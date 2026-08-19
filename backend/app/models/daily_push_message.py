"""
Günün Kelimesi bildirim metinleri.

Her gün (Türkiye saatiyle) belirlenen saatte, son N gündür aktif olan
kullanıcılara "günün kelimesi hazır" bildirimi gönderilir. Gönderilecek metin
BU TABLODAN rastgele seçilir — admin panelden (📣 Günün Bildirimi) satır
eklenir, düzenlenir, pasifleştirilir.

METİNDEKİ YER TUTUCULAR
-----------------------
  {kelime}   -> "K⬜⬜⬜M"  (ilk harf + kutular + son harf)
  {ilk}      -> "K"
  {son}      -> "M"
  {uzunluk}  -> "5"
Yer tutucu yazılmayan metin olduğu gibi gönderilir (ipucusuz bildirim de olur).

Kutu karakteri ayardan gelir (daily_word_push_box, varsayılan ⬜) — emoji
olduğu için her telefonda görünür.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, Text, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# İlk açılışta seed edilen varsayılan metinler (tablo BOŞSA).
DEFAULT_DAILY_PUSH_MESSAGES: list[str] = [
    "Günün Kelimesi {kelime} — bulabildin mi?",
    "Bugünün kelimesi {kelime}. Acaba bu ne?",
    "{kelime} … Bugünkü bulmacayı çözecek misin?",
    "Günün Kelimesi hazır: {kelime}. Sende bu iş var!",
    "İpucu {kelime} — bugünü çözenlerden biri de sen ol!",
]


class DailyPushMessage(Base):
    __tablename__ = "daily_push_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    text: Mapped[str] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def to_public(self) -> dict:
        return {
            "id": self.id,
            "text": self.text,
            "sort_order": self.sort_order,
            "active": bool(self.active),
        }
