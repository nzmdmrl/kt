"""
Kelime modeli — kelime havuzu artık veritabanında (JSON yerine).

Böylece admin panelden yapılan değişiklikler (ekleme, çıkarma, üye/bot ayrımı,
temizlik) KALICI olur; deploy'da sıfırlanmaz. İlk açılışta JSON havuzları
DB'ye aktarılır (seed), sonrası DB üzerinden yürür.

Alanlar:
  length     : kelime uzunluğu (4/5/6) — hızlı filtre için ayrı sütun
  word       : normalize edilmiş kelime (büyük harf)
  difficulty : kolay / orta / zor
  member     : üye havuzunda mı (maçta hedef olarak çıkabilir)
  bot        : bot havuzunda mı (bot tahmin olarak kullanabilir)
  active     : genel aktiflik (pasifse hiç kullanılmaz)
"""

from __future__ import annotations

from sqlalchemy import String, Integer, Boolean, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Word(Base):
    __tablename__ = "words"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    length: Mapped[int] = mapped_column(Integer, index=True)
    word: Mapped[str] = mapped_column(String(32), index=True)
    difficulty: Mapped[str] = mapped_column(String(8), default="orta")
    member: Mapped[bool] = mapped_column(Boolean, default=True)
    bot: Mapped[bool] = mapped_column(Boolean, default=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (
        Index("ix_words_length_word", "length", "word", unique=True),
    )
