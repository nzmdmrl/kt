"""
Matchmaking uçları — "Rakip Bul" akışı.

İstemci akışı:
  1. POST /api/mm/join   -> kuyruğa girer
  2. GET  /api/mm/poll   -> eşleşene kadar sorgular (her 1-2 sn)
     eşleşince {matched:true, code, opponent_is_bot, bot_elo} döner
  3. İstemci code ile WebSocket'e bağlanır (/api/ws/match/{code})
  4. Rakip bot ise, oda WebSocket bağlantısında bot olarak eklenir.

Bot bilgisi (isim, avatar, elo) oda kurulurken DB'den seçilir.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_optional_user
from app.game.matchmaking import matchmaker
from app.models.user import User

router = APIRouter(prefix="/mm", tags=["matchmaking"])


class JoinIn(BaseModel):
    player_id: str
    name: str
    elo: int = 1000


@router.post("/join")
async def join_queue(data: JoinIn, user: User | None = Depends(get_optional_user)):
    # Giriş yapmışsa gerçek ELO'yu kullan.
    elo = user.elo if user else data.elo
    name = user.display_name if user else data.name
    pid = f"u{user.id}" if user else data.player_id
    entry = await matchmaker.join(pid, name, elo)
    return {
        "player_id": pid,
        "in_queue": True,
        "matched": entry.matched,
        "code": entry.room_code,
    }


@router.get("/poll")
async def poll_queue(player_id: str):
    entry = await matchmaker.poll(player_id)
    if not entry:
        return {"in_queue": False, "matched": False}
    return {
        "in_queue": True,
        "matched": entry.matched,
        "code": entry.room_code,
        "opponent_is_bot": entry.opponent_is_bot,
        "bot_elo": entry.bot_elo,
    }


@router.post("/leave")
async def leave_queue(player_id: str):
    await matchmaker.leave(player_id)
    return {"in_queue": False}


@router.get("/status")
async def mm_status():
    return {"queue_size": matchmaker.queue_size()}
