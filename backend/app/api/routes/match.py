"""
WebSocket maç uçları.

İstemci akışı:
  1. /api/ws/match/{code}?player_id=...&name=...  ile bağlanır.
     Matchmaking bot atadıysa: &bot=1&bot_elo=...  eklenir.
  2. Sunucu "joined" mesajı yollar; iki oyuncu (veya oyuncu+bot) dolunca "match_start".
  3. İstemci mesajları: {"action":"buzzer"} ve {"action":"guess","word":"..."}.
  4. Sunucu yayınları: state / round_start / buzzer_taken / guess_result /
     turn_timeout / round_over / match_over / error.
"""

from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.game.room import room_manager
from app.game.models import Player
from app.core.config import get_settings

router = APIRouter()
settings = get_settings()


async def _add_bot_to_room(room, bot_elo: int):
    """Odaya DB'den seçilmiş uygun bir bot ekler. DB yoksa jenerik bot."""
    try:
        from app.core.database import AsyncSessionLocal
        from app.game.match_result import pick_bot
        async with AsyncSessionLocal() as db:
            bot = await pick_bot(db, bot_elo, settings.GAME_LANG)
            if bot:
                room.add_bot(f"bot{bot.id}", bot.name, bot.elo, bot.avatar_url, settings.GAME_LANG)
                return
    except Exception:
        pass
    # Yedek: DB'siz jenerik bot
    import random
    room.add_bot(f"botX{random.randint(1000,9999)}", "Rakip", bot_elo, None, settings.GAME_LANG)


def _attach_stats_callback(room):
    """Maç bitince gerçek kullanıcıların istatistik/ELO'sunu ve lig puanını günceller."""
    async def on_over(match, result):
        from app.core.database import AsyncSessionLocal
        from app.game.match_result import apply_match_result
        order = match.player_order
        scores = result["scores"]
        winner = result["winner"]
        try:
            async with AsyncSessionLocal() as db:
                for pid in order:
                    if not pid.startswith("u"):  # sadece gerçek kullanıcılar (u{id})
                        continue
                    try:
                        uid = int(pid[1:])
                    except ValueError:
                        continue
                    opp = match.opponent_of(pid)
                    opp_player = match.players.get(opp)
                    opp_elo = getattr(opp_player, "elo", 1000) or 1000
                    won = (winner == pid)
                    draw = (winner is None)
                    await apply_match_result(
                        db, uid, opp_elo,
                        won=won, draw=draw,
                        score=scores.get(pid, 0),
                        words_solved=0,
                    )
        except Exception as e:
            import traceback
            print(f"[stats] HATA: {e}")
            traceback.print_exc()
    room.on_match_over = on_over


@router.websocket("/ws/match/{code}")
async def match_ws(
    websocket: WebSocket,
    code: str,
    player_id: str = Query(...),
    name: str = Query("Oyuncu"),
    bot: int = Query(0),
    bot_elo: int = Query(1000),
):
    await websocket.accept()
    room = room_manager.get_or_create(code.upper())

    # Oda dolu ve bu oyuncu içeride değilse reddet.
    if room.is_full and player_id not in room.players:
        await websocket.send_json({"type": "error", "message": "Oda dolu."})
        await websocket.close()
        return

    # Oyuncuyu kaydet / yeniden bağla.
    if player_id not in room.players:
        room.players[player_id] = Player(id=player_id, name=name[:24] or "Oyuncu")
    else:
        room.players[player_id].connected = True
    room.sockets[player_id] = websocket

    # Bot maçı: oda henüz bot içermiyorsa ekle.
    bot_present = any(p.is_bot for p in room.players.values())
    if bot == 1 and not bot_present and not room.is_full:
        await _add_bot_to_room(room, bot_elo)

    await websocket.send_json({
        "type": "joined",
        "code": room.code,
        "player_id": player_id,
        "players": [p.to_public() for p in room.players.values()],
    })
    await room.broadcast({
        "type": "lobby",
        "players": [p.to_public() for p in room.players.values()],
        "ready": room.is_full,
    })

    # Oda doluysa ve maç başlamadıysa başlat (istatistik callback'i ile).
    if room.is_full and room.match is None:
        _attach_stats_callback(room)
        await room.start_match()

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            if action == "buzzer":
                await room.handle_buzzer(player_id)
            elif action == "guess":
                await room.handle_guess(player_id, str(data.get("word", "")))
            elif action == "emote":
                # Hızlı emoji tepkisi — karşıya yayınla.
                emoji = str(data.get("emoji", ""))[:8]
                if emoji:
                    await room.broadcast({"type": "emote", "player_id": player_id, "emoji": emoji})
            elif action == "rematch_request":
                # Rövanş isteği — SADECE rakibe ilet (isteyene değil).
                print(f"[rematch] {player_id} rövanş istedi, odadaki soketler: {list(room.sockets.keys())}")
                await room.send_to_others(player_id, {"type": "rematch_request", "from": player_id})
            elif action == "rematch_accept":
                # Kabul — iki tarafa da yeni maçın başlayacağını bildir + maçı yeniden başlat.
                print(f"[rematch] {player_id} kabul etti, maç yeniden başlıyor")
                await room.broadcast({"type": "rematch_accepted"})
                await room.restart_match()
            elif action == "rematch_decline":
                print(f"[rematch] {player_id} reddetti")
                await room.send_to_others(player_id, {"type": "rematch_declined", "from": player_id})
            elif action == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        if player_id in room.players:
            room.players[player_id].connected = False
        room.sockets.pop(player_id, None)
        await room.broadcast({
            "type": "lobby",
            "players": [p.to_public() for p in room.players.values()],
            "ready": room.is_full,
        })
        # Sadece gerçek soket kalmadıysa ve bot yoksa odayı temizle.
        if not room.sockets:
            room_manager.remove(room.code)
