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
from app.api.routes import health, words, room, match, auth, matchmaking, league, profile, daily, admin, sounds, notifications, home, account, presence, challenge, solo, arena, friends, music

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
app.include_router(matchmaking.router, prefix="/api")
app.include_router(league.router, prefix="/api")
app.include_router(profile.router, prefix="/api")
app.include_router(daily.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(sounds.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(home.router, prefix="/api")
app.include_router(account.router, prefix="/api")
app.include_router(presence.router, prefix="/api")
app.include_router(challenge.router, prefix="/api")
app.include_router(solo.router, prefix="/api")
app.include_router(arena.router, prefix="/api")  # WebSocket: /api/ws/arena
app.include_router(friends.router, prefix="/api")
app.include_router(music.router, prefix="/api")


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
                print(f"[startup] DB init başarısız (devam ediliyor): {e}")
            else:
                await asyncio.sleep(3)
    # notifications.link sütununu garantile (davet bildirimleri için kritik).
    try:
        from app.core.database import engine
        from sqlalchemy import text as _text
        async with engine.begin() as conn:
            try:
                await conn.execute(_text("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link VARCHAR(128) DEFAULT ''"))
                print("[startup] notifications.link garantilendi.")
            except Exception as _e:
                # SQLite gibi IF NOT EXISTS desteklemeyen dialektler için sessiz geç.
                print(f"[startup] link ALTER atlandı: {_e}")
    except Exception as e:
        print(f"[startup] link garantileme hatası: {e}")

    # Unvanları seed et (yoksa) ve cache'e yükle.
    try:
        from app.core.database import AsyncSessionLocal as _ASL
        from app.models.title import Title, DEFAULT_TITLES
        from app.game.xp_service import set_titles_cache
        from sqlalchemy import select as _sel
        async with _ASL() as db:
            rows = (await db.execute(_sel(Title))).scalars().all()
            if not rows:
                for (name, icon, xp) in DEFAULT_TITLES:
                    db.add(Title(name=name, icon=icon, xp_required=xp))
                await db.commit()
                rows = (await db.execute(_sel(Title))).scalars().all()
                print(f"[startup] {len(rows)} unvan seed edildi.")
            set_titles_cache([(t.name, t.xp_required, t.icon) for t in rows])
    except Exception as e:
        print(f"[startup] Unvan seed/cache hatası: {e}")

    # Rozetleri seed et (yoksa) ve cache'e yükle.
    try:
        from app.core.database import AsyncSessionLocal as _ASL2
        from app.models.badge_def import BadgeDef, DEFAULT_BADGES
        from app.game.badges import set_badges_cache
        from sqlalchemy import select as _sel2
        async with _ASL2() as db:
            rows = (await db.execute(_sel2(BadgeDef))).scalars().all()
            if not rows:
                for idx, (code, name, desc, icon, tier, sk, th) in enumerate(DEFAULT_BADGES):
                    db.add(BadgeDef(code=code, name=name, description=desc, icon=icon,
                                    tier=tier, stat_key=sk, threshold=th, sort_order=idx))
                await db.commit()
                rows = (await db.execute(_sel2(BadgeDef))).scalars().all()
                print(f"[startup] {len(rows)} rozet seed edildi.")
            else:
                # Yeni eklenen varsayılan rozetleri (kodda olup DB'de olmayan) ekle.
                existing = {r.code for r in rows}
                added = 0
                for idx, (code, name, desc, icon, tier, sk, th) in enumerate(DEFAULT_BADGES):
                    if code not in existing:
                        db.add(BadgeDef(code=code, name=name, description=desc, icon=icon,
                                        tier=tier, stat_key=sk, threshold=th, sort_order=idx))
                        added += 1
                if added:
                    await db.commit()
                    rows = (await db.execute(_sel2(BadgeDef))).scalars().all()
                    print(f"[startup] {added} yeni rozet eklendi.")
            set_badges_cache([(r.code, r.name, r.description, r.icon, r.tier, r.stat_key, r.threshold, r.sort_order) for r in rows])
    except Exception as e:
        print(f"[startup] Rozet seed/cache hatası: {e}")

    # İlk kez ise botları seed et (100 Türkçe bot).
    try:
        from app.core.database import AsyncSessionLocal
        from app.game.bot_generator import seed_bots_if_empty
        async with AsyncSessionLocal() as db:
            created = await seed_bots_if_empty(db, lang=settings.GAME_LANG, count=100)
            if created:
                print(f"[startup] {created} bot seed edildi.")
    except Exception as e:
        print(f"[startup] Bot seed atlandı: {e}")
    # Kelime havuzunu DB'ye seed et (ilk kez) ve bellek havuzlarını yükle.
    try:
        from app.core.database import AsyncSessionLocal
        from app.words.word_service import seed_words_from_json, refresh_pools, resync_flags_from_json
        async with AsyncSessionLocal() as db:
            added = await seed_words_from_json(db)
            if added:
                print(f"[startup] {added} kelime DB'ye seed edildi.")
            # Frekans temizliği: member/bot/difficulty bayraklarını bir kez uygula.
            # GameSetting damgası ile sadece bir defa çalışır (sonra admin değişikliklerini ezmez).
            try:
                from app.models.game_setting import GameSetting
                from sqlalchemy import select as _sel
                # v2: member eşiği 2000'e düştü + bot tüm kelimeler. Damga değişti -> tekrar çalışır.
                stamp = (await db.execute(_sel(GameSetting).where(GameSetting.key == "freq_resync_v4"))).scalar_one_or_none()
                if stamp is None:
                    updated = await resync_flags_from_json(db)
                    db.add(GameSetting(key="freq_resync_v4", value="done"))
                    await db.commit()
                    print(f"[startup] Frekans resync v4: {updated} kelime bayrağı güncellendi.")
            except Exception as e:
                print(f"[startup] Frekans resync atlandı: {e}")
            await refresh_pools(db)
    except Exception as e:
        print(f"[startup] Kelime havuzu yüklenemedi: {e}")
    # Lig ödül scheduler'ını başlat (kapanmış dönemleri kontrol eder).
    try:
        import asyncio as _asyncio
        from app.game.league_scheduler import league_scheduler_loop
        _asyncio.create_task(league_scheduler_loop())
    except Exception as e:
        print(f"[startup] Lig scheduler atlandı: {e}")
    # Oyun ayarlarını cache'e yükle (admin panelden değişebilir).
    try:
        from app.core.database import AsyncSessionLocal
        from app.game import settings_service
        async with AsyncSessionLocal() as db:
            await settings_service.load_settings(db)
    except Exception as e:
        print(f"[startup] Ayarlar yüklenemedi (varsayılanlar kullanılacak): {e}")
    # ADMIN_EMAIL env'i tanımlıysa o kullanıcıyı admin yap (ilk admin ataması).
    import os as _os
    admin_email = _os.getenv("ADMIN_EMAIL", "").strip().lower()
    if admin_email:
        try:
            from app.core.database import AsyncSessionLocal
            from sqlalchemy import select as _select
            from app.models.user import User as _User
            async with AsyncSessionLocal() as db:
                res = await db.execute(_select(_User).where(_User.email == admin_email))
                u = res.scalar_one_or_none()
                if u and not u.is_admin:
                    u.is_admin = True
                    await db.commit()
                    print(f"[startup] {admin_email} admin yapıldı.")
        except Exception as e:
            print(f"[startup] Admin ataması atlandı: {e}")


@app.get("/")
def root():
    return {"app": settings.APP_NAME, "docs": "/docs", "health": "/api/health"}
