"""
Arena WebSocket — 5 oyunculu senkron yarışma.

İstemci akışı:
  1) WS bağlan /ws/arena  (token ile kimlik)
  2) Sunucu: eşleşmeye alır, {type:"lobby", code, players:[...]} yayınlar (katılım güncellenir)
  3) 5 kişi VEYA 30sn -> {type:"match_start", players:[...]}
  4) Her soru: {type:"countdown", n:3..1} sonra {type:"question", index, length, first_letter,
     scrambled:[...], duration}
  5) İstemci cevap: {action:"answer", guess:"..."} -> {type:"answer_result", correct, gained, flash}
     Ayrıca herkese {type:"player_answered", pid, correct, flash}
  6) Süre/herkes bitince: {type:"reveal", answer, players:[...]} (kısa) -> sonraki soru
  7) 6 soru sonra: {type:"finished", ranking:[...]}

Sunucu tek görev (asyncio task) ile maçı sürer; oyuncular sadece cevap yollar.
Tek instance varsayımı (bellekte). Bağlantı yönetimi basit tutuldu.
"""

from __future__ import annotations

import asyncio
import random
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from sqlalchemy import select

from app.core.database import AsyncSessionLocal, get_db
from app.core.deps import get_current_user
from app.core.security import decode_token
from app.core.config import get_settings
from app.models.user import User
from app.game.arena import ArenaMatch, QUESTION_PLAN, FLASH_SECONDS
from app.game.arena_manager import arena_manager, ARENA_SIZE, WAIT_SECONDS
from app.game.settings_service import cached_int
from app.words.word_service import get_pool

router = APIRouter()


@router.get("/arena/history")
async def arena_history(
    limit: int = 20,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Kullanıcının Arena maç geçmişi (kaçıncı oldu, skor, doğru sayısı)."""
    from app.models.arena_history import ArenaHistory
    from sqlalchemy import select as _select
    rows = (await db.execute(
        _select(ArenaHistory).where(ArenaHistory.user_id == user.id)
        .order_by(ArenaHistory.created_at.desc()).limit(min(limit, 50))
    )).scalars().all()
    return {"matches": [r.to_public() for r in rows]}

# Aktif WS bağlantıları: code -> {pid: websocket}
_connections: dict[str, dict[str, WebSocket]] = {}
# Maçı süren görev başladı mı: code -> True
_runners: dict[str, bool] = {}


async def _broadcast(code: str, message: dict):
    conns = _connections.get(code, {})
    dead = []
    for pid, ws in list(conns.items()):
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(pid)
    for pid in dead:
        conns.pop(pid, None)


async def _send(ws: WebSocket, message: dict):
    try:
        await ws.send_json(message)
    except Exception:
        pass


def _pick_words() -> list[str]:
    """6 kelime: QUESTION_PLAN'a göre (2x4,2x5,2x6), member havuzundan."""
    lang = get_settings().GAME_LANG
    words = []
    for length in QUESTION_PLAN:
        words.append(get_pool(length, lang).random_word())
    return words


async def _run_match(code: str):
    """Maçı baştan sona süren tek görev (senkron akış)."""
    match = arena_manager.get_match(code)
    if not match:
        return

    # Başlangıç bilgisi
    await _broadcast(code, {"type": "match_start", "players": match.player_list()})
    await asyncio.sleep(1.5)

    for index in range(len(match.questions)):
        # Geri sayım 3-2-1 (sıradaki kelimenin uzunluğuyla)
        next_len = match.questions[index].length
        for n in (3, 2, 1):
            await _broadcast(code, {"type": "countdown", "n": n, "index": index, "total": len(match.questions), "length": next_len})
            await asyncio.sleep(1.0)

        q = match.start_question(index)
        await _broadcast(code, {
            "type": "question",
            "index": index,
            "total": len(match.questions),
            "length": q.length,
            "first_letter": q.word[0],
            "scrambled": q.scrambled,
            "duration": q.duration,
        })

        # Botlar için rastgele cevap zamanları planla
        _schedule_bots(match, q)

        # Süre boyunca bekle; herkes cevapladıysa erken bitir
        elapsed = 0.0
        tick = 0.25
        while elapsed < q.duration:
            await asyncio.sleep(tick)
            elapsed += tick
            _apply_due_bots(match, q, elapsed)
            if match.all_answered():
                break

        # Reveal — tablo (her oyuncunun tüm soru geçmişi) + skorlar
        rev = match.reveal()
        await _broadcast(code, {
            "type": "reveal",
            "index": index,
            "total": rev["total"],
            "answer": rev["answer"],
            "players": rev["players"],
            "scores": {p.pid: p.score for p in match.players.values()},
        })
        # Tablo gösterim süresi (admin: arena_reveal_seconds)
        await asyncio.sleep(cached_int("arena_reveal_seconds", 4))

    # Bitiş
    match.state = "finished"
    ranking = match.final_ranking()
    await _broadcast(code, {"type": "finished", "ranking": ranking})
    await _persist_results(match)
    # temizlik (bir süre sonra)
    await asyncio.sleep(2.0)
    arena_manager.cleanup(code)
    _connections.pop(code, None)
    _runners.pop(code, None)


# ---- bot cevap planlama ----
def _schedule_bots(match: ArenaMatch, q):
    """Her bota bir cevap zamanı + doğru/yanlış kararı ver."""
    q._bot_plan = {}  # type: ignore
    for p in match.players.values():
        if not p.is_bot:
            continue
        # Bot doğruluk oranı ve hızı (zorluk arttıkça yavaş/yanlış)
        correct_chance = {4: 0.85, 5: 0.7, 6: 0.55}.get(q.length, 0.7)
        will_correct = random.random() < correct_chance
        # cevap zamanı: sürenin %20-%95 arası
        answer_at = q.duration * random.uniform(0.2, 0.95)
        q._bot_plan[p.pid] = {"at": answer_at, "correct": will_correct, "done": False}  # type: ignore


def _apply_due_bots(match: ArenaMatch, q, elapsed: float):
    """Zamanı gelen botların cevabını işle."""
    plan = getattr(q, "_bot_plan", {})
    for pid, info in plan.items():
        if info["done"] or elapsed < info["at"]:
            continue
        info["done"] = True
        p = match.players.get(pid)
        if not p or p.answered:
            continue
        guess = q.word if info["correct"] else _wrong_guess(q.word)
        match.submit(pid, guess)
        # botun cevabını yayınla (fire-and-forget)
        asyncio.create_task(_broadcast(match.code, {
            "type": "player_answered",
            "pid": pid, "correct": p.correct, "flash": p.flash,
        }))


def _wrong_guess(word: str) -> str:
    """Botun yanlış cevabı: harfleri karıştır (yanlış sıra)."""
    letters = list(word)
    for _ in range(5):
        random.shuffle(letters)
        cand = "".join(letters)
        if cand != word:
            return cand
    return word[::-1]


async def _persist_results(match: ArenaMatch):
    """Arena sonucu: geçmişe kaydet + gerçek oyunculara XP ver."""
    try:
        ranking = match.final_ranking()
        rank_by_pid = {r["pid"]: r["rank"] for r in ranking}
        player_count = len(match.players)
        total_words = len(match.questions)
        from app.game.xp_service import grant_xp
        from app.models.user import User
        from app.models.arena_history import ArenaHistory
        from sqlalchemy import select as _select
        async with AsyncSessionLocal() as db:
            for pid, p in match.players.items():
                if p.is_bot or not pid.startswith("u"):
                    continue
                try:
                    uid = int(pid[1:])
                except ValueError:
                    continue
                user = (await db.execute(_select(User).where(User.id == uid))).scalar_one_or_none()
                if not user:
                    continue
                rank = rank_by_pid.get(pid, 0)
                # Geçmişe kaydet
                db.add(ArenaHistory(
                    user_id=uid, rank=rank, score=p.score,
                    correct_count=p.correct_count, total_words=total_words,
                    player_count=player_count,
                ))
                # Katılım XP'si
                await grant_xp(db, user, "arena_played")
                # 1. olduysa ek XP
                if rank == 1:
                    await grant_xp(db, user, "arena_win")
            await db.commit()
    except Exception as e:
        print(f"[arena xp] HATA: {e}")


@router.websocket("/ws/arena")
async def arena_ws(websocket: WebSocket, token: str = Query(default="")):
    await websocket.accept()

    # Kimlik doğrula
    user = None
    try:
        uid = decode_token(token)
        if uid:
            async with AsyncSessionLocal() as db:
                user = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    except Exception:
        user = None
    if not user:
        await _send(websocket, {"type": "error", "message": "Giriş gerekli."})
        await websocket.close()
        return

    pid = f"u{user.id}"
    name = user.username or user.display_name or "Oyuncu"
    avatar = user.avatar_url or ""

    # Eşleşmeye katıl
    code = await arena_manager.join(pid, name, avatar)
    _connections.setdefault(code, {})[pid] = websocket

    # Lobi durumunu yayınla
    lobby = arena_manager.lobby_for(code)
    if lobby:
        await _broadcast(code, {
            "type": "lobby",
            "code": code,
            "players": [{"pid": k, "name": v["name"], "avatar_url": v.get("avatar_url", "")} for k, v in lobby.members.items()],
            "size": ARENA_SIZE,
            "wait_seconds": WAIT_SECONDS,
        })
        # Eşleşme başlatıcı: ilk giren tetikler (dolunca veya süre dolunca)
        asyncio.create_task(_matchmaker(code))

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            if action == "answer":
                match = arena_manager.get_match(code)
                if match:
                    res = match.submit(pid, data.get("guess", ""))
                    if res.get("ok"):
                        await _send(websocket, {"type": "answer_result", **res})
                        p = match.players.get(pid)
                        await _broadcast(code, {
                            "type": "player_answered",
                            "pid": pid, "correct": p.correct if p else False,
                            "flash": p.flash if p else False,
                        })
    except WebSocketDisconnect:
        conns = _connections.get(code, {})
        conns.pop(pid, None)
    except Exception:
        pass


async def _matchmaker(code: str):
    """Bir lobiyi 5 kişi VEYA süre dolunca başlatır. Eksikse botlar 2sn arayla katılır."""
    if _runners.get(code):
        return
    lobby = arena_manager.lobby_for(code)
    if not lobby:
        return

    # Bekleme döngüsü (5 kişi veya süre dolana kadar)
    while True:
        await asyncio.sleep(0.5)
        lobby = arena_manager.lobby_for(code)
        if lobby is None:
            return
        if lobby.started:
            return
        if lobby.is_full() or lobby.waited_enough():
            break

    if _runners.get(code):
        return
    _runners[code] = True

    words = _pick_words()
    match = await arena_manager.build_match(code, words)  # sadece gerçek oyuncular

    # Botları 2sn (admin: arena_bot_interval) arayla tek tek ekle + yayınla
    interval = cached_int("arena_bot_interval", 2)
    while len(match.players) < ARENA_SIZE:
        await asyncio.sleep(interval)
        bot = arena_manager.add_one_bot(code)
        if not bot:
            break
        await _broadcast(code, {
            "type": "lobby",
            "code": code,
            "players": match.player_list(),
            "size": ARENA_SIZE,
            "joined_bot": bot,   # yeni katılan bot (istemci animasyon için)
        })

    # Kısa bekleme, sonra maçı başlat
    await asyncio.sleep(0.8)
    asyncio.create_task(_run_match(code))
