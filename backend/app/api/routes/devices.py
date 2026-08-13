"""
Push cihaz kayıtları (FCM token'ları) + admin test gönderimi.

Tablolar düz SQL ile kurulur (app_settings.py / notification_prefs.py ile aynı
yaklaşım): CREATE TABLE IF NOT EXISTS. ORM modeli YOKTUR.

  device_tokens -> kullanıcının bildirim alabilen cihazları (web/android/ios)
  push_log      -> her gönderim denemesi için bir satır (teşhis)

Uçlar (giriş gerekli):
- POST   /devices/register  -> token'ı ekle/güncelle (token benzersiz; sahibi değişebilir)
- GET    /devices           -> kullanıcının aktif cihazları
- DELETE /devices/{id}      -> cihazı pasifleştir (sadece kendi cihazı)

Admin:
- POST /admin/push/test     -> yalnızca ADMİNİN KENDİ cihazlarına test push'u
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import engine, get_db
from app.core.deps import get_admin_user, get_current_user
from app.models.user import User
from app.services import push as push_service

router = APIRouter(tags=["devices"])

_IS_PG = engine.dialect.name == "postgresql"
_NOW = "now()" if _IS_PG else "CURRENT_TIMESTAMP"
_TS = "TIMESTAMPTZ" if _IS_PG else "TIMESTAMP"
_PK = "SERIAL PRIMARY KEY" if _IS_PG else "INTEGER PRIMARY KEY AUTOINCREMENT"
_BIGPK = "BIGSERIAL PRIMARY KEY" if _IS_PG else "INTEGER PRIMARY KEY AUTOINCREMENT"
_BOOL_T = "TRUE" if _IS_PG else "1"

PLATFORMS = ("web", "android", "ios")

CREATE_DEVICE_TOKENS_SQL = f"""
CREATE TABLE IF NOT EXISTS device_tokens (
    id {_PK},
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    platform VARCHAR(10) NOT NULL,
    device_label VARCHAR(80),
    user_agent TEXT,
    is_active BOOLEAN NOT NULL DEFAULT {_BOOL_T},
    last_seen_at {_TS} DEFAULT {_NOW},
    created_at {_TS} DEFAULT {_NOW}
)
"""

# Gönderimde "kullanıcının aktif cihazları" sorgusu için kısmi indeks.
CREATE_DEVICE_INDEX_SQL = (
    "CREATE INDEX IF NOT EXISTS ix_device_tokens_user_active "
    "ON device_tokens (user_id) WHERE is_active"
)

CREATE_PUSH_LOG_SQL = f"""
CREATE TABLE IF NOT EXISTS push_log (
    id {_BIGPK},
    user_id INTEGER,
    type_code VARCHAR(48),
    route TEXT,
    platform VARCHAR(10),
    status VARCHAR(16),
    error TEXT,
    created_at {_TS} DEFAULT {_NOW}
)
"""


async def ensure_push_tables() -> None:
    """Tabloları + indeksi oluştur (yoksa) — idempotent."""
    async with engine.begin() as conn:
        await conn.execute(text(CREATE_DEVICE_TOKENS_SQL))
        await conn.execute(text(CREATE_PUSH_LOG_SQL))
        try:
            await conn.execute(text(CREATE_DEVICE_INDEX_SQL))
        except Exception as e:
            # Kısmi indeksi desteklemeyen dialekt olursa gönderim yine çalışır.
            print(f"[startup] device_tokens kısmi indeksi atlandı: {e}")


# ---------------------------------------------------------------- cihaz uçları

class DeviceIn(BaseModel):
    token: str = Field(min_length=10)
    platform: Literal["web", "android", "ios"] = "web"
    device_label: str = ""


@router.post("/devices/register")
async def register_device(
    body: DeviceIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Token'ı kaydeder/tazeler.

    Token benzersizdir: aynı token başka bir hesapta kayıtlıysa (ortak cihaz,
    çıkış yapıp başka hesapla girme) MEVCUT KULLANICIYA devredilir.
    """
    token = body.token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token boş olamaz.")
    ua = (request.headers.get("user-agent") or "")[:1000]
    label = (body.device_label or "").strip()[:80]

    await db.execute(
        text(
            "INSERT INTO device_tokens (user_id, token, platform, device_label, user_agent, "
            f"                          is_active, last_seen_at) "
            f"VALUES (:uid, :token, :platform, :label, :ua, {_BOOL_T}, {_NOW}) "
            "ON CONFLICT (token) DO UPDATE SET "
            "  user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, "
            "  device_label = EXCLUDED.device_label, user_agent = EXCLUDED.user_agent, "
            f"  is_active = {_BOOL_T}, last_seen_at = {_NOW}"
        ),
        {"uid": user.id, "token": token, "platform": body.platform, "label": label, "ua": ua},
    )
    await db.commit()
    return {"ok": True}


@router.get("/devices")
async def list_devices(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        text(
            "SELECT id, platform, device_label, last_seen_at FROM device_tokens "
            "WHERE user_id = :uid AND is_active = TRUE ORDER BY last_seen_at DESC, id DESC"
        ),
        {"uid": user.id},
    )
    return {
        "devices": [
            {
                "id": r[0], "platform": r[1] or "web",
                "device_label": r[2] or "",
                "last_seen_at": r[3].isoformat() if hasattr(r[3], "isoformat") else (str(r[3]) if r[3] else None),
            }
            for r in res.fetchall()
        ]
    }


@router.delete("/devices/{device_id}")
async def delete_device(
    device_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cihazı pasifleştirir. Sadece KENDİ cihazı — başkasınınki 404."""
    res = await db.execute(
        text("UPDATE device_tokens SET is_active = FALSE "
             "WHERE id = :id AND user_id = :uid AND is_active = TRUE"),
        {"id": device_id, "uid": user.id},
    )
    await db.commit()
    if (res.rowcount or 0) == 0:
        raise HTTPException(status_code=404, detail="Cihaz bulunamadı.")
    return {"ok": True}


# ---------------------------------------------------------------- admin test

@router.post("/admin/push/test")
async def admin_push_test(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Yalnızca ADMİNİN KENDİ cihazlarına test push'u. Tercih/sessiz saat atlanır."""
    if not push_service.push_configured():
        return {
            "ok": False, "configured": False, "devices": 0, "sent": 0, "failed": 0,
            "detail": "FIREBASE_CREDENTIALS_B64 tanımlı değil veya geçersiz.",
        }
    out = await push_service.send_test_to_user(
        db, admin.id,
        title="Test bildirimi",
        body="Kelime Tahmin push bildirimleri çalışıyor. 🎉",
        route="/duyurular",
    )
    return {"ok": (out.get("sent") or 0) > 0, "configured": True, **out}
