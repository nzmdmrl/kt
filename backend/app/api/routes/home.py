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
    """Public: gece arka plan animasyonu + arayüz stili ayarları (herkese açık)."""
    from app.game.settings_service import cached_bool, cached_str
    style = cached_str("ui_style", "stil2")
    from app.game.settings_service import cached_int
    return {
        "night_bg_enabled": cached_bool("night_bg_enabled", True),
        "night_bg_theme": cached_str("night_bg_theme", "night"),
        "ui_style": style if style in ("stil1", "stil2") else "stil2",
        # 1v1'de görünen ad etiketinin en fazla kaç karakter olacağı
        # (Grid.tsx + ScoreBar.tsx okur; 0 = kesme). Mobil ve masaüstü ayrı.
        "match_name_max_len": cached_int("match_name_max_len", 7),
        "match_name_max_len_desktop": cached_int("match_name_max_len_desktop", 14),
    }


@router.get("/guest-access")
async def guest_access():
    """Public: misafirin (üye olmayan) hangi modlara girebildiği — admin ayarları.

    Arayüz bu uca bakıp misafire ya "isim yaz & katıl" kartını ya da "üye ol"
    ekranını gösterir. Sunucu tarafı da aynı ayarları ayrıca kontrol eder.
    """
    from app.game.settings_service import cached_bool
    return {
        "match": cached_bool("guest_match_enabled", True),
        "arena": cached_bool("guest_arena_enabled", True),
        "daily": cached_bool("guest_daily_enabled", True),
    }


@router.get("/recent-matches")
async def recent_matches(db: AsyncSession = Depends(get_db), limit: int = 10):
    """Son maçlar — gösterilecek ad (`p1_display`/`p2_display`) ve mini avatar dahil.

    Maç geçmişinde ad ve kullanıcı adı maç anındaki haliyle durur; avatar ise
    kullanıcıdan (güncel) alınır. Misafir/bot için avatar yoktur → arayüz
    varsayılan avatarı çizer.
    """
    from app.models.user import User
    from app.game.display_policy import public_name

    res = await db.execute(
        select(MatchHistory).order_by(MatchHistory.created_at.desc()).limit(limit)
    )
    rows = res.scalars().all()

    unames = {u for m in rows for u in (m.p1_username, m.p2_username) if u}
    users: dict[str, User] = {}
    if unames:
        found = (await db.execute(select(User).where(User.username.in_(unames)))).scalars().all()
        users = {u.username: u for u in found}

    out = []
    for m in rows:
        d = m.to_public()
        for side, uname, stored in (("p1", m.p1_username, m.p1_name), ("p2", m.p2_username, m.p2_name)):
            u = users.get(uname) if uname else None
            # Üye ise güncel adları, değilse (misafir/bot) maçtaki kayıtlı adı kullan.
            d[f"{side}_display"] = public_name(u.display_name if u else stored, uname)
            d[f"{side}_avatar"] = (u.avatar_url if u else None) or ""
            # Avatarı olmayanda hangi varsayılan çizilecek (misafir 👤 / bot 🤖).
            d[f"{side}_kind"] = "user" if uname else ("guest" if stored == "Misafir" else ("bot" if m.has_bot else "guest"))
        out.append(d)
    return {"matches": out}


@router.get("/daily-top")
async def daily_top(db: AsyncSession = Depends(get_db), limit: int = 10):
    from app.game.league_service import leaderboard
    board = await leaderboard(db, scope="daily", limit=limit, ref=date.today())
    return {"top": board, "date": date.today().isoformat()}
