"""
Sayfa SEO modeli.

Her sayfa için başlık (title), açıklama (description), anahtar kelimeler ve
paylaşım görseli (og:image) tutulur. Varsayılan metinler bu dosyada KODDA
gömülüdür (SEO_PAGES); admin panelinden düzenlenirse DB'deki değer geçerli olur.
Boş bırakılan alan varsayılana döner.

Görsel içeriği doğrudan veritabanında base64 olarak saklanır (sound_asset ve
music_track ile aynı yaklaşım) — disk volume gerekmez, deploy'da kaybolmaz.

Özel anahtarlar:
- "default" : og görseli olmayan tüm sayfalar için yedek paylaşım görseli.
- "favicon" : sitenin favicon.ico dosyası (başlık/açıklama kullanılmaz).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

SITE_NAME = "Kelime Tahmin"

# Sayfa tanımları ve VARSAYILAN SEO metinleri.
#   key         : DB anahtarı (frontend generateMetadata bu anahtarla çeker)
#   path        : site içi yol (sitemap + canonical için)
#   label       : admin panelinde görünen ad
#   indexable   : arama motorları indexlesin mi (kişisel sayfalarda False)
#   priority    : sitemap önceliği
SEO_PAGES: list[dict] = [
    {
        "key": "home",
        "path": "/",
        "label": "Ana Sayfa",
        "indexable": True,
        "priority": 1.0,
        "title": "Kelime Tahmin Oyunu — Online Kelime Tahmin Maçları",
        "description": (
            "Karşılıklı kelime tahmin oyunu oyna! Gerçek rakiplerle online kelime tahmin "
            "maçları yap, arenada yarış, ligde kupa ve rozet kazan. Ücretsiz ve üyeliksiz başla."
        ),
        "keywords": "kelime tahmin oyunu, online kelime oyunu, kelime düellosu, türkçe kelime oyunu, kelime bulmaca",
    },
    {
        "key": "duel",
        "path": "/oyna",
        "label": "1v1 Düello (/oyna)",
        "indexable": True,
        "priority": 0.9,
        "title": "1v1 Kelime Düellosu — Rakibinle Karşılıklı Kelime Tahmini",
        "description": (
            "Gerçek rakiplerle sıra tabanlı 1v1 kelime düellosu oyna. Rakip bul, arkadaşını "
            "özel odaya davet et ya da bota karşı pratik yap. Kazandıkça puan ve unvan topla."
        ),
        "keywords": "1v1 kelime oyunu, kelime düellosu, karşılıklı kelime tahmin, online kelime maçı",
    },
    {
        "key": "arena",
        "path": "/arena",
        "label": "Arena (/arena)",
        "indexable": True,
        "priority": 0.9,
        "title": "Kelime Arenası — 5 Kişilik Hızlı Kelime Yarışı",
        "description": (
            "5 kişilik arenada kelime tahmin yarışı! En hızlı doğru cevabı ver, podyuma çık, "
            "şampiyonluk kupası ve XP kazan. Her an yeni bir arena başlıyor."
        ),
        "keywords": "kelime arenası, çok kişili kelime oyunu, hızlı kelime yarışı, online kelime yarışması",
    },
    {
        "key": "custom_arena",
        "path": "/arena/ozel",
        "label": "Özel Arena (/arena/ozel)",
        "indexable": True,
        "priority": 0.6,
        "title": "Özel Arena Kur — Arkadaşlarınla Kelime Yarışı",
        "description": (
            "Kendi arenani kur, kodu paylaş, arkadaşlarınla kelime tahmin yarışı yap. "
            "Kelime uzunluklarını sen seç, herkes aynı anda yarışsın."
        ),
        "keywords": "özel arena, arkadaşlarla kelime oyunu, oda kur kelime yarışı",
    },
    {
        "key": "solo",
        "path": "/solo",
        "label": "Maraton (/solo)",
        "indexable": True,
        "priority": 0.8,
        "title": "Maraton — Bölüm Bölüm Kelime Tahmin Oyunu",
        "description": (
            "Tek başına oyna! Maraton modunda bölümleri sırayla geç, her bölümde zorlaşan "
            "kelimeleri çöz ve rekorunu kır."
        ),
        "keywords": "tek kişilik kelime oyunu, kelime maratonu, bölümlü kelime oyunu, solo kelime tahmin",
    },
    {
        "key": "daily",
        "path": "/gunun-kelimesi",
        "label": "Günün Kelimesi (/gunun-kelimesi)",
        "indexable": True,
        "priority": 0.9,
        "title": "Günün Kelimesi — Her Gün Yeni Türkçe Kelime Bulmacası",
        "description": (
            "Her gün yeni bir Türkçe kelime! Günün kelimesini en az denemede bul, skorunu "
            "arkadaşlarınla paylaş ve günlük seride kal."
        ),
        "keywords": "günün kelimesi, günlük kelime bulmaca, türkçe wordle, günlük kelime oyunu",
    },
    {
        "key": "league",
        "path": "/lig",
        "label": "Lig (/lig)",
        "indexable": True,
        "priority": 0.8,
        "title": "Lig ve Sıralamalar — Günlük, Aylık ve Tüm Zamanlar",
        "description": (
            "Kelime Tahmin ligi: günlük, aylık ve tüm zamanlar sıralamaları. Zirveye tırman, "
            "kupa ve madalya kazan, adını listenin başına yaz."
        ),
        "keywords": "kelime oyunu ligi, sıralama, liderlik tablosu, kelime tahmin puan tablosu",
    },
    {
        "key": "league_archive",
        "path": "/lig/arsiv",
        "label": "Lig Arşivi (/lig/arsiv)",
        "indexable": True,
        "priority": 0.5,
        "title": "Lig Arşivi — Geçmiş Dönem Şampiyonları",
        "description": "Geçmiş günlerin ve ayların lig şampiyonları, kupa ve madalya sahipleri.",
        "keywords": "lig arşivi, geçmiş şampiyonlar, kelime oyunu kupaları",
    },
    {
        "key": "login",
        "path": "/giris",
        "label": "Giriş / Üye Ol (/giris)",
        "indexable": True,
        "priority": 0.5,
        "title": "Giriş Yap veya Ücretsiz Üye Ol",
        "description": (
            "Ücretsiz üye ol; puanların, kupaların ve rozetlerin kayıtlı kalsın. "
            "Google ile tek tıkla giriş yapabilirsin."
        ),
        "keywords": "kelime tahmin giriş, ücretsiz üyelik, kayıt ol",
    },
    {
        # Hızlı Giriş ile açılan hesabın e-posta+şifre eklediği sayfa.
        # indexable=False: kişiye özel bir işlem ekranı, aramada çıkmasın.
        "key": "verify",
        "path": "/dogrula",
        "label": "Profili Doğrula (/dogrula)",
        "indexable": False,
        "priority": 0.2,
        "title": "Profili Doğrula ve Kaydet",
        "description": (
            "E-posta ve şifre ekleyerek hesabını kalıcı hâle getir; "
            "başka bir cihazda da aynı ilerlemeyle oyna."
        ),
        "keywords": "hesap doğrulama, hesabımı kaydet, kelime tahmin hesap",
    },
    {
        "key": "how",
        "path": "/nasil-oynanir",
        "label": "Nasıl Oynanır (/nasil-oynanir)",
        "indexable": True,
        "priority": 0.7,
        "title": "Nasıl Oynanır — Kelime Tahmin Oyunu Kuralları",
        "description": (
            "Kelime Tahmin nasıl oynanır? 1v1 düello, arena, maraton ve günün kelimesi "
            "modlarının kuralları, joker ve puanlama sistemi adım adım anlatılıyor."
        ),
        "keywords": "kelime tahmin nasıl oynanır, oyun kuralları, kelime oyunu rehberi",
    },
    {
        "key": "about",
        "path": "/hakkimizda",
        "label": "Hakkımızda (/hakkimizda)",
        "indexable": True,
        "priority": 0.6,
        "title": "Hakkımızda — Kelime Tahmin Oyunu",
        "description": (
            "Kelime Tahmin kimin, neden ve nasıl yaptığı bir oyun? Türkçe kelime düellosunun "
            "hikâyesi, oyun modları ve bize ulaşabileceğin adres."
        ),
        "keywords": "kelime tahmin hakkında, hakkımızda, türkçe kelime oyunu ekibi",
    },
    {
        "key": "contact",
        "path": "/iletisim",
        "label": "İletişim (/iletisim)",
        "indexable": True,
        "priority": 0.5,
        "title": "İletişim — Kelime Tahmin",
        "description": (
            "Kelime Tahmin ekibine ulaş: hesap ve oyun sorunları, öneriler, iş birliği ve "
            "reklam talepleri için iletişim formu."
        ),
        "keywords": "kelime tahmin iletişim, destek, bize ulaşın, öneri",
    },
    {
        "key": "support",
        "path": "/destek",
        "label": "Destek Taleplerim (/destek)",
        "indexable": False,
        "priority": 0.2,
        "title": "Destek Taleplerim",
        "description": "Açtığın destek taleplerini görüntüle, ekibin yanıtlarını oku ve yazışmayı sürdür.",
        "keywords": "",
    },
    {
        "key": "profile",
        "path": "/profil",
        "label": "Oyuncu Profili (/profil/...)",
        "indexable": True,
        "priority": 0.4,
        "title": "Oyuncu Profili",
        "description": (
            "Oyuncunun istatistikleri: maç sayısı, galibiyet oranı, puanı, unvanı, "
            "kupaları ve rozetleri."
        ),
        "keywords": "oyuncu profili, kelime oyunu istatistikleri",
    },
    {
        "key": "history",
        "path": "/gecmis",
        "label": "Maç Geçmişi (/gecmis)",
        "indexable": False,
        "priority": 0.3,
        "title": "Maç Geçmişim",
        "description": "Oynadığın maçların sonuçları, kazandığın puanlar ve rakiplerin.",
        "keywords": "",
    },
    {
        "key": "notifications",
        "path": "/bildirimler",
        "label": "Bildirimler (/bildirimler)",
        "indexable": False,
        "priority": 0.2,
        "title": "Bildirimler",
        "description": "Arkadaşlık istekleri, yeni unvanlar ve arena ödüllerin.",
        "keywords": "",
    },
    {
        "key": "friends",
        "path": "/arkadaslar",
        "label": "Arkadaşlarım (/arkadaslar)",
        "indexable": False,
        "priority": 0.2,
        "title": "Arkadaşlarım",
        "description": "Arkadaşlarını aile / iş / diğer diye etiketle, listeni düzenle.",
        "keywords": "",
    },
    {
        "key": "member_search",
        "path": "/uye-ara",
        "label": "Üye Ara (/uye-ara)",
        # Etkileşim gerektiren araç sayfası — dizine girecek içeriği yok.
        "indexable": False,
        "priority": 0.2,
        "title": "Üye Ara",
        "description": "Kullanıcı adına göre üye ara, arkadaş ekle.",
        "keywords": "",
    },
    {
        "key": "announcements",
        "path": "/duyurular",
        "label": "Duyurular (/duyurular)",
        "indexable": True,
        "priority": 0.5,
        "title": "Duyurular — Kelime Tahmin Haberleri",
        "description": "Kelime Tahmin'deki yenilikler, güncellemeler ve etkinlik duyuruları.",
        "keywords": "kelime tahmin duyuru, kelime oyunu haberleri, güncellemeler",
    },
    {
        "key": "notification_settings",
        "path": "/ayarlar/bildirimler",
        "label": "Bildirim Ayarları (/ayarlar/bildirimler)",
        "indexable": False,
        "priority": 0.2,
        "title": "Bildirim Ayarları",
        "description": "Hangi bildirimler için push almak istediğini seç, sessiz saatleri ayarla.",
        "keywords": "",
    },
    {
        "key": "menu",
        "path": "/menu",
        "label": "Menü (/menu)",
        "indexable": False,
        "priority": 0.2,
        "title": "Menü",
        "description": "Ayarlar, profil, lig ve diğer bölümlere hızlı erişim.",
        "keywords": "",
    },
    {
        "key": "privacy",
        "path": "/gizlilik",
        "label": "Gizlilik Politikası (/gizlilik)",
        "indexable": True,
        "priority": 0.3,
        "title": "Gizlilik Politikası ve KVKK Aydınlatma Metni",
        "description": (
            "Kelime Tahmin'de hangi kişisel verilerin işlendiğini, ne amaçla kullanıldığını, "
            "ne kadar saklandığını ve KVKK kapsamındaki haklarınızı açıklar."
        ),
        "keywords": "gizlilik politikası, kişisel veri, kvkk",
    },
    {
        "key": "terms",
        "path": "/kosullar",
        "label": "Kullanım Koşulları (/kosullar)",
        "indexable": True,
        "priority": 0.3,
        "title": "Kullanım Koşulları",
        "description": (
            "Kelime Tahmin'i kullanırken geçerli olan kurallar: hesap, adil oyun, yasak davranışlar, "
            "fikri mülkiyet, sorumluluk ve hesap kapatma."
        ),
        "keywords": "kullanım koşulları, kullanıcı sözleşmesi",
    },
    {
        "key": "cookies",
        "path": "/cerez",
        "label": "Çerez Politikası (/cerez)",
        "indexable": True,
        "priority": 0.3,
        "title": "Çerez Politikası",
        "description": (
            "Kelime Tahmin'in tarayıcınızda hangi bilgileri sakladığı, neden sakladığı ve "
            "bunları nasıl temizleyebileceğiniz."
        ),
        "keywords": "çerez politikası, cookie",
    },
    {
        "key": "default",
        "path": "",
        "label": "★ Genel (görseli olmayan tüm sayfalar)",
        "indexable": False,
        "priority": 0.0,
        "title": "Kelime Tahmin — Online Kelime Tahmin Oyunu",
        "description": (
            "Karşılıklı kelime tahmin oyunu. Rakip bul, arenada yarış, ligde kupa kazan."
        ),
        "keywords": "kelime tahmin oyunu, online kelime oyunu",
    },
    {
        "key": "favicon",
        "path": "",
        "label": "★ Favicon (sekme ikonu, .ico/.png)",
        "indexable": False,
        "priority": 0.0,
        "title": "",
        "description": "",
        "keywords": "",
    },
]

SEO_BY_KEY: dict[str, dict] = {p["key"]: p for p in SEO_PAGES}
# Görsel dışında metin alanı olmayan özel anahtarlar.
IMAGE_ONLY_KEYS = {"favicon"}


class SeoPage(Base):
    __tablename__ = "seo_pages"

    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    # Boş/NULL ise koddaki varsayılan kullanılır.
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    keywords: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Paylaşım görseli (og:image) — base64.
    image_b64: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_mime: Mapped[str | None] = mapped_column(String(64), nullable=True)
    image_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
