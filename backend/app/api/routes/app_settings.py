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

# Oyun ekranları: reklam bandı buralarda gösterilmez (oyun alanını kapatmasın).
# Not: "/oda" 1v1 davet bağlantısıdır ve doğrudan düelloya yönlendirir.
# Aynı liste migration'da da kullanılır (app/core/migrations.py) — tek kaynak.
DEFAULT_BANNER_HIDDEN_PATHS: list[str] = [
    "/oyna",            # 1v1 düello + 1vB pratik + özel oda
    "/arena",           # arena + özel arena (/arena/ozel/{kod})
    "/solo",            # Maraton
    "/gunun-kelimesi",  # Günün Kelimesi
    "/oda",             # oda daveti -> /oyna yönlendirmesi
]

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
    "app.flags": (
        {
            "challenge_ttl_seconds": 120,
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


def _clear_cache() -> None:
    _cache.clear()


def _shape_for_platform(key: str, value: dict, platform: str) -> dict:
    """android/ios isteğinde admob'un sadece ilgili platform bloğunu bırak."""
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
