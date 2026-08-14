"""
Profil uçları.

GET /api/profile/{username}  -> herkese açık profil (istatistik + rozet + ödül + lig sırası)
GET /api/profile/me/stats    -> giriş yapmış kullanıcının profili (kendi)

Profil = kullanıcı bilgisi + kümülatif istatistik + kazanılan rozetler +
lig kup/madalyaları + güncel lig sıraları (günlük/aylık/tüm zamanlar).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.league_award import LeagueAward
from app.game.badges import earned_badges
from app.game.league_service import user_rank

router = APIRouter(prefix="/profile", tags=["profile"])


def _level_info(xp: int) -> dict:
    from app.game.xp_service import level_progress
    return level_progress(xp)


def _title_info(xp: int) -> dict:
    from app.game.xp_service import title_for_xp
    return title_for_xp(xp)


async def _friend_count(db, user_id: int) -> int:
    from app.api.routes.friends import friend_count
    return await friend_count(db, user_id)


async def _collected_words_count(db, user_id: int) -> int:
    from app.models.collected_word import CollectedWord
    from sqlalchemy import select as _sel, func as _func
    return (await db.execute(
        _sel(_func.count()).select_from(CollectedWord).where(CollectedWord.user_id == user_id)
    )).scalar() or 0


async def _optional_user(request: Request, db):
    """Authorization header varsa kullanıcıyı çöz, yoksa None (hata fırlatmaz)."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    try:
        from app.core.security import decode_token
        uid = decode_token(auth[7:])
        if not uid:
            return None
        return (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    except Exception:
        return None


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
        "custom_arena_played": user.custom_arena_played or 0,
        "arena_played": user.arena_played or 0,
        "arena_first": user.arena_first or 0,
        "arena_second": user.arena_second or 0,
        "arena_third": user.arena_third or 0,
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

    achievements = _group_achievements(awards)
    # Arena kupaları/madalyaları (Kupalar & Madalyalar bölümüne)
    if (user.arena_first or 0) > 0:
        achievements.append({
            "title": "Arena Şampiyonu", "icon": "🏆",
            "count": user.arena_first, "period_type": "arena", "rank": 1,
        })
    if (user.arena_second or 0) > 0:
        achievements.append({
            "title": "Arena 2.si", "icon": "🥈",
            "count": user.arena_second, "period_type": "arena", "rank": 2,
        })
    if (user.arena_third or 0) > 0:
        achievements.append({
            "title": "Arena 3.sü", "icon": "🥉",
            "count": user.arena_third, "period_type": "arena", "rank": 3,
        })
    # Toplam kupa/madalya sayısına arena dahil (kupa=1.lik, madalya=2.+3.lük)
    trophies_total = trophies + (user.arena_first or 0)
    medals_total = medals + (user.arena_second or 0) + (user.arena_third or 0)

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
        "achievements": achievements,
        "trophies": trophies_total,
        "medals": medals_total,
        "xp": user.xp or 0,
        "level_info": _level_info(user.xp or 0),
        "title_info": _title_info(user.xp or 0),
        "friend_count": await _friend_count(db, user.id),
        "collected_words": await _collected_words_count(db, user.id),
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
async def public_profile(username: str, request: Request, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(User).where(User.username == username))
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    data = await _build_profile(db, user)
    # Bakan kişi giriş yapmışsa, aralarındaki arkadaşlık durumunu ekle.
    viewer = await _optional_user(request, db)
    if viewer and viewer.id != user.id:
        from app.api.routes.friends import friend_status
        data["friend_status"] = await friend_status(db, viewer.id, user.id)
    else:
        data["friend_status"] = "self" if viewer and viewer.id == user.id else "none"
    return data


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

    # Rakip adı listelerdeki kuralla gösterilir (admin: Adlar & Listeler).
    from app.game.display_policy import public_name

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
            "opp_name": public_name(opp_name, opp_username),
            "opp_username": opp_username,   # "" ise bot / link yok
            "my_score": my_score,
            "opp_score": opp_score,
            "result": result,
            "has_bot": m.has_bot,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        })
    return {"matches": out}


@router.get("/{username}/head-to-head")
async def head_to_head(
    username: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    limit: int = 10,
):
    """Bakan kullanıcı ile profil sahibi arasındaki KARŞILIKLI maçlar.

    Profil sayfasında "Sen 4 - 2 kadir" özeti + son karşılaşma tablosu için.
    Misafir/giriş yapmamış ziyaretçide veya kendi profilinde `available: false`
    döner (hata değil) — frontend bölümü hiç göstermez.
    """
    from app.models.match_history import MatchHistory
    from sqlalchemy import or_, and_

    other = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if not other:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

    viewer = await _optional_user(request, db)
    if not viewer or viewer.id == other.id:
        return {"available": False}

    me_u, other_u = viewer.username, other.username
    rows = (await db.execute(
        select(MatchHistory)
        .where(or_(
            and_(MatchHistory.p1_username == me_u, MatchHistory.p2_username == other_u),
            and_(MatchHistory.p1_username == other_u, MatchHistory.p2_username == me_u),
        ))
        .order_by(MatchHistory.created_at.desc())
    )).scalars().all()

    wins = losses = draws = 0
    matches = []
    for m in rows:
        am_p1 = (m.p1_username == me_u)
        my_name = m.p1_name if am_p1 else m.p2_name
        my_score = m.p1_score if am_p1 else m.p2_score
        opp_score = m.p2_score if am_p1 else m.p1_score
        # Sonuç önce skordan; skorlar eşitse kazanan adına bakılır (terk/bağlantı
        # kopması gibi durumlarda skor eşit kalıp kazanan yazılabiliyor).
        if my_score > opp_score:
            result = "win"
        elif my_score < opp_score:
            result = "loss"
        elif not m.winner_name:
            result = "draw"
        else:
            result = "win" if m.winner_name == my_name else "loss"
        if result == "win":
            wins += 1
        elif result == "loss":
            losses += 1
        else:
            draws += 1
        if len(matches) < limit:
            matches.append({
                "my_score": my_score,
                "opp_score": opp_score,
                "result": result,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            })

    return {
        "available": True,
        "me": {"username": viewer.username, "display_name": viewer.display_name or viewer.username},
        "opponent": {"username": other.username, "display_name": other.display_name or other.username},
        "wins": wins,
        "losses": losses,
        "draws": draws,
        "total": len(rows),
        "matches": matches,
    }
