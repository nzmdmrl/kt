"""
Düzenlenebilir sayfa içerikleri (Hakkımızda, Nasıl Oynanır …).

Metin DB'de durur, admin panelinden (📄 Sayfalar) düzenlenir. Tabloda kayıt
yoksa buradaki VARSAYILAN içerik kullanılır ve başlangıçta bir kez seed edilir
(SEO_PAGES ile aynı yaklaşım).

Gövde biçimi — sade markdown alt kümesi (frontend'de PageBody bileşeni basar):
  ## Başlık        -> ara başlık
  - madde          -> liste
  **kalın**        -> kalın
  [metin](adres)   -> bağlantı
  boş satır        -> yeni paragraf
HTML kabul edilmez (istemciye ham HTML basılmaz).

NOT: Yasal sayfalar (Gizlilik, Kullanım Koşulları, Çerez) bilerek burada DEĞİL —
onlar madde numaraları ve iç bağlantılarıyla kod içinde tutuluyor.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, Text, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SitePage(Base):
    __tablename__ = "site_pages"

    key: Mapped[str] = mapped_column(String(48), primary_key=True)
    title: Mapped[str] = mapped_column(String(160), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    # Admin bu sayfayı bir kez kaydettiyse True olur. False kaldığı sürece
    # koddaki varsayılan metin her açılışta satıra kopyalanır — böylece kod
    # tarafındaki metin düzeltmeleri canlıya yansır, ADMİN DÜZENLEMESİ EZİLMEZ.
    is_edited: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


ABOUT_BODY = """\
Kelime Tahmin, Türkçenin en keyifli hâlini bir oyuna sığdırma fikrinden doğdu.
Amacımız basitti: kelime bulmacalarının o tanıdık tadını alıp, karşına gerçek
bir rakip koymak. Tek başına çözülen sessiz bir bulmaca yerine; nefesini
tuttuğun, son saniyede parmaklarının hızlandığı, kazanınca sesli güldüğün bir
oyun.

## Nasıl bir oyun?

Her turda gizli bir kelime var. Harfler renkleniyor: yeşil doğru yerde, sarı
kelimede var ama başka yerde, gri yok. Buraya kadarı tanıdık. Farkı yaratan
şey ise **sıra**: kim önce yazmaya başlarsa söz hakkı onda oluyor, bilemezse
sıra rakibe geçiyor. Böylece oyun bir bulmacadan çok bir düelloya dönüşüyor.

- **1v1 Düello** — rakip bul, arkadaşını odaya davet et ya da bota karşı çalış.
- **Arena** — beş kişilik hız yarışı; en hızlı doğru cevap kazanır.
- **Maraton** — bölüm bölüm ilerleyen tek kişilik mod, her bölüm biraz daha zor.
- **Günün Kelimesi** — herkese aynı kelime, günde bir hak.
- **Lig** — günlük, aylık ve tüm zamanlar sıralamaları; kupalar, madalyalar,
  rozetler ve yükseldikçe açılan unvanlar.

## Neye önem veriyoruz?

**Türkçe önce gelir.** Kelime havuzu elden geçirilmiş Türkçe kelimelerden
oluşuyor; "ı/İ" ayrımından harf sıralamasına kadar her şey Türkçeye göre
kurgulandı. Çeviri bir oyun değil, baştan Türkçe düşünülmüş bir oyun oynuyorsun.

**Adil oyun.** Puan, hızlı ve doğru oynayanı ödüllendirir. Günlük ligde günün en
iyi maçın sayılır — bütün gün oynayıp sıralamayı doldurmak diye bir şey yok.

**Hız ve sadelik.** Oyun tarayıcıda anında açılır, kurulum istemez. Üye olmadan
da oynayabilirsin; üye olursan puanların, rozetlerin ve geçmişin kayıtlı kalır.

**Reklam dengesi.** Oyunu ücretsiz tutabilmek için reklam gösteriyoruz ama
oyunun ortasına giren, akışı bozan hiçbir şey koymuyoruz.

## Kimiz?

Kelime Tahmin, küçük bir ekibin işi. Oyunu oynayarak geliştiriyoruz: yeni bir
mod eklediğimizde önce kendimiz oynuyor, hızını ve dengesini oyuncu geri
bildirimleriyle ayarlıyoruz. Gördüğün her ayrıntı — kutu çevirme sesinden lig
ödüllerine kadar — bu döngüden geçti.

## Bize yazın

Bir fikrin, eksik gördüğün bir kelime ya da bir hata mı var? Yazmaktan çekinme:
[iletisim@kelimetahmin.com](mailto:iletisim@kelimetahmin.com). Gelen her mesajı
okuyoruz; oyunun bugünkü hâlinin büyük kısmı zaten oyunculardan gelen fikirlerle
şekillendi.

Kelimelerle iyi eğlenceler — sıra sende.
"""

HOW_BODY = """\
Bu sayfadaki renk demosu ve mod kartları oyunun kendisinden gelir; aşağıdaki
bölümde ise sık sorulan ayrıntıları bulacaksın.

## Puan nasıl hesaplanır?

Turu kazanmak tek başına yetmez — **ne kadar hızlı** bulduğun da sayılır. Kelimeyi
erken bilen oyuncu kalan süreye göre ek puan alır, ilk buzzer'a basan hız bonusu
kazanır. Maç sonunda puanın ELO'na ve lig sıralamana işlenir.

## Jokerler ne işe yarar?

Sıkıştığında üç joker imdadına yetişir: bir harfi **yeşil** olarak açan joker,
kelimede geçen bir harfi **sarı** olarak gösteren joker ve sana birkaç saniye
kazandıran **süre** jokeri. Her maçta sınırlı sayıda kullanılır; yönetici
ayarlarına göre sayıları değişebilir.

## Misafir olarak oynayabilir miyim?

Evet. Üye olmadan 1v1 maç yapabilir, günün kelimesini çözebilirsin. Ancak puan,
rozet, unvan ve lig sıralaması yalnızca üyelerde birikir — ücretsiz üyelikle
ilerlemen kayıt altına alınır.

## Sesli cevap nasıl çalışır?

Klavye yerine mikrofon düğmesine basılı tut ve kelimeyi söyle; söylediğin kelime
kutucuklara yazılır, onaylayıp gönderirsin. Tarayıcının ses tanımayı desteklemesi
gerekir (Chrome ve Safari'de çalışır).

## Rakip bulamazsam ne olur?

Kısa bir bekleme sonunda seninle aynı seviyede bir bot devreye girer; maç yarıda
kalmaz. Arenada da eksik kalan yerler botlarla doldurulur.

## Bağlantım koparsa?

Kısa kopmalarda oyuna geri dönebilirsin. Maçı sürekli terk edersen kısa süreli
eşleşme engeli uygulanır — rakipleri yarı yolda bırakmamak için.
"""

# Panelde listelenen düzenlenebilir sayfalar.
DEFAULT_PAGES = [
    {
        "key": "hakkimizda",
        "label": "Hakkımızda",
        "path": "/hakkimizda",
        "title": "Hakkımızda",
        "body": ABOUT_BODY,
    },
    {
        "key": "nasil-oynanir",
        "label": "Nasıl Oynanır?",
        "path": "/nasil-oynanir",
        "title": "Nasıl Oynanır?",
        "body": HOW_BODY,
    },
]

PAGE_META = {p["key"]: p for p in DEFAULT_PAGES}
