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


# Ödül isimleri (period_type + rank -> başlık, ikon).
AWARD_NAMES = {
    "daily": "Günün",
    "monthly": "Ayın",
    "yearly": "Yılın",
}
RANK_LABEL = {1: "Şampiyonu", 2: "2.si", 3: "3.sü"}
RANK_ICON = {1: "🏆", 2: "🥈", 3: "🥉"}


def award_title(period_type: str, rank: int) -> str:
    """Örn: 'Günün Şampiyonu', 'Ayın 2.si'."""
    return f"{AWARD_NAMES.get(period_type, '')} {RANK_LABEL.get(rank, '')}".strip()


async def award_period(db: AsyncSession, period_type: str, period_key: str) -> int:
    """Dönem için ilk 3'e ödül verir + bildirim oluşturur. Verilen ödül sayısını döner."""
    if await _already_awarded(db, period_type, period_key):
        return 0

    # Dönemin referans tarihini ve leaderboard kapsamını belirle.
    if period_type == "daily":
        y, m, d = map(int, period_key.split("-"))
        ref = date(y, m, d)
        scope = "daily"
    elif period_type == "monthly":
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

    from app.models.notification import Notification
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
        # Bildirim oluştur (hangi dönemin ödülü olduğunu tarihle belirt).
        title = award_title(period_type, rank)
        icon = RANK_ICON.get(rank, "🏅")
        period_label = _period_label(period_type, period_key)
        db.add(Notification(
            user_id=entry["user_id"],
            kind="award",
            title=f"{title}!",
            body=f"{period_label} liginde {award_title(period_type, rank)} oldun. Tebrikler!",
            icon=icon,
        ))
        awarded += 1
    await db.commit()
    return awarded


_TR_MONTHS = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
              "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]


def _period_label(period_type: str, period_key: str) -> str:
    """period_key'i okunabilir Türkçe tarihe çevirir.
    daily 2026-07-24 -> '24 Temmuz 2026', monthly 2026-07 -> 'Temmuz 2026', yearly 2026 -> '2026'.
    """
    try:
        if period_type == "daily":
            y, m, d = map(int, period_key.split("-"))
            return f"{d} {_TR_MONTHS[m]} {y}"
        if period_type == "monthly":
            y, m = map(int, period_key.split("-"))
            return f"{_TR_MONTHS[m]} {y}"
        return period_key  # yearly
    except Exception:
        return period_key


async def check_and_award_closed_periods(db: AsyncSession) -> None:
    """Kapanmış gün/ay/yıl için ödül dağıtılmadıysa dağıtır + bildirim yollar."""
    today = date.today()
    # Dün (her zaman kapanmıştır) — günlük ödül.
    yesterday = today - timedelta(days=1)
    await award_period(db, "daily", yesterday.isoformat())
    # Ayın 1'iyse geçen ayı kapat.
    if today.day == 1:
        await award_period(db, "monthly", _prev_month_key(today))
    # Yıl başındaysak geçen yılı da kapat.
    if today.month == 1 and today.day == 1:
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
        await asyncio.sleep(3600)  # saatte bir kontrol (gün dönümünü yakalamak için)
