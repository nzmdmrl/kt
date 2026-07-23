"""
Uygunsuz kelime kara listesi (küfür, argo, hakaret, müstehcen).

Havuz üretiminde ve tur hedef seçiminde bu kelimeler dışlanır. Admin panel
(Faz 10) bu listeye ekleme/çıkarma yapabilecek. Aile dostu bir oyun için gerekli.
"""

BLACKLIST = set("""
KALTAK OROSPU KAHPE PEZEVENK GAVAT PUŞT İBNE YAVŞAK
GÖT GÖTÜ SİKİ SİK AMI TAŞAK
ANANI AVRAT ZIKKIM BOK BOKU
PISLIK PIÇ PİÇ SÜRTÜK FAHİŞE
DALYARAK YARAK YARRAK GERİZEKALI
""".split())


def is_blacklisted(word: str) -> bool:
    return word.upper() in BLACKLIST
