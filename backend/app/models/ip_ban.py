"""
IP gölge banları.

Admin, "İsim Kontrol" panelinde bir kaydı incelerken o kişinin kayıt IP'sini
banlayabilir. Ban GÖLGE BANDIR:

  - Kullanıcıya hiçbir şey söylenmez, hata gösterilmez, hesabı kapanmaz.
  - O IP'den açılmış (ve sonradan açılacak) hesaplara users.shadow_banned
    işaretlenir.
  - Gölge banlı hesap oynamaya devam eder ama BAŞKALARI onu göremez:
    lig sıralamalarında, üye aramada ve son maçlarda çıkmaz; rakip aramada
    gerçek oyuncuyla eşleşmez, yalnız botla oynar.

Amaç: isim spam'i yapan kişinin durmadan yeni hesap açıp aynı şeyi yapması.
Açıkça engellenirse hemen VPN/başka ağ dener; farkına varmazsa uğraşmaz.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class IpBan(Base):
    __tablename__ = "ip_bans"

    # IPv6 de sığsın diye 45 karakter.
    ip: Mapped[str] = mapped_column(String(45), primary_key=True)
    reason: Mapped[str] = mapped_column(String(200), default="")
    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
