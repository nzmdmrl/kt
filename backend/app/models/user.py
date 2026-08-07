"""
Kullanıcı modeli.

Hem e-posta/şifre hem Google OAuth ile hesap açılabilir. Şifre yalnızca
e-posta kaydında dolu olur; Google kullanıcılarında google_sub dolu, password boş.

İstatistik alanları (matches_played, wins vb.) burada tutulur; lig/rozet
sistemleri (Faz 5-6) bunların üstüne kurulacak. ELO matchmaking (Faz 4) için hazır.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, Integer, DateTime, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Seviye eğrisi (xp_service ile aynı formül; döngüsel import olmasın diye burada kopya).
_LEVEL_BASE = 100
_LEVEL_STEP = 50


def _xp_for_level(level: int) -> int:
    if level <= 1:
        return 0
    total = 0
    for L in range(1, level):
        total += _LEVEL_BASE + (L - 1) * _LEVEL_STEP
    return total


def _level_from_xp(xp: int) -> int:
    level = 1
    while xp >= _xp_for_level(level + 1):
        level += 1
        if level > 999:
            break
    return level


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
    xp: Mapped[int] = mapped_column(Integer, default=0)   # toplam XP (seviye buradan hesaplanır)
    custom_arena_played: Mapped[int] = mapped_column(Integer, default=0)  # özel arena tamamlama (rozet için)

    # Arena istatistikleri (normal arena — kupa/madalya/rozet için)
    arena_played: Mapped[int] = mapped_column(Integer, default=0)   # toplam arena katılımı
    arena_first: Mapped[int] = mapped_column(Integer, default=0)    # 1.lik (Arena Şampiyonu)
    arena_second: Mapped[int] = mapped_column(Integer, default=0)   # 2.lik (Arena 2.si)
    arena_third: Mapped[int] = mapped_column(Integer, default=0)    # 3.lük

    # Solo istatistikleri (lige yazılmaz — ayrı tutulur)
    solo_matches: Mapped[int] = mapped_column(Integer, default=0)
    solo_best_score: Mapped[int] = mapped_column(Integer, default=0)

    # Yetki
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)

    # Terk (maç bırakma) davranışı — ceza sistemi
    abandons: Mapped[int] = mapped_column(Integer, default=0)          # toplam terk sayısı
    matchmaking_banned_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Gizlilik ayarları (varsayılan açık)
    show_online: Mapped[bool] = mapped_column(Boolean, default=True)   # online durumunu göster
    allow_challenges: Mapped[bool] = mapped_column(Boolean, default=True)  # maç tekliflerine açık

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
            "arena_played": self.arena_played or 0,
            "arena_first": self.arena_first or 0,
            "arena_second": self.arena_second or 0,
            "arena_third": self.arena_third or 0,
            "xp": self.xp or 0,
            "level": _level_from_xp(self.xp or 0),
        }

    def to_private(self) -> dict:
        """Kendi hesabına dair görünüm (e-posta dahil, şifre yok)."""
        data = self.to_public()
        data["email"] = self.email
        data["has_password"] = self.password_hash is not None
        data["google_linked"] = self.google_sub is not None
        return data
