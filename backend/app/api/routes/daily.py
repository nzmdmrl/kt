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

from fastapi import APIRouter, Query
from app.words.word_service import get_pool
from app.core.config import get_settings

router = APIRouter(prefix="/daily", tags=["daily"])
settings = get_settings()


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
async def get_daily_word(length: int = Query(5, ge=4, le=6)):
    """Günün kelimesini döner (ÇÖZÜM AÇIK DEĞİL — sadece uzunluk ve ilk harf)."""
    lang = settings.GAME_LANG
    word = word_of_day(length=length, lang=lang)
    return {
        "date": date.today().isoformat(),
        "length": length,
        "first_letter": word[0] if word else "",
        # Not: tam kelime İSTEMCİYE GÖNDERİLMEZ; tahmin sunucuda doğrulanır.
    }


@router.get("/check")
async def check_daily_guess(guess: str, length: int = Query(5, ge=4, le=6)):
    """Günün kelimesi tahminini değerlendirir (Wordle renkleri)."""
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
    return {
        "valid": True,
        "correct": correct,
        "tiles": [{"letter": r.letter, "state": r.state.value} for r in results],
        # Doğruysa veya oyun bittiyse çözümü göstermek isteğe bağlı; şimdilik gizli.
    }
