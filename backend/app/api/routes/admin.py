"""
Admin uçları — TÜMÜ get_admin_user ile korunur (sadece is_admin=True).

- GET  /admin/dashboard          -> canlı istatistikler
- GET  /admin/settings           -> oyun ayarları listesi
- POST /admin/settings           -> ayar güncelle {key, value}
- GET  /admin/bots               -> bot listesi
- POST /admin/bots/generate      -> yeni bot üret {count, lang}
- POST /admin/bots/{id}/toggle   -> bot aktif/pasif
- GET  /admin/words?length=&q=   -> kelime ara
- POST /admin/words              -> kelime ekle {word, length}
- POST /admin/words/remove       -> kelime çıkar {word, length}
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_admin_user
from app.models.user import User
from app.models.bot import Bot
from app.models.daily_score import DailyScore
from app.game import settings_service
from app.game import presence_service
from app.game.bot_generator import generate_bots
from app.core.config import get_settings

router = APIRouter(prefix="/admin", tags=["admin"])
cfg = get_settings()


@router.get("/dashboard")
async def dashboard(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
    total_matches = (await db.execute(select(func.sum(User.matches_played)))).scalar_one() or 0
    total_bots = (await db.execute(select(func.count(Bot.id)))).scalar_one()
    active_bots = (await db.execute(select(func.count(Bot.id)).where(Bot.active == True))).scalar_one()  # noqa: E712
    # En yüksek ELO'lu 5 oyuncu
    top = (await db.execute(select(User).order_by(User.elo.desc()).limit(5))).scalars().all()

    # Canlı istatistikler
    from datetime import datetime, timezone
    from app.game.presence_service import counts as presence_counts
    from app.game.room import room_manager
    from app.models.match_history import MatchHistory

    pc = presence_counts()
    # Anlık maç: içinde 2 oyuncu olan ve devam eden odalar.
    live_matches = 0
    for r in room_manager.rooms.values():
        try:
            if r.match is not None and len(r.players) >= 2:
                live_matches += 1
        except Exception:
            pass

    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    matches_today = (await db.execute(
        select(func.count(MatchHistory.id)).where(MatchHistory.created_at >= day_start)
    )).scalar_one() or 0
    matches_month = (await db.execute(
        select(func.count(MatchHistory.id)).where(MatchHistory.created_at >= month_start)
    )).scalar_one() or 0

    # Bugünkü arena maçı sayısı: ArenaHistory her oyuncu için 1 kayıt tutar; bir maçtaki
    # oyuncu sayısına bölerek yaklaşık maç sayısı bulunur (sum(1/player_count)).
    from app.models.arena_history import ArenaHistory
    arena_today = (await db.execute(
        select(func.coalesce(func.sum(1.0 / func.nullif(ArenaHistory.player_count, 0)), 0.0))
        .where(ArenaHistory.created_at >= day_start)
    )).scalar_one() or 0

    # --- Ortama göre BUGÜNÜN sayıları.
    # Hesap tek yerde: app/game/platform_stats.py. Aralıklı sürümü ayrı uçta
    # (/admin/platform-stats?range=...); burası geriye dönük uyumluluk için
    # "bugün"ü döndürmeye devam eder.
    from app.game.platform_stats import platform_stats as _pstats
    _today_stats = await _pstats(db, "today")

    return {
        "total_users": total_users,
        "total_matches": int(total_matches),
        "total_bots": total_bots,
        "active_bots": active_bots,
        "top_players": [{"username": u.username, "elo": u.elo, "wins": u.wins} for u in top],
        # Ortam kırılımı — mevcut alanların YANINA eklendi, hiçbiri değişmedi.
        "platforms": {
            "visitors": _today_stats["visitors"],
            "signups": _today_stats["signups"],
            "verifications": _today_stats["verifications"],
        },
        "live": {
            "online": pc["online"],
            "in_match_users": pc["in_match"],
            "live_matches": live_matches,
            "matches_today": int(matches_today),
            "matches_month": int(matches_month),
            "arena_today": round(float(arena_today)),
        },
    }


@router.get("/username-audit")
async def username_audit(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Kural dışı kalmış kullanıcı adları — SADECE LİSTELER, değiştirmez.

    İki grup döner:
      conflicts -> yalnız harf büyüklüğüyle ayrılan hesaplar ("Yasemin"/"yasemin")
      invalid   -> içinde Türkçe harf / büyük harf / alt çizgi olan adlar

    Ne yapılacağına yönetici karar verir; bu uç hiçbir kaydı DEĞİŞTİRMEZ.
    `index_ready` false ise harf duyarsız benzersiz indeks henüz kurulamamıştır
    (çakışmalar çözülünce ilk açılışta kendiliğinden kurulur).
    """
    from app.services.username_audit import audit
    return await audit(db)


@router.get("/platform-stats")
async def get_platform_stats(
    range: str = Query("today", max_length=12),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Ortam kırılımlı sayılar — seçilen aralık için.

    range: today | yesterday | week | month

    YENİ VERİ YAZILMAZ. Ziyaretçi sayısı, `daily_stats` tablosundaki GÜNLÜK
    sayaç satırlarının toplamıdır; yeni üye ve doğrulama `users` tablosundan
    tarih aralığıyla hesaplanır. Ayrıntı: app/game/platform_stats.py.
    """
    from app.game.platform_stats import platform_stats, RANGES, RANGE_LABELS
    data = await platform_stats(db, range)
    data["ranges"] = [{"key": k, "label": RANGE_LABELS[k]} for k in RANGES]
    return data


@router.get("/titles")
async def get_titles(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """XP unvanları — DB'den (admin düzenleyebilir) + XP kazanç ayarları."""
    from app.models.title import Title
    from app.game.xp_service import XP_EVENTS
    from app.game.settings_service import cached_int
    from sqlalchemy import select as _sel
    rows = (await db.execute(_sel(Title).order_by(Title.xp_required))).scalars().all()
    titles = [t.to_public() for t in rows]
    events = []
    for event, (key, default) in XP_EVENTS.items():
        events.append({"event": event, "key": key, "xp": cached_int(key, default)})
    return {"titles": titles, "xp_events": events}


class TitleIn(BaseModel):
    name: str
    icon: str = "🌱"
    xp_required: int = 0


async def _reload_titles_cache(db):
    from app.models.title import Title
    from app.game.xp_service import set_titles_cache
    from sqlalchemy import select as _sel
    rows = (await db.execute(_sel(Title))).scalars().all()
    set_titles_cache([(t.name, t.xp_required, t.icon) for t in rows])


@router.post("/titles")
async def create_title(data: TitleIn, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Yeni unvan ekle."""
    from app.models.title import Title
    t = Title(name=data.name.strip()[:48] or "Unvan", icon=(data.icon or "🌱")[:8], xp_required=max(0, data.xp_required))
    db.add(t)
    await db.commit()
    await _reload_titles_cache(db)
    return {"ok": True, "id": t.id}


@router.put("/titles/{title_id}")
async def update_title(title_id: int, data: TitleIn, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Unvanı düzenle (isim/ikon/XP eşiği)."""
    from app.models.title import Title
    from sqlalchemy import select as _sel
    t = (await db.execute(_sel(Title).where(Title.id == title_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Unvan bulunamadı.")
    t.name = data.name.strip()[:48] or t.name
    t.icon = (data.icon or t.icon)[:8]
    t.xp_required = max(0, data.xp_required)
    await db.commit()
    await _reload_titles_cache(db)
    return {"ok": True}


@router.delete("/titles/{title_id}")
async def delete_title(title_id: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Unvanı sil."""
    from app.models.title import Title
    from sqlalchemy import select as _sel
    t = (await db.execute(_sel(Title).where(Title.id == title_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Unvan bulunamadı.")
    await db.delete(t)
    await db.commit()
    await _reload_titles_cache(db)
    return {"ok": True}


# ---- ROZETLER ----
class BadgeIn(BaseModel):
    code: str = ""
    name: str
    description: str = ""
    icon: str = "🏅"
    tier: str = "bronze"
    stat_key: str = "matches_played"
    threshold: int = 1


async def _reload_badges_cache(db):
    from app.models.badge_def import BadgeDef
    from app.game.badges import set_badges_cache
    from sqlalchemy import select as _sel
    rows = (await db.execute(_sel(BadgeDef))).scalars().all()
    set_badges_cache([(r.code, r.name, r.description, r.icon, r.tier, r.stat_key, r.threshold, r.sort_order) for r in rows])


# İzin verilen istatistik anahtarları (rozet koşulu için)
BADGE_STAT_KEYS = [
    "matches_played", "wins", "losses", "draws", "words_solved", "total_score", "elo",
    "custom_arena_played", "arena_played", "arena_first", "arena_second", "arena_third",
    "trophies", "medals",
]


@router.get("/badges")
async def get_badges(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    from app.models.badge_def import BadgeDef
    from sqlalchemy import select as _sel
    rows = (await db.execute(_sel(BadgeDef).order_by(BadgeDef.sort_order))).scalars().all()
    return {"badges": [b.to_public() for b in rows], "stat_keys": BADGE_STAT_KEYS}


@router.post("/badges")
async def create_badge(data: BadgeIn, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    from app.models.badge_def import BadgeDef
    from sqlalchemy import select as _sel, func as _func
    import re
    code = (data.code or "").strip() or re.sub(r"[^a-z0-9]+", "_", data.name.lower())[:40] or "rozet"
    # kod benzersiz olsun
    exists = (await db.execute(_sel(BadgeDef).where(BadgeDef.code == code))).scalar_one_or_none()
    if exists:
        code = f"{code}_{__import__('uuid').uuid4().hex[:4]}"
    maxo = (await db.execute(_sel(_func.max(BadgeDef.sort_order)))).scalar() or 0
    b = BadgeDef(
        code=code, name=data.name.strip()[:64] or "Rozet", description=data.description[:160],
        icon=(data.icon or "🏅")[:8], tier=data.tier if data.tier in ("bronze", "silver", "gold") else "bronze",
        stat_key=data.stat_key if data.stat_key in BADGE_STAT_KEYS else "matches_played",
        threshold=max(1, data.threshold), sort_order=maxo + 1,
    )
    db.add(b)
    await db.commit()
    await _reload_badges_cache(db)
    return {"ok": True, "id": b.id}


@router.put("/badges/{badge_id}")
async def update_badge(badge_id: int, data: BadgeIn, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    from app.models.badge_def import BadgeDef
    from sqlalchemy import select as _sel
    b = (await db.execute(_sel(BadgeDef).where(BadgeDef.id == badge_id))).scalar_one_or_none()
    if not b:
        raise HTTPException(404, "Rozet bulunamadı.")
    b.name = data.name.strip()[:64] or b.name
    b.description = data.description[:160]
    b.icon = (data.icon or b.icon)[:8]
    if data.tier in ("bronze", "silver", "gold"):
        b.tier = data.tier
    if data.stat_key in BADGE_STAT_KEYS:
        b.stat_key = data.stat_key
    b.threshold = max(1, data.threshold)
    await db.commit()
    await _reload_badges_cache(db)
    return {"ok": True}


@router.delete("/badges/{badge_id}")
async def delete_badge(badge_id: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    from app.models.badge_def import BadgeDef
    from sqlalchemy import select as _sel
    b = (await db.execute(_sel(BadgeDef).where(BadgeDef.id == badge_id))).scalar_one_or_none()
    if not b:
        raise HTTPException(404, "Rozet bulunamadı.")
    await db.delete(b)
    await db.commit()
    await _reload_badges_cache(db)
    return {"ok": True}


@router.get("/settings")
async def get_settings_list(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    return {"settings": await settings_service.all_settings(db)}


class SettingIn(BaseModel):
    key: str
    value: str


# Ad limiti ayarları için üst sınırlar — DB sütunları username(32) / display_name(48).
_NAME_LIMIT_KEYS = {
    "username_min_len": (1, 32),
    "username_max_len": (1, 32),
    "display_name_min_len": (1, 48),
    "display_name_max_len": (1, 48),
}


@router.post("/settings")
async def update_setting(data: SettingIn, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    # Liste adı ayarları
    if data.key == "list_name_source" and data.value not in ("display_name", "username"):
        raise HTTPException(400, "Geçerli değerler: display_name veya username.")
    if data.key == "list_name_max_len":
        try:
            n = int(data.value)
        except (TypeError, ValueError):
            raise HTTPException(400, "Bu ayar sayı olmalı.")
        if n < 0 or n > 48:
            raise HTTPException(400, "Değer 0 ile 48 arasında olmalı (0 = kesme yok).")
        data.value = str(n)

    # Ad limitleri: sayı olmalı, sütun sınırını aşmamalı ve min ≤ max olmalı.
    if data.key in _NAME_LIMIT_KEYS:
        lo, hi = _NAME_LIMIT_KEYS[data.key]
        try:
            val = int(data.value)
        except (TypeError, ValueError):
            raise HTTPException(400, "Bu ayar sayı olmalı.")
        if val < lo or val > hi:
            raise HTTPException(400, f"Değer {lo} ile {hi} arasında olmalı.")
        # Karşı sınırla tutarlılık (min ≤ max). Geçerli değerler name_rules'tan
        # okunur — DB'de kayıt yoksa varsayılanı doğru döner.
        from app.game import name_rules
        lim = await name_rules.limits(db)
        if data.key.endswith("_min_len"):
            other_val = lim[data.key.replace("_min_len", "_max_len")]
            if val > other_val:
                raise HTTPException(400, f"En az değer, en fazla değerden ({other_val}) büyük olamaz.")
        else:
            other_val = lim[data.key.replace("_max_len", "_min_len")]
            if val < other_val:
                raise HTTPException(400, f"En fazla değer, en az değerden ({other_val}) küçük olamaz.")
        data.value = str(val)

    await settings_service.set_setting(db, data.key, data.value)
    return {"ok": True, "key": data.key, "value": data.value}


@router.get("/bots")
async def list_bots(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db), limit: int = 50):
    res = await db.execute(select(Bot).order_by(Bot.elo.desc()).limit(limit))
    bots = res.scalars().all()
    return {"bots": [{"id": b.id, "name": b.name, "elo": b.elo, "active": b.active, "lang": b.lang} for b in bots]}


class GenBotsIn(BaseModel):
    count: int = 10
    lang: str = "tr"


@router.post("/bots/generate")
async def gen_bots(data: GenBotsIn, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    requested = min(data.count, 200)
    created = await generate_bots(db, requested, data.lang)
    # Botlar TEK ADLA üretiliyor (soyad yok) — havuz tükenirse istenen sayı
    # tamamlanamaz. Panel bunu kullanıcıya söyleyebilsin diye kalan da dönülür.
    from app.game.bot_names import pool_for
    used = set((await db.execute(select(Bot.name).where(Bot.lang == data.lang))).scalars().all())
    pool_left = len([n for n in pool_for(data.lang) if n not in used])
    return {"created": created, "requested": requested, "pool_left": pool_left}


@router.post("/bots/{bot_id}/toggle")
async def toggle_bot(bot_id: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Bot).where(Bot.id == bot_id))
    bot = res.scalar_one_or_none()
    if not bot:
        return {"ok": False, "error": "Bot bulunamadı"}
    bot.active = not bot.active
    await db.commit()
    return {"ok": True, "active": bot.active}


# ---- Kelime yönetimi (veritabanı) ----
@router.get("/words")
async def search_words(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
    length: int = Query(5, ge=4, le=6),
    q: str = Query(""),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=200),
    filter: str = Query("all"),
):
    from app.models.word import Word
    qn = q.upper().strip()

    # Sayaçlar (tüm bu uzunluk için).
    all_rows = (await db.execute(select(Word).where(Word.length == length))).scalars().all()
    counts = {
        "total": len(all_rows),
        "member": sum(1 for w in all_rows if w.member),
        "bot": sum(1 for w in all_rows if w.bot),
        "member_only": sum(1 for w in all_rows if w.member and not w.bot),
        "bot_only": sum(1 for w in all_rows if w.bot and not w.member),
    }

    # Filtre + arama (bellekte — havuz birkaç bin kelime).
    rows = all_rows
    if qn:
        rows = [w for w in rows if w.word.startswith(qn)]
    if filter == "member":
        rows = [w for w in rows if w.member]
    elif filter == "bot":
        rows = [w for w in rows if w.bot]
    elif filter == "member_only":
        rows = [w for w in rows if w.member and not w.bot]
    elif filter == "bot_only":
        rows = [w for w in rows if w.bot and not w.member]

    rows.sort(key=lambda w: w.word)
    total = len(rows)
    pages = max(1, (total + per_page - 1) // per_page)
    page = min(page, pages)
    start = (page - 1) * per_page
    page_rows = rows[start:start + per_page]

    words = [{"word": w.word, "difficulty": w.difficulty, "member": w.member, "bot": w.bot} for w in page_rows]
    return {"words": words, "total": total, "page": page, "per_page": per_page, "pages": pages, "counts": counts}


class WordIn(BaseModel):
    word: str
    length: int = 5
    member: bool = True
    bot: bool = True


@router.post("/words")
async def add_word(data: WordIn, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    from app.game.word_engine import normalize, is_valid_word_shape
    from app.models.word import Word
    from app.words.word_service import refresh_pools
    w = normalize(data.word)
    if not is_valid_word_shape(w, data.length):
        return {"ok": False, "error": "Geçersiz kelime"}
    exists = (await db.execute(select(Word).where(Word.length == data.length, Word.word == w))).scalar_one_or_none()
    if exists:
        return {"ok": False, "error": "Kelime zaten var"}
    db.add(Word(length=data.length, word=w, difficulty="orta", member=data.member, bot=data.bot, active=True))
    await db.commit()
    await refresh_pools(db)
    return {"ok": True, "word": w}


class WordFlagIn(BaseModel):
    word: str
    length: int = 5
    member: bool | None = None
    bot: bool | None = None


@router.post("/words/flags")
async def set_word_flags(data: WordFlagIn, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Bir kelimenin üye/bot havuzu üyeliğini değiştirir."""
    from app.game.word_engine import normalize
    from app.models.word import Word
    from app.words.word_service import refresh_pools
    w = normalize(data.word)
    row = (await db.execute(select(Word).where(Word.length == data.length, Word.word == w))).scalar_one_or_none()
    if not row:
        return {"ok": False, "error": "Kelime bulunamadı"}
    if data.member is not None:
        row.member = data.member
    if data.bot is not None:
        row.bot = data.bot
    await db.commit()
    await refresh_pools(db)
    return {"ok": True, "word": w}


@router.post("/words/remove")
async def remove_word(data: WordIn, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    from app.game.word_engine import normalize
    from app.models.word import Word
    from app.words.word_service import refresh_pools
    w = normalize(data.word)
    row = (await db.execute(select(Word).where(Word.length == data.length, Word.word == w))).scalar_one_or_none()
    if not row:
        return {"ok": False, "error": "Kelime bulunamadı"}
    await db.delete(row)
    await db.commit()
    await refresh_pools(db)
    return {"ok": True, "removed": w}




# ---------------------------------------------------------------- 👥 Üyeler
#
# Yazma işlemleri: reklamsız (ad_free) anahtarı, hesap durumu (pasif/gölge ban)
# ve üye profili (görünen ad, kullanıcı adı, e-posta, şifre).
# Bilerek YOK: satır silme — kullanıcı satırı silinirse rakiplerin maç geçmişi
# ve lig kayıtları da bozulur (kullanıcının kendi silme hakkı anonimleştirir).
#
# GÜVENLİK: yanıt alanları AÇIKÇA seçilir (model nesnesi hiç serileştirilmez).
# password_hash, google_sub ve oturum/token bilgisi HİÇBİR koşulda dönmez.

# Sayfa başına satır — panelde 20 / 50 / 100 seçilebilir.
USER_PAGE_SIZE_DEFAULT = 20
USER_PAGE_SIZE_MAX = 100

# ad_free_source: manual | play | apple | web (bugün yalnız "manual" üretiliyor —
# mağaza/site satışı eklendiğinde diğerleri oradan yazılacak).
AD_FREE_SOURCE_MANUAL = "manual"


def _admin_user_row(u: User) -> dict:
    """Panelde gösterilen alanlar — beyaz liste."""
    return {
        "id": u.id,
        "username": u.username,
        "display_name": u.display_name,
        "email": u.email,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        # DB'de last_seen SÜTUNU YOK; canlı durum bellekteki presence servisinden
        # gelir (sunucu yeniden başlayınca sıfırlanır): online | in_match | offline
        "presence": presence_service.get_status(u.id),
        "is_admin": bool(u.is_admin),
        "ad_free": bool(u.ad_free),
        "ad_free_since": u.ad_free_since.isoformat() if u.ad_free_since else None,
        "ad_free_source": u.ad_free_source,
        # Hesap durumu — listede rozetle gösterilir, süzgeçte kullanılır.
        "disabled": bool(getattr(u, "disabled", False)),
        "disabled_reason": getattr(u, "disabled_reason", None),
        "shadow_banned": bool(getattr(u, "shadow_banned", False)),
        "deleted": bool(getattr(u, "deleted", False)),
        "verified": bool(getattr(u, "verified", False)),
        # Cihaz simgesi: app | mobile | desktop (bilinmiyorsa None).
        "platform": getattr(u, "last_platform", None) or getattr(u, "signup_platform", None),
    }


@router.get("/users")
async def list_users(
    q: str = Query("", max_length=64),
    status: str = Query("", max_length=16),
    limit: int = Query(USER_PAGE_SIZE_DEFAULT, ge=1, le=USER_PAGE_SIZE_MAX),
    offset: int = Query(0, ge=0),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Üyeleri sayfalayarak listeler; q verilirse arama yapar.

    q BOŞSA tüm üyeler listelenir (sayfalanmış). Burası ADMİN ucudur — herkese
    açık /profile/search'teki "en az 2 harf" kuralı buraya uygulanmaz.

    Dönenler:
      total_users -> kayıtlı toplam üye (arama fark etmez, sekme başlığı için)
      matched     -> bu sorguya uyan satır sayısı (sayfa sayısı bundan çıkar)
    """
    term = (q or "").strip()
    total = (await db.execute(select(func.count(User.id)))).scalar_one()

    stmt = select(User)
    count_stmt = select(func.count(User.id))
    filtered = False
    if term:
        like = f"%{term.lower()}%"
        cond = (
            func.lower(User.username).like(like)
            | func.lower(func.coalesce(User.email, "")).like(like)
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
        filtered = True

    # Durum süzgeci: active | disabled | banned | deleted (varsayılan: hepsi).
    status_conds = {
        "active": (User.disabled.isnot(True), User.deleted.isnot(True),
                   User.shadow_banned.isnot(True)),
        "disabled": (User.disabled.is_(True), User.deleted.isnot(True)),
        "banned": (User.shadow_banned.is_(True),),
        "deleted": (User.deleted.is_(True),),
    }
    if status in status_conds:
        for c in status_conds[status]:
            stmt = stmt.where(c)
            count_stmt = count_stmt.where(c)
        filtered = True

    matched = (await db.execute(count_stmt)).scalar_one() if filtered else total

    # Sekmedeki süzgeç düğmelerinin yanındaki sayılar.
    async def _count(*conds):
        qq = select(func.count(User.id))
        for c in conds:
            qq = qq.where(c)
        return int((await db.execute(qq)).scalar_one() or 0)

    counts = {
        "all": total,
        "active": await _count(User.disabled.isnot(True), User.deleted.isnot(True),
                               User.shadow_banned.isnot(True)),
        "disabled": await _count(User.disabled.is_(True), User.deleted.isnot(True)),
        "banned": await _count(User.shadow_banned.is_(True)),
        "deleted": await _count(User.deleted.is_(True)),
    }

    rows = (
        await db.execute(stmt.order_by(User.id.desc()).limit(limit).offset(offset))
    ).scalars().all()

    return {
        "users": [_admin_user_row(u) for u in rows],
        "total_users": total,
        "matched": matched,
        "counts": counts,
        "status": status,
        "query": term,
        "limit": limit,
        "offset": offset,
    }


class UserStatusIn(BaseModel):
    """Admin üye durumu. Verilmeyen alana DOKUNULMAZ."""
    # Pasife alma: kullanıcı giriş yapamaz, nedenini görür. GERİ ALINABİLİR.
    # Maç geçmişi, sıralamalar ve arkadaşlıklar OLDUĞU GİBİ kalır.
    disabled: bool | None = None
    # Gölge ban: kullanıcı hiçbir şey fark etmez, ama listelerde görünmez ve
    # gerçek oyuncularla eşleşmez (yalnız botla oynar).
    shadow_banned: bool | None = None
    reason: str = ""


@router.put("/users/{user_id}/status")
async def set_user_status(
    user_id: int,
    data: UserStatusIn,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Üyeyi pasife alır / geri alır / gölge banlar. SİLMEZ.

    Gerçek silme YOKTUR: kullanıcı satırı silinirse rakiplerin maç geçmişi,
    lig kayıtları ve arkadaşlıkları da bozulur. Kullanıcının kendi silme hakkı
    ayrıdır ve o da anonimleştirir (app/services/account_delete.py).
    """
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    if user.is_admin:
        raise HTTPException(status_code=400, detail="Yönetici hesabına bu işlem uygulanamaz.")
    if user.deleted:
        raise HTTPException(status_code=400, detail="Silinmiş hesap üzerinde işlem yapılamaz.")

    if data.disabled is not None:
        user.disabled = bool(data.disabled)
        if data.disabled:
            user.disabled_reason = (data.reason or "Yönetici kararı")[:160]
            user.disabled_at = datetime.now(timezone.utc)
        else:
            user.disabled_reason = None
            user.disabled_at = None
    if data.shadow_banned is not None:
        user.shadow_banned = bool(data.shadow_banned)

    await db.commit()
    return {"ok": True, "user": _admin_user_row(user)}


class UserProfileIn(BaseModel):
    """Admin üye düzenleme. VERİLMEYEN (None) alana dokunulmaz.

    email: "" gönderilirse e-posta SİLİNİR (hesap doğrulanmamışa döner).
    password: "" gönderilirse şifre değiştirilmez (boş şifre kaydedilmez).
    """
    display_name: str | None = None
    username: str | None = None
    email: str | None = None
    password: str | None = None


@router.put("/users/{user_id}/profile")
async def edit_user_profile(
    user_id: int,
    data: UserProfileIn,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Üyenin görünen adını, kullanıcı adını, e-postasını ve şifresini belirler.

    Kurallar kullanıcının kendi düzenleme uçlarıyla AYNI (app/game/name_rules.py):
    kullanıcı adı a-z0-9'a çevrilir, benzersizlik harf duyarsızdır. İki fark:
      - REZERVE adlar admin için serbesttir (destek/sistem hesabı açmak için),
      - kullanıcı adı kotası (30 günde 2) YAKILMAZ — kota kullanıcının kendi
        hakkıdır, yönetici düzeltmesi onu tüketmemeli.
    Ad değişikliği moderasyona DÜŞMEZ: adı yönetici koydu, onaylı sayılır.
    """
    from app.core.auth_service import EMAIL_RE, get_user_by_email, get_user_by_username
    from app.core.security import hash_password
    from app.game import name_rules

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    if user.deleted:
        raise HTTPException(status_code=400, detail="Silinmiş hesap düzenlenemez.")

    changed: list[str] = []

    if data.display_name is not None:
        try:
            name = await name_rules.clean_display_name(db, data.display_name)
        except name_rules.NameError_ as e:
            raise HTTPException(400, str(e))
        if name != user.display_name:
            user.display_name = name
            user.name_status = "approved"
            changed.append("görünen ad")

    if data.username is not None:
        typed = (data.username or "").strip()
        uname = name_rules.slugify_username(typed)
        lim = await name_rules.limits(db)
        lo, hi = lim["username_min_len"], lim["username_max_len"]
        if not uname:
            raise HTTPException(400, "Kullanıcı adı en az bir harf ya da rakam içermeli.")
        if len(uname) < lo:
            raise HTTPException(400, f"Kullanıcı adı en az {lo} karakter olmalı (“{typed}” → “{uname}”).")
        if len(uname) > hi:
            raise HTTPException(400, f"Kullanıcı adı en fazla {hi} karakter olabilir.")
        if uname != user.username:
            other = await get_user_by_username(db, uname)
            if other and other.id != user.id:
                raise HTTPException(409, "Bu kullanıcı adı başka bir hesapta.")
            old = user.username
            user.username = uname
            user.name_status = "approved"
            # Maç geçmişi username tutuyor; eski ad kalırsa geçmiş maçlar
            # profilden ve karşılıklı skordan düşerdi.
            from app.models.match_history import MatchHistory
            from sqlalchemy import update as sa_update
            await db.execute(sa_update(MatchHistory).where(MatchHistory.p1_username == old).values(p1_username=uname))
            await db.execute(sa_update(MatchHistory).where(MatchHistory.p2_username == old).values(p2_username=uname))
            changed.append("kullanıcı adı")

    if data.email is not None:
        email = (data.email or "").strip().lower()
        if email:
            if not EMAIL_RE.match(email):
                raise HTTPException(400, "Geçerli bir e-posta gir.")
            other = await get_user_by_email(db, email)
            if other and other.id != user.id:
                raise HTTPException(409, "Bu e-posta başka bir hesapta kayıtlı.")
            if email != (user.email or ""):
                user.email = email
                changed.append("e-posta")
        elif user.email:
            # E-postayı SİLMEK hesabın kurtarma yolunu kaldırır: doğrulanmış
            # sayılamaz. Şifre de anlamsız kalacağı için birlikte temizlenir.
            user.email = None
            user.password_hash = None
            user.verified = False
            changed.append("e-posta silindi")

    if data.password:
        if len(data.password) < 6:
            raise HTTPException(400, "Şifre en az 6 karakter olmalı.")
        user.password_hash = hash_password(data.password)
        changed.append("şifre")

    # E-posta + şifre = kurtarma yolu var demektir; hesap doğrulanmış sayılır.
    if user.email and user.password_hash and not user.verified:
        user.verified = True
        user.verified_at = datetime.now(timezone.utc)
        changed.append("doğrulandı")

    if not changed:
        return {"ok": True, "changed": [], "user": _admin_user_row(user)}

    await db.commit()
    await db.refresh(user)
    return {"ok": True, "changed": changed, "user": _admin_user_row(user)}


class AdFreeIn(BaseModel):
    enabled: bool


@router.put("/users/{user_id}/ad-free")
async def set_ad_free(
    user_id: int,
    data: AdFreeIn,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Reklamsız hakkını açar/kapatır (kaynak: manual)."""
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

    user.ad_free = bool(data.enabled)
    if data.enabled:
        user.ad_free_since = datetime.now(timezone.utc)
        user.ad_free_source = AD_FREE_SOURCE_MANUAL
    else:
        # Kapatınca geçmiş SİLİNMEZ: ne zaman ve nereden verildiği kayıtlı kalsın.
        pass
    await db.commit()
    return {"ok": True, "user": _admin_user_row(user)}
