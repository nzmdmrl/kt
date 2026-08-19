"""
Rezerve kullanıcı adları — kimsenin alamayacağı adlar.

NEDEN VAR
---------
"admin", "destek", "kelimetahmin" gibi adlar birinin eline geçerse o kişi
yetkili ya da resmî hesap gibi görünür. Oyun içi mesajlarda, arkadaş
listesinde ve profil adresinde (kelimetahmin.com/profil/admin) bu ciddi bir
güven sorunudur.

KODA GÖMÜLMEZ — liste veritabanındadır ve admin panelinden yönetilir
(🔒 Rezerve Adlar sekmesi). Tablo BOŞSA başlangıç listesi bir kez seed edilir;
admin sonradan sildiyse seed onu geri getirmez.

SAKLAMA BİÇİMİ
--------------
`name` her zaman NORMALLEŞTİRİLMİŞ hâlde tutulur (slugify_username):
küçük harf, Türkçe harfler çevrilmiş, yalnız a-z ve 0-9.
Böylece "ADMIN", "Admin", "admın", "A d m i n" hepsi aynı kayda düşer.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ReservedUsername(Base):
    __tablename__ = "reserved_usernames"

    # Normalleştirilmiş ad — birincil anahtar, bu yüzden tekrarı imkânsız.
    name: Mapped[str] = mapped_column(String(32), primary_key=True)
    # Neden rezerve edildiği (panelde gösterilir).
    note: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# Başlangıç listesi — YALNIZCA tablo boşken seed edilir.
# (ad, gerekçe)
DEFAULT_RESERVED: list[tuple[str, str]] = [
    # --- yetki / yönetim taklidi
    ("admin", "Yetkili taklidi"),
    ("admins", "Yetkili taklidi"),
    ("administrator", "Yetkili taklidi"),
    ("superadmin", "Yetkili taklidi"),
    ("yonetici", "Yetkili taklidi"),
    ("yoneticiler", "Yetkili taklidi"),
    ("yonetim", "Yetkili taklidi"),
    ("moderator", "Yetkili taklidi"),
    ("mod", "Yetkili taklidi"),
    ("mods", "Yetkili taklidi"),
    ("root", "Yetkili taklidi"),
    # --- sistem / altyapı
    ("sistem", "Sistem hesabı taklidi"),
    ("system", "Sistem hesabı taklidi"),
    ("sunucu", "Sistem hesabı taklidi"),
    ("server", "Sistem hesabı taklidi"),
    ("bot", "Otomatik hesap taklidi"),
    ("bots", "Otomatik hesap taklidi"),
    ("robot", "Otomatik hesap taklidi"),
    # --- marka
    ("kelimetahmin", "Site adı"),
    ("kelimetahmincom", "Site adı"),
    # --- destek / iletişim
    ("destek", "Resmî kanal taklidi"),
    ("support", "Resmî kanal taklidi"),
    ("yardim", "Resmî kanal taklidi"),
    ("help", "Resmî kanal taklidi"),
    ("iletisim", "Resmî kanal taklidi"),
    ("contact", "Resmî kanal taklidi"),
    ("info", "Resmî kanal taklidi"),
    ("bilgi", "Resmî kanal taklidi"),
    ("guvenlik", "Resmî kanal taklidi"),
    ("security", "Resmî kanal taklidi"),
    # --- resmiyet iddiası
    ("resmi", "Resmiyet iddiası"),
    ("official", "Resmiyet iddiası"),
    ("dogrulanmis", "Resmiyet iddiası"),
    ("verified", "Resmiyet iddiası"),
    # --- adres/teknik çakışması
    # "me" gerçek bir sorundu: /profil/me isteği WHERE username='me' sorgusuna
    # düşüyordu (bkz. app/api/routes/friends.py notu).
    ("me", "Adres çakışması"),
    ("api", "Adres çakışması"),
    ("www", "Adres çakışması"),
    ("null", "Teknik değer"),
    ("undefined", "Teknik değer"),
    ("none", "Teknik değer"),
    # --- sistemin kendi ürettiği adlar
    ("silinmisuye", "Silinen hesaplar için ayrılmış"),
    ("misafir", "Eski misafir kavramı"),
    ("guest", "Eski misafir kavramı"),
    ("anonim", "Kimliksiz hesap izlenimi"),
    ("anonymous", "Kimliksiz hesap izlenimi"),
]
