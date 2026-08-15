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
async def join_queue(data: JoinIn, user: User | None = Depends(get_optional_user), db: AsyncSession = Depends(get_db)):
    # Misafir 1v1 erişimi admin ayarıyla kapatılmış olabilir.
    if not user:
        from app.game.settings_service import cached_bool
        if not cached_bool("guest_match_enabled", True):
            return {
                "player_id": data.player_id,
                "in_queue": False,
                "guest_blocked": True,
                "message": "1v1 düello için giriş yapmalısın.",
            }
    # Terk cezası: engelli kullanıcı eşleştirmeye giremez.
    if user:
        from app.game.abandon_service import is_matchmaking_banned
        banned, remaining = await is_matchmaking_banned(db, user.id)
        if banned:
            mins = (remaining + 59) // 60
            return {
                "player_id": f"u{user.id}",
                "in_queue": False,
                "banned": True,
                "ban_remaining_seconds": remaining,
                "message": f"Maçları sık terk ettiğin için {mins} dakika eşleştirme engellisin. Bota karşı oynayabilirsin.",
            }
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
