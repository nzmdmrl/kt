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

    # --- reCAPTCHA v2 ("Ben robot değilim") — e-posta ile kayıtta bot koruması ---
    # İkisi de doluysa devreye girer; boşsa kayıt eskisi gibi captcha'sız çalışır.
    RECAPTCHA_SITE_KEY: str = os.getenv("RECAPTCHA_SITE_KEY", "")
    RECAPTCHA_SECRET: str = os.getenv("RECAPTCHA_SECRET", "")

    # --- E-posta (iletişim formu) ---
    # SMTP bilgileri Coolify'dan girilir. BOŞSA form yine çalışır: mesaj
    # veritabanına yazılır ve admin panelinden (📬 İletişim) okunur; sadece
    # e-posta gönderilmez.
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587") or 587)
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_TLS: bool = (os.getenv("SMTP_TLS", "true").lower() != "false")
    # Gönderen adresi (boşsa SMTP_USER kullanılır).
    SMTP_FROM: str = os.getenv("SMTP_FROM", "")
    # İletişim formunun ULAŞACAĞI adres.
    CONTACT_EMAIL: str = os.getenv("CONTACT_EMAIL", "destek@kelimetahmin.com")

    @property
    def smtp_configured(self) -> bool:
        return bool(self.SMTP_HOST and (self.SMTP_FROM or self.SMTP_USER))

    # --- JWT (Faz 3) ---
    JWT_SECRET: str = os.getenv("JWT_SECRET", "degistir-beni-guclu-bir-secret-ile")
    JWT_ALGORITHM: str = "HS256"

    @property
    def google_oauth_configured(self) -> bool:
        return bool(self.GOOGLE_CLIENT_ID and self.GOOGLE_CLIENT_SECRET)

    @property
    def recaptcha_configured(self) -> bool:
        return bool(self.RECAPTCHA_SITE_KEY and self.RECAPTCHA_SECRET)


@lru_cache
def get_settings() -> Settings:
    return Settings()
