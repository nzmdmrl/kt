"""
Solo (hikaye) modu mantığı.

- level_length(level): her 10 levelin 3'ü 4h, 4'ü 5h, 3'ü 6h.
- solo_word(user_id, level, attempt): kullanıcıya + level'e + deneme sayısına özel
  deterministik kelime (tekrar oynayınca attempt artar -> kelime değişir).
- stars_for(seconds_left, s3, s2): kalan süreye göre yıldız (3/2/1).
- joker_reveal_order(...): jokerin hangi harfi açacağı (deterministik sıra).
"""

from __future__ import annotations

import hashlib

from app.words.word_service import get_pool

# 10'luk blokta uzunluk deseni: pozisyon (level-1)%10 -> uzunluk.
# 3 tane 4h, 4 tane 5h, 3 tane 6h.
_LENGTH_PATTERN = [4, 5, 4, 5, 6, 4, 5, 6, 5, 6]


def level_length(level: int) -> int:
    """Level numarasına göre kelime uzunluğu (4/5/6)."""
    if level < 1:
        level = 1
    return _LENGTH_PATTERN[(level - 1) % 10]


def solo_word(user_id: int, level: int, attempt: int, lang: str = "tr") -> str:
    """Kullanıcıya + level'e + deneme sayısına özel deterministik hedef kelime.

    attempt her yeni oynayışta artar -> aynı level tekrar oynanınca farklı kelime gelir.
    Aynı (user, level, attempt) için hep aynı kelime döner (yenileme/çökme sonrası tutarlı).
    """
    length = level_length(level)
    pool = get_pool(length, lang)
    words = pool.selectable_words()  # yaygın/seçilebilir hedef kelimeler
    if not words:
        words = sorted(pool._all_words) if pool.size else []  # emniyet
    if not words:
        raise RuntimeError(f"{length} harfli solo kelime havuzu boş")
    seed = f"solo-{user_id}-{level}-{attempt}-{lang}"
    h = int(hashlib.sha256(seed.encode()).hexdigest(), 16)
    return words[h % len(words)]


def joker_reveal_order(user_id: int, level: int, attempt: int, length: int) -> list[int]:
    """Jokerlerin hangi sırayla hangi harfi açacağı — deterministik karışım.

    İlk harf (0. sıra) zaten ipucu olarak veriliyor, o yüzden listeye girmez.
    Aynı (user, level, attempt) için hep aynı sıra döner: sayfa yenilense de
    daha önce açılmış harfler değişmez.
    """
    positions = list(range(1, max(1, length)))
    seed = f"solo-joker-{user_id}-{level}-{attempt}"
    # Her konuma tohumdan türeyen bir anahtar verip ona göre sırala: rastgele
    # ama tekrarlanabilir (random modülünün global durumuna bağlı değil).
    def key(pos: int) -> str:
        return hashlib.sha256(f"{seed}-{pos}".encode()).hexdigest()
    return sorted(positions, key=key)


def stars_for(seconds_left: int, star3_min: int, star2_min: int) -> int:
    """Kalan süreye göre yıldız. Örn (120sn level): >=80 ->3, >=30 ->2, else ->1.
    Kelime bulunduysa en az 1 yıldız garantidir."""
    if seconds_left >= star3_min:
        return 3
    if seconds_left >= star2_min:
        return 2
    return 1
