"""
Günün Kelimesi günlük bildirimi — admin uçları.

- GET    /admin/daily-push                  -> ayarlar + metinler + önizleme + alıcı sayısı
- PUT    /admin/daily-push                  -> tek ayar kaydet {key, value}
- POST   /admin/daily-push/messages         -> yeni metin {text}
- PUT    /admin/daily-push/messages/{id}    -> metni düzenle {text?, active?}
- DELETE /admin/daily-push/messages/{id}    -> metni sil
- POST   /admin/daily-push/test             -> bildirimi ŞİMDİ yalnız admine gönder

Gönderim mantığı app/services/daily_word_push.py içinde.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_admin_user
from app.models.daily_push_message import DailyPushMessage
from app.models.user import User
from app.services import daily_word_push as svc

router = APIRouter(tags=["daily-push"])

# Panelden değiştirilebilen ayarlar ve doğrulama kuralları.
_SETTINGS: dict[str, str] = {
    "daily_word_push_enabled": "bool",
    "daily_word_push_hour": "hour",
    "daily_word_push_active_days": "days",
    "daily_word_push_title": "text",
    "daily_word_push_length": "length",
    "daily_word_push_box": "box",
}


async def _state(db: AsyncSession) -> dict:
    from app.game.settings_service import cached_str
    rows = (await db.execute(
        select(DailyPushMessage).order_by(DailyPushMessage.sort_order, DailyPushMessage.id)
    )).scalars().all()
    return {
        "enabled": svc.enabled(),
        "hour": svc.send_hour(),
        "active_days": svc.active_days(),
        "title": svc.push_title(),
        "length": svc.word_length(),
        "box": svc.box_char(),
        "messages": [r.to_public() for r in rows],
        # Bugünün ipucu ve örnek bildirim — panelde canlı önizleme.
        "hint": svc.hint_for(svc.today_word()),
        "preview": await svc.preview_body(db),
        "recipients": await svc.recipient_count(db),
        "last_sent": cached_str(svc.LAST_DATE_KEY, "") or "",
    }


@router.get("/admin/daily-push")
async def admin_get(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    return await _state(db)


class SettingIn(BaseModel):
    key: str
    value: str


@router.put("/admin/daily-push")
async def admin_set(data: SettingIn, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    kind = _SETTINGS.get(data.key)
    if not kind:
        raise HTTPException(400, "Bilinmeyen ayar.")
    raw = (data.value or "").strip()

    if kind == "bool":
        value = "1" if raw.lower() in ("1", "true", "on", "yes") else "0"
    elif kind == "hour":
        try:
            value = str(max(0, min(23, int(raw))))
        except ValueError:
            raise HTTPException(400, "Saat 0-23 arasında olmalı.")
    elif kind == "days":
        try:
            value = str(max(1, min(365, int(raw))))
        except ValueError:
            raise HTTPException(400, "Gün sayısı 1-365 arasında olmalı.")
    elif kind == "length":
        try:
            value = str(max(4, min(6, int(raw))))
        except ValueError:
            raise HTTPException(400, "Uzunluk 4-6 arasında olmalı.")
    elif kind == "box":
        # Tek bir simge yeter; uzun metin ipucunu okunmaz hâle getirir.
        value = raw[:4] or "⬜"
    else:
        value = raw[:120]

    from app.game.settings_service import set_setting
    await set_setting(db, data.key, value)
    return {"ok": True, **await _state(db)}


class MessageIn(BaseModel):
    text: str


@router.post("/admin/daily-push/messages")
async def admin_add(data: MessageIn, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    text = (data.text or "").strip()
    if not text:
        raise HTTPException(400, "Metin boş olamaz.")
    last = (await db.execute(
        select(DailyPushMessage.sort_order).order_by(DailyPushMessage.sort_order.desc()).limit(1)
    )).scalar_one_or_none()
    row = DailyPushMessage(text=text[:300], sort_order=(last or 0) + 1, active=True)
    db.add(row)
    await db.commit()
    return {"ok": True, "message": row.to_public()}


class MessageUpdate(BaseModel):
    text: str | None = None
    active: bool | None = None


@router.put("/admin/daily-push/messages/{msg_id}")
async def admin_update(msg_id: int, data: MessageUpdate,
                       admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    row = (await db.execute(
        select(DailyPushMessage).where(DailyPushMessage.id == msg_id)
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Metin bulunamadı.")
    if data.text is not None:
        text = data.text.strip()
        if not text:
            raise HTTPException(400, "Metin boş olamaz.")
        row.text = text[:300]
    if data.active is not None:
        row.active = data.active
    await db.commit()
    return {"ok": True, "message": row.to_public()}


@router.delete("/admin/daily-push/messages/{msg_id}")
async def admin_delete(msg_id: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    row = (await db.execute(
        select(DailyPushMessage).where(DailyPushMessage.id == msg_id)
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Metin bulunamadı.")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.post("/admin/daily-push/test")
async def admin_test(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Bildirimi ŞİMDİ yalnız yöneticinin kendisine gönderir (deneme).

    Günlük gönderim damgasına DOKUNMAZ — deneme yapmak o günün gerçek
    bildirimini iptal etmez.
    """
    res = await svc.send_now(db, only_user_id=admin.id)
    return {"ok": True, **res}
