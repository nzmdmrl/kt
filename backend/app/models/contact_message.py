"""
İletişim formu mesajları.

Mesaj HER ZAMAN veritabanına yazılır (hiçbir şey kaybolmasın) ve SMTP
yapılandırılmışsa ayrıca `CONTACT_EMAIL` adresine e-posta olarak gönderilir.
Admin panelinden okunur/silinir.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, Text, Boolean, Integer, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ContactMessage(Base):
    __tablename__ = "contact_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Gönderen giriş yapmışsa kullanıcı id'si (yoksa None — misafir).
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(80), default="")
    email: Mapped[str] = mapped_column(String(160), default="")
    subject: Mapped[str] = mapped_column(String(160), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    # E-posta gerçekten gönderilebildi mi (SMTP yapılandırılmamışsa False).
    mailed: Mapped[bool] = mapped_column(Boolean, default=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def to_admin(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "email": self.email,
            "subject": self.subject,
            "body": self.body,
            "mailed": bool(self.mailed),
            "is_read": bool(self.is_read),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
