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


async def _fill_achievements(player, player_id: str) -> None:
    """Kayıtlı kullanıcının kupa/madalya/rozet sayılarını DB'den doldurur."""
    if not player_id.startswith("u"):
        return
    try:
        uid = int(player_id[1:])
    except ValueError:
        return
    try:
        from app.core.database import AsyncSessionLocal
        from app.models.league_award import LeagueAward
        from app.models.user import User
        from app.game.badges import earned_badges
        from sqlalchemy import select
        async with AsyncSessionLocal() as db:
            awards = (await db.execute(select(LeagueAward).where(LeagueAward.user_id == uid))).scalars().all()
            player.trophies = sum(1 for a in awards if a.award == "trophy")
            player.medals = sum(1 for a in awards if a.award == "medal")
            u = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
            if u:
                stats = {
                    "wins": u.wins, "matches_played": u.matches_played,
                    "words_solved": u.words_solved, "total_score": u.total_score,
                    "elo": u.elo, "trophies": player.trophies, "medals": player.medals,
                }
                player.badges = len([b for b in earned_badges(stats) if b.get("earned")])
    except Exception:
        pass


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
        # Maç geçmişine kaydet (ana sayfa "son maçlar" için).
        try:
            from app.core.database import AsyncSessionLocal
            from app.models.match_history import MatchHistory
            from app.models.user import User
            from sqlalchemy import select as _select
            p1, p2 = order[0], order[1]
            pl1, pl2 = match.players.get(p1), match.players.get(p2)
            winner_name = ""
            if winner is not None:
                wp = match.players.get(winner)
                winner_name = wp.name if wp else ""

            async def _uname(db, pid, pl):
                # Kayıtlı kullanıcıysa (u{id}, bot değil) username'i çek.
                if pl and pl.is_bot:
                    return ""
                if not pid.startswith("u"):
                    return ""
                try:
                    uid = int(pid[1:])
                except ValueError:
                    return ""
                u = (await db.execute(_select(User).where(User.id == uid))).scalar_one_or_none()
                return u.username if u else ""

            async with AsyncSessionLocal() as db:
                u1 = await _uname(db, p1, pl1)
                u2 = await _uname(db, p2, pl2)
                db.add(MatchHistory(
                    p1_name=(pl1.name if pl1 else "?")[:48],
                    p2_name=(pl2.name if pl2 else "?")[:48],
                    p1_username=u1, p2_username=u2,
                    p1_score=scores.get(p1, 0),
                    p2_score=scores.get(p2, 0),
                    winner_name=winner_name[:48],
                    has_bot=bool((pl1 and pl1.is_bot) or (pl2 and pl2.is_bot)),
                ))
                await db.commit()
        except Exception as e:
            print(f"[match_history] HATA: {e}")
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
        p = Player(id=player_id, name=name[:24] or "Oyuncu")
        # Kayıtlı kullanıcıysa başarı özetini (kupa/madalya/rozet) doldur.
        await _fill_achievements(p, player_id)
        room.players[player_id] = p
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
                await room.send_to_others(player_id, {"type": "rematch_request", "from": player_id})
            elif action == "rematch_accept":
                # Kabul — iki tarafa da yeni maçın başlayacağını bildir + maçı yeniden başlat.
                await room.broadcast({"type": "rematch_accepted"})
                await room.restart_match()
            elif action == "rematch_decline":
                await room.send_to_others(player_id, {"type": "rematch_declined", "from": player_id})
            elif action == "joker":
                kind = str(data.get("kind", ""))
                await room.handle_joker(player_id, kind)
            elif action == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        if player_id in room.players:
            room.players[player_id].connected = False
        room.sockets.pop(player_id, None)

        # Maç DEVAM EDİYORSA ve rakip hâlâ bağlıysa: ayrılan kaybeder, kalan kazanır.
        match_active = room.match is not None and getattr(room.match, "phase", None) is not None
        from app.game.models import MatchPhase
        in_progress = (
            room.match is not None
            and room.match.phase not in (MatchPhase.FINISHED,)
        )
        remaining = [pid for pid in room.sockets.keys()]  # hâlâ bağlı gerçek soketler
        if in_progress and remaining:
            # Kalan oyuncuya "rakip ayrıldı" bildir + maçı onun lehine bitir.
            await room.handle_opponent_left(player_id)
        else:
            await room.broadcast({
                "type": "lobby",
                "players": [p.to_public() for p in room.players.values()],
                "ready": room.is_full,
            })

        # Gerçek soket kalmadıysa ve bot yoksa odayı temizle.
        if not room.sockets:
            room_manager.remove(room.code)
