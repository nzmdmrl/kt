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
    "tile_correct": "Harf yerleşme — yeşil (doğru yer)",
    "tile_present": "Harf yerleşme — sarı (yanlış yer)",
    "tile_absent": "Harf yerleşme — gri (yok)",
    "correct": "Doğru tahmin (kelime bulundu)",
    "wrong": "Yanlış tahmin",
    "win": "Kazanma",
    "lose": "Kaybetme",
    "round_start": "Tur başı",
    "match_start": "Maç başlangıç",
    "radar": "Rakip aranıyor (radar)",
    "opponent_found": "Rakip bulundu",
    "tick": "Geri sayım tık-tık",
    "joker_yellow": "Joker — sarı harf",
    "joker_green": "Joker — yeşil harf",
    "joker_time": "Joker — süre uzatma",
    "music1": "Ana sayfa müzik 1",
    "music2": "Ana sayfa müzik 2",
    "music3": "Ana sayfa müzik 3",
    "music4": "Ana sayfa müzik 4",
    "music5": "Ana sayfa müzik 5",
    "music6": "Ana sayfa müzik 6",
}


class SoundAsset(Base):
    __tablename__ = "sound_assets"

    slot: Mapped[str] = mapped_column(String(32), primary_key=True)
    filename: Mapped[str] = mapped_column(String(256))
    mime: Mapped[str] = mapped_column(String(64), default="audio/mpeg")
    # Dosya içeriği base64 olarak (disk yerine DB — kalıcı volume gerekmez).
    data_b64: Mapped[str] = mapped_column(Text)

