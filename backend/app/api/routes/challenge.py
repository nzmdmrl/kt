"""
Maç teklifi uçları.

- POST /challenge/send/{to_user_id}   -> teklif gönder
- GET  /challenge/incoming            -> bana gelen bekleyen teklif (popup için)
- POST /challenge/{cid}/accept        -> teklifi kabul et (oda kodu döner)
- POST /challenge/{cid}/decline       -> teklifi reddet
- GET  /challenge/outgoing            -> gönderdiğim teklifin durumu (kabul edildi mi?)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.game import challenge_service, presence_service

router = APIRouter(prefix="/challenge", tags=["challenge"])


@router.post("/send/{to_user_id}")
async def send_challenge(to_user_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if to_user_id == user.id:
        raise HTTPException(400, "Kendine teklif gönderemezsin.")
    target = (await db.execute(select(User).where(User.id == to_user_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(404, "Kullanıcı bulunamadı.")
    if not target.allow_challenges:
        raise HTTPException(403, "Bu kullanıcı maç tekliflerine kapalı.")
    # Hedef online ve maçta değil mi?
    status = presence_service.get_status(to_user_id)
    if status == "offline":
        raise HTTPException(409, "Kullanıcı şu an çevrimiçi değil.")
    if status == "in_match":
        raise HTTPException(409, "Kullanıcı şu an maçta.")
    ch = challenge_service.create_challenge(user.id, user.display_name, to_user_id)
    return {"ok": True, "challenge_id": ch["id"]}


@router.get("/incoming")
async def incoming(user: User = Depends(get_current_user)):
    ch = challenge_service.pending_for(user.id)
    if not ch:
        return {"challenge": None}
    return {"challenge": {"id": ch["id"], "from_name": ch["from_name"], "from_id": ch["from_id"]}}


@router.post("/{cid}/accept")
async def accept(cid: str, user: User = Depends(get_current_user)):
    ch = challenge_service.get(cid)
    if not ch or ch["to_id"] != user.id:
        raise HTTPException(404, "Teklif bulunamadı.")
    if ch["status"] != "pending":
        raise HTTPException(409, "Teklif artık geçerli değil.")
    accepted = challenge_service.accept(cid)
    return {"ok": True, "room_code": accepted["room_code"]}


@router.post("/{cid}/decline")
async def decline(cid: str, user: User = Depends(get_current_user)):
    ch = challenge_service.get(cid)
    if not ch or ch["to_id"] != user.id:
        raise HTTPException(404, "Teklif bulunamadı.")
    challenge_service.decline(cid)
    return {"ok": True}


@router.get("/outgoing")
async def outgoing(user: User = Depends(get_current_user)):
    ch = challenge_service.outgoing_status(user.id)
    if not ch:
        return {"challenge": None}
    return {"challenge": {
        "id": ch["id"], "status": ch["status"],
        "room_code": ch["room_code"], "to_id": ch["to_id"],
    }}
