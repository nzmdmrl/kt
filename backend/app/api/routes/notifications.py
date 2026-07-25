"""
Bildirim uçları.

- GET  /notifications          -> kullanıcının bildirimleri (yeni->eski) + okunmamış sayısı
- POST /notifications/read     -> tümünü okundu işaretle
- POST /notifications/{id}/read -> tek bildirimi okundu işaretle
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.notification import Notification

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(Notification).where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc()).limit(50)
    )
    items = res.scalars().all()
    unread = sum(1 for n in items if not n.read)
    return {"notifications": [n.to_public() for n in items], "unread": unread}


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
