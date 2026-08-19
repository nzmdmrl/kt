"""
Ad kuralları — kullanıcı adı ve görünen ad için karakter limitleri.

Limitler admin panelinden (⚙️ Ayarlar) değiştirilebilir:
  username_min_len / username_max_len / display_name_min_len / display_name_max_len

Tek yerde toplanmasının sebebi: aynı kural hem kayıtta (auth_service), hem profil
düzenlemede (account.py), hem de arayüze bildirilen limitlerde (GET /account/limits)
kullanılıyor — biri değişirse hepsi değişsin.

DB sütun sınırları AŞILAMAZ: username String(32), display_name String(48).
"""

from __future__ import annotations

import re

from sqlalchemy.ext.asyncio import AsyncSession

from app.game import settings_service

# Kullanıcı adında İZİN VERİLEN tek alfabe: küçük harf a-z ve rakam 0-9.
# Büyük harf, Türkçe harf, alt çizgi ve noktalama YOK — hepsi
# slugify_username() ile çevrilir ya da atılır.
USERNAME_CHARS_RE = re.compile(r"^[a-z0-9]+$")

# Sütun sınırları (DB'yi aşan ayar girilirse buraya kırpılır).
USERNAME_HARD_MAX = 32
DISPLAY_HARD_MAX = 48


# Görünen ad -> kullanıcı adı dönüşümü.
#
# Kullanıcı isim ekranına TEK bir isim yazar; o isim hem görünen ad (yazdığı gibi)
# hem de kullanıcı adı olur. Ama ikisinin karakter kuralları farklı:
#   GÖRÜNEN AD  : Türkçe harfleri ve boşluğu KORUR ("Ayşe Gül", "IŞIK")
#   KULLANICI ADI: yalnız a-z ve 0-9
#
# Kural: Türkçe harfler ASCII karşılığına çevrilir, boşluk ve diğer her şey
# SİLİNİR, sonuç küçük harfe indirilir.
#     "Ayşe Gül" -> aysegul   "Çağrı Öz" -> cagrioz   "Nazım" -> nazim
#     "IŞIK" / "Işık" / "ışık" -> hepsi ISIK DEĞİL, "isik"
#
# NEDEN ÇEVİRİP SİLMEK: eskiden Türkçe harfler tamamen atılıyordu ("Ayşe" -> "aye"),
# bu da tanınmaz kullanıcı adları üretiyordu.
#
# NEDEN BÜYÜK HARF YOK: aksi hâlde "Yasemin" ve "yasemin" iki AYRI hesap olurdu.
# Gerçekten yaşandı (iki test hesabı) — bu yüzden hem üretim hem de benzersizlik
# kontrolü küçük harf üzerinden yürür.
#
# BU TEK FONKSİYON HER YERDE KULLANILIR: isimden türetme, kullanıcı adı
# değiştirme, Google ile kayıt, e-posta ile kayıt. Başka bir yerde kendi
# temizliğini yazma.
TR_TO_ASCII = str.maketrans({
    "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ı": "i", "I": "i", "İ": "i",
    "ö": "o", "Ö": "o", "ş": "s", "Ş": "s", "ü": "u", "Ü": "u",
})


def slugify_username(raw: str) -> str:
    """Serbest bir metni kullanıcı adı alfabesine (a-z, 0-9) indirger.

    Uzunluk KONTROL ETMEZ; boş dönebilir (ör. metin yalnız emoji ise). Çağıran
    taraf buna karar verir: ilk isim ekranı hata gösterir, otomatik hesap açan
    yollar 'oyuncu'ya düşer.

    DİKKAT — sıra önemli: önce Türkçe harfler çevrilir, SONRA küçük harfe inilir.
    Ters sırada "İ".lower() Python'da "i̇" (i + birleşen nokta) üretir ve nokta
    ayrı bir karakter olduğu için sonraki temizlikte tuhaf sonuçlar çıkar.
    """
    text = (raw or "").translate(TR_TO_ASCII).lower()
    return re.sub(r"[^a-z0-9]", "", text)


def is_valid_username(name: str) -> bool:
    """Kullanıcı adı bugünkü karakter kuralına uyuyor mu? (a-z, 0-9)"""
    return bool(name) and bool(USERNAME_CHARS_RE.match(name))


class NameError_(ValueError):
    """Kullanıcıya gösterilecek Türkçe hata mesajı taşır."""


async def limits(db: AsyncSession) -> dict:
    """Geçerli limitler — ayarlardan okunur, mantıksız değerler düzeltilir."""
    u_min = await settings_service.get_int(db, "username_min_len", 3)
    u_max = await settings_service.get_int(db, "username_max_len", 20)
    d_min = await settings_service.get_int(db, "display_name_min_len", 2)
    d_max = await settings_service.get_int(db, "display_name_max_len", 24)
    u_min = max(1, min(u_min, USERNAME_HARD_MAX))
    u_max = max(u_min, min(u_max, USERNAME_HARD_MAX))
    d_min = max(1, min(d_min, DISPLAY_HARD_MAX))
    d_max = max(d_min, min(d_max, DISPLAY_HARD_MAX))
    return {
        "username_min_len": u_min,
        "username_max_len": u_max,
        "display_name_min_len": d_min,
        "display_name_max_len": d_max,
    }


async def clean_username(db: AsyncSession, raw: str) -> str:
    """Kullanıcı adını KURALA ÇEVİRİR ve döner. Hatada NameError_.

    Reddetmek yerine çevirir: kullanıcı "Yasemin_123" yazsa da "yasemin123"
    kaydedilir. Böylece herkes aynı alfabede kalır ve "Yasemin" ile "yasemin"in
    iki ayrı hesap olması mümkün olmaz. Arayüz, yazarken sonucun ne olacağını
    gösterir (ProfileEditModal), yani kimse sürprizle karşılaşmaz.

    Yalnız çevirdikten SONRA hiçbir geçerli karakter kalmadıysa ya da uzunluk
    sınırların dışındaysa hata verilir.
    """
    typed = (raw or "").strip()
    if not typed:
        raise NameError_("Kullanıcı adı boş olamaz.")

    name = slugify_username(typed)
    lim = await limits(db)
    lo, hi = lim["username_min_len"], lim["username_max_len"]
    if not name:
        raise NameError_(
            "Kullanıcı adı en az bir harf ya da rakam içermeli "
            "(yalnız küçük harf a-z ve rakam kullanılır)."
        )
    if len(name) < lo:
        raise NameError_(
            f"Kullanıcı adı en az {lo} karakter olmalı "
            f"(“{typed}” → “{name}”, {len(name)} karakter)."
        )
    if len(name) > hi:
        raise NameError_(f"Kullanıcı adı en fazla {hi} karakter olabilir (girilen: {len(name)}).")
    return name


async def clean_display_name(db: AsyncSession, raw: str) -> str:
    """Görünen adı doğrular ve temizlenmiş halini döner. Hatada NameError_."""
    name = " ".join((raw or "").split())   # baş/son boşluk + çoklu boşluk temizliği
    lim = await limits(db)
    lo, hi = lim["display_name_min_len"], lim["display_name_max_len"]
    if not name:
        raise NameError_("Görünen ad boş olamaz.")
    if len(name) < lo:
        raise NameError_(f"Görünen ad en az {lo} karakter olmalı (girilen: {len(name)}).")
    if len(name) > hi:
        raise NameError_(f"Görünen ad en fazla {hi} karakter olabilir (girilen: {len(name)}).")
    return name
