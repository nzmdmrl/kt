"""
Kelime servisi — havuzu belleğe yükler, rastgele kelime seçer, üyelik kontrolü yapar.

Faz 1'de havuz JSON dosyalarından okunur. İleride (admin panel fazı) havuz
veritabanına taşınacak; bu servis arayüzü aynı kalacak şekilde tasarlandı.
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from functools import lru_cache

from app.game.word_engine import normalize

DATA = Path(__file__).resolve().parent / "data"

# Oyunun varsayılan olarak seçeceği zorluklar (zor havuzda kalır ama seçilmez).
DEFAULT_SELECTABLE = {"kolay", "orta"}


class WordPool:
    """Belirli bir uzunluk için kelime havuzu."""

    def __init__(self, length: int, items: list[dict]):
        self.length = length
        self._items = items
        # Hızlı üyelik kontrolü için tüm geçerli kelimeler (zorluk fark etmez).
        self._all_words: set[str] = {it["word"] for it in items if it.get("active", True)}
        # Seçilebilir (rastgele hedef olabilecek) kelimeler.
        self._selectable: list[str] = [
            it["word"]
            for it in items
            if it.get("active", True) and it.get("difficulty") in DEFAULT_SELECTABLE
        ]

    def random_word(self) -> str:
        """Rastgele bir hedef kelime seçer (kolay/orta havuzdan)."""
        if not self._selectable:
            # Güvenlik: seçilebilir yoksa tüm aktiflerden seç.
            return random.choice(list(self._all_words))
        return random.choice(self._selectable)

    def is_valid(self, word: str) -> bool:
        """Kelime havuzda geçerli bir kelime mi? (tahmin kabul kontrolü)"""
        return normalize(word) in self._all_words

    @property
    def size(self) -> int:
        return len(self._all_words)

    @property
    def selectable_size(self) -> int:
        return len(self._selectable)


@lru_cache(maxsize=None)
def get_pool(length: int, lang: str = "tr") -> WordPool:
    """
    Belirtilen uzunluk ve dil için havuzu döner (önbelleğe alınır).
    Faz 1'de yalnızca 'tr' desteklenir; dil parametresi ileriye dönük.
    """
    path = DATA / f"{lang}_{length}_pool.json"
    if not path.exists():
        raise FileNotFoundError(f"Kelime havuzu bulunamadi: {path.name}")
    items = json.loads(path.read_text(encoding="utf-8"))
    return WordPool(length, items)


def pool_stats() -> dict:
    """Tüm havuzların özet istatistiği (admin/health için)."""
    stats = {}
    for n in (4, 5, 6):
        try:
            p = get_pool(n)
            stats[n] = {"total": p.size, "selectable": p.selectable_size}
        except FileNotFoundError:
            stats[n] = {"total": 0, "selectable": 0}
    return stats
