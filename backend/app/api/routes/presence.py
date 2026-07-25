"""
Online durumu uçları.

- POST /presence/heartbeat  -> "buradayım" sinyali (giriş yapmış kullanıcı)
- GET  /presence/{user_id}  -> bir kullanıcının durumu (gizlilik dikkate alınır)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.game import presence_service

router = APIRouter(prefix="/presence", tags=["presence"])


@router.post("/heartbeat")
async def heartbeat(user: User = Depends(get_current_user)):
    # Maç durumu WS tarafında ayrı set edilir; burada sadece "canlı" işaretle.
    cur = presence_service.get_status(user.id)
    presence_service.heartbeat(user.id, in_match=(cur == "in_match"))
    return {"ok": True}


@router.get("/{user_id}")
async def get_presence(user_id: int, db: AsyncSession = Depends(get_db)):
    # Gizlilik: show_online=False ise offline göster.
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u or not u.show_online:
        return {"status": "offline", "allow_challenges": bool(u.allow_challenges) if u else False}
    return {"status": presence_service.get_status(user_id), "allow_challenges": u.allow_challenges}
