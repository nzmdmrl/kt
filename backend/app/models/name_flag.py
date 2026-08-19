"""
İsim denetimi işaretleri — "İsim Kontrol" panelinin veri kaynağı.

Kullanıcı isim yazdığında (hesap açarken ya da sonradan değiştirirken) denetim
ARKA PLANDA çalışır; şüpheli bulunan her isim için buraya bir satır düşer.
Kullanıcı bu sırada oyununa devam eder — denetim hiçbir şeyi bekletmez.

layer  : hangi katman yakaladı
         "blacklist" -> yerel Türkçe kara liste (anında, bedava)
         "ai"        -> OpenAI (kara listenin kaçırdığı yaratıcı yazımlar)
         "both"      -> ikisi de
score  : 0-100 güven derecesi (yüzde). Eşikler admin ayarı.
action : sistemin kendiliğinden yaptığı iş
         "none"          -> sadece listeye düştü, hesap çalışmaya devam ediyor
         "auto_disabled" -> güven yüksekti, hesap otomatik pasife alındı
status : adminin verdiği karar
         "pending" -> bekliyor
         "clean"   -> temiz (yanlış alarm; hesap pasifse yeniden açılır)
         "blocked" -> uygunsuz (hesap pasif kalır/pasife alınır)
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, String, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

LAYERS = ("blacklist", "ai", "both")
STATUSES = ("pending", "clean", "blocked")
ACTIONS = ("none", "auto_disabled")


class NameFlag(Base):
    __tablename__ = "name_flags"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Kullanıcı silinirse satır kalabilir (geçmiş kaydı) — bu yüzden FK yok,
    # panelde kullanıcı bulunamazsa "silinmiş hesap" yazılır.
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    # İşaretlenen metinler, o ANKİ hâlleriyle (kullanıcı sonradan değiştirse de
    # admin neyin yakalandığını görebilsin).
    display_name: Mapped[str] = mapped_column(String(48), default="")
    username: Mapped[str] = mapped_column(String(32), default="")

    layer: Mapped[str] = mapped_column(String(16), default="blacklist", index=True)
    score: Mapped[int] = mapped_column(Integer, default=0)          # 0-100
    reason: Mapped[str] = mapped_column(Text, default="")           # eşleşen kelime / AI gerekçesi
    source: Mapped[str] = mapped_column(String(16), default="signup")  # signup | rename
    signup_ip: Mapped[str | None] = mapped_column(String(45), nullable=True, index=True)

    action: Mapped[str] = mapped_column(String(16), default="none")
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
