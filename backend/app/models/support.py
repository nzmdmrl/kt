"""
Destek biletleri (iletişim formu -> destek talebi).

Form doldurulunca bir BİLET açılır; yazışma bilet altında mesaj mesaj ilerler.
Admin yanıtlayınca üyeye bildirim gider, üye bileti açıp okur ve tekrar
yanıtlayabilir. E-posta gönderimi YOKTUR — her şey uygulama içinde.

Misafir (giriş yapmamış) da bilet açabilir; ad + e-posta verir ama uygulama
içinden yanıt okuyamaz (bilet paneli üyeye özeldir).
"""

from __future__ import annotations

import secrets
from datetime import datetime

from sqlalchemy import String, Text, Boolean, Integer, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Bilet numarası: 5 haneli, karıştırılması kolay harfler (I/O/0/1) çıkarılmış.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LEN = 5


def new_ticket_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LEN))

# Bilet durumları.
STATUS_OPEN = "open"          # yanıt bekliyor (üye yazdı)
STATUS_ANSWERED = "answered"  # admin yanıtladı
STATUS_CLOSED = "closed"      # kapatıldı


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Kullanıcıya gösterilen bilet numarası (5 haneli harf+rakam, ör. "K7M2P").
    # Adres ve bildirim linki bu koda göre kurulur; sıralı id dışarı sızmaz.
    code: Mapped[str] = mapped_column(String(8), default="", index=True)
    # Giriş yapmış kullanıcı (misafir bilette None).
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(80), default="")
    email: Mapped[str] = mapped_column(String(160), default="")
    subject: Mapped[str] = mapped_column(String(160), default="")
    status: Mapped[str] = mapped_column(String(16), default=STATUS_OPEN, index=True)
    # Okunmamış işaretleri: rozetler ve "yeni yanıt" vurgusu bunlara bakar.
    user_unread: Mapped[bool] = mapped_column(Boolean, default=False)
    admin_unread: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    def to_public(self, last: str = "", count: int = 0) -> dict:
        return {
            "id": self.id,
            "code": self.code or str(self.id),
            "subject": self.subject,
            "status": self.status,
            "unread": bool(self.user_unread),
            "messages": count,
            "last": last,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def to_admin(self, last: str = "", count: int = 0) -> dict:
        d = self.to_public(last, count)
        d.update({
            "user_id": self.user_id,
            "name": self.name,
            "email": self.email,
            "admin_unread": bool(self.admin_unread),
        })
        return d


class SupportMessage(Base):
    __tablename__ = "support_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[int] = mapped_column(Integer, index=True)
    # "user" (bileti açan) | "admin" (destek ekibi)
    sender: Mapped[str] = mapped_column(String(8), default="user")
    body: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def to_public(self) -> dict:
        return {
            "id": self.id,
            "sender": self.sender,
            "body": self.body,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
