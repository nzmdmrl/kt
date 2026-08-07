"""
Rozet (badge) modeli — istatistik eşiğine göre kazanılan rozetler.

Admin panelden eklenebilsin diye DB'de tutulur. Koşul: bir istatistik alanı
(stat_key) >= eşik (threshold). İlk açılışta DEFAULT_BADGES ile seed edilir.

stat_key seçenekleri (kullanıcı istatistikleri):
  matches_played, wins, losses, draws, words_solved, total_score, elo,
  custom_arena_played, arena_played, arena_first, arena_second, arena_third,
  trophies, medals
"""

from __future__ import annotations

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class BadgeDef(Base):
    __tablename__ = "badge_defs"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(48), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(64))
    description: Mapped[str] = mapped_column(String(160), default="")
    icon: Mapped[str] = mapped_column(String(8), default="🏅")
    tier: Mapped[str] = mapped_column(String(12), default="bronze")   # bronze|silver|gold
    stat_key: Mapped[str] = mapped_column(String(32), default="matches_played")
    threshold: Mapped[int] = mapped_column(Integer, default=1)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    def to_public(self) -> dict:
        return {
            "id": self.id, "code": self.code, "name": self.name,
            "description": self.description, "icon": self.icon, "tier": self.tier,
            "stat_key": self.stat_key, "threshold": self.threshold, "sort_order": self.sort_order,
        }


# Varsayılan rozetler: (code, name, desc, icon, tier, stat_key, threshold)
DEFAULT_BADGES = [
    ("first_match", "İlk Adım", "İlk maçını oyna", "🎮", "bronze", "matches_played", 1),
    ("first_win", "İlk Zafer", "İlk maçını kazan", "✨", "bronze", "wins", 1),
    ("wins_10", "Yükselen", "10 maç kazan", "🔥", "silver", "wins", 10),
    ("wins_50", "Usta", "50 maç kazan", "💎", "gold", "wins", 50),
    ("matches_10", "Düzenli", "10 maç oyna", "🎯", "bronze", "matches_played", 10),
    ("matches_100", "Bağımlı", "100 maç oyna", "🏅", "gold", "matches_played", 100),
    ("words_100", "Kelime Avcısı", "Toplam 100 kelime bil", "📚", "silver", "words_solved", 100),
    ("elo_1200", "Rekabetçi", "1200 ELO'ya ulaş", "⚔️", "silver", "elo", 1200),
    ("elo_1500", "Şampiyon", "1500 ELO'ya ulaş", "👑", "gold", "elo", 1500),
    ("trophy_1", "Kupa Sahibi", "Bir kupa kazan", "🏆", "gold", "trophies", 1),
    ("score_1000", "Puan Canavarı", "Toplam 1000 puan topla", "⭐", "silver", "total_score", 1000),
    ("custom_arena", "Arena Kurucusu", "Bir özel arena tamamla", "🎪", "gold", "custom_arena_played", 1),
    ("arena_1", "Arena Acemisi", "İlk arena maçını oyna", "🎫", "bronze", "arena_played", 1),
    ("arena_5", "Arena Sever", "5 arena maçı oyna", "🎟️", "bronze", "arena_played", 5),
    ("arena_10", "Arena Savaşçısı", "10 arena maçı oyna", "🛡️", "silver", "arena_played", 10),
    ("arena_50", "Arena Veteranı", "50 arena maçı oyna", "⚔️", "gold", "arena_played", 50),
    ("arena_100", "Arena Efsanesi", "100 arena maçı oyna", "🔱", "gold", "arena_played", 100),
    ("arena_champ_10", "Gladyatör", "10 arena şampiyonluğu kazan", "🦁", "gold", "arena_first", 10),
    ("arena_champ_50", "Spartaküs", "50 arena şampiyonluğu kazan", "🏛️", "gold", "arena_first", 50),
]
