"""Oda oluşturma / kontrol HTTP uçları (WebSocket öncesi)."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, or_, select

from app.core.database import get_db
from app.core.deps import get_current_user
from app.game.room import room_manager

router = APIRouter(prefix="/room", tags=["room"])


class CreateRoomIn(BaseModel):
    host: str = ""            # Odayı kuranın görünen adı (davet linki başlığı için)
    size: int = 2             # kaç kişilik oda (2-4)
    rounds: int = 1           # tur sayısı (1-5) — her tur 5 veya 6 harfli rastgele kelime
    wait_seconds: int = 120   # bu sürede dolmazsa oda pasifleşir (30-600)
    custom: bool = False      # "Özel Oda Kur" akışı mı (tur/kişi ayarları geçerli)


@router.post("/create")
async def create_room(data: Optional[CreateRoomIn] = None):
    """Yeni bir oda kodu üretir. Oyuncular bu kodla WebSocket'e bağlanır."""
    import asyncio
    code = room_manager.new_code()
    # Odayı önden oluştur (ilk katılan beklemede kalır).
    room = room_manager.get_or_create(code)
    if data:
        if data.host:
            room.host_name = data.host.strip()[:24]
        room.configure(size=data.size, rounds=data.rounds,
                       wait_seconds=data.wait_seconds, custom=data.custom)
        if data.custom:
            # Süre dolarsa oda pasifleşsin (bekleyenlere bildirilir).
            # NOT: bu uç async olmalı — senkron def threadpool'da çalışır ve
            # get_running_loop() hata verip görev hiç başlamaz.
            asyncio.create_task(room.watch_expiry())
    return {**room.public_info(), "code": code, "host_name": room.host_name}


class RoomInviteIn(BaseModel):
    code: str
    friend_ids: list[int]


@router.post("/invite")
async def invite_to_room(data: RoomInviteIn, user=Depends(get_current_user), db=Depends(get_db)):
    """Arkadaşları özel 1v1 odasına davet et — her birine bildirim gönder."""
    from app.models.friendship import Friendship
    from app.models.notification import Notification
    from app.services.push import send_to_user_bg

    code = (data.code or "").strip().upper()
    room = room_manager.rooms.get(code)
    if not room:
        raise HTTPException(404, "Oda bulunamadı.")

    inviter = user.display_name or user.username
    n_title = "Düello daveti"
    n_body = f"{inviter} seni özel odada 1v1 düelloya davet etti."
    link = f"/oyna?join={code}"
    invited: list[int] = []
    sent = 0
    for fid in data.friend_ids[:20]:
        # Gerçekten arkadaş mı doğrula
        f = (await db.execute(select(Friendship).where(and_(
            Friendship.status == "accepted",
            or_(
                and_(Friendship.requester_id == user.id, Friendship.addressee_id == fid),
                and_(Friendship.requester_id == fid, Friendship.addressee_id == user.id),
            ),
        )))).scalar_one_or_none()
        if not f:
            continue
        db.add(Notification(
            user_id=fid, kind="room_invite", type_code="room_invite",
            title=n_title,
            body=n_body,
            icon="🎮",
            link=link,
        ))
        invited.append(fid)
        sent += 1
    await db.commit()
    for fid in invited:
        send_to_user_bg(fid, "room_invite", n_title, n_body, link,
                        ctx={"code": code, "from_user_id": user.id})
    return {"ok": True, "sent": sent}


@router.get("/{code}")
def room_status(code: str):
    """Oda var mı, kaç kişi bağlı, dolu mu, kaç saniyesi kaldı?"""
    room = room_manager.rooms.get(code.upper())
    if not room:
        raise HTTPException(status_code=404, detail="Oda bulunamadı")
    return room.public_info()
