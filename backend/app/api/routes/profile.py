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

    # Solo ilerlemesi (varsa)
    from app.models.solo import SoloProgress
    solo = (await db.execute(select(SoloProgress).where(SoloProgress.user_id == user.id))).scalar_one_or_none()
    solo_info = {
        "level": solo.current_level if solo else 1,
        "stars": solo.total_stars if solo else 0,
    }

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
        "solo": solo_info,
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


@router.get("/{username}/matches")
async def user_matches(username: str, db: AsyncSession = Depends(get_db), limit: int = 10):
    """Bir kullanıcının son maçları (maç geçmişinden). Kullanıcı perspektifinden
    (kendisi / rakip / skor / sonuç) döner."""
    from app.models.match_history import MatchHistory
    from sqlalchemy import or_

    user = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

    rows = (await db.execute(
        select(MatchHistory)
        .where(or_(MatchHistory.p1_username == username, MatchHistory.p2_username == username))
        .order_by(MatchHistory.created_at.desc())
        .limit(limit)
    )).scalars().all()

    out = []
    for m in rows:
        # Kullanıcı p1 mi p2 mi? Perspektifi ona göre kur.
        am_p1 = (m.p1_username == username)
        my_name = m.p1_name if am_p1 else m.p2_name
        my_score = m.p1_score if am_p1 else m.p2_score
        opp_name = m.p2_name if am_p1 else m.p1_name
        opp_username = m.p2_username if am_p1 else m.p1_username
        opp_score = m.p2_score if am_p1 else m.p1_score
        if not m.winner_name:
            result = "draw"
        elif m.winner_name == my_name:
            result = "win"
        else:
            result = "loss"
        out.append({
            "opp_name": opp_name,
            "opp_username": opp_username,   # "" ise bot / link yok
            "my_score": my_score,
            "opp_score": opp_score,
            "result": result,
            "has_bot": m.has_bot,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        })
    return {"matches": out}
