"""
Toplanan kelimeler — kullanıcının maçlarda doğru bildiği benzersiz kelimeler.

Her (user_id, word) çifti tek satır (benzersiz). "Kaç farklı kelime bildin"
istatistiği için sayılır. Sadece gerçek kullanıcılar; bot yok.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, String, DateTime, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CollectedWord(Base):
    __tablename__ = "collected_words"
    __table_args__ = (
        UniqueConstraint("user_id", "word", name="uq_collected_word"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    word: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
