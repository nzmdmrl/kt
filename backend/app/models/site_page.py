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

from sqlalchemy import String, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SitePage(Base):
    __tablename__ = "site_pages"

    key: Mapped[str] = mapped_column(String(48), primary_key=True)
    title: Mapped[str] = mapped_column(String(160), default="")
    body: Mapped[str] = mapped_column(Text, default="")
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
Kelime Tahmin, gerçek rakiplere karşı oynanan hızlı bir kelime düellosudur.
Amaç, gizli kelimeyi rakibinden önce bulmaktır.

## Temel kurallar

Her turda gizli bir kelime vardır; kelimenin ilk harfi ve kaç harfli olduğu
gösterilir. Bir kelime tahmin ettiğinde harfler renklenir: **yeşil** harf doğru
yerde, **sarı** harf kelimede var ama yanlış yerde, **gri** harf kelimede yok
demektir.

## Sıra ve buzzer

Tur başında sıra boştur — kim önce yazmaya başlarsa söz hakkı onda olur. Doğru
bilemezsen sıra rakibine geçer. Kelimeyi ilk bulan turu kazanır ve kalan süreye
göre puan alır.

## Sesli cevap

Klavyeyle yazmak yerine mikrofon düğmesine basılı tutup kelimeyi sesli
söyleyebilirsin. Söylediğin kelime kutucuklara yazılır, onaylayıp gönderirsin.
(Tarayıcının ses tanımayı desteklemesi gerekir.)

## Lig, rozet ve kupalar

Her maçta topladığın puan seni lig sıralamasında yükseltir. Günlük en iyi maçın
aylık toplamına eklenir. Dönem sonunda ilk üç oyuncu kupa ve madalya kazanır.
Oyun ilerledikçe rozetler ve yeni unvanlar açılır.

## Günün Kelimesi

Her gün herkese aynı özel kelime sunulur. Tek başına çözer, sonucunu
arkadaşlarınla paylaşırsın. Yarın yeni bir kelime gelir.
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
