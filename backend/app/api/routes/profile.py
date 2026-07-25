"""
Profil uçları.

GET /api/profile/{username}  -> herkese açık profil (istatistik + rozet + ödül + lig sırası)
GET /api/profile/me/stats    -> giriş yapmış kullanıcının profili (kendi)

Profil = kullanıcı bilgisi + kümülatif istatistik + kazanılan rozetler +
lig kup/madalyaları + güncel lig sıraları (günlük/aylık/tüm zamanlar).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.league_award import LeagueAward
from app.game.badges import earned_badges
from app.game.league_service import user_rank

router = APIRouter(prefix="/profile", tags=["profile"])


def _group_achievements(awards) -> list[dict]:
    """
    Ödülleri (period_type + rank) türüne göre gruplar ve sayar (×N için).
    Örn: 2 kez Günün Şampiyonu -> {title:'Günün Şampiyonu', count:2, icon:'🏆'}.
    """
    from app.game.league_scheduler import award_title, RANK_ICON
    groups: dict = {}
    for a in awards:
        key = (a.period_type, a.rank)
        if key not in groups:
            groups[key] = {
                "title": award_title(a.period_type, a.rank),
                "icon": RANK_ICON.get(a.rank, "🏅"),
                "period_type": a.period_type,
                "rank": a.rank,
                "count": 0,
            }
        groups[key]["count"] += 1
    order = {"daily": 0, "monthly": 1, "yearly": 2}
    return sorted(groups.values(), key=lambda g: (order.get(g["period_type"], 9), g["rank"]))


async def _build_profile(db: AsyncSession, user: User) -> dict:
    # Kupa/madalya say
    res = await db.execute(select(LeagueAward).where(LeagueAward.user_id == user.id))
    awards = res.scalars().all()
    trophies = sum(1 for a in awards if a.award == "trophy")
    medals = sum(1 for a in awards if a.award == "medal")

    stats = {
        "matches_played": user.matches_played,
        "wins": user.wins,
        "losses": user.losses,
        "draws": user.draws,
        "words_solved": user.words_solved,
        "total_score": user.total_score,
        "elo": user.elo,
        "trophies": trophies,
        "medals": medals,
    }

    # Kazanım oranı
    win_rate = round(user.wins / user.matches_played * 100) if user.matches_played else 0

    # Lig sıraları
    daily = await user_rank(db, user.id, scope="daily")
    monthly = await user_rank(db, user.id, scope="monthly")
    all_time = await user_rank(db, user.id, scope="all")

    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "elo": user.elo,
        "stats": {
            "matches_played": user.matches_played,
            "wins": user.wins,
            "losses": user.losses,
            "draws": user.draws,
            "win_rate": win_rate,
            "words_solved": user.words_solved,
            "total_score": user.total_score,
        },
        "badges": earned_badges(stats),
        "awards": [a.to_public() for a in awards],
        "achievements": _group_achievements(awards),
        "trophies": trophies,
        "medals": medals,
        "ranks": {
            "daily": daily["rank"] if daily else None,
            "monthly": monthly["rank"] if monthly else None,
            "all": all_time["rank"] if all_time else None,
        },
    }


@router.get("/me/stats")
async def my_profile(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _build_profile(db, user)


@router.get("/{username}")
async def public_profile(username: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(User).where(User.username == username))
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    return await _build_profile(db, user)
