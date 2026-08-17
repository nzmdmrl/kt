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
    # Oyun modu — 1: klasik (1v1 3 tur, arena 6 kelime), 2: hızlı (1v1 tek tur 5/6 harf, arena 5 kelime)
    "game_mode": {"value": "1", "label": "Oyun modu (1: Klasik · 2: Hızlı)", "type": "int", "group": "Genel"},
    "round_total_seconds": {"value": "90", "label": "Tur süresi (saniye)", "type": "int", "group": "1v1 Düello"},
    "buzzer_answer_seconds": {"value": "20", "label": "Cevap süresi (saniye)", "type": "int", "group": "1v1 Düello"},
    "reveal_seconds": {"value": "5", "label": "Doğru cevabı gösterme süresi (saniye)", "type": "int", "group": "1v1 Düello"},
    "rows_4": {"value": "5", "label": "4 harfli tur satır sayısı", "type": "int", "group": "1v1 Düello"},
    "rows_5": {"value": "5", "label": "5 harfli tur satır sayısı", "type": "int", "group": "1v1 Düello"},
    "rows_6": {"value": "5", "label": "6 harfli tur satır sayısı", "type": "int", "group": "1v1 Düello"},
    "speed_bonus": {"value": "10", "label": "Hız bonusu (ilk buzzer)", "type": "int", "group": "1v1 Düello"},
    "matchmaking_bot_wait": {"value": "15", "label": "Bot atanmadan önce bekleme (saniye)", "type": "int", "group": "1v1 Düello"},
    "bot_matches_count_league": {"value": "1", "label": "Bot maçları lige sayılsın (1/0)", "type": "bool", "group": "1v1 Düello"},
    "sound_enabled": {"value": "1", "label": "Ses efektleri açık (1/0)", "type": "bool", "group": "Ses"},
    "music_enabled": {"value": "0", "label": "Arka plan müziği açık (1/0)", "type": "bool", "group": "Ses"},
    "sound_volume": {"value": "70", "label": "Ses seviyesi (0-100)", "type": "int", "group": "Ses"},
    "abandon_free_limit": {"value": "2", "label": "Cezasız terk hakkı (sonrası engel)", "type": "int", "group": "1v1 Düello"},
    "abandon_ban_minutes": {"value": "10", "label": "Terk engeli temel süresi (dakika)", "type": "int", "group": "1v1 Düello"},
    "jokers_enabled": {"value": "true", "label": "Joker sistemi aktif", "type": "bool", "group": "Jokerler"},
    "joker_yellow_count": {"value": "2", "label": "Sarı harf joker hakkı", "type": "int", "group": "Jokerler"},
    "joker_green_count": {"value": "1", "label": "Yeşil harf joker hakkı", "type": "int", "group": "Jokerler"},
    "joker_time_count": {"value": "1", "label": "Süre uzatma joker hakkı", "type": "int", "group": "Jokerler"},
    "solo_seconds": {"value": "120", "label": "Maraton bölüm süresi (saniye)", "type": "int", "group": "Maraton"},
    "solo_star3_min": {"value": "80", "label": "Maraton 3 yıldız için min kalan süre (sn)", "type": "int", "group": "Maraton"},
    "solo_star2_min": {"value": "30", "label": "Maraton 2 yıldız için min kalan süre (sn)", "type": "int", "group": "Maraton"},
    "solo_jokers_enabled": {"value": "0", "label": "Maraton joker sistemi açık (1/0)", "type": "bool", "group": "Jokerler"},
    "solo_joker_per_level": {"value": "1", "label": "Maraton bölüm başına joker hakkı", "type": "int", "group": "Jokerler"},
    "arena_seconds_4": {"value": "10", "label": "Arena 4 harfli süre (sn)", "type": "int", "group": "Arena"},
    "arena_seconds_5": {"value": "15", "label": "Arena 5 harfli süre (sn)", "type": "int", "group": "Arena"},
    "arena_seconds_6": {"value": "20", "label": "Arena 6 harfli süre (sn)", "type": "int", "group": "Arena"},
    "arena_wait_seconds": {"value": "15", "label": "Arena rakip arama süresi (sn)", "type": "int", "group": "Arena"},
    "arena_bot_interval": {"value": "2", "label": "Arena bot katılım aralığı (sn)", "type": "int", "group": "Arena"},
    "arena_reveal_seconds": {"value": "4", "label": "Arena sonuç tablosu gösterim süresi (sn)", "type": "int", "group": "Arena"},
    "arena_feedback_seconds": {"value": "2", "label": "Arena cevap sonrası doğru/yanlış gösterim payı (sn)", "type": "int", "group": "Arena"},
    # Biri arenaya girince o an boşta olan üyelere çıkan anlık davet popup'ı.
    "arena_call_enabled": {"value": "true", "label": "Arenaya çağrı (anlık davet popup'ı)", "type": "bool", "group": "Arena"},
    # Oyun ekranı dikey boşlukları (px) — dar ekranlarda ince ayar için.
    "arena_gap_word_letters": {"value": "28", "label": "Arena: kelime kutuları ↔ karma harfler boşluğu (px)", "type": "int", "group": "Arena"},
    "arena_gap_letters_input": {"value": "24", "label": "Arena: karma harfler ↔ yazma satırı boşluğu (px)", "type": "int", "group": "Arena"},
    # Arayüz stili — stil1: eski (klasik) görünüm, stil2: yeni görünüm.
    # Sadece GÖRÜNÜMÜ değiştirir; oyun mantığı/veri aynıdır.
    "ui_style": {"value": "stil2", "label": "Arayüz stili (stil1: klasik · stil2: yeni)", "type": "str", "group": "Görünüm"},
    "night_bg_enabled": {"value": "true", "label": "Gece arka plan animasyonu açık", "type": "bool", "group": "Görünüm"},
    "night_bg_theme": {"value": "night", "label": "Arka plan teması (night/aurora/nebula/snow)", "type": "str", "group": "Görünüm"},
    "xp_match_win": {"value": "50", "label": "XP: 1v1 galibiyet", "type": "int", "group": "XP"},
    "xp_match_loss": {"value": "15", "label": "XP: 1v1 mağlubiyet", "type": "int", "group": "XP"},
    "xp_match_draw": {"value": "25", "label": "XP: 1v1 beraberlik", "type": "int", "group": "XP"},
    "xp_arena_played": {"value": "20", "label": "XP: Arena katılım", "type": "int", "group": "XP"},
    "xp_arena_win": {"value": "60", "label": "XP: Arena birincilik", "type": "int", "group": "XP"},
    "xp_solo_level": {"value": "30", "label": "XP: Maraton bölüm geçme", "type": "int", "group": "XP"},
    "xp_daily_solved": {"value": "40", "label": "XP: Günün kelimesi çözme", "type": "int", "group": "XP"},
    "friend_request_hourly_limit": {"value": "5", "label": "Saatlik arkadaşlık isteği limiti", "type": "int", "group": "Sosyal"},
    # Bu süreyi aşan bildirimler otomatik silinir (6 saatte bir çalışan görev).
    # Kullanıcıya bildirim sayfasında bu süre yazılır. 0 = otomatik silme kapalı.
    "notification_retention_days": {"value": "30", "label": "Bildirim saklama süresi (gün · 0 = sınırsız)", "type": "int", "group": "Sosyal"},
    # Moderasyon — admin panelde 🖼️ Foto Mod / 🏷️ Ad Mod sekmelerinin başından da açılır/kapanır.
    "photo_upload_enabled": {"value": "true", "label": "Profil fotoğrafı yükleme açık (kapalıysa sadece hazır avatar)", "type": "bool", "group": "Moderasyon"},
    "photo_moderation_enabled": {"value": "true", "label": "Yüklenen fotoğraflar onaydan geçsin", "type": "bool", "group": "Moderasyon"},
    "name_moderation_enabled": {"value": "true", "label": "Görünen ad / kullanıcı adı onaydan geçsin", "type": "bool", "group": "Moderasyon"},

    # Misafir (üye olmayan ziyaretçi) erişimi. Kapatılırsa ilgili moda girişte
    # "üye ol" ekranı çıkar; sunucu tarafında da engellenir.
    # Not: panelin aç/kapa düğmesi "true"/"false" yazar — varsayılanlar da öyle.
    "guest_match_enabled": {"value": "true", "label": "Misafirler 1v1 düello oynayabilsin", "type": "bool", "group": "Misafir"},
    "guest_arena_enabled": {"value": "true", "label": "Misafirler arenaya katılabilsin", "type": "bool", "group": "Misafir"},
    "guest_daily_enabled": {"value": "true", "label": "Misafirler günün kelimesini çözebilsin", "type": "bool", "group": "Misafir"},
    # Ad kuralları — kayıt ve profil düzenlemede geçerli (hem sunucu hem arayüz uyar).
    # Sunucu sınırı: kullanıcı adı en fazla 32, görünen ad en fazla 48 karakter (DB sütunu).
    "username_min_len": {"value": "3", "label": "Kullanıcı adı: en az karakter", "type": "int", "group": "Adlar & Listeler"},
    "username_max_len": {"value": "20", "label": "Kullanıcı adı: en fazla karakter (üst sınır 32)", "type": "int", "group": "Adlar & Listeler"},
    "display_name_min_len": {"value": "2", "label": "Görünen ad: en az karakter", "type": "int", "group": "Adlar & Listeler"},
    "display_name_max_len": {"value": "24", "label": "Görünen ad: en fazla karakter (üst sınır 48)", "type": "int", "group": "Adlar & Listeler"},
    # Listelerde (son maçlar, lig tabloları) hangi ad gösterilsin ve kaç karakterden
    # sonra "…" ile kesilsin. Kesme sunucuda yapılır — dar ekranda skorun üstüne binmesin.
    "list_name_source": {"value": "display_name", "label": "Listelerde gösterilecek ad (display_name / username)", "type": "str", "group": "Adlar & Listeler"},
    "list_name_max_len": {"value": "14", "label": "Listelerde ad uzunluğu (aşarsa … ile kesilir · 0 = kesme)", "type": "int", "group": "Adlar & Listeler"},
    # 1v1 tahmin satırının sağ üstündeki mini ad etiketi (Grid.tsx → Tag).
    "match_name_max_len": {"value": "7", "label": "Maçlarda görünen ad — MOBİL (BÜYÜK harfte bu değer, normal yazımda +2 · 0 = kesme)", "type": "int", "group": "Adlar & Listeler"},
    "match_name_max_len_desktop": {"value": "14", "label": "Maçlarda görünen ad — MASAÜSTÜ (BÜYÜK harfte bu değer, normal yazımda +2 · 0 = kesme)", "type": "int", "group": "Adlar & Listeler"},
}
