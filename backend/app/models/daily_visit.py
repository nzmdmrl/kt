"""
Günlük tekil ziyaretçi sayacı — admin özet ekranındaki "ziyaretçi" sayıları.

Her (gün, ortam, ziyaretçi) için TEK satır. Ziyaretçi anahtarı:
  - girişli kullanıcı -> "u{id}"
  - girişsiz ziyaretçi -> "c{tarayıcıda üretilen rastgele anahtar}"

Ortam (platform):
  app     -> mobil uygulama (user agent'ta "KelimeApp/" işareti)
  mobile  -> mobil tarayıcı
  desktop -> masaüstü tarayıcı

Kişisel veri tutulmaz: IP, user agent ya da ad YAZILMAZ. Yalnız "bugün şu
ortamdan kaç ayrı ziyaretçi geldi" sorusunu yanıtlar.
"""

from __future__ import annotations

from datetime import date as date_type, datetime

from sqlalchemy import Integer, String, Date, DateTime, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

PLATFORMS = ("app", "mobile", "desktop")


class DailyVisit(Base):
    __tablename__ = "daily_visits"
    __table_args__ = (
        UniqueConstraint("visit_date", "platform", "visitor_key", name="uq_daily_visit"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    visit_date: Mapped[date_type] = mapped_column(Date, index=True)
    platform: Mapped[str] = mapped_column(String(10), index=True)
    visitor_key: Mapped[str] = mapped_column(String(48))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
