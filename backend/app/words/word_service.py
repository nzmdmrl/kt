"""
Kelime servisi — havuz artık VERİTABANINDA (JSON yerine).

Oyun kodu senkron çalıştığı için (random_word, is_valid), DB'yi bir kez belleğe
yükleyip senkron cache'ten okuruz. Startup'ta ve admin her değişiklik yaptığında
refresh_pools() ile cache tazelenir.

İlk açılışta words tablosu boşsa, JSON havuzları DB'ye aktarılır (seed_words_from_json).
"""

from __future__ import annotations

import json
import random
from pathlib import Path

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.game.word_engine import normalize

DATA = Path(__file__).resolve().parent / "data"

DEFAULT_SELECTABLE = {"kolay", "orta"}


class WordPool:
    """Belirli bir uzunluk için kelime havuzu (bellekte)."""

    def __init__(self, length: int, items: list[dict]):
        self.length = length
        self._items = items
        self._all_words: set[str] = {it["word"] for it in items if it.get("active", True)}
        self._selectable: list[str] = [
            it["word"] for it in items
            if it.get("active", True) and it.get("member", True)
            and it.get("difficulty") in DEFAULT_SELECTABLE
        ]
        self._bot_words: list[str] = [
            it["word"] for it in items
            if it.get("active", True) and it.get("bot", True)
        ]

    def random_word(self) -> str:
        if not self._selectable:
            if not self._all_words:
                raise RuntimeError(f"{self.length} harfli seçilebilir kelime yok")
            return random.choice(list(self._all_words))
        return random.choice(self._selectable)

    def bot_words(self) -> list[str]:
        return self._bot_words

    def is_valid(self, word: str) -> bool:
        return normalize(word) in self._all_words

    @property
    def size(self) -> int:
        return len(self._all_words)

    @property
    def selectable_size(self) -> int:
        return len(self._selectable)

    def selectable_words(self) -> list[str]:
        return sorted(self._selectable)


# Bellekteki havuz cache'i (length -> WordPool).
_POOLS: dict[int, WordPool] = {}


def get_pool(length: int, lang: str = "tr") -> WordPool:
    """Bellekteki havuzu döner. Yüklenmemişse boş havuz (refresh bekleniyor)."""
    pool = _POOLS.get(length)
    if pool is None:
        pool = WordPool(length, [])
        _POOLS[length] = pool
    return pool


async def refresh_pools(db: AsyncSession) -> None:
    """DB'den tüm kelimeleri okuyup bellek havuzlarını yeniler."""
    from app.models.word import Word
    res = await db.execute(select(Word))
    rows = res.scalars().all()
    by_len: dict[int, list[dict]] = {4: [], 5: [], 6: []}
    for w in rows:
        by_len.setdefault(w.length, []).append({
            "word": w.word, "difficulty": w.difficulty,
            "member": w.member, "bot": w.bot, "active": w.active,
        })
    for length, items in by_len.items():
        _POOLS[length] = WordPool(length, items)


async def seed_words_from_json(db: AsyncSession) -> int:
    """
    words tablosu boşsa JSON havuzlarını DB'ye aktarır. Aktarılan sayıyı döner.
    Zaten doluysa hiçbir şey yapmaz (0 döner).
    """
    from app.models.word import Word
    count = (await db.execute(select(func.count()).select_from(Word))).scalar() or 0
    if count > 0:
        return 0

    added = 0
    for length in (4, 5, 6):
        path = DATA / f"tr_{length}_pool.json"
        if not path.exists():
            continue
        try:
            items = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        for it in items:
            db.add(Word(
                length=length,
                word=it["word"],
                difficulty=it.get("difficulty", "orta"),
                member=it.get("member", True),
                bot=it.get("bot", True),
                active=it.get("active", True),
            ))
            added += 1
    await db.commit()
    return added


def pool_stats() -> dict:
    stats = {}
    for n in (4, 5, 6):
        p = get_pool(n)
        stats[n] = {"total": p.size, "selectable": p.selectable_size}
    return stats
