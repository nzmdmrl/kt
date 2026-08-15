"""
Günün kelimesi.

Her gün herkese AYNI kelime gösterilir (tarihe göre deterministik seçim).
Oyuncu tek başına Wordle gibi çözer; sonucunu paylaşabilir. Lig'den ayrı,
sosyal/günlük bir mod.

Kelime seçimi: tarih -> sabit hash -> havuzdan indeks. Böylece sunucu durumu
tutmadan herkes aynı kelimeyi alır ve ertesi gün değişir.
"""

from __future__ import annotations

import hashlib
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_optional_user
from app.models.daily_solve import DailySolve
from app.words.word_service import get_pool
from app.core.config import get_settings

router = APIRouter(prefix="/daily", tags=["daily"])
settings = get_settings()


def _guard_guest(user) -> None:
    """Misafir erişimi admin ayarıyla kapalıysa engelle."""
    if user:
        return
    from app.game.settings_service import cached_bool
    if not cached_bool("guest_daily_enabled", True):
        raise HTTPException(401, "Günün kelimesi için giriş yapmalısın.")


def _solver_key(request: Request, cid: str) -> str:
    """Çözeni tekilleştiren anahtar: üye 'u{id}', misafir 'g{istemci anahtarı}'."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            from app.core.security import decode_token
            uid = decode_token(auth[7:])
            if uid:
                return f"u{uid}"
        except Exception:
            pass
    cid = "".join(ch for ch in (cid or "") if ch.isalnum())[:40]
    return f"g{cid}" if cid else ""


def word_of_day(d: date | None = None, length: int = 5, lang: str = "tr") -> str:
    """Verilen gün için deterministik kelime seçer."""
    d = d or date.today()
    seed = f"{d.isoformat()}-{length}-{lang}"
    h = int(hashlib.sha256(seed.encode()).hexdigest(), 16)
    pool = get_pool(length, lang)
    words = pool.selectable_words()  # yaygın/seçilebilir kelimeler
    if not words:
        return ""
    return words[h % len(words)]


@router.get("/word")
async def get_daily_word(
    request: Request,
    length: int = Query(5, ge=4, le=6),
    cid: str = Query("", description="Misafir istemci anahtarı (tekilleştirme)"),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_optional_user),
):
    """Günün kelimesini döner (ÇÖZÜM AÇIK DEĞİL — sadece uzunluk ve ilk harf).

    `solved`: bu kişi bugünkü kelimeyi çözmüş mü (üyede hesabına, misafirde cid'ine
    bağlı). Arayüz tekrar girildiğinde "bugünkü kelimeyi çözdün" ekranını gösterir.
    """
    _guard_guest(user)
    lang = settings.GAME_LANG
    word = word_of_day(length=length, lang=lang)
    solved = False
    solver = _solver_key(request, cid)
    if solver:
        solved = (await db.execute(
            select(DailySolve.id).where(
                DailySolve.solve_date == date.today(),
                DailySolve.length == length,
                DailySolve.solver == solver,
            )
        )).scalar_one_or_none() is not None
    return {
        "date": date.today().isoformat(),
        "length": length,
        "first_letter": word[0] if word else "",
        "solved": solved,
        # Not: tam kelime İSTEMCİYE GÖNDERİLMEZ; tahmin sunucuda doğrulanır.
    }


@router.get("/stats")
async def daily_stats(db: AsyncSession = Depends(get_db), length: int = Query(5, ge=4, le=6)):
    """Bugün günün kelimesini kaç kişinin çözdüğü (public)."""
    n = (await db.execute(
        select(func.count(DailySolve.id)).where(
            DailySolve.solve_date == date.today(), DailySolve.length == length
        )
    )).scalar_one()
    return {"date": date.today().isoformat(), "length": length, "solved_count": int(n or 0)}


@router.get("/check")
async def check_daily_guess(
    request: Request,
    guess: str,
    length: int = Query(5, ge=4, le=6),
    cid: str = Query("", description="Misafir istemci anahtarı (tekilleştirme)"),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_optional_user),
):
    """Günün kelimesi tahminini değerlendirir (Wordle renkleri).

    Tahmin doğruysa çözüm sayacına tek satır yazılır (aynı kişi tekrar çözerse
    sayaç artmaz).
    """
    _guard_guest(user)
    from app.game.word_engine import normalize, evaluate_guess, is_correct, is_valid_word_shape
    lang = settings.GAME_LANG
    target = word_of_day(length=length, lang=lang)
    g = normalize(guess)
    if len(g) != length or not is_valid_word_shape(g, length):
        return {"valid": False, "error": "Geçersiz kelime"}
    if g[0] != target[0]:
        return {"valid": False, "error": f"'{target[0]}' ile başlamalı"}
    results = evaluate_guess(g, target)
    correct = is_correct(g, target)
    if correct:
        # Sayaç: aynı çözen için ikinci satır açılmaz (benzersiz kısıt + kontrol).
        solver = _solver_key(request, cid)
        if solver:
            today = date.today()
            exists = (await db.execute(
                select(DailySolve.id).where(
                    DailySolve.solve_date == today,
                    DailySolve.length == length,
                    DailySolve.solver == solver,
                )
            )).scalar_one_or_none()
            if not exists:
                db.add(DailySolve(solve_date=today, length=length, solver=solver))
                try:
                    await db.commit()
                except Exception:
                    # Aynı anda iki istek geldiyse benzersiz kısıt patlar — sorun değil.
                    await db.rollback()
    return {
        "valid": True,
        "correct": correct,
        "tiles": [{"letter": r.letter, "state": r.state.value} for r in results],
        # Doğruysa veya oyun bittiyse çözümü göstermek isteğe bağlı; şimdilik gizli.
    }
