"""
Ana sayfa public uçları — giriş gerektirmez.

- GET /home/recent-matches  -> son 10 tamamlanan maç
- GET /home/daily-top        -> bugünün lig ilk 10'u
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.match_history import MatchHistory

router = APIRouter(prefix="/home", tags=["home"])


@router.get("/appearance")
async def appearance():
    """Public: gece arka plan animasyonu ayarları (herkese açık)."""
    from app.game.settings_service import cached_bool, cached_str
    return {
        "night_bg_enabled": cached_bool("night_bg_enabled", True),
        "night_bg_theme": cached_str("night_bg_theme", "night"),
    }


@router.get("/recent-matches")
async def recent_matches(db: AsyncSession = Depends(get_db), limit: int = 10):
    res = await db.execute(
        select(MatchHistory).order_by(MatchHistory.created_at.desc()).limit(limit)
    )
    return {"matches": [m.to_public() for m in res.scalars().all()]}


@router.get("/daily-top")
async def daily_top(db: AsyncSession = Depends(get_db), limit: int = 10):
    from app.game.league_service import leaderboard
    board = await leaderboard(db, scope="daily", limit=limit, ref=date.today())
    return {"top": board, "date": date.today().isoformat()}
