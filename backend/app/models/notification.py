"""
Bildirim modeli.

Kullanıcıya düşen bildirimler (lig ödülü kazanma, vb.). Kullanıcı adının
yanındaki bildirim bölümünde gösterilir; okununca işaretlenir.

kind:    "award" (lig ödülü) | ileride başka türler
title:   kısa başlık ("Günün Şampiyonu!")
body:    açıklama ("Dünkü günlük ligde 1. oldun 🏆")
icon:    emoji
read:    okundu mu
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, String, Text, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(24), default="award")
    title: Mapped[str] = mapped_column(String(128))
    body: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(8), default="🔔")
    link: Mapped[str] = mapped_column(String(128), default="")   # tıklanınca gidilecek (ör. /arena/ozel/{code})
    read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def to_public(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "title": self.title,
            "body": self.body,
            "icon": self.icon,
            "link": self.link or "",
            "read": self.read,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
