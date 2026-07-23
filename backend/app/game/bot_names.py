"""
Bot isim havuzları (dile bağlı).

Bot üretici bu havuzlardan gerçekçi isimler seçer. Türkçe kurulum Türkçe
isimler, İngilizce kurulum İngilizce isimler kullanır. Yeni dil eklenince
buraya o dilin isim havuzu eklenir (Faz 11 / admin).

Avatar: DiceBear gibi bir servis URL'i ile üretilir (harici görsel, key gerektirmez).
"""

from __future__ import annotations

TR_FIRST_NAMES = [
    "Ahmet", "Mehmet", "Mustafa", "Ali", "Hüseyin", "Hasan", "İbrahim", "Osman",
    "Yusuf", "Murat", "Ömer", "Emre", "Burak", "Serkan", "Kaan", "Onur", "Barış",
    "Cem", "Deniz", "Ege", "Kerem", "Arda", "Efe", "Tolga", "Volkan", "Uğur",
    "Ayşe", "Fatma", "Emine", "Hatice", "Zeynep", "Elif", "Meryem", "Şevval",
    "Merve", "Büşra", "Esra", "Selin", "Ceren", "Gizem", "Damla", "Ebru",
    "Sena", "İrem", "Melis", "Duru", "Nehir", "Yağmur", "Defne", "Aslı",
    "Kübra", "Betül", "Sıla", "Nisa", "Ela", "Beren", "Doğa", "Pınar",
]

TR_LAST_INITIALS = [
    "K.", "Y.", "D.", "A.", "T.", "Ç.", "Ö.", "Ş.", "G.", "B.", "S.", "M.",
    "Kaya", "Yıldız", "Demir", "Şahin", "Çelik", "Aydın", "Öztürk", "Arslan",
    "Doğan", "Kılıç", "Aslan", "Koç", "Kurt", "Özdemir", "Taş", "Yılmaz",
]

EN_FIRST_NAMES = [
    "James", "John", "Robert", "Michael", "William", "David", "Chris", "Daniel",
    "Matt", "Ryan", "Jason", "Kevin", "Brian", "Eric", "Sean", "Adam", "Tyler",
    "Mary", "Jennifer", "Linda", "Patricia", "Susan", "Jessica", "Sarah", "Karen",
    "Emily", "Ashley", "Amanda", "Megan", "Rachel", "Laura", "Emma", "Olivia",
    "Sophie", "Chloe", "Grace", "Hannah", "Lily", "Ella", "Zoe", "Mia",
]

EN_LAST_INITIALS = [
    "S.", "J.", "M.", "B.", "T.", "R.", "W.", "D.", "H.", "C.", "P.", "K.",
    "Smith", "Johnson", "Brown", "Jones", "Miller", "Davis", "Wilson", "Moore",
    "Taylor", "Clark", "Lewis", "Walker", "Hall", "Young", "King", "Wright",
]

NAME_POOLS = {
    "tr": (TR_FIRST_NAMES, TR_LAST_INITIALS),
    "en": (EN_FIRST_NAMES, EN_LAST_INITIALS),
}


def avatar_url_for(seed: str) -> str:
    """DiceBear ile deterministik avatar URL'i (harici, key gerektirmez)."""
    # 'thumbs' stili nötr ve hoş; seed isme göre sabit avatar verir.
    from urllib.parse import quote
    return f"https://api.dicebear.com/7.x/thumbs/svg?seed={quote(seed)}"
