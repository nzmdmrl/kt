"""
Oyun ayarları (GameSetting) — key-value.

Faz 4'te koda gömülü olan değerler (tur süresi, cevap süresi, satır sayısı,
puanlar) buraya taşınır. Admin panelden düzenlenir; oyun bu tablodan okur.
Tablo boşsa kod içindeki varsayılanlar kullanılır (güvenli geriye dönüş).
"""

from __future__ import annotations

from sqlalchemy import String, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class GameSetting(Base):
    __tablename__ = "game_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(256))


# Varsayılan ayarlar ve açıklamaları (admin panelde gösterilir).
DEFAULT_SETTINGS = {
    "round_total_seconds": {"value": "90", "label": "Tur süresi (saniye)", "type": "int"},
    "buzzer_answer_seconds": {"value": "20", "label": "Cevap süresi (saniye)", "type": "int"},
    "reveal_seconds": {"value": "5", "label": "Doğru cevabı gösterme süresi (saniye)", "type": "int"},
    "rows_4": {"value": "5", "label": "4 harfli tur satır sayısı", "type": "int"},
    "rows_5": {"value": "5", "label": "5 harfli tur satır sayısı", "type": "int"},
    "rows_6": {"value": "5", "label": "6 harfli tur satır sayısı", "type": "int"},
    "speed_bonus": {"value": "10", "label": "Hız bonusu (ilk buzzer)", "type": "int"},
    "matchmaking_bot_wait": {"value": "15", "label": "Bot atanmadan önce bekleme (saniye)", "type": "int"},
    "bot_matches_count_league": {"value": "1", "label": "Bot maçları lige sayılsın (1/0)", "type": "bool"},
    "sound_enabled": {"value": "1", "label": "Ses efektleri açık (1/0)", "type": "bool"},
    "music_enabled": {"value": "0", "label": "Arka plan müziği açık (1/0)", "type": "bool"},
    "sound_volume": {"value": "70", "label": "Ses seviyesi (0-100)", "type": "int"},
    "abandon_free_limit": {"value": "2", "label": "Cezasız terk hakkı (sonrası engel)", "type": "int"},
    "abandon_ban_minutes": {"value": "10", "label": "Terk engeli temel süresi (dakika)", "type": "int"},
}
