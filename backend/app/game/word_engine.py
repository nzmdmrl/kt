"""
Kelime motoru — Türkçe harf duyarlı.

Sorumluluklar:
  * Türkçe'ye özel büyük harf dönüşümü (i -> İ, ı -> I).
  * Bir tahminin hedef kelimeye göre Wordle-tarzı renk sonucunu üretmek
    (yeşil / sarı / gri), tekrarlı harfleri doğru sayarak.
  * Tahminin geçerli bir kelime olup olmadığını (havuzda mı) kontrol etmek.

Tüm kelimeler sistemde BÜYÜK harfle tutulur ve karşılaştırılır.
"""

from __future__ import annotations

from enum import Enum
from dataclasses import dataclass


# Türkçe küçük -> büyük eşlemesi. Python'un varsayılan .upper()'ı
# "i" harfini "I" yapar; Türkçe'de "i" -> "İ" ve "ı" -> "I" olmalı.
_TR_LOWER_TO_UPPER = {
    "i": "İ",
    "ı": "I",
    "ş": "Ş",
    "ğ": "Ğ",
    "ü": "Ü",
    "ö": "Ö",
    "ç": "Ç",
}

# Türkçe alfabesinde geçerli büyük harfler (kelime doğrulaması için).
TR_UPPER_ALPHABET = set("ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ")


def tr_upper(text: str) -> str:
    """Türkçe kurallarına göre büyük harfe çevirir."""
    result = []
    for ch in text:
        if ch in _TR_LOWER_TO_UPPER:
            result.append(_TR_LOWER_TO_UPPER[ch])
        else:
            result.append(ch.upper())
    return "".join(result)


def normalize(word: str) -> str:
    """Kelimeyi karşılaştırma için normalize eder: boşlukları at, büyük harfe çevir."""
    return tr_upper(word.strip())


class LetterState(str, Enum):
    """Bir harfin tahmindeki durumu."""

    CORRECT = "correct"   # doğru harf, doğru yer (yeşil)
    PRESENT = "present"   # harf var ama yanlış yer (sarı)
    ABSENT = "absent"     # harf kelimede yok (gri)


@dataclass
class LetterResult:
    letter: str
    state: LetterState


def evaluate_guess(guess: str, target: str) -> list[LetterResult]:
    """
    Bir tahmini hedefe göre değerlendirir ve harf harf renk sonucu döner.

    Tekrarlı harfleri doğru işler: önce tüm doğru (yeşil) konumlar işaretlenir,
    sonra kalan harfler için sarı/gri kararı verilir. Hedefte bir harf 2 kez
    varsa tahminde en fazla 2 kez sarı/yeşil olabilir.
    """
    guess = normalize(guess)
    target = normalize(target)

    if len(guess) != len(target):
        raise ValueError(
            f"Tahmin uzunlugu ({len(guess)}) hedef uzunlugu ({len(target)}) ile ayni olmali."
        )

    n = len(target)
    results: list[LetterResult | None] = [None] * n

    # Hedefteki her harften kaç tane var — sarı/gri sayımı için havuz.
    remaining: dict[str, int] = {}
    for ch in target:
        remaining[ch] = remaining.get(ch, 0) + 1

    # 1. geçiş: doğru konumları (yeşil) işaretle ve havuzdan düş.
    for i in range(n):
        if guess[i] == target[i]:
            results[i] = LetterResult(guess[i], LetterState.CORRECT)
            remaining[guess[i]] -= 1

    # 2. geçiş: kalanları sarı ya da gri olarak işaretle.
    for i in range(n):
        if results[i] is not None:
            continue
        ch = guess[i]
        if remaining.get(ch, 0) > 0:
            results[i] = LetterResult(ch, LetterState.PRESENT)
            remaining[ch] -= 1
        else:
            results[i] = LetterResult(ch, LetterState.ABSENT)

    return results  # type: ignore[return-value]


def is_correct(guess: str, target: str) -> bool:
    """Tahmin hedefle birebir aynı mı?"""
    return normalize(guess) == normalize(target)


def count_present_letters(results: list[LetterResult]) -> int:
    """
    Sarı (doğru harf, yanlış yer) sayısını döner.
    0-0 önleme teselli puanı bu sayıya göre verilir.
    """
    return sum(1 for r in results if r.state == LetterState.PRESENT)


def is_valid_word_shape(word: str, length: int) -> bool:
    """
    Kelimenin biçimsel geçerliliği: doğru uzunluk ve yalnızca
    Türkçe büyük harfler içeriyor mu? (Havuz üyeliği ayrı kontrol edilir.)
    """
    word = normalize(word)
    if len(word) != length:
        return False
    return all(ch in TR_UPPER_ALPHABET for ch in word)
