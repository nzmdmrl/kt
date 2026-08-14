"""
Kullanıcı adı değişiklik kaydı.

Kullanıcı adı 30 günde en fazla 2 kez değiştirilebilir; kotayı denetlemek için
her değişiklik bir satır olarak buraya yazılır. Eski ad da tutulur (destek /
kötüye kullanım incelemesi için).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UsernameChange(Base):
    __tablename__ = "username_changes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    old_username: Mapped[str] = mapped_column(String(48))
    new_username: Mapped[str] = mapped_column(String(48))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
