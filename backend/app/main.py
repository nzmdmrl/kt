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
from app.core.database import init_models
from app.api.routes import health, words, room, match, auth

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description="Türkçe karşılıklı kelime tahmin oyunu — API",
)

# CORS — frontend ayrı origin'de (www.kelimetahmin.com) çalışır.
# FRONTEND_ORIGIN birden fazla origin içerebilir (virgülle ayrılmış).
# Not: allow_credentials=True ile "*" birlikte KULLANILAMAZ (tarayıcı reddeder);
# o durumda regex ile tüm origin'lere izin verilir.
raw_origins = [o.strip() for o in settings.FRONTEND_ORIGIN.split(",") if o.strip()]
if not raw_origins or "*" in raw_origins:
    # Herhangi bir origin'e credentials ile izin ver (allow_origin_regex ile).
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=raw_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Rotalar — hepsi /api altında toplanır (Coolify'da yönlendirme kolay olsun).
app.include_router(health.router, prefix="/api")
app.include_router(words.router, prefix="/api")
app.include_router(room.router, prefix="/api")
app.include_router(match.router, prefix="/api")  # WebSocket: /api/ws/match/{code}
app.include_router(auth.router, prefix="/api")


@app.on_event("startup")
async def on_startup():
    # Veritabanı tablolarını oluştur (yoksa). Deploy'da ekstra komut gerekmez.
    # DB henüz hazır değilse birkaç kez dener (Coolify'da db servisi geç açılabilir).
    import asyncio
    for attempt in range(10):
        try:
            await init_models()
            break
        except Exception as e:
            if attempt == 9:
                # Son denemede de olmadıysa logla ama uygulamayı düşürme;
                # DB gerektirmeyen uçlar (health, kelime, maç) çalışmaya devam etsin.
                print(f"[startup] DB init başarısız (devam ediliyor): {e}")
            else:
                await asyncio.sleep(3)


@app.get("/")
def root():
    return {"app": settings.APP_NAME, "docs": "/docs", "health": "/api/health"}
