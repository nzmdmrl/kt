"""
Kelime havuzunu zorluk etiketiyle zenginleştirir.

generate_wordlist.py ham havuzu üretir (tr_4/5/6.json — düz liste).
Bu script her kelimeye frekans verisine göre zorluk etiketi ekler ve
oyunun kullanacağı nihai yapıyı yazar (tr_4/5/6_pool.json).

Zorluk:
  * "kolay"  -> frekans listesinde üst dilimde (çok yaygın)
  * "orta"   -> frekans listesinde ama alt dilimde
  * "zor"    -> frekans listesinde yok (nadir/arkaik/teknik)

Oyun varsayılan olarak kolay+orta havuzdan seçer; "zor" kelimeler
havuzda kalır ama admin panelden aktif edilene kadar öncelik almaz.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.game.word_engine import tr_upper

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"

# Üst dilim eşiği: en yaygın bu kadar kelime "kolay" sayılır.
EASY_TOP_RANK = 8000


def load_frequency() -> dict[str, int]:
    """Frekans ham dosyasını {BÜYÜK_KELIME: sira} olarak döner (küçük sira = yaygın)."""
    freq_path = BASE / "raw_tr_freq.txt"
    ranks: dict[str, int] = {}
    if not freq_path.exists():
        return ranks
    with freq_path.open(encoding="utf-8") as f:
        for rank, line in enumerate(f):
            parts = line.split()
            if len(parts) == 2:
                ranks[tr_upper(parts[0])] = rank
    return ranks


def difficulty_for(word: str, ranks: dict[str, int]) -> str:
    rank = ranks.get(word)
    if rank is None:
        return "zor"
    if rank <= EASY_TOP_RANK:
        return "kolay"
    return "orta"


def build() -> None:
    ranks = load_frequency()
    for n in (4, 5, 6):
        words = json.loads((DATA / f"tr_{n}.json").read_text(encoding="utf-8"))
        pool = []
        for w in words:
            pool.append({"word": w, "difficulty": difficulty_for(w, ranks), "active": True})
        # İstatistik
        counts = {"kolay": 0, "orta": 0, "zor": 0}
        for item in pool:
            counts[item["difficulty"]] += 1
        out = DATA / f"tr_{n}_pool.json"
        out.write_text(json.dumps(pool, ensure_ascii=False), encoding="utf-8")
        print(f"{n} harf: {len(pool)} kelime -> kolay={counts['kolay']} orta={counts['orta']} zor={counts['zor']}")


if __name__ == "__main__":
    build()
