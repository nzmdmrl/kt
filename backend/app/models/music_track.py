"""
Müzik havuzu — her bölüm için birden fazla mp3 tutulur.

Bölümler (section):
  home        -> Ana sayfa arka plan müziği
  arena_wait  -> Arena rakip aranırken
  match_wait  -> 1v1 rakip aranırken
  solo        -> Solo mod arka plan müziği
  daily       -> Günün kelimesi müziği

Her bölümde birden fazla parça olabilir; oynatıcı rastgele seçer, biterken
fade-out ile diğerine geçer. Admin sürükle-bırak ile yükler, beğenmediğini siler.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Integer, String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


MUSIC_SECTIONS = {
    "home": "Ana sayfa müziği",
    "arena_wait": "Arena rakip aranırken",
    "match_wait": "1v1 rakip aranırken",
    "solo": "Solo mod müziği",
    "daily": "Günün kelimesi müziği",
}


class MusicTrack(Base):
    __tablename__ = "music_tracks"

    id: Mapped[int] = mapped_column(primary_key=True)
    section: Mapped[str] = mapped_column(String(24), index=True)   # MUSIC_SECTIONS anahtarı
    name: Mapped[str] = mapped_column(String(80), default="")       # görünen ad (dosya adı)
    mime: Mapped[str] = mapped_column(String(64), default="audio/mpeg")
    data_b64: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    def to_meta(self) -> dict:
        """Ses verisi olmadan meta (liste için)."""
        return {"id": self.id, "section": self.section, "name": self.name, "mime": self.mime}
