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
from app.words.word_service import get_pool
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


# ---- Kelime yönetimi (havuz JSON dosyaları) ----
def _pool_path(length: int, lang: str) -> Path:
    return Path(__file__).resolve().parent.parent.parent / "words" / "data" / f"{lang}_{length}_pool.json"


@router.get("/words")
async def search_words(
    admin: User = Depends(get_admin_user),
    length: int = Query(5, ge=4, le=6),
    q: str = Query(""),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=200),
    filter: str = Query("all"),  # all | member | bot | member_only | bot_only
):
    path = _pool_path(length, cfg.GAME_LANG)
    try:
        items = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"words": [], "total": 0, "page": page, "per_page": per_page, "pages": 0, "counts": {}}

    qn = q.upper().strip()

    def is_member(it): return it.get("member", True)
    def is_bot(it): return it.get("bot", True)

    # Sayaçlar (tüm havuz için).
    counts = {
        "total": len(items),
        "member": sum(1 for it in items if is_member(it)),
        "bot": sum(1 for it in items if is_bot(it)),
        "member_only": sum(1 for it in items if is_member(it) and not is_bot(it)),
        "bot_only": sum(1 for it in items if is_bot(it) and not is_member(it)),
    }

    # Arama + filtre.
    filtered = [it for it in items if not qn or it["word"].startswith(qn)]
    if filter == "member":
        filtered = [it for it in filtered if is_member(it)]
    elif filter == "bot":
        filtered = [it for it in filtered if is_bot(it)]
    elif filter == "member_only":
        filtered = [it for it in filtered if is_member(it) and not is_bot(it)]
    elif filter == "bot_only":
        filtered = [it for it in filtered if is_bot(it) and not is_member(it)]

    total = len(filtered)
    pages = max(1, (total + per_page - 1) // per_page)
    page = min(page, pages)
    start = (page - 1) * per_page
    page_items = filtered[start:start + per_page]

    words = [
        {
            "word": it["word"],
            "difficulty": it.get("difficulty", "orta"),
            "member": is_member(it),
            "bot": is_bot(it),
        }
        for it in page_items
    ]
    return {"words": words, "total": total, "page": page, "per_page": per_page, "pages": pages, "counts": counts}


class WordIn(BaseModel):
    word: str
    length: int = 5
    member: bool = True
    bot: bool = True


@router.post("/words")
async def add_word(data: WordIn, admin: User = Depends(get_admin_user)):
    from app.game.word_engine import normalize, is_valid_word_shape
    w = normalize(data.word)
    if not is_valid_word_shape(w, data.length):
        return {"ok": False, "error": "Geçersiz kelime"}
    path = _pool_path(data.length, cfg.GAME_LANG)
    try:
        items = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        items = []
    if any(it["word"] == w for it in items):
        return {"ok": False, "error": "Kelime zaten var"}
    items.append({"word": w, "difficulty": "orta", "active": True, "member": data.member, "bot": data.bot})
    path.write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")
    get_pool.cache_clear()  # havuz cache'ini yenile
    return {"ok": True, "word": w}


class WordFlagIn(BaseModel):
    word: str
    length: int = 5
    member: bool | None = None
    bot: bool | None = None


@router.post("/words/flags")
async def set_word_flags(data: WordFlagIn, admin: User = Depends(get_admin_user)):
    """Bir kelimenin üye/bot havuzu üyeliğini değiştirir."""
    from app.game.word_engine import normalize
    w = normalize(data.word)
    path = _pool_path(data.length, cfg.GAME_LANG)
    try:
        items = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"ok": False, "error": "Havuz okunamadı"}
    found = False
    for it in items:
        if it["word"] == w:
            if data.member is not None:
                it["member"] = data.member
            if data.bot is not None:
                it["bot"] = data.bot
            found = True
            break
    if not found:
        return {"ok": False, "error": "Kelime bulunamadı"}
    path.write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")
    get_pool.cache_clear()
    return {"ok": True, "word": w}


@router.post("/words/remove")
async def remove_word(data: WordIn, admin: User = Depends(get_admin_user)):
    from app.game.word_engine import normalize
    w = normalize(data.word)
    path = _pool_path(data.length, cfg.GAME_LANG)
    try:
        items = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"ok": False, "error": "Havuz okunamadı"}
    new_items = [it for it in items if it["word"] != w]
    if len(new_items) == len(items):
        return {"ok": False, "error": "Kelime bulunamadı"}
    path.write_text(json.dumps(new_items, ensure_ascii=False), encoding="utf-8")
    get_pool.cache_clear()
    return {"ok": True, "removed": w}
