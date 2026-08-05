"""
Unvan (title) modeli — XP eşiğine göre açılan unvanlar.

Admin panelden isim/ikon/XP eşiği düzenlenebilsin diye DB'de tutulur.
İlk açılışta DEFAULT_TITLES ile seed edilir (yoksa).
"""

from __future__ import annotations

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Title(Base):
    __tablename__ = "titles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(48))
    icon: Mapped[str] = mapped_column(String(8), default="🌱")
    xp_required: Mapped[int] = mapped_column(Integer, default=0, index=True)

    def to_public(self) -> dict:
        return {"id": self.id, "name": self.name, "icon": self.icon, "xp_required": self.xp_required}


# Varsayılan 20 unvan — başta hızlı (0/20/50/100), sonra aralık kademeli artar.
DEFAULT_TITLES = [
    ("Çaylak", "🌱", 0),
    ("Meraklı", "🔎", 20),
    ("Kaşif", "🧭", 50),
    ("Bilgin", "📚", 100),
    ("Düşünür", "💡", 180),
    ("Araştırmacı", "📝", 300),
    ("Usta", "⚒️", 480),
    ("Uzman", "🎯", 720),
    ("Âlim", "📖", 1050),
    ("Deha", "🧠", 1500),
    ("Üstat", "🏅", 2100),
    ("Fenomen", "🌟", 2900),
    ("Şampiyon", "👑", 3900),
    ("Titan", "⚔️", 5200),
    ("Efsane", "🔥", 6800),
    ("İkon", "💎", 8800),
    ("Zirve", "🏔️", 11300),
    ("Öncü", "🚀", 14400),
    ("Mit", "⚡", 18200),
    ("Ölümsüz", "♾️", 22800),
]
