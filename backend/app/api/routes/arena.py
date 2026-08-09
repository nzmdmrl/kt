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

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends, HTTPException
from sqlalchemy import select
from pydantic import BaseModel

from app.core.database import AsyncSessionLocal, get_db
from app.core.deps import get_current_user
from app.core.security import decode_token
from app.core.config import get_settings
from app.models.user import User
from app.game.arena import ArenaMatch, FLASH_SECONDS, default_question_plan
from app.game.arena_manager import arena_manager, ARENA_SIZE, WAIT_SECONDS
from app.game.settings_service import cached_int
from app.words.word_service import get_pool

router = APIRouter()


# ============ ÖZEL ARENA ============

class CustomArenaIn(BaseModel):
    name: str = "Özel Arena"
    size: int = 5              # 2..5
    wait_seconds: int = 60     # max 120
    bots_enabled: bool = False
    word_plan: list[int] = [4, 4, 5, 5, 6, 6]   # max 6, her biri 4/5/6


def _sanitize_plan(plan: list[int]) -> list[int]:
    """Kelime planını doğrula: max 6, her biri 4/5/6."""
    clean = [n for n in plan if n in (4, 5, 6)][:6]
    return clean or [4, 4, 5, 5, 6, 6]


@router.post("/arena/custom/create")
async def create_custom_arena(data: CustomArenaIn, user=Depends(get_current_user), db=Depends(get_db)):
    """Özel arena oluştur: lobiyi kur + ayarları 'önceki arenalarım' için kaydet."""
    from app.models.custom_arena import CustomArena
    import json as _json
    plan = _sanitize_plan(data.word_plan)
    size = max(2, min(5, data.size))
    wait = max(10, min(120, data.wait_seconds))
    name = (data.name or "Özel Arena").strip()[:64] or "Özel Arena"

    # Belleğe lobi kur
    owner_pid = f"u{user.id}"
    lobby = arena_manager.create_custom(
        owner_pid=owner_pid, name=name, size=size, wait_seconds=wait,
        bots_enabled=data.bots_enabled, word_plan=plan,
    )
    # Sahibi otomatik katılır
    lobby.add(owner_pid, user.display_name or user.username, user.avatar_url or "")

    # "Önceki arenalarım" için kaydet
    rec = CustomArena(
        owner_id=user.id, name=name, size=size, wait_seconds=wait,
        bots_enabled=1 if data.bots_enabled else 0, word_plan_json=_json.dumps(plan),
    )
    db.add(rec)
    await db.commit()

    return {"code": lobby.code, "name": name, "size": size, "wait_seconds": wait,
            "bots_enabled": data.bots_enabled, "word_plan": plan}


@router.get("/arena/custom/mine")
async def my_custom_arenas(limit: int = 10, user=Depends(get_current_user), db=Depends(get_db)):
    """Önceki özel arenalarım (aynı ayarlarla tekrar açmak için)."""
    from app.models.custom_arena import CustomArena
    rows = (await db.execute(
        select(CustomArena).where(CustomArena.owner_id == user.id)
        .order_by(CustomArena.created_at.desc()).limit(min(limit, 20))
    )).scalars().all()
    return {"arenas": [r.to_public() for r in rows]}


@router.delete("/arena/custom/mine/{arena_id}")
async def delete_custom_arena(arena_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    """Önceki arenalarımdan birini sil (sadece sahibi)."""
    from app.models.custom_arena import CustomArena
    rec = (await db.execute(
        select(CustomArena).where(CustomArena.id == arena_id, CustomArena.owner_id == user.id)
    )).scalar_one_or_none()
    if not rec:
        raise HTTPException(404, "Arena bulunamadı.")
    await db.delete(rec)
    await db.commit()
    return {"ok": True}


@router.get("/arena/custom/{code}")
async def custom_arena_info(code: str, user=Depends(get_current_user)):
    """Bir özel arena lobisinin bilgisi (davet linkiyle girince)."""
    lobby = arena_manager.custom_lobby(code)
    if not lobby:
        raise HTTPException(404, "Arena bulunamadı veya süresi doldu.")
    return {
        "code": lobby.code, "name": lobby.name, "size": lobby.size,
        "wait_seconds": lobby.wait_seconds, "seconds_left": lobby.seconds_left(),
        "bots_enabled": lobby.bots_enabled, "word_plan": lobby.word_plan,
        "players": [{"pid": k, "name": v["name"], "avatar_url": v.get("avatar_url", "")} for k, v in lobby.members.items()],
        "started": lobby.started,
    }


class InviteIn(BaseModel):
    code: str
    friend_ids: list[int]


@router.post("/arena/custom/invite")
async def invite_to_custom_arena(data: InviteIn, user=Depends(get_current_user), db=Depends(get_db)):
    """Arkadaşları özel arenaya davet et — her birine bildirim gönder."""
    from app.models.notification import Notification
    from app.models.friendship import Friendship
    from sqlalchemy import or_, and_
    lobby = arena_manager.custom_lobby(data.code)
    if not lobby:
        raise HTTPException(404, "Arena bulunamadı.")
    if lobby.owner_pid != f"u{user.id}":
        raise HTTPException(403, "Sadece arenayı kuran davet edebilir.")

    inviter = user.display_name or user.username
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
            user_id=fid, kind="arena_invite",
            title="Özel Arena daveti",
            body=f"{inviter} seni '{lobby.name}' arenasına davet etti.",
            icon="🎪",
            link=f"/arena/ozel/{lobby.code}",
        ))
        sent += 1
    await db.commit()
    return {"ok": True, "sent": sent}


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


def _pick_words(plan: list[int] | None = None) -> list[str]:
    """Plana göre kelime seç (varsayılan: oyun moduna göre plan), member havuzundan."""
    lang = get_settings().GAME_LANG
    words = []
    for length in (plan or default_question_plan()):
        words.append(get_pool(length, lang).random_word())
    return words


async def _run_match(code: str, custom: bool = False):
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
    # Önce XP/geçmiş kaydı (rewards_by_pid al), sonra her oyuncuya kendi kazanımıyla finished.
    if custom:
        await _persist_custom_results(match)
        rewards_by_pid = {}
    else:
        rewards_by_pid = await _persist_results(match)
    # Her bağlı oyuncuya kendi rewards'ıyla finished gönder.
    conns = _connections.get(code, {})
    for cpid, ws in list(conns.items()):
        try:
            await ws.send_json({
                "type": "finished",
                "ranking": ranking,
                "rewards": rewards_by_pid.get(cpid),
            })
        except Exception:
            pass
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


async def _persist_custom_results(match: ArenaMatch):
    """Özel arena sonucu: kupa/madalya/XP YOK. Sadece custom_arena_played++ (rozet için)."""
    try:
        from app.models.user import User
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
                user.custom_arena_played = (user.custom_arena_played or 0) + 1
            await db.commit()
    except Exception as e:
        print(f"[custom arena] HATA: {e}")


async def _persist_results(match: ArenaMatch) -> dict:
    """Arena sonucu: geçmişe kaydet + gerçek oyunculara XP ver. rewards_by_pid döndürür."""
    rewards_by_pid: dict = {}
    try:
        ranking = match.final_ranking()
        rank_by_pid = {r["pid"]: r["rank"] for r in ranking}
        player_count = len(match.players)
        total_words = len(match.questions)
        from app.game.xp_service import grant_xp, xp_amount
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
                # Arena istatistik sayaçları (kupa/madalya/rozet için)
                user.arena_played = (user.arena_played or 0) + 1
                medal_notif = None
                if rank == 1:
                    user.arena_first = (user.arena_first or 0) + 1
                    medal_notif = ("🏆", "Arena Şampiyonu!", "Arenada 1. oldun, Arena Şampiyonu kupası kazandın!")
                elif rank == 2:
                    user.arena_second = (user.arena_second or 0) + 1
                    medal_notif = ("🥈", "Arena 2.si!", "Arenada 2. oldun, gümüş madalya kazandın!")
                elif rank == 3:
                    user.arena_third = (user.arena_third or 0) + 1
                    medal_notif = ("🥉", "Arena 3.sü!", "Arenada 3. oldun, bronz madalya kazandın!")
                if medal_notif:
                    try:
                        from app.models.notification import Notification as _Notif
                        _icon, _title, _body = medal_notif
                        db.add(_Notif(
                            user_id=uid, kind="arena_medal",
                            title=_title, body=_body, icon=_icon,
                            link=f"/profil/{user.username}" if user.username else "/profil/me",
                        ))
                    except Exception as e:
                        print(f"[arena madalya bildirim] HATA: {e}")
                # Geçmişe kaydet
                db.add(ArenaHistory(
                    user_id=uid, rank=rank, score=p.score,
                    correct_count=p.correct_count, total_words=total_words,
                    player_count=player_count,
                ))
                # Katılım XP'si (öncesi/sonrası unvanı karşılaştır)
                from app.game.xp_service import title_for_xp
                title_before = title_for_xp(user.xp or 0)["title"]
                r1 = await grant_xp(db, user, "arena_played")
                xp_total = r1.get("gained", 0) if isinstance(r1, dict) else 0
                won = rank == 1
                # 1. olduysa ek XP
                if won:
                    r2 = await grant_xp(db, user, "arena_win")
                    xp_total += r2.get("gained", 0) if isinstance(r2, dict) else 0
                title_after = title_for_xp(user.xp or 0)
                new_title = None
                if title_after["title"] != title_before:
                    new_title = {"name": title_after["title"], "icon": title_after["title_icon"]}
                    try:
                        from app.models.notification import Notification
                        db.add(Notification(
                            user_id=uid, kind="title_up",
                            title="Yeni unvan kazandın!",
                            body=f"{title_after['title_icon']} {title_after['title']} unvanına yükseldin.",
                            icon=title_after["title_icon"],
                            link=f"/profil/{user.username}" if user.username else "/profil/me",
                        ))
                    except Exception as e:
                        print(f"[arena unvan bildirim] HATA: {e}")
                rewards_by_pid[pid] = {
                    "xp_gained": xp_total,
                    "rank": rank,
                    "won": won,
                    "new_title": new_title,
                }
            await db.commit()
    except Exception as e:
        print(f"[arena xp] HATA: {e}")
    return rewards_by_pid


@router.websocket("/ws/arena")
async def arena_ws(websocket: WebSocket, token: str = Query(default=""), custom: str = Query(default="")):
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

    # ---- ÖZEL ARENA ----
    if custom:
        clobby = arena_manager.custom_lobby(custom)
        if not clobby:
            await _send(websocket, {"type": "error", "message": "Arena bulunamadı veya süresi doldu."})
            await websocket.close()
            return
        ok = await arena_manager.join_custom(custom, pid, name, avatar)
        code = custom
        _connections.setdefault(code, {})[pid] = websocket
        if not ok:
            # Maç zaten başlamış olabilir; yine de bağlı kalsın (izleyici/tekrar bağlanan)
            await _send(websocket, {"type": "error", "message": "Arenaya katılınamadı (dolu veya başladı)."})
        clobby = arena_manager.custom_lobby(custom)
        if clobby:
            await _broadcast(code, {
                "type": "lobby", "code": code,
                "players": [{"pid": k, "name": v["name"], "avatar_url": v.get("avatar_url", "")} for k, v in clobby.members.items()],
                "size": clobby.size, "wait_seconds": clobby.wait_seconds,
                "seconds_left": clobby.seconds_left(),
            })
            asyncio.create_task(_custom_matchmaker(code))
        await _arena_receive_loop(websocket, code, pid, name=name, is_custom=True)
        return

    # ---- NORMAL ARENA ----
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

    await _arena_receive_loop(websocket, code, pid, name=name, is_custom=False)


async def _arena_receive_loop(websocket: WebSocket, code: str, pid: str, name: str = "", is_custom: bool = False):
    """WS mesaj döngüsü (answer). Normal ve özel arena ortak."""
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
        await _handle_arena_leave(code, pid, name, is_custom)
    except Exception:
        conns = _connections.get(code, {})
        conns.pop(pid, None)
        await _handle_arena_leave(code, pid, name, is_custom)


async def _handle_arena_leave(code: str, pid: str, name: str, is_custom: bool):
    """Bir oyuncu arenadan çıktı/terk etti — diğerlerine bildir."""
    # Çıkanın adını bul (parametre boşsa lobi/maçtan)
    disp = name
    if not disp:
        clobby = arena_manager.custom_lobby(code)
        if clobby and pid in clobby.members:
            disp = clobby.members[pid].get("name", "")
        else:
            match = arena_manager.get_match(code)
            if match and pid in match.players:
                disp = match.players[pid].name
    disp = disp or "Bir oyuncu"

    # Özel lobiden de çıkar (henüz başlamadıysa)
    clobby = arena_manager.custom_lobby(code)
    if clobby and not clobby.started and pid in clobby.members:
        clobby.members.pop(pid, None)

    # Diğerlerine popup bildirimi
    await _broadcast(code, {
        "type": "player_left",
        "pid": pid,
        "name": disp,
        "message": f"{disp} arenadan çıktı",
    })


async def _custom_matchmaker(code: str):
    """Özel lobiyi başlatır. Bot açıksa son 10sn'de doldurur; kapalıysa gelenlerle (min2) başlar."""
    if _runners.get(code):
        return
    clobby = arena_manager.custom_lobby(code)
    if not clobby:
        return

    bots_added = False
    while True:
        await asyncio.sleep(0.5)
        clobby = arena_manager.custom_lobby(code)
        if clobby is None or clobby.started:
            return
        left = clobby.seconds_left()
        full = clobby.is_full()
        # Bot açıksa: son 10 sn'de eksikleri botla doldur
        if clobby.bots_enabled and not bots_added and left <= 10 and not full:
            bots_added = True  # aşağıda maç kurulunca eklenecek (işaret)
        if full or left <= 0:
            break

    if _runners.get(code):
        return
    _runners[code] = True

    clobby = arena_manager.custom_lobby(code)
    if not clobby:
        _runners.pop(code, None)
        return

    # En az 2 gerçek oyuncu yoksa ve bot kapalıysa iptal
    real_count = len(clobby.members)
    if real_count < 2 and not clobby.bots_enabled:
        await _broadcast(code, {"type": "error", "message": "Yeterli oyuncu katılmadı, arena iptal edildi."})
        _runners.pop(code, None)
        return

    words = _pick_words(clobby.word_plan)
    match = await arena_manager.build_custom_match(code, words)
    if not match:
        _runners.pop(code, None)
        return

    # Bot açıksa: lobinin size'ına kadar botla doldur
    if clobby.bots_enabled:
        interval = cached_int("arena_bot_interval", 2)
        while len(match.players) < clobby.size:
            bot = arena_manager.add_one_bot_custom(code, clobby.size)
            if not bot:
                break
            await _broadcast(code, {
                "type": "lobby", "code": code,
                "players": match.player_list(), "size": clobby.size,
                "joined_bot": bot,
            })
            await asyncio.sleep(min(interval, 1.0))

    await asyncio.sleep(0.8)
    asyncio.create_task(_run_match(code, custom=True))


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

    plan = default_question_plan()          # mod 1: 6 kelime · mod 2: 5 kelime
    words = _pick_words(plan)
    match = await arena_manager.build_match(code, words, word_plan=plan)  # sadece gerçek oyuncular

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
