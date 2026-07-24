"""
Bot davranış simülasyonu.

Bot gerçekten "düşünmez"; ELO'suna ve kelime zorluğuna göre olasılıksal
davranır. Amaç: inandırıcı bir rakip — bazen bilir, bazen bilemez, bazen
kaybeder. Düşük ELO botu tereddüt eder, hatalı tahmin yapar; yüksek ELO
botu hızlı ve isabetli ama %100 kusursuz değil.

Tüm katsayılar admin panelde (Faz 10) ayarlanabilir olacak; şimdilik sabit.
"""

from __future__ import annotations

import random

from app.game.word_engine import evaluate_guess, normalize
from app.words.word_service import get_pool


# ELO -> beceri (0..1). 600 ELO ~ zayıf, 1800 ELO ~ güçlü.
def _skill(elo: int) -> float:
    s = (elo - 500) / 1300.0
    return max(0.18, min(0.95, s))


# Kelime zorluğu çarpanı (kolay kelime daha sık bilinir).
_DIFF_FACTOR = {"kolay": 1.0, "orta": 0.8, "zor": 0.55}


def solve_probability(elo: int, difficulty: str) -> float:
    """Bu botun bu turu (bir denemede) bilme olasılığı — TABAN (attempt=0)."""
    base = _skill(elo)
    return base * _DIFF_FACTOR.get(difficulty, 0.8)


def solve_probability_at(elo: int, difficulty: str, attempt_index: int) -> float:
    """
    Botun KAÇINCI tahminde olduğuna göre bilme olasılığı.

    Amaç: bot yeni oyuncuya oyunu sevdirsin — erken tahminlerde bilmesin,
    ipuçları biriktikçe (geç tahminlerde) bilmeye başlasın.

    attempt_index: bu bot için kaçıncı tahmin (0 tabanlı; 0 = ilk tahmini).
      0-1 (ilk 2 tahmin): neredeyse hiç bilmez (çok düşük).
      2   (3. tahmin)    : ipuçlarını kullanmaya başlar, düşük şans.
      3-4 (4-5. tahmin)  : orta şans, artan.
      5+  (6+ tahmin)    : yüksek şans — artık bilmeye başlar.
    """
    base = _skill(elo) * _DIFF_FACTOR.get(difficulty, 0.8)
    # Tahmin sayısına göre çarpan (0..1'e yaklaşır).
    ramp = {
        0: 0.0,    # ilk tahmin: asla direkt bilmez
        1: 0.05,   # 2. tahmin: çok nadir
        2: 0.20,   # 3. tahmin: ipuçları devreye girer
        3: 0.45,   # 4. tahmin
        4: 0.70,   # 5. tahmin
    }.get(attempt_index, 1.0)  # 6. tahmin ve sonrası: tam beceri
    return base * ramp


def use_hints_level(attempt_index: int) -> float:
    """
    Bot ipuçlarını (yeşil/sarı/gri) ne kadar KULLANSIN? 0..1.
    Erken tahminlerde ipuçlarını görmezden gelip inandırıcı yanlışlar yapar;
    3. tahminden sonra ipuçlarına uymaya başlar.
    """
    return {
        0: 0.0,   # ilk tahmin: ipuçsuz, rastgele (zaten ipucu da yok)
        1: 0.1,   # 2. tahmin: çoğunlukla ipuçları kullanmaz
        2: 0.5,   # 3. tahmin: yarı yarıya ipuçlarını kullanır
        3: 0.75,  # 4. tahmin
        4: 0.9,   # 5. tahmin
    }.get(attempt_index, 1.0)  # 6+: ipuçlarını tam kullanır


def think_delay(elo: int) -> float:
    """
    Buzzer'a basmadan önce 'düşünme' süresi (saniye).
    Yüksek ELO daha hızlı basar; düşük ELO daha yavaş. Rastgelelik eklenir.
    """
    skill = _skill(elo)
    # 2..8 sn aralığı; yüksek beceri alt uca yaklaşır.
    fast = 2.0
    slow = 8.0
    center = slow - (slow - fast) * skill
    return max(1.5, random.gauss(center, 1.2))


def decide_action(elo: int, difficulty: str, attempts_made: int, max_rows: int) -> bool:
    """
    Bot bu turda buzzer'a basıp denemeli mi? (Her tur için stratejik karar.)
    Yüksek ELO daha girişken. Satırlar azaldıkça temkinli olur.
    """
    skill = _skill(elo)
    # Girişkenlik ELO ile artar; %35..%90 arası.
    aggression = 0.35 + 0.55 * skill
    return random.random() < aggression


def pick_guess(target: str, lang: str, prev_rows: list, hint_level: float = 1.0) -> str:
    """
    Botun yapacağı tahmini seçer.

    prev_rows: o ana kadar ızgaradaki tahminler (renk ipuçları).
    hint_level: 0..1 — bot ipuçlarını ne kadar kullansın. Düşükse ipuçları
      görmezden gelinir (inandırıcı erken yanlışlar); yüksekse ipuçlarına uyulur.
    """
    target = normalize(target)
    length = len(target)
    pool = get_pool(length, lang)

    import json
    from pathlib import Path
    data_path = Path(__file__).resolve().parent.parent / "words" / "data" / f"{lang}_{length}_pool.json"
    try:
        items = json.loads(data_path.read_text(encoding="utf-8"))
    except Exception:
        return target  # güvenlik: en kötü ihtimalle doğruyu döner

    candidates = [it["word"] for it in items
                  if it.get("active", True) and it["word"][0] == target[0] and it["word"] != target]
    if not candidates:
        return target

    # Bot ipuçlarını kullanmaya karar verdi mi? (hint_level olasılığıyla)
    if random.random() >= hint_level:
        # İpuçlarını GÖRMEZDEN gel — ilk harfi tutan rastgele kelime (inandırıcı yanlış).
        return random.choice(candidates)

    # İpuçlarına göre eleme: yeşil konumları tutan, gri harfleri içermeyen adaylar.
    greens: dict[int, str] = {}
    absents: set[str] = set()
    for row in prev_rows:
        for i, tile in enumerate(row):
            st = tile.get("state")
            ch = tile.get("letter")
            if st == "correct":
                greens[i] = ch
            elif st == "absent":
                absents.add(ch)

    def fits(word: str) -> bool:
        for i, ch in greens.items():
            if i < len(word) and word[i] != ch:
                return False
        for ch in absents:
            if ch in word and ch not in greens.values():
                return False
        return True

    filtered = [w for w in candidates if fits(w)]
    return random.choice(filtered) if filtered else random.choice(candidates)
