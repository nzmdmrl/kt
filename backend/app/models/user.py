"""
Kullanıcı modeli.

Hem e-posta/şifre hem Google OAuth ile hesap açılabilir. Şifre yalnızca
e-posta kaydında dolu olur; Google kullanıcılarında google_sub dolu, password boş.

İstatistik alanları (matches_played, wins vb.) burada tutulur; lig/rozet
sistemleri (Faz 5-6) bunların üstüne kurulacak. ELO matchmaking (Faz 4) için hazır.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, Integer, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Kimlik
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    username: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)

    # Profil
    display_name: Mapped[str] = mapped_column(String(48))
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Oyun / reyting
    elo: Mapped[int] = mapped_column(Integer, default=1000)

    # Kümülatif istatistikler (Faz 5-6 lig/rozet bunları kullanır)
    matches_played: Mapped[int] = mapped_column(Integer, default=0)
    wins: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    draws: Mapped[int] = mapped_column(Integer, default=0)
    words_solved: Mapped[int] = mapped_column(Integer, default=0)
    total_score: Mapped[int] = mapped_column(Integer, default=0)

    # Solo istatistikleri (lige yazılmaz — ayrı tutulur)
    solo_matches: Mapped[int] = mapped_column(Integer, default=0)
    solo_best_score: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def to_public(self) -> dict:
        """Herkese açık profil görünümü (hassas alanlar yok)."""
        return {
            "id": self.id,
            "username": self.username,
            "display_name": self.display_name,
            "avatar_url": self.avatar_url,
            "elo": self.elo,
            "matches_played": self.matches_played,
            "wins": self.wins,
            "losses": self.losses,
            "draws": self.draws,
            "words_solved": self.words_solved,
            "solo_best_score": self.solo_best_score,
        }

    def to_private(self) -> dict:
        """Kendi hesabına dair görünüm (e-posta dahil, şifre yok)."""
        data = self.to_public()
        data["email"] = self.email
        data["has_password"] = self.password_hash is not None
        data["google_linked"] = self.google_sub is not None
        return data
