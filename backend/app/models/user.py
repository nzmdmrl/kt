"""
Kullanıcı modeli.

Hem e-posta/şifre hem Google OAuth ile hesap açılabilir. Şifre yalnızca
e-posta kaydında dolu olur; Google kullanıcılarında google_sub dolu, password boş.

İstatistik alanları (matches_played, wins vb.) burada tutulur; lig/rozet
sistemleri (Faz 5-6) bunların üstüne kurulacak. ELO matchmaking (Faz 4) için hazır.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, Integer, DateTime, Boolean, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Seviye eğrisi (xp_service ile aynı formül; döngüsel import olmasın diye burada kopya).
_LEVEL_BASE = 100
_LEVEL_STEP = 50


def _xp_for_level(level: int) -> int:
    if level <= 1:
        return 0
    total = 0
    for L in range(1, level):
        total += _LEVEL_BASE + (L - 1) * _LEVEL_STEP
    return total


def _level_from_xp(xp: int) -> int:
    level = 1
    while xp >= _xp_for_level(level + 1):
        level += 1
        if level > 999:
            break
    return level


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Kimlik
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    username: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    # Play Games oyuncu kimliği (yalnız Android uygulaması). google_sub'dan AYRI
    # bir kimlik uzayıdır: aynı kişinin Google hesabı ile Play Games oyuncu
    # kimliği FARKLI değerlerdir, birbirine eşitlenemez. Play Games e-posta
    # vermez — bu yüzden e-posta ile eşleştirme de yapılmaz (bkz. auth_service).
    play_games_id: Mapped[str | None] = mapped_column(String(64), unique=True, index=True, nullable=True)

    # Profil
    display_name: Mapped[str] = mapped_column(String(48))
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Yüklenen profil fotoğrafı (200x200 JPEG, data URI). ONAYLI olan herkese görünür.
    avatar_photo: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Onay bekleyen yükleme — SADECE sahibine gösterilir (admin → 🖼️ Foto Mod).
    avatar_pending: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_pending_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Görünen ad / kullanıcı adı moderasyonu: pending | approved | rejected
    name_status: Mapped[str] = mapped_column(String(16), default="pending", server_default="pending")
    name_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Oyun / reyting
    elo: Mapped[int] = mapped_column(Integer, default=1000)

    # Kümülatif istatistikler (Faz 5-6 lig/rozet bunları kullanır)
    matches_played: Mapped[int] = mapped_column(Integer, default=0)
    wins: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    draws: Mapped[int] = mapped_column(Integer, default=0)
    words_solved: Mapped[int] = mapped_column(Integer, default=0)
    total_score: Mapped[int] = mapped_column(Integer, default=0)
    xp: Mapped[int] = mapped_column(Integer, default=0)   # toplam XP (seviye buradan hesaplanır)
    custom_arena_played: Mapped[int] = mapped_column(Integer, default=0)  # özel arena tamamlama (rozet için)

    # Arena istatistikleri (normal arena — kupa/madalya/rozet için)
    arena_played: Mapped[int] = mapped_column(Integer, default=0)   # toplam arena katılımı
    arena_first: Mapped[int] = mapped_column(Integer, default=0)    # 1.lik (Arena Şampiyonu)
    arena_second: Mapped[int] = mapped_column(Integer, default=0)   # 2.lik (Arena 2.si)
    arena_third: Mapped[int] = mapped_column(Integer, default=0)    # 3.lük

    # Solo istatistikleri (lige yazılmaz — ayrı tutulur)
    solo_matches: Mapped[int] = mapped_column(Integer, default=0)
    solo_best_score: Mapped[int] = mapped_column(Integer, default=0)

    # --- Hızlı Giriş (isimle hesap açma) ---
    # verified: hesabın KURTARILABİLİR bir kimliği var mı?
    #   True  -> e-posta (+şifre) ya da Google/Play Games bağlı; cihaz/jeton
    #            kaybolsa bile kişi hesabına yeniden girebilir.
    #   False -> hesap YALNIZCA cihazdaki oturum jetonuna dayanıyor (isimle
    #            açılmış hızlı hesap). Jeton silinirse hesap erişilemez olur —
    #            bu yüzden arayüz kullanıcıyı e-posta+şifre eklemeye teşvik eder.
    # Mevcut kullanıcılar geriye dönük doldurulur (app/core/migrations.py → 16).
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    # Hesabın açıldığı IP — aynı IP'den sınırsız hesap açılmasını engellemek için.
    # Yalnız kayıt anında yazılır, sonra güncellenmez (kullanıcı IP'si zaten değişir).
    signup_ip: Mapped[str | None] = mapped_column(String(45), nullable=True, index=True)
    # Gölge ban: hesap kendini normal sanır ama listelerde/eşleşmede saklanır.
    # Admin bir IP'yi banlayınca o IP'den açılan/açılmış hesaplara işlenir
    # (app/api/routes/quick_auth.py). Kullanıcıya HİÇBİR yerde bildirilmez.
    shadow_banned: Mapped[bool] = mapped_column(Boolean, default=False)

    # Hesap pasife alındı mı (isim denetimi yüksek güvenle uygunsuz bulduysa ya
    # da admin elle kapattıysa). Pasif hesap giriş yapamaz: get_current_user 403
    # döner ve arayüz nedeni gösterir. shadow_banned'dan FARKLIDIR — gölge ban
    # gizlidir, bu açıkça engeller.
    disabled: Mapped[bool] = mapped_column(Boolean, default=False)
    disabled_reason: Mapped[str | None] = mapped_column(String(160), nullable=True)
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Kullanıcı hesabını KENDİ sildi mi (Google Play / App Store zorunluluğu).
    # Satır SİLİNMEZ, anonimleştirilir: ad "Silinmiş üye", username
    # "silinmisuye001", e-posta/şifre/avatar boşaltılır. Sebep: maç geçmişi
    # kayıtları rakiplerin geçmişinde duruyor; satır silinseydi onların
    # geçmişi de bozulurdu. Ayrıntı: app/api/routes/account.py → delete_account.
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Hangi ortamdan geldi — admin panelindeki cihaz simgesi ve özet sayıları.
    # Değerler: "app" (mobil uygulama) | "mobile" (mobil tarayıcı) | "desktop"
    signup_platform: Mapped[str | None] = mapped_column(String(10), nullable=True)
    last_platform: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Hesabın ne zaman ve hangi ortamdan doğrulandığı (özet istatistikleri).
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verified_platform: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Yetki
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)

    # Reklamsız (ad-free) hak sahipliği.
    # ÖDEME ENTEGRASYONU YOK — bu yalnızca bayraktır; şu an sadece admin elle açar.
    # ad_free_source: manual | play | apple | web
    #   manual -> admin verdi, play/apple -> mağaza aboneliği, web -> site üzerinden
    # Sütunlar başlangıçta otomatik eklenir (app/core/database.py, DEFAULT FALSE).
    ad_free: Mapped[bool] = mapped_column(Boolean, default=False)
    ad_free_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ad_free_source: Mapped[str | None] = mapped_column(String(24), nullable=True)

    # Terk (maç bırakma) davranışı — ceza sistemi
    abandons: Mapped[int] = mapped_column(Integer, default=0)          # toplam terk sayısı
    matchmaking_banned_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Gizlilik ayarları (varsayılan açık)
    show_online: Mapped[bool] = mapped_column(Boolean, default=True)   # online durumunu göster
    allow_challenges: Mapped[bool] = mapped_column(Boolean, default=True)  # maç tekliflerine açık

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    @property
    def public_avatar(self) -> str | None:
        """Herkese görünen avatar: ONAYLI yüklenen foto > seçilen DiceBear avatarı.
        Onay bekleyen yükleme burada YER ALMAZ (yalnız sahibi görür)."""
        return self.avatar_photo or self.avatar_url

    def to_public(self) -> dict:
        """Herkese açık profil görünümü (hassas alanlar yok)."""
        return {
            "id": self.id,
            "username": self.username,
            "display_name": self.display_name,
            # Herkese açık avatar: onaylı yüklenen foto > seçilen DiceBear avatarı.
            # Onay bekleyen yükleme burada GÖSTERİLMEZ (sadece sahibi görür).
            "avatar_url": self.avatar_photo or self.avatar_url,
            "elo": self.elo,
            "matches_played": self.matches_played,
            "wins": self.wins,
            "losses": self.losses,
            "draws": self.draws,
            "words_solved": self.words_solved,
            "solo_best_score": self.solo_best_score,
            "arena_played": self.arena_played or 0,
            "arena_first": self.arena_first or 0,
            "arena_second": self.arena_second or 0,
            "arena_third": self.arena_third or 0,
            "xp": self.xp or 0,
            "level": _level_from_xp(self.xp or 0),
        }

    def to_private(self) -> dict:
        """Kendi hesabına dair görünüm (e-posta dahil, şifre yok)."""
        data = self.to_public()
        # Sahibi kendi bekleyen fotoğrafını görür (profilinde ve maçlarda).
        data["avatar_url"] = self.avatar_pending or self.avatar_photo or self.avatar_url
        data["avatar_pending"] = bool(self.avatar_pending)
        data["name_status"] = self.name_status or "pending"
        data["email"] = self.email
        data["has_password"] = self.password_hash is not None
        data["google_linked"] = self.google_sub is not None
        data["play_games_linked"] = self.play_games_id is not None
        # Hesap kurtarılabilir mi (e-posta/şifre ya da Google bağlı mı)?
        # Arayüz buna bakıp "Hesabını doğrula" uyarısını gösterir.
        # shadow_banned BİLEREK dönmez — gölge ban, banlanana görünmez olmalı.
        data["verified"] = bool(self.verified)
        # Reklamsız hak: istemci reklam yollarını buna göre kapatır (AdSense,
        # AdMob bandı, geçiş reklamı). Herkese açık görünümde YER ALMAZ.
        data["ad_free"] = bool(self.ad_free)
        data["ad_free_source"] = self.ad_free_source
        # Yönetici mi? Arayüzde admin'e özel girişleri (ör. Reklam Oyunu) açar.
        data["is_admin"] = bool(self.is_admin)
        return data
