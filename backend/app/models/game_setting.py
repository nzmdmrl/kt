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
    "jokers_enabled": {"value": "true", "label": "Joker sistemi aktif", "type": "bool"},
    "joker_yellow_count": {"value": "2", "label": "Sarı harf joker hakkı", "type": "int"},
    "joker_green_count": {"value": "1", "label": "Yeşil harf joker hakkı", "type": "int"},
    "joker_time_count": {"value": "1", "label": "Süre uzatma joker hakkı", "type": "int"},
    "solo_seconds": {"value": "120", "label": "Solo level süresi (saniye)", "type": "int"},
    "solo_star3_min": {"value": "80", "label": "Solo 3 yıldız için min kalan süre (sn)", "type": "int"},
    "solo_star2_min": {"value": "30", "label": "Solo 2 yıldız için min kalan süre (sn)", "type": "int"},
    "solo_jokers_enabled": {"value": "0", "label": "Solo joker sistemi açık (1/0)", "type": "bool"},
    "solo_joker_per_level": {"value": "1", "label": "Solo level başına joker hakkı", "type": "int"},
    "arena_seconds_4": {"value": "10", "label": "Arena 4 harfli süre (sn)", "type": "int"},
    "arena_seconds_5": {"value": "15", "label": "Arena 5 harfli süre (sn)", "type": "int"},
    "arena_seconds_6": {"value": "20", "label": "Arena 6 harfli süre (sn)", "type": "int"},
    "arena_wait_seconds": {"value": "15", "label": "Arena rakip arama süresi (sn)", "type": "int"},
    "arena_bot_interval": {"value": "2", "label": "Arena bot katılım aralığı (sn)", "type": "int"},
    "arena_reveal_seconds": {"value": "4", "label": "Arena sonuç tablosu gösterim süresi (sn)", "type": "int"},
    "night_bg_enabled": {"value": "true", "label": "Gece arka plan animasyonu açık", "type": "bool"},
    "night_bg_theme": {"value": "night", "label": "Arka plan teması (night/aurora/nebula/snow)", "type": "str"},
    "xp_match_win": {"value": "50", "label": "XP: 1v1 galibiyet", "type": "int"},
    "xp_match_loss": {"value": "15", "label": "XP: 1v1 mağlubiyet", "type": "int"},
    "xp_match_draw": {"value": "25", "label": "XP: 1v1 beraberlik", "type": "int"},
    "xp_arena_played": {"value": "20", "label": "XP: Arena katılım", "type": "int"},
    "xp_arena_win": {"value": "60", "label": "XP: Arena birincilik", "type": "int"},
    "xp_solo_level": {"value": "30", "label": "XP: Solo level geçme", "type": "int"},
    "xp_daily_solved": {"value": "40", "label": "XP: Günün kelimesi çözme", "type": "int"},
    "friend_request_hourly_limit": {"value": "5", "label": "Saatlik arkadaşlık isteği limiti", "type": "int"},
}
