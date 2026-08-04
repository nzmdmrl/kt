"""
Üyelere sorulacak kelimeleri Nazım'ın elle seçtiği listelerle DEĞİŞTİRİR.

Kural:
- member (üyeye sorulur) = SADECE verilen listelerdeki kelimeler. Başka hiçbir kelime member olmaz.
- bot (bot hedefi) = TÜM kelimeler (geniş havuz).
- kabul (is_valid) = mevcut geniş havuz + frekans listesi (dokunulmaz; liste harici de kabul).
- Listedeki kelime havuzda yoksa havuza EKLENİR (member=True, bot=True, active=True).

Kaynak dosyalar: kelimeler_{4,5,6}_harf_saglam.txt (küçük harf, satır başına bir kelime).
"""

from __future__ import annotations

import json
from pathlib import Path

from app.game.word_engine import normalize

DATA = Path(__file__).resolve().parent / "data"
# Liste dosyaları words/ altına kopyalanır (deploy'da erişilebilir olsun).
LISTS = {
    4: DATA / "member_4.txt",
    5: DATA / "member_5.txt",
    6: DATA / "member_6.txt",
}


def load_member_words(length: int) -> set[str]:
    path = LISTS[length]
    words = set()
    if not path.exists():
        return words
    for line in path.read_text(encoding="utf-8").splitlines():
        w = line.strip()
        if not w:
            continue
        nw = normalize(w)
        if len(nw) == length and nw.isalpha():
            words.add(nw)
    return words


def main() -> None:
    for length in (4, 5, 6):
        members = load_member_words(length)
        pool_path = DATA / f"tr_{length}_pool.json"
        items = json.loads(pool_path.read_text(encoding="utf-8"))

        existing = {it["word"]: it for it in items}
        # 1) Havuzdaki her kelime: member = (listede mi?), bot = True (tümü)
        #    Listedeki kelimelerin difficulty'sini "orta" yap ki seçilebilir filtresine takılmasın.
        member_hit = 0
        for it in items:
            in_list = it["word"] in members
            it["member"] = in_list
            it["bot"] = True
            it["active"] = True
            if in_list:
                it["difficulty"] = "orta"   # seçilebilir havuza girsin (kolay/orta filtresi)
                member_hit += 1

        # 2) Listede olup havuzda OLMAYAN kelimeleri ekle
        added = 0
        for w in members:
            if w not in existing:
                items.append({
                    "word": w, "difficulty": "orta", "active": True,
                    "member": True, "bot": True, "freq_rank": -1,
                })
                added += 1

        pool_path.write_text(json.dumps(items, ensure_ascii=False, indent=0), encoding="utf-8")
        total_member = member_hit + added
        print(f"tr_{length}: liste {len(members)} kelime | havuzda eşleşen {member_hit} + eklenen {added} = {total_member} member | toplam havuz {len(items)}")


if __name__ == "__main__":
    main()
