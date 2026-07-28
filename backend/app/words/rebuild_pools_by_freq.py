"""
Havuzları frekansa göre işaretle (offline hazırlık scripti).

Mevcut geniş kelime havuzunu (tr_N_pool.json) korur ama her kelimeye
kullanım sıklığına göre `member` ve `difficulty` atar:

  - member=True  -> HEDEF havuzu: maçta oyuncuya sorulabilir. Sadece yaygın
    (frekans rank < TARGET_THRESHOLD) kelimeler. "Duyulmamış kelime sorulmaz."
  - member=False -> yalnızca KABUL: oyuncu tahmin olarak yazabilir, geçerli
    sayılır; ama asla hedef seçilmez. (Geniş sözlük burada yaşar.)
  - active=True  -> hepsi (geçerli tahmin kabulü için).
  - bot=True     -> botun tahmin olarak kullanabileceği kelimeler (member ile aynı
    tutulur; bot da yaygın kelimeleri "bilir").
  - difficulty   -> kolay (<4k) / orta (<12k) / zor (rest veya listede yok).

Frekans kaynağı: data/tr_freq_50k.txt (OpenSubtitles TR, "kelime sayı" formatı).

Çalıştır: python -m app.words.rebuild_pools_by_freq
Çıktı: tr_N_pool.json dosyalarını yerinde günceller.
"""

from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
FREQ_FILE = DATA / "tr_freq_50k.txt"

# Hedef (member) eşiği: frekans rank bunun altındaysa kelime maçta sorulabilir.
# 2000 = sadece en yaygın/net kelimeler (ADLİ, AKLI gibi seyrek kelimeler elenir).
TARGET_THRESHOLD = 2000
# Zorluk eşikleri (rank).
EASY_THRESHOLD = 4000
MEDIUM_THRESHOLD = 12000


def tr_lower(s: str) -> str:
    # Türkçe'ye duyarlı küçük harf (İ->i, I->ı).
    return s.replace("I", "ı").replace("İ", "i").lower()


def load_freq() -> dict[str, int]:
    ranks: dict[str, int] = {}
    with FREQ_FILE.open(encoding="utf-8") as f:
        for i, line in enumerate(f):
            parts = line.split()
            if parts:
                ranks[parts[0]] = i  # 0 = en sık
    return ranks


def difficulty_for(rank: int | None) -> str:
    if rank is None:
        return "zor"
    if rank < EASY_THRESHOLD:
        return "kolay"
    if rank < MEDIUM_THRESHOLD:
        return "orta"
    return "zor"


def main() -> None:
    ranks = load_freq()
    for length in (4, 5, 6):
        path = DATA / f"tr_{length}_pool.json"
        pool = json.load(path.open(encoding="utf-8"))
        member_count = 0
        for item in pool:
            r = ranks.get(tr_lower(item["word"]))
            is_target = r is not None and r < TARGET_THRESHOLD
            item["member"] = is_target        # hedef havuzu (yaygın) — üyeye sorulur
            item["bot"] = True                 # bot TÜM kelimeleri kullanabilir
            item["active"] = True             # hepsi geçerli tahmin
            item["difficulty"] = difficulty_for(r)
            item["freq_rank"] = r if r is not None else -1
            if is_target:
                member_count += 1
        json.dump(pool, path.open("w", encoding="utf-8"), ensure_ascii=False, indent=0)
        print(f"tr_{length}: {len(pool)} kabul, {member_count} hedef (member) yazıldı -> {path.name}")


if __name__ == "__main__":
    main()
