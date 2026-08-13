"""
Push bildirim gönderimi (FCM / firebase-admin).

TASARIM
-------
- Kimlik bilgisi FIREBASE_CREDENTIALS_B64 ortam değişkeninden okunur
  (base64'lenmiş servis hesabı JSON'u). Değişken yoksa/bozuksa BİR KEZ uyarı
  basılır ve her gönderim SESSİZCE atlanır — site normal çalışmaya devam eder.
  Anahtar içeriği asla loglanmaz.
- send_to_user ASLA hata fırlatmaz. Push başarısızlığı çağıran kodu (maç bitişi,
  arkadaşlık isteği vb.) hiçbir koşulda bozmamalı.
- Tercih kapıları SADECE push'u kısıtlar; uygulama içi bildirim satırları
  bundan bağımsız olarak her zaman oluşur (notification_prefs.py'daki kural).

ÇAĞRI YERLERİ
-------------
Mevcut bildirim çağrı yerleri send_to_user_bg() ile bağlandı (ateşle-unut).
Uygulama içi satır YAZILDIKTAN VE COMMIT EDİLDİKTEN SONRA çağrılır; push
başarısız olsa da uygulama içi bildirim her hâlükârda durur.
Tam liste: docs/mobile/00-discovery.md §1.1.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import json
import os
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import engine

_IS_PG = engine.dialect.name == "postgresql"
_NOW = "now()" if _IS_PG else "CURRENT_TIMESTAMP"

# Sessiz saat karşılaştırması kullanıcının saat diliminde yapılır.
TZ = ZoneInfo("Europe/Istanbul")
SITE_URL = os.environ.get("PUSH_SITE_URL", "https://www.kelimetahmin.com").rstrip("/")
# Web bildirim ikonu. Varsayılan, admin panelinden yüklenen favicon
# (next.config.js /favicon.ico -> backend rewrite). PUSH_ICON_URL ile ezilebilir;
# dosya yoksa tarayıcı kendi varsayılan ikonunu kullanır (zararsız).
DEFAULT_ICON = os.environ.get("PUSH_ICON_URL") or f"{SITE_URL}/favicon.ico"

# --- firebase tembel başlatma ---
_app: Any = None
_init_done = False
_warned = False


def _warn_once(msg: str) -> None:
    global _warned
    if not _warned:
        _warned = True
        print(f"[push] {msg} Push gönderimi devre dışı; site normal çalışmaya devam ediyor.")


def _get_app() -> Any:
    """firebase_admin uygulamasını ilk kullanımda kurar. Kurulamazsa None."""
    global _app, _init_done
    if _init_done:
        return _app
    _init_done = True

    raw = (os.environ.get("FIREBASE_CREDENTIALS_B64") or "").strip()
    if not raw:
        _warn_once("FIREBASE_CREDENTIALS_B64 tanımlı değil.")
        return None
    try:
        import firebase_admin
        from firebase_admin import credentials
    except Exception as e:
        # requirements'ta var ama kurulmamışsa (eski imaj) yine sessiz devam.
        _warn_once(f"firebase-admin içe aktarılamadı ({type(e).__name__}).")
        return None
    try:
        data = json.loads(base64.b64decode(raw, validate=True).decode("utf-8"))
        if not isinstance(data, dict) or "project_id" not in data:
            raise ValueError("beklenen servis hesabı JSON'u değil")
        cred = credentials.Certificate(data)
        _app = firebase_admin.initialize_app(cred, name="kelimetahmin-push")
        print(f"[push] Firebase hazır (proje: {data.get('project_id')}).")
        return _app
    except (binascii.Error, ValueError, json.JSONDecodeError) as e:
        # DİKKAT: yalnızca hata TÜRÜ loglanır — anahtar içeriği asla.
        _warn_once(f"FIREBASE_CREDENTIALS_B64 çözülemedi ({type(e).__name__}).")
        return None
    except Exception as e:
        _warn_once(f"Firebase başlatılamadı ({type(e).__name__}).")
        return None


def push_configured() -> bool:
    """/api/health ve admin ekranı için — anahtar geçerli mi?"""
    return _get_app() is not None


# ---------------------------------------------------------------- yardımcılar

def in_quiet_hours(start: int | None, end: int | None, now: datetime | None = None) -> bool:
    """Şu an [start, end) sessiz aralığında mı? Gece yarısını AŞAN aralık desteklenir.

    23 -> 8 : 23:00, 00:00 ... 07:59 sessiz; 08:00 değil.
    Uçlardan biri None ise sessiz saat kapalıdır.
    """
    if start is None or end is None:
        return False
    h = (now or datetime.now(TZ)).hour
    if start == end:
        return False           # sıfır uzunlukta aralık = kapalı
    if start < end:
        return start <= h < end
    return h >= start or h < end   # gece yarısını aşan aralık


async def _log(
    db: AsyncSession, user_id: int | None, type_code: str, route: str,
    platform: str, status: str, error: str | None = None,
) -> None:
    try:
        await db.execute(
            text(
                "INSERT INTO push_log (user_id, type_code, route, platform, status, error) "
                "VALUES (:user_id, :type_code, :route, :platform, :status, :error)"
            ),
            {
                "user_id": user_id, "type_code": type_code[:48], "route": route,
                "platform": platform[:10], "status": status[:16],
                "error": (error or None) if error is None else error[:500],
            },
        )
        await db.commit()
    except Exception:
        pass   # log yazamamak gönderimi bozmaz


async def _active_tokens(db: AsyncSession, user_id: int) -> list[dict[str, Any]]:
    res = await db.execute(
        text(
            "SELECT id, token, platform FROM device_tokens "
            "WHERE user_id = :uid AND is_active = TRUE ORDER BY id"
        ),
        {"uid": user_id},
    )
    return [{"id": r[0], "token": r[1], "platform": (r[2] or "web").lower()} for r in res.fetchall()]


async def _deactivate(db: AsyncSession, token_ids: list[int]) -> None:
    if not token_ids:
        return
    try:
        await db.execute(
            text("UPDATE device_tokens SET is_active = FALSE WHERE id = ANY(:ids)"
                 if _IS_PG else
                 f"UPDATE device_tokens SET is_active = FALSE WHERE id IN ({','.join(str(int(i)) for i in token_ids)})"),
            {"ids": token_ids} if _IS_PG else {},
        )
        await db.commit()
    except Exception:
        pass


def _is_dead_token(exc: Any) -> bool:
    """Token artık geçersiz mi? (UNREGISTERED / INVALID_ARGUMENT)"""
    name = type(exc).__name__
    code = str(getattr(exc, "code", "") or "").upper()
    return (
        name in ("UnregisteredError", "SenderIdMismatchError")
        or "UNREGISTERED" in code
        or "INVALID_ARGUMENT" in code
        or "NOT_FOUND" in code
    )


def _build_message(
    messaging: Any, tokens: list[str], title: str, body: str, route: str,
    type_code: str, channel_id: str | None, ctx: dict[str, Any] | None,
) -> Any:
    # FCM data alanındaki TÜM değerler string olmalı.
    data = {"type": str(type_code), "route": str(route)}
    for k, v in (ctx or {}).items():
        if v is not None:
            data[str(k)] = str(v)

    return messaging.MulticastMessage(
        tokens=tokens,
        notification=messaging.Notification(title=title, body=body),
        data=data,
        android=messaging.AndroidConfig(
            priority="high",
            notification=messaging.AndroidNotification(
                title=title, body=body,
                channel_id=channel_id or None,
            ),
        ),
        webpush=messaging.WebpushConfig(
            notification=messaging.WebpushNotification(
                title=title, body=body, icon=DEFAULT_ICON, tag=type_code,
            ),
            fcm_options=messaging.WebpushFCMOptions(link=f"{SITE_URL}{route}"),
        ),
    )


async def _send_to_tokens(
    db: AsyncSession, user_id: int, type_code: str, title: str, body: str,
    route: str, tokens: list[dict[str, Any]], channel_id: str | None,
    ctx: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Asıl gönderim. Hata fırlatmaz."""
    if not tokens:
        return {"sent": 0, "failed": 0, "skipped": "no_device"}

    app = _get_app()
    if app is None:
        await _log(db, user_id, type_code, route, "-", "no_credentials")
        return {"sent": 0, "failed": 0, "skipped": "no_credentials"}

    from firebase_admin import messaging

    msg = _build_message(messaging, [t["token"] for t in tokens], title, body,
                         route, type_code, channel_id, ctx)
    try:
        # firebase-admin senkron çalışır — event loop'u bloklamasın.
        resp = await asyncio.to_thread(messaging.send_each_for_multicast, msg, app=app)
    except Exception as e:
        await _log(db, user_id, type_code, route, "-", "send_error", f"{type(e).__name__}: {e}")
        return {"sent": 0, "failed": len(tokens), "error": type(e).__name__}

    sent = failed = 0
    dead: list[int] = []
    errors: list[str] = []
    for tok, r in zip(tokens, resp.responses):
        if r.success:
            sent += 1
            await _log(db, user_id, type_code, route, tok["platform"], "sent")
            continue
        failed += 1
        exc = r.exception
        err = f"{type(exc).__name__}: {exc}" if exc else "unknown"
        errors.append(err)
        if exc is not None and _is_dead_token(exc):
            dead.append(tok["id"])
            await _log(db, user_id, type_code, route, tok["platform"], "token_dead", err)
        else:
            await _log(db, user_id, type_code, route, tok["platform"], "failed", err)

    await _deactivate(db, dead)
    return {"sent": sent, "failed": failed, "deactivated": len(dead), "errors": errors}


# ---------------------------------------------------------------- ana API

async def send_to_user(
    db: AsyncSession, user_id: int, type_code: str, title: str, body: str,
    route: str, ctx: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Kullanıcıya push gönderir — tüm tercih kapılarından geçtikten sonra.

    Her koşulda bir sözlük döner; ASLA istisna fırlatmaz.
    """
    try:
        # 1) Bildirim türü
        row = (await db.execute(
            text(
                "SELECT is_active, allow_push, allow_web, allow_native, user_editable, "
                "       default_enabled, channel_id "
                "FROM notification_types WHERE code = :code"
            ),
            {"code": type_code},
        )).first()
        if row is None:
            return {"skipped": "unknown_type"}
        is_active, allow_push, allow_web, allow_native, user_editable, default_enabled, channel_id = (
            bool(row[0]), bool(row[1]), bool(row[2]), bool(row[3]), bool(row[4]), bool(row[5]), row[6]
        )
        if not is_active:
            return {"skipped": "type_inactive"}
        if not allow_push:
            return {"skipped": "type_push_disabled"}

        # 2) Kullanıcının genel push ayarı (satır yoksa varsayılan)
        s = (await db.execute(
            text("SELECT push_master, quiet_start, quiet_end, delivery_mode "
                 "FROM user_push_settings WHERE user_id = :uid"),
            {"uid": user_id},
        )).first()
        if s is None:
            from app.api.routes.notification_prefs import DEFAULT_QUIET_START, DEFAULT_QUIET_END
            push_master, quiet_start, quiet_end, delivery_mode = (
                True, DEFAULT_QUIET_START, DEFAULT_QUIET_END, "prefer_native"
            )
        else:
            push_master = True if s[0] is None else bool(s[0])
            quiet_start = int(s[1]) if s[1] is not None else None
            quiet_end = int(s[2]) if s[2] is not None else None
            delivery_mode = s[3] or "prefer_native"
        if not push_master:
            return {"skipped": "push_master_off"}

        # 3) Tür bazlı tercih (yalnızca kullanıcı değiştirebiliyorsa)
        if user_editable:
            pref = (await db.execute(
                text("SELECT enabled FROM user_push_prefs WHERE user_id = :uid AND type_code = :code"),
                {"uid": user_id, "code": type_code},
            )).scalar()
            effective = default_enabled if pref is None else bool(pref)
            if not effective:
                return {"skipped": "type_disabled_by_user"}

        # 4) Sessiz saatler (Europe/Istanbul)
        if in_quiet_hours(quiet_start, quiet_end):
            await _log(db, user_id, type_code, route, "-", "quiet_hours")
            return {"skipped": "quiet_hours"}

        # 5) Cihazlar + platform süzgeci
        tokens = await _active_tokens(db, user_id)
        if not allow_web:
            tokens = [t for t in tokens if t["platform"] != "web"]
        if not allow_native:
            tokens = [t for t in tokens if t["platform"] == "web"]

        # 6) Teslim modu
        has_native = any(t["platform"] != "web" for t in tokens)
        if delivery_mode == "prefer_native" and has_native:
            tokens = [t for t in tokens if t["platform"] != "web"]
        elif delivery_mode == "native_only":
            tokens = [t for t in tokens if t["platform"] != "web"]
        elif delivery_mode == "web_only":
            tokens = [t for t in tokens if t["platform"] == "web"]
        # "all" -> hepsine gönder

        if not tokens:
            return {"skipped": "no_device"}

        return await _send_to_tokens(
            db, user_id, type_code, title, body, route, tokens, channel_id, ctx
        )
    except Exception as e:
        # Push hiçbir koşulda çağıranı bozmamalı.
        print(f"[push] send_to_user beklenmeyen hata ({type(e).__name__}: {e})")
        return {"skipped": "error", "error": type(e).__name__}


# Arka plan görevlerine güçlü referans — aksi hâlde GC görevi yarıda toplayabilir.
_bg_tasks: set[asyncio.Task] = set()


def send_to_user_bg(
    user_id: int, type_code: str, title: str, body: str,
    route: str, ctx: dict[str, Any] | None = None,
) -> None:
    """Ateşle-unut push. Çağıranı ASLA bloklamaz, ASLA hata fırlatmaz.

    Çağıranın DB session'ı yanıt sonrası kapanabileceği için görev KENDİ
    session'ını açar. Uygulama içi bildirim satırı commit EDİLDİKTEN SONRA
    çağrılmalıdır.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return   # event loop yok (senkron bağlam) — sessizce atla

    async def _run() -> None:
        try:
            from app.core.database import AsyncSessionLocal
            async with AsyncSessionLocal() as db:
                await send_to_user(db, int(user_id), type_code, title, body, route, ctx)
        except Exception as e:
            print(f"[push] arka plan gönderimi başarısız ({type(e).__name__}: {e})")

    try:
        task = loop.create_task(_run())
        _bg_tasks.add(task)
        task.add_done_callback(_bg_tasks.discard)
    except Exception as e:
        print(f"[push] arka plan görevi başlatılamadı ({type(e).__name__}: {e})")


async def send_test_to_user(
    db: AsyncSession, user_id: int, title: str, body: str, route: str = "/duyurular",
) -> dict[str, Any]:
    """Admin test gönderimi — tercihleri ve sessiz saatleri ATLAR."""
    try:
        tokens = await _active_tokens(db, user_id)
        if not tokens:
            return {"sent": 0, "failed": 0, "devices": 0, "skipped": "no_device"}
        out = await _send_to_tokens(
            db, user_id, "system_announcement", title, body, route, tokens,
            channel_id="system", ctx={"test": "1"},
        )
        out["devices"] = len(tokens)
        return out
    except Exception as e:
        return {"sent": 0, "failed": 0, "devices": 0, "error": type(e).__name__}
