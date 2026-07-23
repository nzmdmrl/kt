"""Oda oluşturma / kontrol HTTP uçları (WebSocket öncesi)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.game.room import room_manager

router = APIRouter(prefix="/room", tags=["room"])


@router.post("/create")
def create_room():
    """Yeni bir oda kodu üretir. İki oyuncu bu kodla WebSocket'e bağlanır."""
    code = room_manager.new_code()
    # Odayı önden oluştur (ilk katılan beklemede kalır).
    room_manager.get_or_create(code)
    return {"code": code}


@router.get("/{code}")
def room_status(code: str):
    """Oda var mı, kaç kişi bağlı, dolu mu?"""
    room = room_manager.rooms.get(code.upper())
    if not room:
        raise HTTPException(status_code=404, detail="Oda bulunamadı")
    return {
        "code": room.code,
        "player_count": len(room.players),
        "is_full": room.is_full,
        "match_started": room.match is not None,
    }
