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

    # --- JWT (Faz 3) ---
    JWT_SECRET: str = os.getenv("JWT_SECRET", "degistir-beni-guclu-bir-secret-ile")
    JWT_ALGORITHM: str = "HS256"

    @property
    def google_oauth_configured(self) -> bool:
        return bool(self.GOOGLE_CLIENT_ID and self.GOOGLE_CLIENT_SECRET)


@lru_cache
def get_settings() -> Settings:
    return Settings()
