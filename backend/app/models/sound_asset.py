"""
Ses dosyası modeli.

Her ses SLOT'u (buton, doğru, yanlış, kazanma, kaybetme, tur başı, müzik)
için admin bir mp3 yükleyebilir. Yüklenmemişse frontend sentetik ses çalar.

Bu tablo sadece "hangi slotta dosya var ve dosya adı ne" bilgisini tutar.
Dosyalar diskte AUDIO_DIR altında saklanır.
"""

from __future__ import annotations

from sqlalchemy import String
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
