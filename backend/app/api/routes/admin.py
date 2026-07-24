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
from pathlib import Path

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_admin_user
from app.models.user import User
from app.models.bot import Bot
from app.models.daily_score import DailyScore
from app.game import settings_service
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
    return {
        "total_users": total_users,
        "total_matches": int(total_matches),
        "total_bots": total_bots,
        "active_bots": active_bots,
        "top_players": [{"username": u.username, "elo": u.elo, "wins": u.wins} for u in top],
    }


@router.get("/settings")
async def get_settings_list(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    return {"settings": await settings_service.all_settings(db)}


class SettingIn(BaseModel):
    key: str
    value: str


@router.post("/settings")
async def update_setting(data: SettingIn, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
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
    created = await generate_bots(db, min(data.count, 200), data.lang)
    return {"created": created}


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
