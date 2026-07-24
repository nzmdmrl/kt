"""
Lig uçları.

GET /api/league/leaderboard?scope=daily|monthly|yearly|all&limit=100
    -> sıralı liste
GET /api/league/me?scope=...   -> giriş yapmış kullanıcının sırası
GET /api/league/awards/{user_id} -> kullanıcının kup/madalyaları
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.game.league_service import leaderboard, user_rank
from app.models.user import User
from app.models.league_award import LeagueAward

router = APIRouter(prefix="/league", tags=["league"])

VALID_SCOPES = {"daily", "monthly", "yearly", "all"}


@router.get("/leaderboard")
async def get_leaderboard(
    scope: str = Query("daily"),
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
):
    if scope not in VALID_SCOPES:
        scope = "daily"
    board = await leaderboard(db, scope=scope, limit=limit)
    return {"scope": scope, "entries": board}


@router.get("/me")
async def my_rank(
    scope: str = Query("daily"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if scope not in VALID_SCOPES:
        scope = "daily"
    entry = await user_rank(db, user.id, scope=scope)
    return {"scope": scope, "entry": entry}


@router.get("/awards/{user_id}")
async def get_awards(user_id: int, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(LeagueAward).where(LeagueAward.user_id == user_id).order_by(LeagueAward.awarded_at.desc())
    )
    awards = res.scalars().all()
    return {"awards": [a.to_public() for a in awards]}
