"""
Kelime listesi üretici (offline hazırlık scripti).

Ham Türkçe sözlük listesinden oyuna uygun 4/5/6 harflik kelimeleri
filtreleyip JSON havuzlarına yazar. Bu script build zamanında değil,
hazırlık aşamasında çalıştırılır; çıktısı repoda hazır gelir.

Filtre kuralları (isim olmayan, yaygın, oyuna uygun):
  * Sadece Türkçe küçük harfler (a-z + çğıöşü). Büyük harfle başlayan
    (özel isim) satırlar elenir.
  * Boşluk, tire, kesme işareti içerenler elenir (tamlama / özel biçim).
  * Mastar ekli fiiller (-mak / -mek) elenir — oyunda kök/ad tercih edilir.
  * İstenen uzunlukta (4/5/6) olanlar tutulur, BÜYÜK harfe çevrilip yazılır.

Not: Otomatik filtre kaba bir ilk süzgeçtir. Nihai havuz admin panelde
gözden geçirilip (onay akışı) argo/teknik/çok arkaik kelimeler ayıklanır.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# Kelime motorundaki Türkçe büyük harf dönüşümünü tekrar kullan.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from app.game.word_engine import tr_upper  # noqa: E402

TR_LOWER = set("abcçdefgğhıijklmnoöprsştuüvyz")

# Yalnızca Türkçe küçük harflerden oluşan saf kelime.
PURE_WORD = re.compile(r"^[abcçdefgğhıijklmnoöprsştuüvyz]+$")

# Oyunda istemediğimiz mastar sonları (fiil çekimi).
INFINITIVE_SUFFIXES = ("mak", "mek")


def is_candidate(raw: str) -> bool:
    w = raw.strip()
    if not w:
        return False
    # Büyük harfle başlayan -> özel isim, ele.
    if w[0].isupper():
        return False
    # Boşluk / tire / kesme / nokta içeren -> ele.
    if any(c in w for c in (" ", "-", "'", "’", ".", "/")):
        return False
    # Saf Türkçe küçük harf değilse ele.
    if not PURE_WORD.match(w):
        return False
    # Mastar ekli fiilleri ele (oyunda ad/kök tercih ediyoruz).
    if w.endswith(INFINITIVE_SUFFIXES):
        return False
    return True


def build(raw_path: Path, out_dir: Path, lengths=(4, 5, 6)) -> dict[int, int]:
    seen: dict[int, set[str]] = {n: set() for n in lengths}

    with raw_path.open(encoding="utf-8") as f:
        for line in f:
            w = line.strip()
            if not is_candidate(w):
                continue
            n = len(w)
            if n in seen:
                seen[n].add(tr_upper(w))

    out_dir.mkdir(parents=True, exist_ok=True)
    counts: dict[int, int] = {}
    for n in lengths:
        words = sorted(seen[n])
        counts[n] = len(words)
        out_file = out_dir / f"tr_{n}.json"
        out_file.write_text(
            json.dumps(words, ensure_ascii=False, indent=0),
            encoding="utf-8",
        )
    return counts


if __name__ == "__main__":
    base = Path(__file__).resolve().parent
    raw = base / "raw_tr_words.txt"
    out = base / "data"
    if not raw.exists():
        print(f"Ham liste bulunamadi: {raw}")
        print("Once ham listeyi indirin (bkz. README / hazirlik adimlari).")
        sys.exit(1)
    counts = build(raw, out)
    for n, c in counts.items():
        print(f"{n} harf: {c} kelime -> data/tr_{n}.json")
