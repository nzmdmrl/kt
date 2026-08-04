"""
Arkadaşlık modeli.

Tek satır bir ilişkiyi temsil eder: requester -> addressee.
status: pending (teklif bekliyor) | accepted (arkadaş) | (reddedilince satır silinir)

Arkadaşlık simetriktir: accepted olunca iki taraf da arkadaş sayılır.
Sorgularken her iki yön de kontrol edilir.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, String, DateTime, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Friendship(Base):
    __tablename__ = "friendships"
    __table_args__ = (
        UniqueConstraint("requester_id", "addressee_id", name="uq_friendship"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    requester_id: Mapped[int] = mapped_column(Integer, index=True)   # teklifi gönderen
    addressee_id: Mapped[int] = mapped_column(Integer, index=True)   # teklifi alan
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending | accepted
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
