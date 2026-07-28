"""
Member (üyeye sorulacak) havuzundan çekimli / birleşik / türemiş kelimeleri ayıklar.

Amaç: "birisi", "birçok", "alma", "bakma", "bana", "adına" gibi çekim/birleşim
yapıları hedef havuzundan çıkarmak; saf kök kelimeleri (kitap, deniz, anne) bırakmak.

member=False yapılır (üyeye sorulmaz) ama bot=True ve kabul korunur (yazılırsa geçerli).

Yaklaşım: kural tabanlı sezgisel. Türkçe morfoloji analizi yapmadan, en sık çekim
son eklerini ve bilinen birleşik/zamir listesini kullanır. Yanlışlıkla kök silmemek
için KORU listesi ve muhafazakâr kurallar var.
"""

from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"

# Kesin çıkar: bilinen birleşik / zamir / belirteç çekimleri (net kök değil).
BLACKLIST = {
    "BİRİSİ", "BİRÇOK", "BİRKAÇ", "HİÇBİR", "HERKES", "HERKESİN",
    "BUNLAR", "ŞUNLAR", "ONLAR", "BİZLER", "SİZLER",
    "BANA", "SANA", "ONA", "BENİ", "SENİ", "ONU", "BİZE", "SİZE",
    "BUNA", "ŞUNA", "BUNU", "ŞUNU", "BUNUN", "ŞUNUN", "ONUN",
    "BENİM", "SENİN", "BİZİM", "SİZİN",
    "NASIL", "NİÇİN", "NEDEN", "NEREYE", "NEREDE", "NEREDEN",
    "KENDİ", "KENDİM", "KENDİNE", "KENDİNİ",
    "ADINA", "ADIMA", "YERİNE", "ÜZERE", "ÜZERİNE", "HAKKINDA",
    "BÖYLE", "ŞÖYLE", "ÖYLE", "BÖYLECE",
}

# Bu kalıpla biten VE çekim olma ihtimali yüksek olanlar çıkarılır,
# AMA bu köklerle biten gerçek kökler KORU'da tutulur.
KORU = {
    # -ma/-me ile biten ama KÖK olan kelimeler (çekim değil)
    "ELMA", "YÜZME", "KREMA", "SİNEMA", "LOKMA", "HURMA", "FIRMA", "NORMA",
    "DRAMA", "PLAZMA", "MAGMA", "VİRGÜL",
    # -a/-e ile biten kökler
    "BABA", "ANNE", "AMCA", "HALA", "TEYZE", "DAYE", "NİNE", "DEDE",
    "MASA", "KAPA", "ARABA", "ELMA", "OKA", "ÇANTA", "SOBA", "LAMBA",
    "DAKİKA", "HAFTA", "AKRABA", "DÜNYA", "DAVA", "PARA", "YARA", "SIRA",
    "KALE", "LALE", "İLE", "AİLE", "GECE", "BAHÇE", "PERDE", "MADDE",
    "KEDE", "ÜLKE", "ölke", "TÜRKÇE", "BÖLGE", "İLÇE",
    # -na ile biten kök
    "ANA", "SAHNE", "DÜNYA",
    # -cak/-cek kökleri (varsa)
    "ANCAK", "BEBEK", "ÇİÇEK", "GERÇEK", "YÜREK", "KELEBEK",
    # -lar/-ler kökleri
    "PARLAK", "KILAR",
    # -me/-ma ile biten ama KÖK olan kelimeler
    "KELİME", "İKLİME", "REJİME", "SİSTEME",
    # -tan/-ten ile biten kökler (ayrılma eki değil)
    "KAPTAN", "VATAN", "ÇOBAN", "LİMAN", "ORMAN", "DÜKKAN", "ROMAN",
    "SULTAN", "MEYDAN", "İNSAN", "ZAMAN", "DÜŞMAN", "KURBAN", "ŞEYTAN", "KAFTAN",
    # -nun/-nın ile biten kökler (tamlayan değil)
    "MEMNUN", "OYUN", "BURUN", "KOYUN", "YORGUN", "OLGUN", "UZUN",
    # -sı/-si ile biten kökler (iyelik değil)
    "TERSİ", "DERSİ", "NAKSİ",
    # zarflar - sorulabilir kökler
    "DAİMA", "SAÇMA", "OLASI",
}

# Çekim olduğunu güçlü gösteren son ekler (kelime bu ekle bitiyorsa ve KORU'da
# değilse VE eki attığında makul bir kök kalıyorsa -> çekimli say).
# Sıra önemli: uzun ekler önce.
INFLECTION_SUFFIXES = [
    "ACAK", "ECEK",              # gelecek zaman / sıfat-fiil (ALACAK, GELECEK)
    "MASI", "MESI", "MASİ", "MESİ",
    "LARI", "LERİ", "LARİ", "LERI",
    "INCA", "İNCE", "UNCA", "ÜNCE",
    "DIĞI", "DİĞİ", "DUĞU", "DÜĞÜ",
    "MAK", "MEK",               # mastar (BAKMAK)
    "MA", "ME",                 # fiil-isim (ALMA, BAKMA, ARAMA, ANLAMA)
    "LAR", "LER",               # çoğul (EVLER)
    "DAN", "DEN", "TAN", "TEN", # ayrılma
    "NIN", "NİN", "NUN", "NÜN", # tamlayan
    "SI", "Sİ", "SU", "SÜ",     # iyelik 3. tekil (ARABASI)
]


def strip_suffix(word: str):
    """Kelime bir çekim ekiyle bitiyorsa (kök, ek) döner; değilse None."""
    for suf in INFLECTION_SUFFIXES:
        if word.endswith(suf) and len(word) - len(suf) >= 3:
            return word[: -len(suf)], suf
    return None


def looks_inflected(word: str) -> bool:
    """Kelime çekimli/türemiş görünüyor mu? (muhafazakâr)"""
    if word in KORU:
        return False
    if word in BLACKLIST:
        return True
    res = strip_suffix(word)
    if not res:
        return False
    root, suf = res
    # Kök en az 3 harf olmalı ve bir sesli harf içermeli (makul kök).
    if len(root) < 3:
        return False
    if not any(v in root for v in "AEIİOÖUÜ"):
        return False
    # -MA/-ME için: özellikle fiil-isim; kök sonu sessizse fiil kökü olabilir -> çekim say.
    return True


def main() -> None:
    total_removed = 0
    for length in (4, 5, 6):
        path = DATA / f"tr_{length}_pool.json"
        items = json.loads(path.read_text(encoding="utf-8"))
        removed = []
        for it in items:
            if it.get("member") and looks_inflected(it["word"]):
                it["member"] = False   # üyeye sorulmaz
                # bot=True ve kabul korunur (dokunma)
                removed.append(it["word"])
        path.write_text(json.dumps(items, ensure_ascii=False, indent=0), encoding="utf-8")
        total_removed += len(removed)
        print(f"tr_{length}: {len(removed)} çekimli/birleşik kelime member'dan çıkarıldı.")
        if removed:
            print("   örnekler:", ", ".join(sorted(removed)[:25]))
    print(f"\nToplam {total_removed} kelime üyeye sorulmayacak (bot/kabul korundu).")


if __name__ == "__main__":
    main()
