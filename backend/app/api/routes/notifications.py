"""
Bildirim uçları.

- GET  /notifications          -> kullanıcının bildirimleri (yeni->eski) + okunmamış sayısı
- POST /notifications/read     -> tümünü okundu işaretle
- POST /notifications/{id}/read -> tek bildirimi okundu işaretle
- POST /notifications/delete   -> seçilenleri sil {ids:[...]} (toplu silme)
- DELETE /notifications        -> kullanıcının TÜM bildirimlerini sil
- DELETE /notifications/{id}   -> tek bildirimi sil

Eski bildirimler ayrıca otomatik silinir (app/services/notification_cleanup.py,
admin ayarı `notification_retention_days`, varsayılan 30 gün).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, update, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.notification import Notification
from app.services.notification_cleanup import retention_days

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(Notification).where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc()).limit(50)
    )
    items = res.scalars().all()
    unread = sum(1 for n in items if not n.read)
    # retention_days: arayüz "X günden eski bildirimler otomatik silinir" yazar.
    return {
        "notifications": [n.to_public() for n in items],
        "unread": unread,
        "retention_days": retention_days(),
    }


@router.post("/read")
async def mark_all_read(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(
        update(Notification).where(Notification.user_id == user.id, Notification.read == False).values(read=True)
    )
    await db.commit()
    return {"ok": True}


@router.post("/{notif_id}/read")
async def mark_read(notif_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Notification).where(Notification.id == notif_id, Notification.user_id == user.id))
    n = res.scalar_one_or_none()
    if n:
        n.read = True
        await db.commit()
    return {"ok": True}


class DeleteIn(BaseModel):
    ids: list[int] = []


@router.post("/delete")
async def delete_many(data: DeleteIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Seçilen bildirimleri sil (toplu). Sadece kendi bildirimlerini siler."""
    ids = [int(i) for i in data.ids][:200]
    if not ids:
        return {"ok": True, "deleted": 0}
    res = await db.execute(
        delete(Notification).where(Notification.user_id == user.id, Notification.id.in_(ids))
    )
    await db.commit()
    return {"ok": True, "deleted": int(res.rowcount or 0)}


@router.delete("")
async def delete_all(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Kullanıcının tüm bildirimlerini sil."""
    res = await db.execute(delete(Notification).where(Notification.user_id == user.id))
    await db.commit()
    return {"ok": True, "deleted": int(res.rowcount or 0)}


@router.delete("/{notif_id}")
async def delete_one(notif_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Tek bildirimi sil."""
    res = await db.execute(
        delete(Notification).where(Notification.id == notif_id, Notification.user_id == user.id)
    )
    await db.commit()
    return {"ok": True, "deleted": int(res.rowcount or 0)}
