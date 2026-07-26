"""
Solo (hikaye) modu uçları.

- GET  /solo/progress          -> kullanıcının ilerlemesi (current_level, total_stars, level sonuçları)
- POST /solo/level/{level}/start   -> level'i başlat: kelime bilgisi (uzunluk, ilk harf) + süre + joker
- POST /solo/level/{level}/guess   -> tahmin doğrula (tiles + doğru mu)
- POST /solo/level/{level}/finish  -> level bitir: kalan süre gönder, yıldız hesapla + kaydet

Kelime deterministik (solo_word) olduğu için sunucu her tahminde hedefi yeniden üretir;
istemci hedefi hiç görmez. attempt SoloLevelResult'ta tutulur (tekrar oynayınca +1).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.config import get_settings
from app.models.user import User
from app.models.solo import SoloProgress, SoloLevelResult
from app.game import solo_service

router = APIRouter(prefix="/solo", tags=["solo"])


async def _get_setting_int(db: AsyncSession, key: str, default: int) -> int:
    from app.models.game_setting import GameSetting
    row = (await db.execute(select(GameSetting).where(GameSetting.key == key))).scalar_one_or_none()
    try:
        return int(row.value) if row else default
    except (ValueError, TypeError):
        return default


async def _get_progress(db: AsyncSession, user_id: int) -> SoloProgress:
    prog = (await db.execute(select(SoloProgress).where(SoloProgress.user_id == user_id))).scalar_one_or_none()
    if not prog:
        prog = SoloProgress(user_id=user_id, current_level=1, total_stars=0)
        db.add(prog)
        await db.commit()
        await db.refresh(prog)
    return prog


async def _attempt_for(db: AsyncSession, user_id: int, level: int) -> int:
    res = (await db.execute(
        select(SoloLevelResult).where(SoloLevelResult.user_id == user_id, SoloLevelResult.level == level)
    )).scalar_one_or_none()
    return res.attempts if res else 0


@router.get("/progress")
async def get_progress(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    prog = await _get_progress(db, user.id)
    results = (await db.execute(
        select(SoloLevelResult).where(SoloLevelResult.user_id == user.id)
    )).scalars().all()
    stars_by_level = {r.level: r.best_stars for r in results}
    return {
        "current_level": prog.current_level,
        "total_stars": prog.total_stars,
        "levels": [{"level": lvl, "stars": stars_by_level.get(lvl, 0)} for lvl in sorted(stars_by_level)],
    }


@router.post("/level/{level}/start")
async def start_level(level: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if level < 1:
        raise HTTPException(400, "Geçersiz level.")
    prog = await _get_progress(db, user.id)
    if level > prog.current_level:
        raise HTTPException(403, "Bu level henüz açık değil.")

    lang = get_settings().GAME_LANG
    attempt = await _attempt_for(db, user.id, level)
    # Tekrar oynanıyorsa (daha önce sonuç var) yeni kelime için attempt+1 kullan.
    existing = (await db.execute(
        select(SoloLevelResult).where(SoloLevelResult.user_id == user.id, SoloLevelResult.level == level)
    )).scalar_one_or_none()
    use_attempt = attempt + 1 if existing else 0

    word = solo_service.solo_word(user.id, level, use_attempt, lang)
    length = solo_service.level_length(level)
    seconds = await _get_setting_int(db, "solo_seconds", 120)
    joker_per = await _get_setting_int(db, "solo_joker_per_level", 1)

    return {
        "level": level,
        "length": length,
        "first_letter": word[0] if word else "",
        "seconds": seconds,
        "joker_count": joker_per,
        "replay": existing is not None,   # tekrar oynanıyorsa istemci "kelime değişti" gösterir
    }


class GuessIn(BaseModel):
    guess: str


@router.post("/level/{level}/guess")
async def guess_level(level: int, data: GuessIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.game.word_engine import normalize, evaluate_guess, is_correct, is_valid_word_shape

    prog = await _get_progress(db, user.id)
    if level > prog.current_level:
        raise HTTPException(403, "Bu level henüz açık değil.")

    lang = get_settings().GAME_LANG
    length = solo_service.level_length(level)
    existing = (await db.execute(
        select(SoloLevelResult).where(SoloLevelResult.user_id == user.id, SoloLevelResult.level == level)
    )).scalar_one_or_none()
    use_attempt = (existing.attempts + 1) if existing else 0
    target = solo_service.solo_word(user.id, level, use_attempt, lang)

    g = normalize(data.guess)
    if len(g) != length or not is_valid_word_shape(g, length):
        return {"valid": False, "error": f"{length} harfli geçerli bir kelime girin."}
    pool_valid = True
    from app.words.word_service import get_pool
    if not get_pool(length, lang).is_valid(g):
        return {"valid": False, "error": "Kelime listesinde yok."}

    results = evaluate_guess(g, target)
    correct = is_correct(g, target)
    return {
        "valid": True,
        "correct": correct,
        "tiles": [{"letter": r.letter, "state": r.state.value} for r in results],
    }


class FinishIn(BaseModel):
    seconds_left: int


@router.post("/level/{level}/hint")
async def level_hint(level: int, pos: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Joker: bir konumdaki doğru harfi açar. Sunucu hedefi bildiği için o konumun harfini döner."""
    prog = await _get_progress(db, user.id)
    if level > prog.current_level:
        raise HTTPException(403, "Bu level henüz açık değil.")
    lang = get_settings().GAME_LANG
    length = solo_service.level_length(level)
    if pos < 0 or pos >= length:
        raise HTTPException(400, "Geçersiz konum.")
    existing = (await db.execute(
        select(SoloLevelResult).where(SoloLevelResult.user_id == user.id, SoloLevelResult.level == level)
    )).scalar_one_or_none()
    use_attempt = (existing.attempts + 1) if existing else 0
    target = solo_service.solo_word(user.id, level, use_attempt, lang)
    return {"pos": pos, "letter": target[pos] if pos < len(target) else ""}


@router.post("/level/{level}/finish")
async def finish_level(level: int, data: FinishIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Level bitti (kelime bulundu). Kalan süreden yıldız hesapla, kaydet, sonraki level'i aç."""
    prog = await _get_progress(db, user.id)
    if level > prog.current_level:
        raise HTTPException(403, "Bu level henüz açık değil.")

    seconds = await _get_setting_int(db, "solo_seconds", 120)
    s3 = await _get_setting_int(db, "solo_star3_min", 80)
    s2 = await _get_setting_int(db, "solo_star2_min", 30)
    sec_left = max(0, min(seconds, data.seconds_left))
    stars = solo_service.stars_for(sec_left, s3, s2)

    # Level sonucunu kaydet / güncelle (en iyi yıldızı sakla, attempt +1).
    res = (await db.execute(
        select(SoloLevelResult).where(SoloLevelResult.user_id == user.id, SoloLevelResult.level == level)
    )).scalar_one_or_none()
    if res:
        old_best = res.best_stars
        res.attempts += 1
        if stars > res.best_stars:
            res.best_stars = stars
        star_delta = max(0, res.best_stars - old_best)  # toplam yıldıza sadece artış eklenir
    else:
        res = SoloLevelResult(user_id=user.id, level=level, best_stars=stars, attempts=1)
        db.add(res)
        star_delta = stars

    prog.total_stars += star_delta
    # Sonraki level'i aç (ilk kez geçildiyse).
    if level == prog.current_level:
        prog.current_level = level + 1

    await db.commit()
    return {
        "stars": stars,
        "best_stars": res.best_stars,
        "total_stars": prog.total_stars,
        "next_level": prog.current_level,
    }
