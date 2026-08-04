"""
Özel Arena modeli — kullanıcının oluşturduğu özelleştirilmiş arena ayarları.

"Önceki arenalarım" için saklanır; tıklayınca aynı ayarlarla tekrar açılır.
Her satır bir özel arena şablonu/kaydı: isim + ayarlar (JSON).

Ayarlar:
  size: 2..5 (kişi sayısı)
  wait_seconds: lobi bekleme (max 120, default 60)
  bots_enabled: bot açık mı (default False; açıksa son 10sn'de katılır)
  word_plan: [4,4,5,5,6,6] gibi (toplam max 6)
"""

from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy import Integer, String, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CustomArena(Base):
    __tablename__ = "custom_arenas"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(Integer, index=True)
    name: Mapped[str] = mapped_column(String(64), default="Özel Arena")
    size: Mapped[int] = mapped_column(Integer, default=5)
    wait_seconds: Mapped[int] = mapped_column(Integer, default=60)
    bots_enabled: Mapped[int] = mapped_column(Integer, default=0)   # 0/1
    word_plan_json: Mapped[str] = mapped_column(Text, default="[4,4,5,5,6,6]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    @property
    def word_plan(self) -> list[int]:
        try:
            return json.loads(self.word_plan_json)
        except Exception:
            return [4, 4, 5, 5, 6, 6]

    def to_public(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "size": self.size,
            "wait_seconds": self.wait_seconds,
            "bots_enabled": bool(self.bots_enabled),
            "word_plan": self.word_plan,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
