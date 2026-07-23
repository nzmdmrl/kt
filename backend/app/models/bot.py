"""
Bot modeli.

Botlar gerçek kullanıcı gibi ELO taşır ve matchmaking'de oyuncunun ELO'suna
yakın olanlar seçilir. Botun ELO'su davranışını da belirler (bkz. bot_engine).
Admin panel (Faz 10) botları buradan yönetecek: aktif/pasif, üret, sil.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, Integer, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Bot(Base):
    __tablename__ = "bots"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(48))
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    lang: Mapped[str] = mapped_column(String(8), default="tr", index=True)
    elo: Mapped[int] = mapped_column(Integer, default=1000, index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def to_public(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "avatar_url": self.avatar_url,
            "elo": self.elo,
            "is_bot": True,
        }
