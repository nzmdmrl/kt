"""
Ana sayfa mod butonlarının ikon ve renkleri (admin → 🏠 Ana Sayfa).

Her buton için:
  icon      : solda görünen ikon
  deco_icon : kartın sağındaki büyük arka plan ikonu (boş = sol ikonun aynısı)
  bg        : CSS arka plan değeri (boş = koddaki/temadaki varsayılan görünüm)

DEFAULT_HOME_BUTTONS, MEVCUT tasarımın birebir aynısıdır — startup'ta sadece
EKSİK anahtarlar eklenir, admin düzenlemesi korunur. 1v1 hero butonu ve ikili
kartların (bot/oda) `bg` alanı bilerek BOŞ bırakıldı: renkleri globals.css'te
tanımlı (stil2'de farklı ton kullanıyor) — boş kaldığı sürece görünüm değişmez.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

DEFAULT_HOME_BUTTONS: list[dict] = [
    {"key": "arena", "label": "Arena", "icon": "⚔️", "deco_icon": "",
     "bg": "linear-gradient(145deg,#e0940a,#c47a00)"},
    {"key": "custom_arena", "label": "Özel Arena", "icon": "🎪", "deco_icon": "",
     "bg": "linear-gradient(145deg,#7b52c4,#5e3a9e)"},
    {"key": "marathon", "label": "Maraton", "icon": "🏃", "deco_icon": "",
     "bg": "linear-gradient(145deg,#4a8fc4,#2e6da8)"},
    {"key": "duel", "label": "1v1 Düello — Oyna (büyük buton)", "icon": "🎮", "deco_icon": "", "bg": ""},
    {"key": "bot", "label": "1vB Pratik", "icon": "🤖", "deco_icon": "", "bg": ""},
    {"key": "room", "label": "Özel Oda Kur", "icon": "🚪", "deco_icon": "", "bg": ""},
    {"key": "daily", "label": "Günün Kelimesi", "icon": "📅", "deco_icon": "",
     "bg": "linear-gradient(145deg,#c44a7e,#a23763)"},
    {"key": "league", "label": "Lig", "icon": "🏆", "deco_icon": "",
     "bg": "linear-gradient(145deg,#3a7fc4,#2868a8)"},
]

HOME_BUTTON_KEYS = [b["key"] for b in DEFAULT_HOME_BUTTONS]
HOME_BUTTON_LABELS = {b["key"]: b["label"] for b in DEFAULT_HOME_BUTTONS}


class HomeButton(Base):
    __tablename__ = "home_buttons"

    key: Mapped[str] = mapped_column(String(32), primary_key=True)
    icon: Mapped[str] = mapped_column(String(16), default="")
    deco_icon: Mapped[str] = mapped_column(String(16), default="")
    bg: Mapped[str] = mapped_column(String(255), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def to_public(self) -> dict:
        return {
            "key": self.key,
            "icon": self.icon or "",
            # Boşsa arka plan ikonu sol ikonla aynıdır (mevcut davranış).
            "deco_icon": self.deco_icon or "",
            "bg": self.bg or "",
        }
