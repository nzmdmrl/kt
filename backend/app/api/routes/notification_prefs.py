"""
Bildirim türü kataloğu + kullanıcı push tercihleri.

ÖNEMLİ TASARIM KURALI
---------------------
Buradaki tercihler SADECE PUSH bildirimlerini kısıtlar. Uygulama içi bildirim
satırları (notifications tablosu) bugün olduğu gibi HER ZAMAN oluşturulmaya
devam eder; mevcut 9 bildirim çağrısı bu tabloları hiç sorgulamaz. Push altyapısı
(FCM) eklendiğinde gönderim kararı bu tablolardan okunacak.

Tablolar düz SQL ile kurulur (app_settings.py ile aynı yaklaşım):
CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING seed. ORM modeli YOKTUR,
bu yüzden create_all bu tablolara dokunmaz, alembic autogenerate kullanılmaz.

  notification_groups  -> ayar sayfasındaki başlıklar (Oyun, Sosyal, Lig, ...)
  notification_types   -> bildirim türü kataloğu (admin panelinden düzenlenir)
  user_push_prefs      -> SEYREK: sadece varsayılandan FARKLI olan satırlar tutulur
  user_push_settings   -> kullanıcı başına ana anahtar + sessiz saatler + teslim modu

Uçlar
-----
Kullanıcı (giriş gerekli):
- GET /notification-types        -> gruplar + aktif türler + kullanıcının etkin değeri
- GET /me/push-preferences       -> ana anahtar, sessiz saat, teslim modu
- PUT /me/push-preferences       -> tercihleri kaydet (varsayılana eşitse satır silinir)

Admin (get_admin_user):
- GET /admin/notification-types      -> pasifler dahil TÜM türler
- PUT /admin/notification-types/{code} -> tek satır güncelle (Unvanlar sekmesiyle aynı kalıp)
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import engine, get_db
from app.core.deps import get_admin_user, get_current_user
from app.models.user import User

router = APIRouter(tags=["notification-prefs"])

# Postgres/SQLite (test) farkları — app_settings.py ile aynı yaklaşım.
_IS_PG = engine.dialect.name == "postgresql"
_NOW = "now()" if _IS_PG else "CURRENT_TIMESTAMP"
_TS = "TIMESTAMPTZ" if _IS_PG else "TIMESTAMP"
_BOOL_T = "TRUE" if _IS_PG else "1"


# ---------------------------------------------------------------- DDL

CREATE_GROUPS_SQL = f"""
CREATE TABLE IF NOT EXISTS notification_groups (
    code VARCHAR(24) PRIMARY KEY,
    label VARCHAR(60),
    sort_order SMALLINT
)
"""

CREATE_TYPES_SQL = f"""
CREATE TABLE IF NOT EXISTS notification_types (
    code VARCHAR(48) PRIMARY KEY,
    group_code VARCHAR(24) NOT NULL,
    label VARCHAR(80) NOT NULL,
    description VARCHAR(160),
    default_enabled BOOLEAN NOT NULL DEFAULT {_BOOL_T},
    user_editable BOOLEAN NOT NULL DEFAULT {_BOOL_T},
    allow_push BOOLEAN NOT NULL DEFAULT {_BOOL_T},
    allow_web BOOLEAN NOT NULL DEFAULT {_BOOL_T},
    allow_native BOOLEAN NOT NULL DEFAULT {_BOOL_T},
    route_template VARCHAR(160),
    title_template VARCHAR(160),
    body_template VARCHAR(300),
    channel_id VARCHAR(24),
    sort_order SMALLINT DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT {_BOOL_T}
)
"""

CREATE_USER_PREFS_SQL = f"""
CREATE TABLE IF NOT EXISTS user_push_prefs (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type_code VARCHAR(48) NOT NULL REFERENCES notification_types(code) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL,
    updated_at {_TS} DEFAULT {_NOW},
    PRIMARY KEY (user_id, type_code)
)
"""

CREATE_USER_SETTINGS_SQL = f"""
CREATE TABLE IF NOT EXISTS user_push_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    push_master BOOLEAN DEFAULT {_BOOL_T},
    quiet_start SMALLINT DEFAULT 0,
    quiet_end SMALLINT DEFAULT 8,
    delivery_mode VARCHAR(16) DEFAULT 'prefer_native',
    updated_at {_TS} DEFAULT {_NOW}
)
"""


# ---------------------------------------------------------------- seed verisi

# code, label, sort_order
DEFAULT_GROUPS: list[tuple[str, str, int]] = [
    ("game", "Oyun ve Maç", 10),
    ("social", "Sosyal", 20),
    ("league", "Lig", 30),
    ("achievement", "Başarımlar", 40),
    ("system", "Sistem", 50),
]

# code, group, label, description, default_enabled, channel_id, route_template,
# sort_order, is_active
#
# AKTİF türler bugün gerçekten üretilen bildirimlere karşılık gelir
# (docs/mobile/00-discovery.md §1.1 — 9 çağrı). route_template yalnızca bugün
# zaten link üretilen türlerde dolu.
#
# "award" tek bir kind; günlük/aylık/yıllık ayrımını league_scheduler.py:100
# period_type ile yapıyor. Katalogda kullanıcı üçünü ayrı kapatabilsin diye üçe
# bölündü — o kod BU GÖREVDE DEĞİŞTİRİLMEDİ.
DEFAULT_TYPES: list[tuple[str, str, str, str, bool, str, str, int, bool]] = [
    # --- AKTİF ---
    ("room_invite", "game", "1v1 oda davetleri",
     "Bir arkadaşın seni özel 1v1 odasına davet ettiğinde.",
     True, "game", "/oyna?join={code}", 10, True),
    ("arena_invite", "game", "Arena davetleri",
     "Bir arkadaşın seni özel arenasına çağırdığında.",
     True, "game", "/arena/ozel/{code}", 20, True),
    ("friend_request", "social", "Arkadaşlık istekleri",
     "Sana yeni bir arkadaşlık isteği geldiğinde.",
     True, "social", "", 10, True),
    ("friend_accept", "social", "İstek kabulleri",
     "Gönderdiğin arkadaşlık isteği kabul edildiğinde.",
     True, "social", "", 20, True),
    ("friend_reject", "social", "İstek redleri",
     "Gönderdiğin arkadaşlık isteği reddedildiğinde.",
     False, "social", "", 30, True),
    ("award_daily", "league", "Günlük lig ödülleri",
     "Günlük ligde ilk üçe girip kupa veya madalya kazandığında.",
     True, "league", "", 10, True),
    ("award_monthly", "league", "Aylık lig ödülleri",
     "Aylık lig dönemi kapandığında ilk üçe girdiysen.",
     True, "league", "", 20, True),
    ("award_yearly", "league", "Yıllık lig ödülleri",
     "Yıllık lig dönemi kapandığında ilk üçe girdiysen.",
     True, "league", "", 30, True),
    ("arena_medal", "achievement", "Arena madalyaları",
     "Arena maçını 1., 2. veya 3. bitirdiğinde.",
     False, "achievement", "/profil/{username}", 10, True),
    ("title_up", "achievement", "Unvan yükselmeleri",
     "Kazandığın XP ile yeni bir unvana yükseldiğinde.",
     True, "achievement", "/profil/{username}", 20, True),
    ("challenge_offer", "game", "Maç teklifleri",
     "Bir arkadaşın sana doğrudan 1v1 maç teklifi gönderdiğinde.",
     True, "game", "/", 30, True),

    # --- PASİF (planlanan; bugün üretilmiyor, ayar sayfasında GÖRÜNMEZ) ---
    ("match_result", "game", "Maç sonuçları",
     "Oynadığın 1v1 maçın sonucu belli olduğunda.",
     True, "game", "", 40, False),
    ("badge_earned", "achievement", "Rozet kazanımları",
     "Yeni bir rozetin kilidini açtığında.",
     False, "achievement", "", 30, False),
    ("level_up", "achievement", "Seviye atlamaları",
     "Yeterli XP toplayıp yeni bir seviyeye geçtiğinde.",
     False, "achievement", "", 40, False),
    ("streak_milestone", "achievement", "Seri kilometre taşları",
     "Üst üste oynama serinde önemli bir eşiğe ulaştığında.",
     False, "achievement", "", 50, False),
    ("league_ending_soon", "league", "Lig dönemi bitmek üzere",
     "İçinde bulunduğun lig dönemi kapanmadan önce son hatırlatma.",
     False, "league", "", 40, False),
    ("system_announcement", "system", "Sistem duyuruları",
     "Yeni özellikler, bakım ve önemli duyurular.",
     True, "system", "/duyurular/{slug}", 10, True),
    ("daily_reminder", "system", "Günlük hatırlatma",
     "Günün kelimesini henüz çözmediysen günlük hatırlatma.",
     False, "system", "", 20, False),
]

# Teslim modu seçenekleri. Bugün hiçbiri kullanılmıyor (push henüz yok);
# varsayılan prefer_native = uygulama kuruluysa native, değilse web push.
DELIVERY_MODES = ("prefer_native", "native_only", "web_only", "all")

# Sessiz saat varsayılanı: yeni kullanıcıda AÇIK, 00:00–08:00.
# Kullanıcı kapatırsa iki sütun da NULL yazılır (bkz. _settings_row).
DEFAULT_QUIET_START = 0
DEFAULT_QUIET_END = 8


async def ensure_notification_tables() -> int:
    """Tabloları oluştur (yoksa) + katalog satırlarını seed et — idempotent."""
    from app.core.database import AsyncSessionLocal

    async with engine.begin() as conn:
        for ddl in (CREATE_GROUPS_SQL, CREATE_TYPES_SQL,
                    CREATE_USER_PREFS_SQL, CREATE_USER_SETTINGS_SQL):
            await conn.execute(text(ddl))

    added = 0
    async with AsyncSessionLocal() as db:
        for code, label, sort_order in DEFAULT_GROUPS:
            res = await db.execute(
                text(
                    "INSERT INTO notification_groups (code, label, sort_order) "
                    "VALUES (:code, :label, :sort_order) ON CONFLICT DO NOTHING"
                ),
                {"code": code, "label": label, "sort_order": sort_order},
            )
            added += res.rowcount or 0

        for (code, group_code, label, description, default_enabled,
             channel_id, route_template, sort_order, is_active) in DEFAULT_TYPES:
            res = await db.execute(
                text(
                    "INSERT INTO notification_types "
                    "(code, group_code, label, description, default_enabled, channel_id, "
                    " route_template, title_template, body_template, sort_order, is_active) "
                    "VALUES (:code, :group_code, :label, :description, :default_enabled, :channel_id, "
                    " :route_template, '', '', :sort_order, :is_active) "
                    "ON CONFLICT DO NOTHING"
                ),
                {
                    "code": code, "group_code": group_code, "label": label,
                    "description": description, "default_enabled": default_enabled,
                    "channel_id": channel_id, "route_template": route_template,
                    "sort_order": sort_order, "is_active": is_active,
                },
            )
            added += res.rowcount or 0

        # Duyurular modülü geldi: system_announcement artık gerçekten üretiliyor.
        # Seed ON CONFLICT DO NOTHING olduğu için ÖNCEDEN eklenmiş satırı burada
        # bir kez düzeltiyoruz. Koşul route_template'in boş olması: düzeltme
        # uygulandıktan sonra bir daha çalışmaz, böylece adminin sonradan yaptığı
        # is_active değişikliği her açılışta ezilmez.
        await db.execute(
            text(
                "UPDATE notification_types "
                f"SET is_active = {_BOOL_T}, route_template = '/duyurular/{{slug}}' "
                "WHERE code = 'system_announcement' "
                "AND (route_template IS NULL OR route_template = '')"
            )
        )
        # Aynı gerekçe: maç teklifleri artık challenges tablosuna yazılıyor ve
        # gerçekten bildirim/push üretiyor (bkz. app/game/challenge_service.py).
        await db.execute(
            text(
                "UPDATE notification_types "
                f"SET is_active = {_BOOL_T}, route_template = '/', "
                f"    group_code = 'game', channel_id = 'game', default_enabled = {_BOOL_T} "
                "WHERE code = 'challenge_offer' "
                "AND (route_template IS NULL OR route_template = '')"
            )
        )
        await db.commit()
    return added


# ---------------------------------------------------------------- yardımcılar

async def _types_map(db: AsyncSession) -> dict[str, dict[str, Any]]:
    """code -> tür satırı (tümü, pasifler dahil)."""
    res = await db.execute(
        text(
            "SELECT code, group_code, label, description, default_enabled, user_editable, "
            "       allow_push, allow_web, allow_native, route_template, channel_id, "
            "       sort_order, is_active "
            "FROM notification_types"
        )
    )
    out: dict[str, dict[str, Any]] = {}
    for r in res.fetchall():
        out[r[0]] = {
            "code": r[0], "group_code": r[1], "label": r[2], "description": r[3] or "",
            "default_enabled": bool(r[4]), "user_editable": bool(r[5]),
            "allow_push": bool(r[6]), "allow_web": bool(r[7]), "allow_native": bool(r[8]),
            "route_template": r[9] or "", "channel_id": r[10] or "",
            "sort_order": int(r[11] or 100), "is_active": bool(r[12]),
        }
    return out


async def _groups(db: AsyncSession) -> list[dict[str, Any]]:
    res = await db.execute(
        text("SELECT code, label, sort_order FROM notification_groups ORDER BY sort_order, code")
    )
    return [{"code": r[0], "label": r[1] or r[0], "sort_order": int(r[2] or 0)} for r in res.fetchall()]


async def _settings_row(db: AsyncSession, user_id: int) -> dict[str, Any]:
    """Kullanıcının push ayarı — satır yoksa varsayılanlar döner (404 yok).

    Sessiz saat YENİ KULLANICIDA AÇIK gelir: 00:00–08:00. Satır varsa ve
    quiet_start/quiet_end NULL ise bu "kullanıcı sessiz saati kapattı" demektir —
    o durumda None döner, varsayılana geri düşmez.
    """
    res = await db.execute(
        text(
            "SELECT push_master, quiet_start, quiet_end, delivery_mode "
            "FROM user_push_settings WHERE user_id = :uid"
        ),
        {"uid": user_id},
    )
    row = res.first()
    if row is None:
        return {
            "push_master": True,
            "quiet_start": DEFAULT_QUIET_START, "quiet_end": DEFAULT_QUIET_END,
            "delivery_mode": "prefer_native",
        }
    return {
        "push_master": bool(row[0]) if row[0] is not None else True,
        "quiet_start": int(row[1]) if row[1] is not None else None,
        "quiet_end": int(row[2]) if row[2] is not None else None,
        "delivery_mode": row[3] or "prefer_native",
    }


# ---------------------------------------------------------------- kullanıcı uçları

@router.get("/notification-types")
async def notification_types(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aktif türler, gruplanmış + kullanıcının ETKİN değeriyle.

    Etkin değer = COALESCE(user_push_prefs.enabled, notification_types.default_enabled)
    """
    res = await db.execute(
        text(
            "SELECT t.code, t.group_code, t.label, t.description, t.default_enabled, "
            "       t.user_editable, t.allow_push, t.allow_web, t.allow_native, "
            "       t.channel_id, t.sort_order, "
            "       COALESCE(p.enabled, t.default_enabled) AS effective "
            "FROM notification_types t "
            "LEFT JOIN user_push_prefs p ON p.type_code = t.code AND p.user_id = :uid "
            f"WHERE t.is_active = {_BOOL_T} "
            "ORDER BY t.sort_order, t.code"
        ),
        {"uid": user.id},
    )
    by_group: dict[str, list[dict[str, Any]]] = {}
    for r in res.fetchall():
        by_group.setdefault(r[1], []).append({
            "code": r[0], "label": r[2], "description": r[3] or "",
            "default_enabled": bool(r[4]), "user_editable": bool(r[5]),
            "allow_push": bool(r[6]), "allow_web": bool(r[7]), "allow_native": bool(r[8]),
            "channel_id": r[9] or "", "sort_order": int(r[10] or 100),
            "enabled": bool(r[11]),
        })

    groups = [
        {**g, "types": by_group.get(g["code"], [])}
        for g in await _groups(db)
    ]
    # İçinde aktif tür olmayan grubu gösterme.
    return {"groups": [g for g in groups if g["types"]]}


@router.get("/me/push-preferences")
async def get_push_preferences(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _settings_row(db, user.id)


class PushPreferencesUpdate(BaseModel):
    prefs: dict[str, bool] = Field(default_factory=dict)
    push_master: bool | None = None
    quiet_start: int | None = None
    quiet_end: int | None = None
    delivery_mode: str | None = None


@router.put("/me/push-preferences")
async def put_push_preferences(
    body: PushPreferencesUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Tercihleri kaydeder.

    - Bilinmeyen veya pasif tür kodu -> 400.
    - user_editable=false olan tür -> sessizce yok sayılır (ignored listesinde döner).
    - Değer türün varsayılanına EŞİTSE satır SİLİNİR (tablo seyrek kalsın).
    """
    types = await _types_map(db)

    unknown = [c for c in body.prefs if c not in types or not types[c]["is_active"]]
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"Bilinmeyen veya pasif bildirim türü: {', '.join(sorted(unknown))}",
        )

    ignored: list[str] = []
    for code, value in body.prefs.items():
        t = types[code]
        if not t["user_editable"]:
            ignored.append(code)
            continue
        if bool(value) == t["default_enabled"]:
            await db.execute(
                text("DELETE FROM user_push_prefs WHERE user_id = :uid AND type_code = :code"),
                {"uid": user.id, "code": code},
            )
        else:
            await db.execute(
                text(
                    "INSERT INTO user_push_prefs (user_id, type_code, enabled, updated_at) "
                    f"VALUES (:uid, :code, :enabled, {_NOW}) "
                    "ON CONFLICT (user_id, type_code) DO UPDATE "
                    f"SET enabled = EXCLUDED.enabled, updated_at = {_NOW}"
                ),
                {"uid": user.id, "code": code, "enabled": bool(value)},
            )

    # --- genel ayarlar ---
    # "alan hiç gönderilmedi" ile "alan null gönderildi" ayrımı şart:
    # quiet_start=null = "sessiz saat kapalı" demek, "dokunma" demek değil.
    provided = body.model_fields_set
    touches_settings = bool(
        {"push_master", "quiet_start", "quiet_end", "delivery_mode"} & provided
    )
    if touches_settings:
        for name, val in (("quiet_start", body.quiet_start), ("quiet_end", body.quiet_end)):
            if val is not None and not (0 <= int(val) <= 23):
                raise HTTPException(status_code=400, detail=f"{name} 0-23 aralığında olmalı.")
        if body.delivery_mode is not None and body.delivery_mode not in DELIVERY_MODES:
            raise HTTPException(
                status_code=400,
                detail=f"delivery_mode şunlardan biri olmalı: {', '.join(DELIVERY_MODES)}",
            )

        current = await _settings_row(db, user.id)
        merged = {
            "push_master": bool(body.push_master) if "push_master" in provided else current["push_master"],
            "quiet_start": body.quiet_start if "quiet_start" in provided else current["quiet_start"],
            "quiet_end": body.quiet_end if "quiet_end" in provided else current["quiet_end"],
            "delivery_mode": (
                body.delivery_mode if "delivery_mode" in provided and body.delivery_mode
                else current["delivery_mode"]
            ),
        }
        await db.execute(
            text(
                "INSERT INTO user_push_settings "
                "(user_id, push_master, quiet_start, quiet_end, delivery_mode, updated_at) "
                f"VALUES (:uid, :push_master, :quiet_start, :quiet_end, :delivery_mode, {_NOW}) "
                "ON CONFLICT (user_id) DO UPDATE SET "
                "push_master = EXCLUDED.push_master, quiet_start = EXCLUDED.quiet_start, "
                "quiet_end = EXCLUDED.quiet_end, delivery_mode = EXCLUDED.delivery_mode, "
                f"updated_at = {_NOW}"
            ),
            {"uid": user.id, **merged},
        )

    await db.commit()
    return {"ok": True, "ignored": ignored, **(await _settings_row(db, user.id))}


# ---------------------------------------------------------------- admin uçları

@router.get("/admin/notification-types")
async def admin_notification_types(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Pasifler dahil TÜM türler + grup etiketleri."""
    types = await _types_map(db)
    rows = sorted(types.values(), key=lambda t: (t["group_code"], t["sort_order"], t["code"]))
    return {"groups": await _groups(db), "types": rows}


class NotificationTypeUpdate(BaseModel):
    label: str | None = None
    description: str | None = None
    default_enabled: bool | None = None
    user_editable: bool | None = None
    allow_push: bool | None = None
    allow_web: bool | None = None
    allow_native: bool | None = None
    is_active: bool | None = None
    sort_order: int | None = None


@router.put("/admin/notification-types/{code}")
async def admin_update_notification_type(
    code: str,
    body: NotificationTypeUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Tek türü günceller. Bu görevde tür EKLEME/SİLME yok."""
    res = await db.execute(
        text("SELECT code FROM notification_types WHERE code = :code"), {"code": code}
    )
    if res.first() is None:
        raise HTTPException(status_code=404, detail="Bilinmeyen bildirim türü")

    fields = body.model_dump(exclude_none=True)
    if not fields:
        return {"ok": True, "code": code}

    sets = ", ".join(f"{k} = :{k}" for k in fields)
    await db.execute(
        text(f"UPDATE notification_types SET {sets} WHERE code = :code"),
        {**fields, "code": code},
    )
    await db.commit()
    return {"ok": True, "code": code}
