"""
Solo (hikaye) modu ilerlemesi.

Her kullanıcı için:
  - current_level : ulaştığı en yüksek açık level (1'den başlar)
  - total_stars   : toplam kazanılan yıldız

Her level için ayrı kayıt (SoloLevelResult): o levelde alınan en iyi yıldız
+ kaç kez oynandı (attempt — tekrar oynayınca kelime değişsin diye).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, DateTime, func, UniqueConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SoloProgress(Base):
    __tablename__ = "solo_progress"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), primary_key=True)
    current_level: Mapped[int] = mapped_column(Integer, default=1)   # açık en yüksek level
    total_stars: Mapped[int] = mapped_column(Integer, default=0)     # toplam yıldız
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SoloLevelResult(Base):
    __tablename__ = "solo_level_results"
    __table_args__ = (UniqueConstraint("user_id", "level", name="uq_solo_user_level"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    level: Mapped[int] = mapped_column(Integer, index=True)
    best_stars: Mapped[int] = mapped_column(Integer, default=0)      # bu levelde alınan en iyi yıldız (0-3)
    attempts: Mapped[int] = mapped_column(Integer, default=0)        # kaç kez oynandı (kelime değişimi için)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
