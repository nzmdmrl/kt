"""
Lig uçları.

GET /api/league/leaderboard?scope=daily|monthly|yearly|all&limit=100&offset=0
    -> sıralı liste + toplam oyuncu sayısı (100'er 100'er "daha fazla göster")
GET /api/league/me?scope=...   -> giriş yapmış kullanıcının sırası
GET /api/league/awards/{user_id} -> kullanıcının kup/madalyaları
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.game.league_service import leaderboard, leaderboard_count, user_rank
from app.models.user import User
from app.models.league_award import LeagueAward

router = APIRouter(prefix="/league", tags=["league"])

VALID_SCOPES = {"daily", "monthly", "yearly", "all"}


@router.get("/leaderboard")
async def get_leaderboard(
    scope: str = Query("daily"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    if scope not in VALID_SCOPES:
        scope = "daily"
    board = await leaderboard(db, scope=scope, limit=limit, offset=offset)
    total = await leaderboard_count(db, scope=scope)
    return {"scope": scope, "entries": board, "total": total, "offset": offset, "limit": limit}


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


async def _period_top3(db: AsyncSession, period_type: str, period_key: str) -> list[dict]:
    """Bir dönemin ilk 3'ünü (ödül kayıtlarından, kullanıcı adıyla) döner."""
    from app.models.user import User
    res = await db.execute(
        select(LeagueAward, User)
        .join(User, User.id == LeagueAward.user_id)
        .where(LeagueAward.period_type == period_type, LeagueAward.period_key == period_key)
        .order_by(LeagueAward.rank)
    )
    from app.game.display_policy import public_name
    out = []
    for award, user in res.all():
        out.append({
            "rank": award.rank,
            "username": user.username,
            "display_name": user.display_name,
            "avatar_url": user.avatar_url,
            "name": public_name(user.display_name, user.username),
            "score": award.total_score,
            "award": award.award,
        })
    return out


@router.get("/previous")
async def previous_periods(db: AsyncSession = Depends(get_db)):
    """Önceki dönemlerin (dün/geçen ay/geçen yıl) ilk 3'ü."""
    from datetime import date, timedelta
    from app.game.league_scheduler import _prev_month_key, _prev_year_key
    today = date.today()
    yesterday = (today - timedelta(days=1)).isoformat()
    return {
        "daily": {"period_key": yesterday, "top3": await _period_top3(db, "daily", yesterday)},
        "monthly": {"period_key": _prev_month_key(today), "top3": await _period_top3(db, "monthly", _prev_month_key(today))},
        "yearly": {"period_key": _prev_year_key(today), "top3": await _period_top3(db, "yearly", _prev_year_key(today))},
    }


@router.get("/archive")
async def archive(
    db: AsyncSession = Depends(get_db),
    period_type: str = "daily",
    page: int = 1,
    per_page: int = 10,
):
    """Bir dönem tipinin geçmiş kayıtları (sayfalı) — her dönemin ilk 3'ü."""
    # Bu tipteki tüm dönem anahtarlarını bul (yeni->eski).
    res = await db.execute(
        select(LeagueAward.period_key)
        .where(LeagueAward.period_type == period_type)
        .distinct()
    )
    keys = sorted({r[0] for r in res.all()}, reverse=True)
    total = len(keys)
    pages = max(1, (total + per_page - 1) // per_page)
    page = min(max(1, page), pages)
    start = (page - 1) * per_page
    page_keys = keys[start:start + per_page]

    periods = []
    for k in page_keys:
        periods.append({"period_key": k, "top3": await _period_top3(db, period_type, k)})
    return {"periods": periods, "page": page, "pages": pages, "total": total}
