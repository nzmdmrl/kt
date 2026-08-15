"""
Arkadaş etiketi (aile / iş / diğer).

Etiket KİŞİYE ÖZELdir: A, B'yi "aile" diye etiketlese de B'nin listesinde A
etiketsiz görünebilir. Bu yüzden simetrik `friendships` satırına yazılmaz,
ayrı tabloda (owner_id -> friend_id) tutulur.

Kullanım: özel arena davetinde "sadece aileyi göster" gibi filtreler.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, String, DateTime, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Geçerli etiketler (boş string = etiketsiz -> satır silinir).
FRIEND_LABELS = ("aile", "is", "diger")


class FriendLabel(Base):
    __tablename__ = "friend_labels"
    __table_args__ = (
        UniqueConstraint("owner_id", "friend_id", name="uq_friend_label"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(Integer, index=True)    # etiketleyen
    friend_id: Mapped[int] = mapped_column(Integer, index=True)   # etiketlenen arkadaş
    label: Mapped[str] = mapped_column(String(16), default="diger")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
