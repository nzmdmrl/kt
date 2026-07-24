"""
Ses dosyası modeli.

Her ses SLOT'u (buton, doğru, yanlış, kazanma, kaybetme, tur başı, müzik)
için admin bir mp3 yükleyebilir. Yüklenmemişse frontend sentetik ses çalar.

Ses dosyası İÇERİĞİ doğrudan veritabanında saklanır (base64). Böylece disk
volume'u gerekmez — PostgreSQL zaten kalıcı, dosyalar deploy'da kaybolmaz.
Dosyalar küçük (max 3MB) olduğundan bu yöntem uygundur.
"""

from __future__ import annotations

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Geçerli ses slotları ve açıklamaları.
SOUND_SLOTS = {
    "button": "Buton tıklama",
    "correct": "Doğru tahmin",
    "wrong": "Yanlış tahmin",
    "win": "Kazanma",
    "lose": "Kaybetme",
    "round_start": "Tur başı",
    "music": "Arka plan müziği",
}


class SoundAsset(Base):
    __tablename__ = "sound_assets"

    slot: Mapped[str] = mapped_column(String(32), primary_key=True)
    filename: Mapped[str] = mapped_column(String(256))
    mime: Mapped[str] = mapped_column(String(64), default="audio/mpeg")
    # Dosya içeriği base64 olarak (disk yerine DB — kalıcı volume gerekmez).
    data_b64: Mapped[str] = mapped_column(Text)

