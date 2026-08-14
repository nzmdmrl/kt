"""
Günün kelimesini çözenler — "Bugün X kişi çözdü" sayacı için.

Her (gün, kelime uzunluğu, çözen) için TEK satır. `solver` alanı:
  - üye     -> "u{user_id}"
  - misafir -> "g{istemci anahtarı}" (tarayıcıda localStorage'da üretilir)

Kayıt, tahmin DOĞRU olduğunda /api/daily/check içinde atılır: doğru kelimeyi
bilmeden satır oluşturulamaz, bu yüzden ayrı bir "çözdüm" ucu açmaya gerek yok.
"""

from __future__ import annotations

from datetime import date as date_type, datetime

from sqlalchemy import Integer, String, Date, DateTime, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DailySolve(Base):
    __tablename__ = "daily_solves"
    __table_args__ = (
        UniqueConstraint("solve_date", "length", "solver", name="uq_daily_solver"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    solve_date: Mapped[date_type] = mapped_column(Date, index=True)
    length: Mapped[int] = mapped_column(Integer, default=5)
    solver: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
