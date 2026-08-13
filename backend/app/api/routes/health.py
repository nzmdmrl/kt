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
        "recaptcha_configured": settings.recaptcha_configured,
        # FIREBASE_CREDENTIALS_B64 geçerli mi? (push gönderimi bunsuz sessizce atlanır)
        "push_configured": _push_configured(),
    }


def _push_configured() -> bool:
    try:
        from app.services.push import push_configured
        return push_configured()
    except Exception:
        return False
