"""
Lig ödül modeli.

Dönem (ay/yıl) sonunda ilk 3 oyuncuya ödül verilir:
  1. -> kupa (trophy), 2. ve 3. -> madalya (medal).
Ödüller kalıcı olarak burada saklanır ve profilde/rozet vitrininde gösterilir.

period_type: "monthly" | "yearly"
period_key:  "2026-07" (aylık) | "2026" (yıllık)
rank:        1 | 2 | 3
award:       "trophy" | "medal"
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, String, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class LeagueAward(Base):
    __tablename__ = "league_awards"
    __table_args__ = (
        UniqueConstraint("user_id", "period_type", "period_key", name="uq_award"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    period_type: Mapped[str] = mapped_column(String(16))   # monthly | yearly
    period_key: Mapped[str] = mapped_column(String(16), index=True)  # 2026-07 | 2026
    rank: Mapped[int] = mapped_column(Integer)             # 1,2,3
    award: Mapped[str] = mapped_column(String(16))         # trophy | medal
    total_score: Mapped[int] = mapped_column(Integer, default=0)  # dönem toplam puanı
    awarded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def to_public(self) -> dict:
        return {
            "period_type": self.period_type,
            "period_key": self.period_key,
            "rank": self.rank,
            "award": self.award,
            "total_score": self.total_score,
        }
