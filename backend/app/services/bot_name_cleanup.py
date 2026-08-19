"""
Bot adlarındaki soyisimleri bir kez temizler.

NEDEN: botlar eskiden "Sıla Öztürk" / "Ceren D." gibi ad+soyad üretiliyordu;
gerçek üyeler tek adla göründüğü için botlar listede sırıtıyordu. Yeni üretim
tek ad kullanıyor (app/game/bot_names.py) ama CANLIDAKİ satırlar öyle kalır —
bu servis onları düzeltir.

Neden SQL migration değil: soyadı atınca adlar çakışır (100 bot, 58 farklı ad
değil). Çakışanlara havuzdan BOŞ bir ad verilir; bu, tek SQL cümlesiyle
yapılamaz. Bir kez çalışır: `applied_migrations` tablosuna damga atılır
(migration'larla aynı tablo, aynı mantık).
"""

from __future__ import annotations

import random

from sqlalchemy import select, text

from app.core.database import AsyncSessionLocal
from app.core.migrations import ensure_migrations_table
from app.game.bot_names import avatar_url_for, first_name_of, pool_for
from app.models.bot import Bot

CODE = "2026_08_bot_names_first_only"


async def cleanup_bot_names() -> int:
    """Soyadlı bot adlarını tek ada indirir. Değişen satır sayısını döner."""
    await ensure_migrations_table()
    async with AsyncSessionLocal() as db:
        seen = (await db.execute(
            text("SELECT 1 FROM applied_migrations WHERE code = :c"), {"c": CODE}
        )).first()
        if seen:
            return 0

        bots = (await db.execute(select(Bot).order_by(Bot.id))).scalars().all()
        # Dile göre "bu ad kullanılıyor" kümesi — çakışma buna göre çözülür.
        taken: dict[str, set[str]] = {}
        for b in bots:
            taken.setdefault(b.lang or "tr", set())

        changed = 0
        for b in bots:
            lang = b.lang or "tr"
            first = first_name_of(b.name)
            if not first:
                continue
            used = taken[lang]
            if first in used:
                # Ad zaten alınmış: havuzdan boş bir ad seç.
                free = [n for n in pool_for(lang) if n not in used]
                if not free:
                    used.add(b.name)          # havuz bitti, adı olduğu gibi bırak
                    continue
                first = random.choice(free)
            used.add(first)
            if first != b.name:
                # Avatar tohum olarak adı kullanıyor; adla birlikte tazelenir
                # (admin elle başka bir adres yazmışsa DOKUNULMAZ).
                if not b.avatar_url or "dicebear" in (b.avatar_url or ""):
                    b.avatar_url = avatar_url_for(first)
                b.name = first
                changed += 1

        await db.execute(
            text("INSERT INTO applied_migrations (code) VALUES (:c)"), {"c": CODE}
        )
        await db.commit()
        return changed
