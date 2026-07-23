"""
WebSocket maç uçları.

İstemci akışı:
  1. /api/ws/match/{code}?player_id=...&name=...  ile bağlanır.
  2. Sunucu "joined" mesajı yollar; iki oyuncu dolunca "match_start".
  3. İstemci mesajları: {"action":"buzzer"} ve {"action":"guess","word":"..."}.
  4. Sunucu yayınları: state / round_start / buzzer_taken / guess_result /
     turn_timeout / round_over / match_over / error.

Faz 4'te bunun önüne matchmaking (rakip bul + bot) gelecek; oda mantığı
aynı kalacak.
"""

from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.game.room import room_manager
from app.game.models import Player

router = APIRouter()


@router.websocket("/ws/match/{code}")
async def match_ws(
    websocket: WebSocket,
    code: str,
    player_id: str = Query(...),
    name: str = Query("Oyuncu"),
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

    await websocket.send_json({
        "type": "joined",
        "code": room.code,
        "player_id": player_id,
        "players": [p.to_public() for p in room.players.values()],
    })
    # Diğer oyuncuya haber ver.
    await room.broadcast({
        "type": "lobby",
        "players": [p.to_public() for p in room.players.values()],
        "ready": room.is_full,
    })

    # İki oyuncu dolduysa ve maç henüz başlamadıysa başlat.
    if room.is_full and room.match is None:
        await room.start_match()

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            if action == "buzzer":
                await room.handle_buzzer(player_id)
            elif action == "guess":
                await room.handle_guess(player_id, str(data.get("word", "")))
            elif action == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        # Bağlantı koptu — oyuncuyu 'bağlı değil' işaretle, odayı hemen silme
        # (yeniden bağlanabilir). Boş odayı temizle.
        if player_id in room.players:
            room.players[player_id].connected = False
        room.sockets.pop(player_id, None)
        await room.broadcast({
            "type": "lobby",
            "players": [p.to_public() for p in room.players.values()],
            "ready": room.is_full,
        })
        if not room.sockets:
            room_manager.remove(room.code)
