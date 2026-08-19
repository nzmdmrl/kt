"""
Doğrulama hatırlatması kaydı — kime, ne zaman hatırlatıldı.

NEDEN AYRI BİR TABLO
--------------------
"Aynı kullanıcıya aynı hatırlatma iki kez gitmesin" kuralını, gönderilmiş
bildirimlere bakarak uygulayamayız: `notifications` satırları belirli bir süre
sonra otomatik siliniyor (notification_retention_days, varsayılan 30 gün).
Satır silinince kullanıcı ikinci kez aynı hatırlatmayı alırdı. Bu tablo asla
temizlenmez; kalıcı "gönderildi" damgasıdır.

Kullanıcı başına TEK satır tutulur:
  first_sent_at   -> birinci hatırlatma gönderildi (NULL = henüz gönderilmedi)
  second_sent_at  -> ikinci hatırlatma gönderildi
  cancelled_at    -> kullanıcı ARADA hesabını doğruladı; bekleyen ikinci
                     hatırlatma iptal edildi, bir daha hiç gönderilmez.

Aşama 4'teki admin paneli bu tablodan "kaç kişiye hatırlatıldı, kaçı sonrasında
doğruladı" sayılarını okuyabilecek.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class VerifyReminder(Base):
    __tablename__ = "verify_reminders"

    # Kullanıcı başına tek satır -> user_id birincil anahtar.
    # Hesap silinirse (ör. ilerleme taşıma) satır da gitsin.
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    first_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    second_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
