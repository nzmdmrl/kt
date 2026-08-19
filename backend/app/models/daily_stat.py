"""
Günlük SAYAÇLAR — admin özet ekranındaki ortam kırılımı.

TASARIM: gün + ortam + ölçü başına TEK SATIR
------------------------------------------
    (2026-08-19, "app", "visitors") -> 137

Önceki sürüm ZİYARETÇİ BAŞINA bir satır yazıyordu (daily_visits). O yaklaşımın
iki sıkıntısı vardı:
  - tablo ziyaretçi sayısıyla doğru orantılı büyüyordu (günde binlerce satır),
  - "bu ay kaç ziyaretçi" sorusu on binlerce satır taramak demekti.
Sayaç kurgusunda gün başına en fazla 3 ortam × 1 ölçü = 3 satır oluşur; aylık
toplam 90 satırın toplamıdır.

TEKİLLEŞTİRME NEREYE GİTTİ
-------------------------
Eskiden "aynı kişiyi iki kez sayma" işini sunucu yapıyordu (visitor_key).
Sayaçta satırda kimlik tutulmadığı için bu iş CİHAZA taşındı: tarayıcı, o gün
zaten sayıldıysa bir daha sinyal göndermez (frontend/components/VisitPing.tsx,
localStorage'da tarih damgası). Ziyaretçi anahtarı zaten yalnız o tarayıcıya
ait rastgele bir dizeydi; sunucuda tutulmasının kimliksel bir değeri yoktu.

ARALIK TOPLAMLARININ ANLAMI
---------------------------
"Bu hafta ziyaretçi" = o haftanın GÜNLÜK tekil sayılarının toplamıdır.
Pazartesi ve salı giren bir kişi 2 sayılır. Analitikte standart olan budur
("günlük tekil toplamı"); arayüzde de böyle yazıyor.

metric: "visitors" (şimdilik tek ölçü)
  Yeni üye ve doğrulama sayıları AYRI SAYAÇ TUTMAZ — onlar `users` tablosundan
  (created_at / verified_at) tarih aralığıyla doğrudan ve KESİN hesaplanır.
  Ziyaretçi için bu mümkün değil, çünkü geçmişe dönük tekil ziyaretçi bilgisi
  başka hiçbir yerde durmuyor.
"""

from __future__ import annotations

from datetime import date as date_type, datetime

from sqlalchemy import Integer, String, Date, DateTime, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

PLATFORMS = ("app", "mobile", "desktop")
METRIC_VISITORS = "visitors"


class DailyStat(Base):
    __tablename__ = "daily_stats"
    __table_args__ = (
        UniqueConstraint("stat_date", "platform", "metric", name="uq_daily_stat"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    stat_date: Mapped[date_type] = mapped_column(Date, index=True)
    platform: Mapped[str] = mapped_column(String(10), index=True)
    metric: Mapped[str] = mapped_column(String(16), default=METRIC_VISITORS)
    count: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
