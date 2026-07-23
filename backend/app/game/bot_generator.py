"""
Bot üretici.

Dile bağlı isimlerle, ELO dağılımı olan botlar üretir. Startup'ta hiç bot
yoksa 100 Türkçe bot seed edilir. Admin panel (Faz 10) bunu dil/adet seçerek
çağıracak.
"""

from __future__ import annotations

import random

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bot import Bot
from app.game.bot_names import NAME_POOLS, avatar_url_for


async def bot_count(db: AsyncSession, lang: str | None = None) -> int:
    q = select(func.count(Bot.id))
    if lang:
        q = q.where(Bot.lang == lang)
    res = await db.execute(q)
    return res.scalar_one()


async def generate_bots(db: AsyncSession, count: int, lang: str = "tr") -> int:
    """Belirtilen dilde `count` adet bot üretir. Üretilen sayıyı döner."""
    pool = NAME_POOLS.get(lang)
    if not pool:
        return 0
    first_names, last_parts = pool

    # Var olan isimleri çekip çakışmayı azalt.
    res = await db.execute(select(Bot.name).where(Bot.lang == lang))
    existing = set(res.scalars().all())

    created = 0
    attempts = 0
    while created < count and attempts < count * 5:
        attempts += 1
        name = f"{random.choice(first_names)} {random.choice(last_parts)}"
        if name in existing:
            continue
        existing.add(name)
        # ELO dağılımı: çoğu orta seviyede, az sayıda uç.
        elo = int(random.gauss(1050, 250))
        elo = max(600, min(1900, elo))
        bot = Bot(
            name=name,
            lang=lang,
            elo=elo,
            avatar_url=avatar_url_for(name),
            active=True,
        )
        db.add(bot)
        created += 1

    if created:
        await db.commit()
    return created


async def seed_bots_if_empty(db: AsyncSession, lang: str = "tr", count: int = 100) -> int:
    """Hiç bot yoksa seed eder. Startup'ta çağrılır."""
    existing = await bot_count(db, lang)
    if existing > 0:
        return 0
    return await generate_bots(db, count, lang)
