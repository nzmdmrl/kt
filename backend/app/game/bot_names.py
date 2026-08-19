"""
Bot isim havuzları (dile bağlı).

Bot üretici bu havuzlardan gerçekçi isimler seçer. Türkçe kurulum Türkçe
isimler, İngilizce kurulum İngilizce isimler kullanır.

SOYİSİM YOK: botlar yalnız TEK ADLA görünür ("Ceren", "Murat"). Eskiden
"Ceren D." / "Sıla Öztürk" gibi soyad/baş harf ekleniyordu; gerçek üyeler
genelde tek ad kullandığı için botlar listede sırıtıyordu. Bu yüzden havuz
soyad yerine GENİŞLETİLDİ — 100+ bot üretilirken bile ad tekrarı olmasın.
Mevcut botların adları açılışta bir kez temizlenir
(bkz. app/services/bot_name_cleanup.py).

Avatar: DiceBear gibi bir servis URL'i ile üretilir (harici görsel, key gerektirmez).
"""

from __future__ import annotations

TR_FIRST_NAMES = [
    # erkek
    "Ahmet", "Mehmet", "Mustafa", "Ali", "Hüseyin", "Hasan", "İbrahim", "Osman",
    "Yusuf", "Murat", "Ömer", "Emre", "Burak", "Serkan", "Kaan", "Onur", "Barış",
    "Cem", "Deniz", "Ege", "Kerem", "Arda", "Efe", "Tolga", "Volkan", "Uğur",
    "Selim", "Sinan", "Tarık", "Yiğit", "Berk", "Batuhan", "Cihan", "Doruk",
    "Emir", "Ercan", "Erdem", "Fatih", "Furkan", "Gökhan", "Halil", "Hakan",
    "Harun", "İlker", "İsmail", "Kadir", "Kemal", "Levent", "Mert", "Metin",
    "Okan", "Oğuz", "Orhan", "Ramazan", "Recep", "Salih", "Samet", "Sarp",
    "Semih", "Suat", "Şükrü", "Taner", "Tayfun", "Tuna", "Tunç", "Turgut",
    "Umut", "Ufuk", "Veli", "Yavuz", "Yalçın", "Yunus", "Zafer", "Alp",
    "Alper", "Altay", "Aras", "Atakan", "Ayaz", "Baran", "Bora", "Can",
    "Cenk", "Çağrı", "Eren", "Ertan", "Eymen", "Görkem", "Kayra", "Koray",
    "Kuzey", "Ozan", "Poyraz", "Rıza", "Tekin", "Toprak", "Ulaş", "Yaman",
    "Yakup", "Bahadır", "Ediz", "Sencer", "Kağan", "Tuğrul", "Batur",
    # kadın
    "Ayşe", "Fatma", "Emine", "Hatice", "Zeynep", "Elif", "Meryem", "Şevval",
    "Merve", "Büşra", "Esra", "Selin", "Ceren", "Gizem", "Damla", "Ebru",
    "Sena", "İrem", "Melis", "Duru", "Nehir", "Yağmur", "Defne", "Aslı",
    "Kübra", "Betül", "Sıla", "Nisa", "Ela", "Beren", "Doğa", "Pınar",
    "Aleyna", "Alara", "Arzu", "Aysu", "Bahar", "Banu", "Başak", "Beyza",
    "Bilge", "Burcu", "Ceyda", "Ceylin", "Cansu", "Çiğdem", "Derya", "Dilara",
    "Dilek", "Ece", "Eda", "Ekin", "Elvan", "Eylül", "Ezgi", "Feyza",
    "Filiz", "Funda", "Gamze", "Gökçe", "Gonca", "Gülsüm", "Handan", "Hazal",
    "Hilal", "Ilgın", "İlkay", "İlayda", "İpek", "Kader", "Lale", "Leyla",
    "Melek", "Melike", "Mine", "Nazlı", "Neslihan", "Nilay", "Nurgül", "Öykü",
    "Özge", "Özlem", "Pelin", "Rabia", "Rüya", "Sanem", "Seda", "Sedef",
    "Sevgi", "Sibel", "Simge", "Sude", "Şeyma", "Şule", "Tuana", "Tuğba",
    "Tülin", "Yaren", "Yasemin", "Zehra", "Zeliha", "Zümra", "Hande",
    "Hülya", "Nihal", "Seher", "Semra", "Tuğçe", "Vildan", "Selma", "Nurcan",
]

EN_FIRST_NAMES = [
    "James", "John", "Robert", "Michael", "William", "David", "Chris", "Daniel",
    "Matt", "Ryan", "Jason", "Kevin", "Brian", "Eric", "Sean", "Adam", "Tyler",
    "Aaron", "Alex", "Ben", "Caleb", "Cole", "Dylan", "Ethan", "Evan", "Gavin",
    "Henry", "Isaac", "Jack", "Jake", "Josh", "Liam", "Logan", "Lucas", "Luke",
    "Mason", "Nathan", "Noah", "Oliver", "Owen", "Peter", "Sam", "Scott",
    "Simon", "Toby", "Travis", "Victor", "Wyatt", "Zach",
    "Mary", "Jennifer", "Linda", "Patricia", "Susan", "Jessica", "Sarah", "Karen",
    "Emily", "Ashley", "Amanda", "Megan", "Rachel", "Laura", "Emma", "Olivia",
    "Sophie", "Chloe", "Grace", "Hannah", "Lily", "Ella", "Zoe", "Mia",
    "Abigail", "Alice", "Amber", "Anna", "Bella", "Claire", "Daisy", "Eva",
    "Fiona", "Holly", "Iris", "Ivy", "Julia", "Kate", "Leah", "Maya",
    "Nora", "Paige", "Ruby", "Sadie", "Tessa", "Vera", "Willow", "Zara",
]

# Dil -> tek adlık havuz. (Eskiden (isimler, soyadlar) ikilisiydi.)
NAME_POOLS = {
    "tr": TR_FIRST_NAMES,
    "en": EN_FIRST_NAMES,
}


def pool_for(lang: str = "tr") -> list[str]:
    return NAME_POOLS.get(lang, NAME_POOLS["tr"])


def first_name_of(full: str) -> str:
    """"Sıla Öztürk" -> "Sıla". Zaten tek adsa aynen döner."""
    return (full or "").strip().split(" ")[0].strip()


def avatar_url_for(seed: str) -> str:
    """DiceBear ile deterministik avatar URL'i (harici, key gerektirmez)."""
    # 'thumbs' stili nötr ve hoş; seed isme göre sabit avatar verir.
    from urllib.parse import quote
    return f"https://api.dicebear.com/7.x/thumbs/svg?seed={quote(seed)}"


def random_bot_names(count: int, lang: str = "tr", exclude: set[str] | None = None) -> list[str]:
    """Benzersiz rastgele bot isimleri üretir (Arena için).

    `exclude`: o maçta/lobide ZATEN bulunan adlar. Tek ada geçildiği için
    havuz küçüldü; aynı arenada iki "Murat" çıkmasın diye eleniyor.
    """
    import random
    pool = [n for n in pool_for(lang) if n not in (exclude or set())]
    random.shuffle(pool)
    names = pool[:count]
    # Havuz yetmezse numarayla tamamla (pratikte olmaz: havuz 200'e yakın).
    while len(names) < count:
        names.append(f"Oyuncu {random.randint(1000, 9999)}")
    return names
