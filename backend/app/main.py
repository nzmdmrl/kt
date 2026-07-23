"""
Kelime Tahmin — Backend giriş noktası (FastAPI).

Faz 1: health + kelime uçları + kelime motoru.
Sonraki fazlar bu uygulamaya WebSocket maç, auth, matchmaking, lig,
admin panel vb. ekleyecek.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.api.routes import health, words

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description="Türkçe karşılıklı kelime tahmin oyunu — API",
)

# CORS — frontend ayrı origin'de çalışır.
origins = ["*"] if settings.FRONTEND_ORIGIN == "*" else [settings.FRONTEND_ORIGIN]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rotalar — hepsi /api altında toplanır (Coolify'da yönlendirme kolay olsun).
app.include_router(health.router, prefix="/api")
app.include_router(words.router, prefix="/api")


@app.get("/")
def root():
    return {"app": settings.APP_NAME, "docs": "/docs", "health": "/api/health"}
