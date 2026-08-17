"""
Mobil & reklam ayarları (app_settings tablosu).

Tablo düz SQL ile oluşturulur (main.py startup — notifications.link bloğuyla aynı
yaklaşım): CREATE TABLE IF NOT EXISTS. ORM modeli YOKTUR, bu yüzden create_all
bu tabloya dokunmaz. Değerler JSON (Postgres'te jsonb) olarak saklanır.

Public:
- GET /app-config?platform=web|android|ios  -> is_public=true satırlar tek JSON'da
  birleşir (anahtar = ayar adı). android/ios için admob'un sadece o platform bloğu
  döner. Bellekte 60 sn cache'lenir.

Admin (get_admin_user):
- GET /admin/app-settings        -> tüm satırlar (public olmayanlar dahil)
- PUT /admin/app-settings/{key}  -> value günceller, updated_at tazelenir, cache temizlenir
"""

from __future__ import annotations

import copy
import json
import time
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import engine, get_db
from app.core.deps import get_admin_user
from app.models.user import User

router = APIRouter(tags=["app-settings"])

# Postgres'te jsonb sütununa yazarken cast gerekir; SQLite (test) düz metin tutar.
_IS_PG = engine.dialect.name == "postgresql"
_VALUE_BIND = "CAST(:value AS JSONB)" if _IS_PG else ":value"

# Tablo DDL'i — startup'ta bir kez çalışır (main.py).
CREATE_TABLE_SQL_PG = """
CREATE TABLE IF NOT EXISTS app_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(64) NOT NULL UNIQUE,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
"""

CREATE_TABLE_SQL_SQLITE = """
CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key VARCHAR(64) NOT NULL UNIQUE,
    value TEXT NOT NULL DEFAULT '{}',
    is_public BOOLEAN NOT NULL DEFAULT 1,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)
"""

# Banner'ın GİZLENECEĞİ yollar. VARSAYILAN ARTIK BOŞ — gerçek cihaz denemesinden
# sonra yaklaşım değişti: oyun ekranlarında bant GİZLENMİYOR, onun yerine dipteki
# her eleman (arena oyuncu şeridi vb.) alt barın yaptığı gibi bandın üstüne
# çekiliyor (bkz. frontend/components/NativeBootstrap.tsx → --kt-game-space).
# Alan admin panelinde DURUYOR: istenirse tek tek yol yazılıp banner yine gizlenir.
DEFAULT_BANNER_HIDDEN_PATHS: list[str] = []

# Geçiş (interstitial) reklamının mod bazlı aç/kapası.
# ÖZEL ARENA VARSAYILAN KAPALI: ödül vermiyor ve arkadaşların birlikte oynadığı
# mod — admin isterse panelden açar.
# Aynı sözlük migration'da da kullanılır (app/core/migrations.py) — tek kaynak.
DEFAULT_INTERSTITIAL_MODES: dict[str, bool] = {
    "gunun_kelimesi": True,
    "maraton": True,
    "pratik": True,     # 1vB (bota karşı)
    "duello": True,     # 1v1 rakip bul
    "arena": True,
    "oda": True,        # özel oda (2 / 3-4 kişilik)
    "ozel_arena": False,
}

# Geçiş reklamı sıklık kuralları — ayrıntı: frontend/lib/interstitial.ts.
# Aynı sözlük migration'da da kullanılır — tek kaynak.
DEFAULT_INTERSTITIAL_RULES: dict = {
    "interstitial_every_n_matches": 5,
    "interstitial_min_seconds": 90,
    "interstitial_skip_first_n": 3,
    "interstitial_modes": DEFAULT_INTERSTITIAL_MODES,
}

# Mikrofon bilgilendirme balonunun VARSAYILAN metni. Admin panelden değiştirilir;
# migration'da da kullanılır (app/core/migrations.py) — tek kaynak.
MIC_NOTICE_TEXT = (
    "Sesiniz karşı tarafa iletilmez, sadece söylediğiniz kelimenin kutuya "
    "yazılmasını sağlar."
)

# Bilgilendirme balonu için kabul edilen sınırlar (admin panel + API).
MIC_NOTICE_TIMES_MAX = 20      # 0 = hiç gösterme
MIC_NOTICE_SECONDS_MIN = 1
MIC_NOTICE_SECONDS_MAX = 30

# Startup'ta eksikse eklenen varsayılanlar (hepsi kapalı/boş).
#   anahtar -> (varsayılan değer, is_public)
DEFAULT_APP_SETTINGS: dict[str, tuple[dict, bool]] = {
    "ads.adsense": (
        {
            "enabled": False,
            "client": "",
            "slots": {"header": "", "in_content": "", "footer": ""},
        },
        True,
    ),
    "ads.admob": (
        {
            "enabled": False,
            # Ana anahtar açıkken banner ve geçiş reklamı AYRI AYRI kapatılabilir:
            # banner sorun çıkarırsa interstitial'ı kaybetmeden kapatılır.
            "banner_enabled": True,
            "interstitial_enabled": True,
            "test_mode": True,
            "android": {"app_id": "", "banner": "", "interstitial": ""},
            "ios": {"app_id": "", "banner": "", "interstitial": ""},
            # Banner'ın GÖSTERİLMEYECEĞİ yollar (oyun ekranları). Eşleşme: tam yol
            # ya da alt yol ("/arena" -> "/arena/ozel/ABC" de kapsanır).
            # Bu listeyi admin panelinden (Mobil & Reklam) değiştirebilirsin.
            "banner_hidden_paths": DEFAULT_BANNER_HIDDEN_PATHS,
            # ALT BAR kaldırma ince ayarı (cihazda deneyip kaydetmek için — deploy
            # gerekmez). DİKKAT: bunlar showBanner'ın margin'ine GİTMEZ; bant her
            # zaman ekranın dibindedir (margin 0), oynayan şey alt bardır.
            #   banner_margin_extra    -> navLift'e EKLENİR
            #                             (navLift = bant + güvenli alan + extra)
            #   banner_margin_override -> 0'dan büyükse hesap YOK SAYILIR, navLift = bu
            "banner_margin_extra": 0,
            "banner_margin_override": 0,
            # OYUN EKRANLARI (arena, 1v1, özel oda, maraton, günün kelimesi) için
            # ek pay: dipteki elemanlar bandın üstüne çekilirken hesaplanan boşluğa
            # (bant + güvenli alan) BU DEĞER de eklenir. Yalnız oyun ekranlarını
            # etkiler; alt bar ve diğer sayfalar banner_margin_extra'ya bakar.
            # Cihazda deneyip kaydetmek için — deploy gerekmez.
            "banner_game_offset_extra": 0,
            # Geçiş (interstitial) reklamı sıklığı. Reklam YALNIZCA oyun akışından
            # OYUN OLMAYAN bir hedefe çıkarken gösterilir (ana sayfa, /lig, profil,
            # maraton haritası); "tekrar oyna / rövanş / sonraki bölüm / yeni rakip"
            # gibi devam eylemlerinde ASLA gösterilmez.
            #   interstitial_every_n_matches -> her kaç maçta bir
            #   interstitial_min_seconds     -> iki reklam arası en az kaç saniye
            #   interstitial_skip_first_n    -> yeni kullanıcının ilk N maçı reklamsız
            #   interstitial_modes           -> mod bazlı aç/kapa
            **DEFAULT_INTERSTITIAL_RULES,
        },
        True,
    ),
    "push.firebase": (
        {
            "web": {"apiKey": "", "projectId": "", "appId": "", "messagingSenderId": ""},
            "vapid_key": "",
        },
        True,
    ),
    "app.stores": (
        {
            "badges_enabled": False,
            "play_url": "",
            "ios_url": "",
            "show_on_paths": ["/"],
        },
        True,
    ),
    # Davranış bayrakları. challenge_ttl_seconds: maç teklifinin geçerlilik
    # süresi (app/game/challenge_service.py okur, 60 sn cache'li).
    #
    # google_web_client_id: Google Cloud Console'daki **Web** istemci kimliği.
    # İKİ yerde kullanılır ve İKİSİNDE DE AYNI değer olmalıdır:
    #   1) Uygulama (Capacitor) — native hesap seçici bu kimlikle açılır ve
    #      döndürdüğü id_token'ın `aud` alanı BU değer olur,
    #   2) Backend — /auth/google/native gelen id_token'ın audience'ını buna göre
    #      doğrular (app/api/routes/auth.py).
    # Env'deki GOOGLE_CLIENT_ID'den AYRI tutulur: web akışı env'e, uygulama akışı
    # bu satıra bakar; admin panelden deploy'suz değiştirilebilsin diye burada.
    "app.flags": (
        {
            "challenge_ttl_seconds": 120,
            "google_web_client_id": "",
        },
        True,
    ),
    # Mikrofon / sesli tahmin — frontend/lib/useSpeech.ts okur.
    #   web_enabled -> tarayıcıda Web Speech API yolu
    #   app_enabled -> Capacitor uygulamasında native tanıma (plugin)
    # UYGULAMA VARSAYILAN KAPALI: gerçek telefonda doğrulanana kadar kapalı
    # çıksın, admin panelden açsın.
    # app_enabled, web_enabled'a BAĞIMLIDIR (aşağıdaki _mic_valid kuralı).
    #
    # notice_* : mikrofon İLK kullanıldığında çıkan bilgilendirme balonu.
    # Kullanıcı "sesim rakibe gidiyor mu?" diye tereddüt ediyor; balon bunu
    # yanıtlar, notice_times kez gösterilir (cihaz bazlı sayaç) ve
    # notice_seconds sonra kendiliğinden kapanır.
    "app.mic": (
        {
            "web_enabled": True,
            "app_enabled": False,
            "notice_enabled": True,
            "notice_text": MIC_NOTICE_TEXT,
            "notice_times": 2,
            "notice_seconds": 5,
        },
        True,
    ),
}

# Admin panelinde görünen etiketler.
SETTING_LABELS: dict[str, str] = {
    "ads.adsense": "Google AdSense (web)",
    "ads.admob": "AdMob (mobil uygulama)",
    "push.firebase": "Firebase / Push bildirim",
    "app.stores": "Uygulama mağaza rozetleri",
    "app.flags": "Davranış ayarları",
    "app.mic": "🎤 Mikrofon (sesli tahmin)",
}


# ---------------------------------------------------------------- yardımcılar

def _as_dict(raw: Any) -> dict:
    """jsonb sürücüye göre dict veya JSON metni dönebilir — ikisini de karşıla."""
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", "ignore")
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except Exception:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


# --------------------------------------------- mikrofon bayrak kuralı ("app.mic")
#
# Uygulama mikrofonu WEB mikrofonuna BAĞIMLIDIR:
#   web açık  + uygulama açık   -> geçerli
#   web açık  + uygulama kapalı -> geçerli (yalnız web)
#   web kapalı+ uygulama kapalı -> geçerli (tamamen kapalı)
#   web kapalı+ uygulama açık   -> GEÇERSİZ
#
# Gerekçe: uygulama sitenin AYNI JS'ini çalıştırır (WebView canlı siteyi yükler).
# "Web'de kapalı ama uygulamada açık" hâli tek bir anahtarla yönetilebilir bir
# durum değil; uygulama bayrağı web bayrağının üstüne binen bir ek şarttır.
#
# Panel bu kombinasyonu zaten üretmez (kutular birbirini otomatik ayarlar);
# buradaki kontrol sunucu tarafı güvencesidir (doğrudan API çağrısı, curl vb.).

MIC_KEY = "app.mic"


def _mic_valid(value: dict) -> bool:
    return not (value.get("app_enabled") is True and value.get("web_enabled") is not True)


def _mic_notice_error(value: dict) -> str | None:
    """Balon ayarları için sınır kontrolü. Sorun varsa Türkçe mesaj döner."""
    times = value.get("notice_times")
    if times is not None:
        if not isinstance(times, int) or isinstance(times, bool) or not (
            0 <= times <= MIC_NOTICE_TIMES_MAX
        ):
            return f"Uyarı kaç kez gösterilsin: 0 ile {MIC_NOTICE_TIMES_MAX} arası bir sayı olmalı."
    secs = value.get("notice_seconds")
    if secs is not None:
        if not isinstance(secs, int) or isinstance(secs, bool) or not (
            MIC_NOTICE_SECONDS_MIN <= secs <= MIC_NOTICE_SECONDS_MAX
        ):
            return (
                f"Uyarı kaç saniye dursun: {MIC_NOTICE_SECONDS_MIN} ile "
                f"{MIC_NOTICE_SECONDS_MAX} arası bir sayı olmalı."
            )
    return None


def _normalize_mic(value: dict) -> dict:
    """Geçersiz kombinasyon public yanıtta ASLA görünmesin.

    Satır elle (psql) düzenlenmiş olabilir; okuma tarafında da kuralı uygularız.
    """
    if _mic_valid(value):
        return value
    out = dict(value)
    out["app_enabled"] = False
    return out


async def _all_rows(db: AsyncSession) -> list[dict]:
    res = await db.execute(
        text("SELECT key, value, is_public, updated_at FROM app_settings ORDER BY key")
    )
    return [
        {
            "key": r[0],
            "value": _as_dict(r[1]),
            "is_public": bool(r[2]),
            "updated_at": r[3].isoformat() if r[3] is not None else None,
        }
        for r in res.fetchall()
    ]


async def ensure_app_settings_table() -> int:
    """Tabloyu oluştur (yoksa) ve eksik anahtarları seed et — idempotent."""
    from app.core.database import AsyncSessionLocal

    async with engine.begin() as conn:
        await conn.execute(text(CREATE_TABLE_SQL_PG if _IS_PG else CREATE_TABLE_SQL_SQLITE))

    async with AsyncSessionLocal() as db:
        res = await db.execute(text("SELECT key FROM app_settings"))
        existing = {r[0] for r in res.fetchall()}
        added = 0
        for key, (value, is_public) in DEFAULT_APP_SETTINGS.items():
            if key in existing:
                continue
            await db.execute(
                text(
                    f"INSERT INTO app_settings (key, value, is_public) "
                    f"VALUES (:key, {_VALUE_BIND}, :is_public)"
                ),
                {"key": key, "value": json.dumps(value), "is_public": is_public},
            )
            added += 1
        if added:
            await db.commit()
    _clear_cache()
    return added


# ---------------------------------------------------------------- public cache

CACHE_TTL = 60.0
_cache: dict[str, tuple[float, dict]] = {}

# "app.flags" satırının sunucu tarafı okuması (public yanıttan bağımsız).
# Neden ayrı: /app-config yanıtı platforma göre şekillendirilmiş bir SÖZLÜK; sunucu
# kodu (ör. Google native girişi) tek satırın ham değerini ister. 60 sn cache'li,
# admin kaydettiğinde _clear_cache ile birlikte düşer.
FLAGS_KEY = "app.flags"
_flags_cache: tuple[float, dict] | None = None


def _clear_cache() -> None:
    global _flags_cache
    _cache.clear()
    _flags_cache = None


async def read_flags(db: AsyncSession) -> dict:
    """'app.flags' satırının ham değeri. Tablo/satır yoksa boş sözlük döner."""
    global _flags_cache
    now = time.monotonic()
    if _flags_cache and now - _flags_cache[0] < CACHE_TTL:
        return _flags_cache[1]
    try:
        res = await db.execute(
            text("SELECT value FROM app_settings WHERE key = :k"), {"k": FLAGS_KEY}
        )
        row = res.first()
        value = _as_dict(row[0]) if row else {}
    except Exception:
        # Tablo henüz yoksa (ilk deploy) özellik "yapılandırılmamış" sayılır.
        value = {}
    _flags_cache = (now, value)
    return value


def _shape_for_platform(key: str, value: dict, platform: str) -> dict:
    """android/ios isteğinde admob'un sadece ilgili platform bloğunu bırak."""
    if key == MIC_KEY:
        return _normalize_mic(value)
    if key != "ads.admob" or platform not in ("android", "ios"):
        return value
    out = copy.deepcopy(value)
    other = "ios" if platform == "android" else "android"
    out.pop(other, None)
    return out


@router.get("/app-config")
async def app_config(
    platform: Literal["web", "android", "ios"] = "web",
    db: AsyncSession = Depends(get_db),
):
    """Public — giriş gerekmez. Sadece is_public=true satırlar döner."""
    now = time.monotonic()
    hit = _cache.get(platform)
    if hit and now - hit[0] < CACHE_TTL:
        return hit[1]

    try:
        rows = await _all_rows(db)
    except Exception:
        # Tablo henüz yoksa (ilk deploy) boş yapılandırma dön — sayfa kırılmasın.
        return {"platform": platform, "config": {}}

    config = {
        r["key"]: _shape_for_platform(r["key"], r["value"], platform)
        for r in rows
        if r["is_public"]
    }
    out = {"platform": platform, "config": config}
    _cache[platform] = (now, out)
    return out


# ---------------------------------------------------------------- admin

@router.get("/admin/app-settings")
async def admin_list(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    rows = await _all_rows(db)
    for r in rows:
        r["label"] = SETTING_LABELS.get(r["key"], r["key"])
    return {"settings": rows}


class AppSettingUpdate(BaseModel):
    value: dict[str, Any] = Field(default_factory=dict)
    is_public: bool | None = None


@router.put("/admin/app-settings/{key}")
async def admin_update(
    key: str,
    body: AppSettingUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    if not isinstance(body.value, dict):
        raise HTTPException(status_code=400, detail="Değer bir JSON nesnesi olmalı.")
    res = await db.execute(text("SELECT id FROM app_settings WHERE key = :key"), {"key": key})
    if res.first() is None:
        raise HTTPException(status_code=404, detail="Bilinmeyen ayar anahtarı")

    # Mikrofon bağımlılık kuralı — panel dışı çağrılar da geçemez.
    if key == MIC_KEY:
        if not _mic_valid(body.value):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Uygulamada sesli tahmin açıkken web'de de açık olmalı. "
                    "Önce “Web'de sesli tahmin” seçeneğini işaretle."
                ),
            )
        notice_err = _mic_notice_error(body.value)
        if notice_err:
            raise HTTPException(status_code=400, detail=notice_err)

    params: dict[str, Any] = {"key": key, "value": json.dumps(body.value)}
    sets = [f"value = {_VALUE_BIND}", "updated_at = " + ("now()" if _IS_PG else "CURRENT_TIMESTAMP")]
    if body.is_public is not None:
        sets.append("is_public = :is_public")
        params["is_public"] = body.is_public
    await db.execute(
        text(f"UPDATE app_settings SET {', '.join(sets)} WHERE key = :key"), params
    )
    await db.commit()
    _clear_cache()
    if key == "app.flags":
        # Maç teklifi TTL'i buradan okunuyor — 60 sn beklemeden yansısın.
        from app.game.challenge_service import clear_ttl_cache
        clear_ttl_cache()
    return {"ok": True, "key": key}
