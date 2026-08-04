"""
Arena geçmişi modeli — kullanıcının katıldığı Arena maçlarının sonucu.

Her gerçek oyuncu için maç başına bir satır: kaçıncı olduğu (rank), skoru,
doğru sayısı, toplam oyuncu. Geçmiş sayfasında "Arena'da 2. oldun" gibi gösterilir.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ArenaHistory(Base):
    __tablename__ = "arena_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    rank: Mapped[int] = mapped_column(Integer, default=0)          # kaçıncı oldu (1,2,3...)
    score: Mapped[int] = mapped_column(Integer, default=0)         # arena puanı
    correct_count: Mapped[int] = mapped_column(Integer, default=0) # kaç kelime bildi
    total_words: Mapped[int] = mapped_column(Integer, default=6)
    player_count: Mapped[int] = mapped_column(Integer, default=5)  # maçtaki oyuncu sayısı
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    def to_public(self) -> dict:
        return {
            "rank": self.rank,
            "score": self.score,
            "correct_count": self.correct_count,
            "total_words": self.total_words,
            "player_count": self.player_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
