"""
Uygulama yapılandırması.

Tüm ayarlar environment variable'dan okunur (Coolify panelinden girilir).
Gizli değerler (API key, DB şifresi) koda gömülmez; .env.example bunları listeler.
Key boşsa ilgili özellik "yapılandırılmadı" durumunda kalır, uygulama çökmez.
"""

from __future__ import annotations

import os
from functools import lru_cache


class Settings:
    # --- Genel ---
    APP_NAME: str = os.getenv("APP_NAME", "Kelime Tahmin")
    DEFAULT_LANG: str = os.getenv("DEFAULT_LANG", "tr")   # varsayılan sistem dili
    GAME_LANG: str = os.getenv("GAME_LANG", "tr")         # oyun (kelime) dili
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "production")
    # Yüklenen ses dosyalarının klasörü (kalıcı volume ile eşlenmeli).
    AUDIO_DIR: str = os.getenv("AUDIO_DIR", "/app/uploads/audio")

    # --- Veritabanı ---
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://kelime:kelime@db:5432/kelimetahmin",
    )

    # --- Redis ---
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://redis:6379/0")

    # --- CORS / Frontend ---
    FRONTEND_ORIGIN: str = os.getenv("FRONTEND_ORIGIN", "*")

    # --- Google OAuth (Faz 3'te kullanılacak; şimdilik boş olabilir) ---
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")

    # --- Play Games Services (yalnız Android uygulaması) ---
    # DİKKAT — bunlar yukarıdaki GOOGLE_CLIENT_ID/SECRET'ten BAŞKA bir Google
    # Cloud projesine aittir ve BİRBİRİNİN YERİNE KULLANILAMAZ:
    #   GOOGLE_CLIENT_*      -> sitedeki web Google girişi (ayrı proje)
    #   PLAY_GAMES_CLIENT_*  -> uygulamanın Play Games projesi (958058877022)
    # Bilerek fallback YOK: biri boşsa Play Games girişi kapalıdır, sessizce
    # diğer projenin kimliğine düşmez (düşseydi kod takası "invalid_client"
    # ile reddedilir, hata da yanıltıcı olurdu).
    #
    # Değer: Play Games projesindeki **Web** istemcisinin kimliği ve gizli
    # anahtarı (Android istemcisininki DEĞİL — Android istemcisinin secret'ı
    # zaten yoktur).
    PLAY_GAMES_CLIENT_ID: str = os.getenv("PLAY_GAMES_CLIENT_ID", "")
    PLAY_GAMES_CLIENT_SECRET: str = os.getenv("PLAY_GAMES_CLIENT_SECRET", "")

    # --- reCAPTCHA v2 ("Ben robot değilim") — e-posta ile kayıtta bot koruması ---
    # İkisi de doluysa devreye girer; boşsa kayıt eskisi gibi captcha'sız çalışır.
    RECAPTCHA_SITE_KEY: str = os.getenv("RECAPTCHA_SITE_KEY", "")
    RECAPTCHA_SECRET: str = os.getenv("RECAPTCHA_SECRET", "")

    # --- JWT (Faz 3) ---
    JWT_SECRET: str = os.getenv("JWT_SECRET", "degistir-beni-guclu-bir-secret-ile")
    JWT_ALGORITHM: str = "HS256"

    @property
    def google_oauth_configured(self) -> bool:
        return bool(self.GOOGLE_CLIENT_ID and self.GOOGLE_CLIENT_SECRET)

    @property
    def play_games_configured(self) -> bool:
        return bool(self.PLAY_GAMES_CLIENT_ID and self.PLAY_GAMES_CLIENT_SECRET)

    @property
    def recaptcha_configured(self) -> bool:
        return bool(self.RECAPTCHA_SITE_KEY and self.RECAPTCHA_SECRET)


@lru_cache
def get_settings() -> Settings:
    return Settings()
