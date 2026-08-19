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
from app.game.bot_names import NAME_POOLS, avatar_url_for, pool_for


async def bot_count(db: AsyncSession, lang: str | None = None) -> int:
    q = select(func.count(Bot.id))
    if lang:
        q = q.where(Bot.lang == lang)
    res = await db.execute(q)
    return res.scalar_one()


async def generate_bots(db: AsyncSession, count: int, lang: str = "tr") -> int:
    """Belirtilen dilde `count` adet bot üretir. Üretilen sayıyı döner."""
    if lang not in NAME_POOLS:
        return 0
    # Botlar TEK ADLA görünür (soyad/baş harf yok) — havuz bu yüzden geniş.
    first_names = pool_for(lang)

    # Var olan isimleri çekip çakışmayı azalt.
    res = await db.execute(select(Bot.name).where(Bot.lang == lang))
    existing = set(res.scalars().all())

    # Havuzu karıştırıp sırayla gezmek, rastgele çekip çakışma beklemekten
    # hem hızlı hem de "havuz bitti" durumunu net gösterir.
    candidates = [n for n in first_names if n not in existing]
    random.shuffle(candidates)

    created = 0
    for name in candidates:
        if created >= count:
            break
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
