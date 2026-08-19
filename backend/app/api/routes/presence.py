"""
Online durumu uçları.

- POST /presence/heartbeat  -> "buradayım" sinyali (giriş yapmış kullanıcı)
- GET  /presence/{user_id}  -> bir kullanıcının durumu (gizlilik dikkate alınır)
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.game import presence_service

router = APIRouter(prefix="/presence", tags=["presence"])


@router.post("/heartbeat")
async def heartbeat(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Maç durumu WS tarafında ayrı set edilir; burada sadece "canlı" işaretle.
    cur = presence_service.get_status(user.id)
    presence_service.heartbeat(user.id, in_match=(cur == "in_match"))
    # Kullanıcının SON kullandığı ortam (admin üye listesindeki cihaz simgesi).
    # Heartbeat her sayfada 30 sn'de bir geldiği için en güncel bilgi burasıdır.
    # Yalnız DEĞİŞTİYSE yazılır — her 30 saniyede bir UPDATE atılmasın.
    try:
        from app.core.platform import platform_from_request
        p = platform_from_request(request)
        dirty = False
        if user.last_platform != p:
            user.last_platform = p
            dirty = True
        # "Son aktif" damgası — günlük Günün Kelimesi bildirimi kime gideceğini
        # buradan bilir. SAATTE BİR yazılır: heartbeat 30 sn'de bir geliyor,
        # her seferinde UPDATE atmanın anlamı yok.
        now = datetime.now(timezone.utc)
        last = user.last_active_at
        if last is not None and last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if last is None or (now - last) > timedelta(hours=1):
            user.last_active_at = now
            dirty = True
        if dirty:
            await db.commit()
    except Exception:
        pass
    return {"ok": True}


@router.get("/{user_id}")
async def get_presence(user_id: int, db: AsyncSession = Depends(get_db)):
    # Gizlilik: show_online=False ise offline göster.
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u or not u.show_online:
        return {"status": "offline", "allow_challenges": bool(u.allow_challenges) if u else False}
    return {"status": presence_service.get_status(user_id), "allow_challenges": u.allow_challenges}
