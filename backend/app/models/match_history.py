"""
Maç geçmişi modeli — ana sayfada "son maçlar" için.

Her tamamlanan maç bir satır. İki oyuncunun adı, skoru ve kazanan bilgisi tutulur.
Botlar da dahil (ana sayfada canlılık için). Kişisel/gizli veri yok — sadece görünen ad.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, String, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MatchHistory(Base):
    __tablename__ = "match_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    p1_name: Mapped[str] = mapped_column(String(48))
    p2_name: Mapped[str] = mapped_column(String(48))
    p1_score: Mapped[int] = mapped_column(Integer, default=0)
    p2_score: Mapped[int] = mapped_column(Integer, default=0)
    winner_name: Mapped[str] = mapped_column(String(48), default="")  # "" = beraberlik
    has_bot: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    def to_public(self) -> dict:
        return {
            "p1_name": self.p1_name,
            "p2_name": self.p2_name,
            "p1_score": self.p1_score,
            "p2_score": self.p2_score,
            "winner_name": self.winner_name,
            "has_bot": self.has_bot,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
