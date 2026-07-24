"""
Lig servisi — puan yazma ve sıralama hesaplama.

record_daily_score: maç bitince çağrılır. O günün satırını upsert eder;
  yeni maç puanı mevcut günlük en iyiden büyükse best_score güncellenir.

leaderboard: dört kapsamdan biri için sıralı liste döner.
  - daily:   verilen günün best_score'una göre (o gün oynayanlar).
  - monthly: o ayki günlük best_score'ların SUM'ına göre.
  - yearly:  o yılki SUM.
  - all:     tüm zamanların SUM'ı.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily_score import DailyScore
from app.models.user import User


async def record_daily_score(db: AsyncSession, user_id: int, match_score: int) -> None:
    """Maç puanını bugünün lig kaydına işler (günün en iyisini tutar)."""
    today = date.today()
    res = await db.execute(
        select(DailyScore).where(
            DailyScore.user_id == user_id,
            DailyScore.score_date == today,
        )
    )
    row = res.scalar_one_or_none()
    if row is None:
        row = DailyScore(
            user_id=user_id,
            score_date=today,
            best_score=max(0, match_score),
            matches=1,
        )
        db.add(row)
    else:
        row.matches += 1
        if match_score > row.best_score:
            row.best_score = match_score
    await db.commit()


def _period_bounds(scope: str, ref: date | None = None) -> tuple[date | None, date | None]:
    """scope için tarih aralığı (dahil). all -> (None, None)."""
    ref = ref or date.today()
    if scope == "daily":
        return ref, ref
    if scope == "monthly":
        start = ref.replace(day=1)
        # ay sonu: bir sonraki ayın 1'inden bir gün önce
        if start.month == 12:
            nxt = start.replace(year=start.year + 1, month=1)
        else:
            nxt = start.replace(month=start.month + 1)
        from datetime import timedelta
        return start, nxt - timedelta(days=1)
    if scope == "yearly":
        return date(ref.year, 1, 1), date(ref.year, 12, 31)
    return None, None  # all


async def leaderboard(
    db: AsyncSession,
    scope: str = "daily",
    limit: int = 100,
    ref: date | None = None,
) -> list[dict]:
    """
    Sıralı liderlik tablosu döner: [{rank, user_id, username, elo, score}, ...]
    scope: daily | monthly | yearly | all
    """
    start, end = _period_bounds(scope, ref)

    if scope == "daily":
        score_col = DailyScore.best_score
    else:
        score_col = func.sum(DailyScore.best_score)

    q = (
        select(
            DailyScore.user_id,
            User.username,
            User.elo,
            (DailyScore.best_score if scope == "daily" else func.sum(DailyScore.best_score)).label("score"),
        )
        .join(User, User.id == DailyScore.user_id)
    )
    if start is not None:
        q = q.where(DailyScore.score_date >= start, DailyScore.score_date <= end)
    if scope != "daily":
        q = q.group_by(DailyScore.user_id, User.username, User.elo)
    q = q.order_by(func.sum(DailyScore.best_score).desc() if scope != "daily" else DailyScore.best_score.desc())
    q = q.limit(limit)

    res = await db.execute(q)
    rows = res.all()
    out = []
    for i, r in enumerate(rows):
        out.append({
            "rank": i + 1,
            "user_id": r.user_id,
            "username": r.username,
            "elo": r.elo,
            "score": int(r.score or 0),
        })
    return out


async def user_rank(db: AsyncSession, user_id: int, scope: str = "daily", ref: date | None = None) -> dict | None:
    """Tek bir kullanıcının bir kapsamdaki sırasını ve puanını döner."""
    board = await leaderboard(db, scope=scope, limit=100000, ref=ref)
    for entry in board:
        if entry["user_id"] == user_id:
            return entry
    return None
