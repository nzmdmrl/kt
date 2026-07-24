"""
Maç sonrası işlemler: istatistik güncelleme, ELO değişimi, bot seçimi.
"""

from __future__ import annotations

import random

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.bot import Bot


def elo_change(player_elo: int, opp_elo: int, result: float, k: int = 32) -> int:
    """
    Standart ELO formülü. result: 1.0 galibiyet, 0.5 beraberlik, 0.0 mağlubiyet.
    Döndürülen: yeni ELO (yuvarlanmış).
    """
    expected = 1.0 / (1.0 + 10 ** ((opp_elo - player_elo) / 400.0))
    return round(player_elo + k * (result - expected))


async def pick_bot(db: AsyncSession, target_elo: int, lang: str = "tr") -> Bot | None:
    """Hedef ELO'ya yakın aktif bir bot seçer."""
    # ±200 aralığındaki aktif botlardan rastgele biri.
    res = await db.execute(
        select(Bot).where(
            Bot.active == True,  # noqa: E712
            Bot.lang == lang,
            Bot.elo >= target_elo - 200,
            Bot.elo <= target_elo + 200,
        )
    )
    bots = res.scalars().all()
    if not bots:
        # Aralıkta yoksa herhangi aktif bir bot.
        res = await db.execute(select(Bot).where(Bot.active == True, Bot.lang == lang))  # noqa: E712
        bots = res.scalars().all()
    return random.choice(bots) if bots else None


async def apply_match_result(
    db: AsyncSession,
    user_id: int,
    opp_elo: int,
    won: bool,
    draw: bool,
    score: int,
    words_solved: int,
) -> User | None:
    """
    Gerçek kullanıcının maç sonucu istatistiklerini ve ELO'sunu günceller.
    (Botların istatistiği tutulmaz.)
    """
    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalar_one_or_none()
    if not user:
        return None

    user.matches_played += 1
    user.total_score += score
    user.words_solved += words_solved
    if draw:
        user.draws += 1
        result_val = 0.5
    elif won:
        user.wins += 1
        result_val = 1.0
    else:
        user.losses += 1
        result_val = 0.0

    user.elo = max(100, elo_change(user.elo, opp_elo, result_val))
    await db.commit()
    await db.refresh(user)

    # Lig puanı: bu maçın puanını bugünün lig kaydına işle (günün en iyisi tutulur).
    try:
        from app.game.league_service import record_daily_score
        await record_daily_score(db, user_id, score)
    except Exception as e:
        print(f"[lig] HATA user={user_id}: {e}")

    return user
