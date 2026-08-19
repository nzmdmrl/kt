"""
İsim denetimi — BİRİNCİ KATMAN: yerel Türkçe kara liste.

NEDEN YEREL KATMAN ÖNCE
-----------------------
Anında çalışır, para tutmaz, internet gerektirmez ve Türkçe küfürde yapay
zekâdan çok daha güvenilirdir. Yapay zekâ (ikinci katman) kara listenin
kaçırdığı YARATICI yazımlar için var — tek başına bırakılmaz.

YAZIM OYUNLARINA KARŞI NORMALLEŞTİRME
-------------------------------------
Kullanıcılar filtreyi atlatmak için hep aynı şeyleri yapar; hepsi sökülür:
  "S1kt1r"  -> rakam-harf oyunu (1→i, 0→o, 3→e, 4→a, 5→s, 7→t, @→a, $→s)
  "s.i.k"   -> araya nokta/boşluk/alt çizgi
  "siiiik"  -> harf tekrarı
  "SİKTİR"  -> büyük/küçük + Türkçe harf (İ→i, Ş→s ...)
  "ѕik"     -> Kiril/Yunan görsel taklidi

İKİ ÖLÇEKTE BAKILIR
-------------------
1) BÜTÜN İSİM, boşluklar silinerek ("s i k t i r" -> "siktir"),
2) HER KELİME ayrı ayrı ("Admin Yardımcı" -> "admin", "yardimci").

İkincisi şart: boşluklar silinince kelime sınırı kaybolur ve "admin" gibi
tek başına anlamlı olan sözcükler tam-kelime kuralıyla yakalanamaz.

YANLIŞ ALARMI ÖNLEMEK EN AZ YAKALAMAK KADAR ÖNEMLİ
--------------------------------------------------
Bu filtre gerçek insanların adlarını görüyor. İki koruma var:

  a) Risk taşıyan kısa kökler yalnız TAM KELİME olarak sayılır
     ("sik" -> "Sikke Koleksiyoncusu"nu yakalamaz).
  b) WHITELIST: eşleşen küfür, isimde geçen MASUM bir kelimenin parçasıysa
     eşleşme iptal edilir ("sikke" içindeki "sik", "gaye" içindeki "gay").
     Bu kontrol "kelimeye özel"dir: masum bir kelimenin varlığı ismin
     TAMAMINI aklamaz, yalnız o kelimenin açıkladığı eşleşmeyi düşürür.

Gerçek örnek: "Nazım" (sahibin adı) ilk sürümde "nazi" diye yakalanıyordu.
Bu yüzden "nazi" artık yalnız tam kelime olarak sayılıyor.
"""

from __future__ import annotations

import re
import unicodedata

# ---------------------------------------------------------------- normalleştirme

# Türkçe + görsel taklit harfler -> ASCII
_TRANSLIT = str.maketrans({
    "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ı": "i", "I": "i", "İ": "i",
    "ö": "o", "Ö": "o", "ş": "s", "Ş": "s", "ü": "u", "Ü": "u",
    # sık kullanılan görsel taklitler (Kiril/Yunan)
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y",
    "і": "i", "ѕ": "s", "κ": "k", "ν": "v", "τ": "t", "ρ": "p", "ο": "o",
})

# Rakam/işaret -> harf ("leet")
_LEET = str.maketrans({
    "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b",
    "@": "a", "$": "s", "!": "i", "|": "i", "+": "t",
})


def normalize(raw: str) -> str:
    """Metni karşılaştırılabilir sade bir hâle indirger (harf+rakam kalır)."""
    text = unicodedata.normalize("NFKD", raw or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.translate(_TRANSLIT).lower()
    text = text.translate(_LEET)
    return re.sub(r"[^a-z0-9]", "", text)


def collapse(text: str) -> str:
    """Arka arkaya tekrar eden harfleri teke indirir: 'siiik' -> 'sik'."""
    return re.sub(r"(.)\1+", r"\1", text)


def _tokens(raw: str) -> list[str]:
    """İsmi kelimelere ayırır ve her birini normalleştirir."""
    parts = re.split(r"[\s._\-]+", raw or "")
    return [t for t in (normalize(p) for p in parts) if t]


# ---------------------------------------------------------------- listeler
#
# contains=True  -> normalleştirilmiş metnin İÇİNDE geçmesi yeter.
#                   Yalnız uzun ve ayırt edici köklerde kullanılır.
# contains=False -> yalnız TAM KELİME olarak sayılır (kelime ya da ismin tamamı).

# Kesin küfür/hakaret — içinde geçmesi yeter.
_STRONG_CONTAINS = [
    "amcik", "amcigi", "amcigini", "amck", "aminakoy", "aminakoyim",
    "aminakoyum", "amnakoyim", "ananisik", "ananisikeyim", "anankisikeyim",
    "avradini", "bokgot", "cocugunusikeyim", "gotveren", "gotlalesi",
    "ibinenin", "kahpe", "orospu", "orspu", "orosbu", "oruspu",
    "pezevenk", "pezeveng", "sikeyim", "sikerim", "sikik", "sikimin",
    "sikis", "siktir", "sikeceem", "sikecem", "siktimin", "siktigimin",
    "yarrak", "yarram", "yarrag", "dalyarak", "sulaleni", "ecdadini",
    # ingilizce yaygınlar
    "fuck", "fuk", "motherfucker", "asshole", "nigger", "nigga",
    "bitch", "whore",
]

# Kesin küfür ama KISA — yalnız tam kelime olarak sayılır.
# ("sik" içeride sayılsaydı "sikke", "pisik" yakalanırdı.)
_STRONG_WORD = [
    "sik", "sikim", "sike", "got", "gotu", "gotunu", "am", "amk", "amq",
    "amina", "yarak", "gavat", "pust", "ibne", "ibine", "pic", "kevase",
    "godos", "kaltak", "shit", "cunt", "dick", "pussy", "slut",
]

# Hafif hakaret — tam kelime, daha düşük puan (listeye düşer, kapatmaz).
_MILD_WORD = [
    "salak", "aptal", "gerizekali", "serefsiz", "namussuz",
    "domal", "domalt", "sirtlan",
]

# ÇOK ANLAMLI kısa kelimeler — yalnız İSMİN TAMAMI buysa sayılır.
# "Mal Müdürü", "Bok Böceği" gibi masum kullanımlar yakalanmasın diye;
# ama tek başına "Mal" yazan kişi hakaret ediyordur.
_AMBIGUOUS_EXACT = ["mal", "bok", "kic", "am", "oc"]

# Nefret söylemi. "nazi" TAM KELİME — "Nazım", "Nazife" yakalanmasın diye.
_HATE_CONTAINS = ["hitler", "siegheil", "soykirim"]
_HATE_WORD = ["nazi", "kkk", "gavur", "zenci"]

# Kurum/yetkili taklidi — tam kelime.
# "mod" bilerek YOK: "moda", "modacı", "model" gibi masum kelimelerle çakışıyor.
_IMPERSONATION_WORD = [
    "admin", "administrator", "yonetici", "moderator", "sistem", "system",
    "destek", "support", "kelimetahmin", "resmi", "official", "root", "sunucu",
]

# Cinsel içerik / kumar reklamı.
# "gay", "lezbiyen", "travesti" BİLEREK YOK: bunlar kimlik sözcükleri, küfür
# değil; ayrıca "Gaye" gibi masum isimleri yakalıyorlardı.
_ADULT_CONTAINS = ["porno", "escort", "eskort", "xxx", "seksi"]
_ADULT_WORD = ["porn", "sex", "seks", "bahis", "casino", "kumar", "bet", "iddaa"]

# MASUM kelimeler — bunlardan biri isimde geçiyorsa, o kelimenin İÇİNDE kalan
# eşleşme iptal edilir. (Bütün ismi aklamaz; yalnız o eşleşmeyi düşürür.)
_WHITELIST = [
    "sikke", "sikkeler", "pisik", "pisikoloji", "amac", "amaci", "amacim",
    "amator", "amerika", "amerikan", "amir", "amine", "emine", "amblem",
    "ambar", "ambalaj", "ampul", "amfi", "amsterdam", "amortisor",
    "gotik", "gotham", "gotze", "bokser", "boks", "kickboks",
    "betul", "beton", "betik", "bethoven", "betonarme",
    "gaye", "gayret", "gayrimenkul", "nazim", "nazife", "nazire", "nazlim",
    "malzeme", "maltepe", "malatya", "malikane", "picasso", "topkapi",
    "sikago", "chicago", "massimo", "modern", "model", "moda", "modaci",
    "sokak", "sokagi", "tasarim", "kicik",
]

# (etiket, kelimeler, eşleşme biçimi, puan)
#   True  -> metnin İÇİNDE geçsin yeter
#   False -> TAM KELİME (kelimelerden biri ya da ismin tamamı)
#   None  -> yalnız İSMİN TAMAMI bu kelimeyse
_RULES: list[tuple[str, list[str], bool | None, int]] = [
    ("küfür", _STRONG_CONTAINS, True, 95),
    ("küfür", _STRONG_WORD, False, 90),
    ("hakaret", _MILD_WORD, False, 50),
    ("hakaret", _AMBIGUOUS_EXACT, None, 55),
    ("nefret söylemi", _HATE_CONTAINS, True, 95),
    ("nefret söylemi", _HATE_WORD, False, 90),
    ("yetkili taklidi", _IMPERSONATION_WORD, False, 70),
    ("uygunsuz içerik", _ADULT_CONTAINS, True, 75),
    ("uygunsuz içerik", _ADULT_WORD, False, 70),
]

_WHITELIST_N = [normalize(w) for w in _WHITELIST]


def _explained(word: str, haystacks: list[str]) -> bool:
    """Eşleşen küfür, isimde geçen masum bir kelimenin parçası mı?

    Örnek: isim "Sikke Koleksiyoncusu", eşleşen kök "sik".
    "sikke" hem whitelist'te hem isimde geçiyor ve "sik" onun parçası ->
    eşleşme iptal. Ama isim "Sikke Siktir" olsaydı "siktir" eşleşmesi
    "sikke" ile açıklanamayacağı için ayakta kalırdı.

    Masum kelimenin SADELEŞTİRİLMİŞ hâline de bakılır: harf tekrarı silinince
    "sikke" -> "sike" oluyor ve o hâliyle küfür listesine çarpıyordu.
    """
    for ww in _WHITELIST_N:
        if not any(ww in h for h in haystacks):
            continue
        if word in ww or word in collapse(ww):
            return True
    return False


def _word_hit(word: str, tokens: list[str], full: str) -> bool:
    """Tam kelime eşleşmesi: bir kelimenin tamamı ya da ismin tamamı."""
    if full == word:
        return True
    for t in tokens:
        if t == word:
            return True
        # "siktir123" gibi sona eklenen rakamlar sayılmaz.
        if re.sub(r"^\d+|\d+$", "", t) == word:
            return True
    return False


def check_name(display_name: str, username: str = "") -> tuple[int, list[str]]:
    """İsmi kara listeye göre puanlar.

    Dönen: (0-100 puan, gerekçe listesi). 0 = temiz.
    Görünen ad ve kullanıcı adı ayrı ayrı bakılır, en yüksek puan kazanır.
    """
    best_score = 0
    reasons: list[str] = []

    for raw in (display_name or "", username or ""):
        if not raw.strip():
            continue
        full = normalize(raw)
        if not full:
            continue
        full_c = collapse(full)
        toks = _tokens(raw)
        toks_c = [collapse(t) for t in toks]
        # Whitelist araması bütün yazımlarda yapılır.
        hay = [full, full_c] + toks + toks_c

        for label, words, contains, score in _RULES:
            for w in words:
                wn = normalize(w)
                if not wn:
                    continue
                if contains is None:
                    hit = full == wn or full_c == wn
                elif contains:
                    hit = wn in full or wn in full_c
                else:
                    hit = _word_hit(wn, toks, full) or _word_hit(wn, toks_c, full_c)
                if not hit:
                    continue
                if _explained(wn, hay):
                    continue
                reasons.append(f"{label}: {w}")
                best_score = max(best_score, score)

    seen: list[str] = []
    for r in reasons:
        if r not in seen:
            seen.append(r)
    return best_score, seen
