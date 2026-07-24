"""
Lig ödül dağıtımı (scheduler).

award_period: bir dönem (ay veya yıl) için ilk 3 oyuncuya ödül verir.
  Zaten ödül verilmişse tekrar vermez (idempotent).

check_and_award_closed_periods: bir önceki ay/yıl kapandıysa ve ödül
  dağıtılmamışsa dağıtır. Startup'ta ve periyodik (günde bir) çağrılır.

Not: Basit in-process scheduler. Ölçek büyürse harici cron'a taşınabilir.
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.league_award import LeagueAward
from app.game.league_service import leaderboard, _period_bounds


def _prev_month_key(today: date) -> str:
    first = today.replace(day=1)
    prev_last = first - timedelta(days=1)
    return f"{prev_last.year:04d}-{prev_last.month:02d}"


def _prev_year_key(today: date) -> str:
    return f"{today.year - 1:04d}"


async def _already_awarded(db: AsyncSession, period_type: str, period_key: str) -> bool:
    res = await db.execute(
        select(LeagueAward).where(
            LeagueAward.period_type == period_type,
            LeagueAward.period_key == period_key,
        ).limit(1)
    )
    return res.scalar_one_or_none() is not None


async def award_period(db: AsyncSession, period_type: str, period_key: str) -> int:
    """Dönem için ilk 3'e ödül verir. Verilen ödül sayısını döner."""
    if await _already_awarded(db, period_type, period_key):
        return 0

    # Dönemin referans tarihini belirle (aralık hesaplamak için).
    if period_type == "monthly":
        y, m = map(int, period_key.split("-"))
        ref = date(y, m, 15)
        scope = "monthly"
    else:
        y = int(period_key)
        ref = date(y, 6, 15)
        scope = "yearly"

    board = await leaderboard(db, scope=scope, limit=3, ref=ref)
    if not board:
        return 0

    awarded = 0
    for entry in board:
        rank = entry["rank"]
        award = "trophy" if rank == 1 else "medal"
        db.add(LeagueAward(
            user_id=entry["user_id"],
            period_type=period_type,
            period_key=period_key,
            rank=rank,
            award=award,
            total_score=entry["score"],
        ))
        awarded += 1
    await db.commit()
    return awarded


async def check_and_award_closed_periods(db: AsyncSession) -> None:
    """Kapanmış ay/yıl için ödül dağıtılmadıysa dağıtır."""
    today = date.today()
    # Geçen ay (her zaman kapanmıştır).
    await award_period(db, "monthly", _prev_month_key(today))
    # Yıl başındaysak geçen yılı da kapat.
    if today.month == 1:
        await award_period(db, "yearly", _prev_year_key(today))


async def league_scheduler_loop():
    """Günde bir kapanmış dönemleri kontrol eder. Startup'ta task olarak başlatılır."""
    from app.core.database import AsyncSessionLocal
    while True:
        try:
            async with AsyncSessionLocal() as db:
                await check_and_award_closed_periods(db)
        except Exception:
            pass
        await asyncio.sleep(24 * 3600)  # günde bir
