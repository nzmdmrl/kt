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
from app.api.routes import health, words, room, match, auth, matchmaking, league, profile, daily, admin, sounds, notifications, home, account, presence, challenge, solo, arena, friends, music, seo, app_settings, notification_prefs, announcements, devices, pages, share_texts, home_buttons, moderation, support

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
app.include_router(share_texts.router, prefix="/api")
app.include_router(home_buttons.router, prefix="/api")
app.include_router(moderation.router, prefix="/api")
app.include_router(account.router, prefix="/api")
app.include_router(presence.router, prefix="/api")
app.include_router(challenge.router, prefix="/api")
app.include_router(solo.router, prefix="/api")
app.include_router(arena.router, prefix="/api")  # WebSocket: /api/ws/arena
app.include_router(friends.router, prefix="/api")
app.include_router(music.router, prefix="/api")
app.include_router(seo.router, prefix="/api")  # sayfa SEO (baslik/aciklama/og gorsel)
app.include_router(app_settings.router, prefix="/api")  # mobil & reklam ayarlari (app_settings)
app.include_router(notification_prefs.router, prefix="/api")  # bildirim turu katalogu + push tercihleri
app.include_router(announcements.router, prefix="/api")  # duyurular (public liste + admin CRUD/bildirim)
app.include_router(devices.router, prefix="/api")  # push cihaz kayitlari + admin test gonderimi
app.include_router(pages.router, prefix="/api")  # duzenlenebilir sayfa icerikleri (Hakkimizda, Nasil Oynanir)
app.include_router(support.router, prefix="/api")  # destek biletleri (iletisim formu -> bilet)


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
                await conn.execute(_text("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type_code VARCHAR(48) DEFAULT ''"))
                print("[startup] notifications.link + type_code garantilendi.")
            except Exception as _e:
                # SQLite gibi IF NOT EXISTS desteklemeyen dialektler için sessiz geç.
                print(f"[startup] link ALTER atlandı: {_e}")
    except Exception as e:
        print(f"[startup] link garantileme hatası: {e}")

    # app_settings tablosunu (mobil & reklam ayarları) düz SQL ile garantile + seed et.
    # ORM modeli yok; CREATE TABLE IF NOT EXISTS + eksik anahtar ekleme (idempotent).
    try:
        from app.api.routes.app_settings import ensure_app_settings_table
        added = await ensure_app_settings_table()
        print(f"[startup] app_settings garantilendi ({added} yeni anahtar).")
    except Exception as e:
        print(f"[startup] app_settings garantileme hatası: {e}")

    # Bildirim türü kataloğu + push tercih tabloları (düz SQL, ORM modeli yok).
    # Seed idempotent: ON CONFLICT DO NOTHING.
    try:
        from app.api.routes.notification_prefs import ensure_notification_tables
        added = await ensure_notification_tables()
        print(f"[startup] bildirim türü kataloğu garantilendi ({added} yeni satır).")
    except Exception as e:
        print(f"[startup] bildirim kataloğu garantileme hatası: {e}")

    # Duyurular tablosu (düz SQL, ORM modeli yok).
    try:
        from app.api.routes.announcements import ensure_announcements_table
        await ensure_announcements_table()
        print("[startup] duyurular tablosu garantilendi.")
    except Exception as e:
        print(f"[startup] duyurular tablosu garantileme hatası: {e}")

    # Push cihaz tabloları (device_tokens + push_log).
    try:
        from app.api.routes.devices import ensure_push_tables
        await ensure_push_tables()
        print("[startup] push cihaz tabloları garantilendi.")
    except Exception as e:
        print(f"[startup] push tabloları garantileme hatası: {e}")

    # Maç teklifi tablosu (challenges) — düz SQL, ORM modeli yok.
    try:
        from app.game.challenge_service import ensure_challenge_table
        await ensure_challenge_table()
        print("[startup] maç teklifi tablosu garantilendi.")
    except Exception as e:
        print(f"[startup] maç teklifi tablosu garantileme hatası: {e}")

    # Bir kez çalışan veri düzeltmeleri (katalog UPDATE'leri + geriye dönük
    # doldurmalar). Tablolar/sütunlar hazır olduktan SONRA çalışmalı.
    try:
        from app.core.migrations import apply_data_migrations
        n = await apply_data_migrations()
        print(f"[startup] veri migration'ları kontrol edildi ({n} yeni uygulandı).")
    except Exception as e:
        print(f"[startup] veri migration hatası: {e}")

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

    # Düzenlenebilir sayfa içeriklerini seed et (yoksa) — Hakkımızda, Nasıl Oynanır.
    # Var olan kayda DOKUNULMAZ; admin panelinden yapılan düzenleme korunur.
    try:
        from app.core.database import AsyncSessionLocal
        from app.models.site_page import SitePage, DEFAULT_PAGES
        from sqlalchemy import select as _sel
        async with AsyncSessionLocal() as db:
            rows = {r.key: r for r in (await db.execute(_sel(SitePage))).scalars().all()}
            added = synced = 0
            for p in DEFAULT_PAGES:
                row = rows.get(p["key"])
                if row is None:
                    db.add(SitePage(key=p["key"], title=p["title"], body=p["body"]))
                    added += 1
                elif not row.is_edited and (row.body != p["body"] or row.title != p["title"]):
                    # Admin hiç dokunmadıysa koddaki güncel metni taşı.
                    row.title, row.body = p["title"], p["body"]
                    synced += 1
            if added or synced:
                await db.commit()
                print(f"[startup] sayfa içeriği: {added} yeni, {synced} güncellendi.")
    except Exception as e:
        print(f"[startup] Sayfa içeriği seed hatası: {e}")

    # Sonuç paylaşım metinlerini seed et — sadece BOŞ olan gruplara ekler,
    # admin sildiyse/düzenlediyse dokunmaz.
    try:
        from app.core.database import AsyncSessionLocal
        from app.models.share_line import ShareLine, DEFAULT_SHARE_LINES
        from sqlalchemy import select as _sel
        async with AsyncSessionLocal() as db:
            existing = {(r.module, r.variant) for r in (await db.execute(_sel(ShareLine))).scalars().all()}
            added = 0
            for (module, variant), texts in DEFAULT_SHARE_LINES.items():
                if (module, variant) in existing:
                    continue
                for i, t in enumerate(texts):
                    db.add(ShareLine(module=module, variant=variant, text=t, sort_order=i, active=True))
                    added += 1
            if added:
                await db.commit()
                print(f"[startup] {added} paylaşım metni seed edildi.")
    except Exception as e:
        print(f"[startup] Paylaşım metni seed hatası: {e}")

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
    # Eski bildirimleri temizleyen döngü (varsayılan: 30 günden eskiler).
    try:
        import asyncio as _asyncio
        from app.services.notification_cleanup import notification_cleanup_loop
        _asyncio.create_task(notification_cleanup_loop())
    except Exception as e:
        print(f"[startup] Bildirim temizlik görevi atlandı: {e}")
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
