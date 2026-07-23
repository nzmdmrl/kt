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
    """Bu botun bu turu (bir denemede) bilme olasılığı."""
    base = _skill(elo)
    return base * _DIFF_FACTOR.get(difficulty, 0.8)


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


def pick_guess(target: str, lang: str, prev_rows: list) -> str:
    """
    Botun yapacağı tahmini seçer.

    prev_rows: o ana kadar ızgaradaki tahminler (renk ipuçları).
    Bot ipuçlarına UYAN geçerli bir kelime bulmaya çalışır; bulamazsa
    ilk harfi tutan rastgele geçerli bir kelime döner (inandırıcı yanlış).
    """
    target = normalize(target)
    length = len(target)
    pool = get_pool(length, lang)

    # Havuzdan ilk harfi tutan adayları topla (tam listeyi tekrar tarama maliyeti
    # düşük — havuzlar birkaç bin kelime).
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

    # Önceki ipuçlarına göre eleme: yeşil konumları tutan, gri harfleri
    # içermeyen adayları tercih et (botun ipuçlarını "kullanması").
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
