"""Sağlık kontrolü uçları — Coolify/monitoring için."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.config import get_settings
from app.words.word_service import pool_stats

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    settings = get_settings()
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
        "game_lang": settings.GAME_LANG,
        "word_pools": pool_stats(),
        "google_oauth_configured": settings.google_oauth_configured,
    }
