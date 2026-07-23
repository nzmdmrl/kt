"""Kelime ile ilgili HTTP uçları (Faz 1 — test/geliştirme için)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.words.word_service import get_pool, pool_stats
from app.game.word_engine import evaluate_guess, is_correct, count_present_letters

router = APIRouter(prefix="/words", tags=["words"])


@router.get("/stats")
def stats():
    """Havuz büyüklükleri (her uzunluk için toplam/seçilebilir)."""
    return pool_stats()


@router.get("/random")
def random_word(length: int = Query(..., ge=3, le=8)):
    """
    Rastgele hedef kelime döner.
    NOT: Bu uç geliştirme/test içindir; gerçek maçta hedef kelime
    sunucuda gizli tutulur, istemciye gönderilmez.
    """
    try:
        pool = get_pool(length)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"{length} harfli havuz yok")
    return {"length": length, "word": pool.random_word()}


@router.get("/validate")
def validate(word: str, length: int = Query(..., ge=3, le=8)):
    """Verilen kelime havuzda geçerli mi?"""
    try:
        pool = get_pool(length)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"{length} harfli havuz yok")
    return {"word": word, "valid": pool.is_valid(word)}


@router.get("/evaluate")
def evaluate(guess: str, target: str):
    """
    Bir tahmini hedefe göre değerlendirir (renk sonucu).
    NOT: Geliştirme aracı; gerçek maçta değerlendirme WebSocket üzerinden yapılır.
    """
    if len(guess) != len(target):
        raise HTTPException(status_code=400, detail="Uzunluklar eşleşmeli")
    results = evaluate_guess(guess, target)
    return {
        "guess": guess,
        "target": target,
        "correct": is_correct(guess, target),
        "present_count": count_present_letters(results),
        "letters": [{"letter": r.letter, "state": r.state.value} for r in results],
    }
