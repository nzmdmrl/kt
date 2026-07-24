"""
Lig puan modeli.

Lig mantığı:
  - Günlük puan = kullanıcının o GÜN oynadığı maçlardaki EN YÜKSEK tek-maç puanı.
    (Her maçta değil; günün en iyisi. Böylece spam oynamak avantaj sağlamaz,
     ama iyi bir maç günü kurtarır.)
  - Aylık = o ayki günlük puanların TOPLAMI (her gün oynayan birikim yapar).
  - Yıllık = o yılki günlük puanların toplamı.
  - Tüm zamanlar = tüm günlük puanların toplamı.

Bir satır = (user_id, date, best_score). Maç bitince o günün satırı upsert edilir:
yeni maç puanı mevcut best_score'dan büyükse güncellenir.

Sıralamalar bu tablodan SUM/MAX ile hesaplanır (aşağıdaki league_service).
"""

from __future__ import annotations

from datetime import date as date_type

from sqlalchemy import Integer, Date, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DailyScore(Base):
    __tablename__ = "daily_scores"
    __table_args__ = (
        UniqueConstraint("user_id", "score_date", name="uq_user_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    score_date: Mapped[date_type] = mapped_column(Date, index=True)
    best_score: Mapped[int] = mapped_column(Integer, default=0)
    # O gün kaç maç oynandı (istatistik/gösterim için).
    matches: Mapped[int] = mapped_column(Integer, default=0)
