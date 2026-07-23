# Kelime Tahmin — Proje Dokümanı v1.4 (FINAL)

**Marka Adı:** Kelime Tahmin
**Domain:** kelimetahmin.com
**Logo:** "KT" monogram
**Platform:** Web (VPS) + Android (WebView ile paketlenecek)
**Belge Durumu:** FINAL — açık soru yok, "başla" komutuyla üretime geçilecek.

---

## 1. Genel Bakış

İki kişinin karşılıklı, gerçek zamanlı oynadığı Türkçe kelime tahmin oyunu. Wordle mekaniği + buzzer (önce davranan tahmin eder) + lig/rozet/ödül sistemi. Önce VPS'te web olarak yayına alınacak, ardından WebView ile Android uygulamasına sarılacak.

Ana konsept: Rakip bul → 3 turluk kelime düellosu → puan kazan → ligde yarış → kupa/madalya/rozet topla.

---

## 2. Oynanış Mekaniği

### Maç Yapısı — 3 Tur
| Tur | Kelime Uzunluğu | Deneme (Satır) Sayısı |
|-----|-----------------|------------------------|
| 1   | 4 harf          | 5 satır                |
| 2   | 5 harf          | 6 satır                |
| 3   | 6 harf          | 7 satır                |

> Tüm bu değerler (harf sayısı, satır sayısı) admin panelden değiştirilebilir.

### Kelimeler
- Büyük harfle oluşur ve gösterilir.
- İlk harf açık başlar (örn. `K _ _ _`).
- Türkçede kullanılan, **isim olmayan**, herkesin bilebileceği mantıklı kelimeler.
- Kaynak: TDK Güncel Türkçe Sözlük verisinden filtrelenmiş (özel isim / argo / arkaik / teknik terim ayıklanmış).
- Türkçe harf duyarlılığı: İ/ı, ğ, ç, ş, ö, ü ve büyük/küçük harf dönüşümü doğru kurulacak.
- Her kurulum **tek bir oyun dili** için çalışır (arayüz diliyle karıştırılmamalı — bkz. Bölüm 19). Ana kurulum Türkçe kelime havuzuyla gelir; yeni domain kurulumunda oyun dili değiştirilip kelime üretilir.

### Izgara (Grid)
- **Paylaşımlı ızgara:** İki oyuncu da aynı grid'i ve renk ipuçlarını görür.
- Renk kodları: **Yeşil** = doğru harf doğru yerde, **Sarı** = harf var ama yanlış yerde, **Gri** = harf yok.

### Buzzer / Sıra Mantığı
1. Tur başlar, **60 saniyelik toplam tur sayacı** işler.
2. Oyunculardan biri klavyeye yazmaya başlar **veya** sesli cevap butonuna basar → buzzer o kişide kilitlenir, **10 saniyelik cevap penceresi** açılır.
3. Cevap grid'e düşer, renkler hesaplanır (her iki oyuncu da görür).
4. **Doğruysa:** tur sayacında kalan saniye kadar puan o oyuncuya yazılır, tur biter.
5. **Yanlışsa veya 10 sn'de cevap gelmezse:** sıra rakibe geçer (10 sn onun).
6. Satırlar bitene veya 60 sn dolana kadar sürer.

### Puanlama
- Doğru bilen, tur sayacında **kalan saniye kadar puan** alır (örn. 42. saniyede bilen 42 puan).
- Sadece doğru bilen puan alır → "bekleme" stratejisi doğal olarak cezalanır (beklersen rakip önce basıp alabilir).
- **Hız bonusu:** İlk buzzer'a basıp doğru bilene ek bonus (katsayısı admin panelden ayarlanır).
- **0-0 önleme:** İki taraf da bilemezse, doğru bilinen ama yanlış yerdeki (sarı) harf sayısı kadar teselli puanı eklenir.

### Aynı Anda Buzzer Çözümü
- Sunucu otoritesi: server timestamp'ine göre önce ulaşan kazanır.
- Redis atomic lock (`SET NX`) ile milisaniyelik yarış güvenli çözülür.

---

## 3. Oyun Modları

- **Düello (Online):** "Rakip Bul" → matchmaking. 15 sn içinde insan bulunamazsa bot devreye girer.
- **Solo:** Tek başına oynama. Solo skorlar **lige yazılmaz**, profilde ayrı panelde tutulur.

---

## 4. Matchmaking & Botlar

- Redis kuyruğu ile eşleştirme; ELO/MMR'a göre adil eşleşme.
- **100 hazır bot:** gerçekçi Türkçe isim + profil fotoğrafı (ana kurulum). İsimler seçili oyun/arayüz diline göre üretilir.
- Botlar insan gibi rastgele düşünme gecikmesi (2–8 sn) ve zorluk seviyesine göre bilme olasılığı taşır.
- Admin panelden: bot on/off, bot zorluk ayarı. İleride tamamen kapatılabilir.
- **Bot üretici (admin):** dile bağlı — dil seç + adet seç → o dile uygun gerçekçi isimlerle + avatarla bot üretir (bkz. Bölüm 19). Üretilen isimler gözden geçirilip düzenlenebilir; avatar havuzu admin'den yönetilir.

### Bot ELO & Davranış Simülasyonu
- Her botun bir **ELO/MMR** değeri vardır. Matchmaking, oyuncunun ELO'suna yakın botu seçer (düşük ELO oyuncuya düşük ELO bot, yüksek ELO oyuncuya yüksek ELO bot).
- Botun ELO'su **oyun içi davranışını** belirler (sadece eşleşme etiketi değil):
  - Düşük ELO: kelimeyi bilme olasılığı düşük, buzzer'a geç basar, inandırıcı hatalı tahminler yapar (doğru uzunlukta ama yanlış kelime; ipuçlarını tam kullanamama).
  - Yüksek ELO: hızlı basar, yeşil/sarı ipuçlarını iyi kullanır, çoğu turu bilir ama %100 kusursuz değil (robot olduğu belli olmasın).
- Bot her zaman kazanmaz/kaybetmez — ELO'suna uygun kazanma/kaybetme dengesi olur (örüntü fark edilmesin, yeni oyuncu ilk maçlarda kazanma hissi alsın).
- Bilme simülasyonu olasılıksaldır: kelime zorluk etiketi (kolay/orta/zor) × bot ELO → deneme ve süre içinde bulma olasılığı.
- **Admin'den ayarlanabilir:** genel zorluk çarpanı, ELO–performans eğrisi, düşünme gecikmesi aralığı, bilme olasılığı katsayıları.

---

## 5. VS (Eşleşme) Ekranı

- Rakip bulununca iki oyuncu yan yana gösterilir: avatar, kullanıcı adı, ELO, kupa/madalya/rozet özeti, son maç sonuçları, kazanma oranı.
- Kısa "hazırlanıyor" animasyonu → maç başlar.
- **Maç esnasında** bu alanlar küçülüp üstte kompakt bir bara döner (skor + sıra göstergesi).

---

## 6. Lig Sistemi

| Lig | Hesaplama |
|-----|-----------|
| Günlük | O günkü en yüksek tek-maç puanı |
| Aylık | Ay boyunca günlük en yüksek puanların **toplamı** (her gün oynayan birikim yapar) |
| Yıllık | Aynı mantıkla üst toplam |
| Tüm Zamanlar | Aynı mantıkla üst toplam |

- Aylık lig ödülleri: **1. → kupa**, **2. ve 3. → madalya**.
- Ay sonunda lig sıfırlanır; kazananların profiline o ayın nişanı kalıcı işlenir.
- Her gün oynayan kullanıcının aylık ligdeki başarı şansı artar (birikim mantığı).

---

## 7. Ödül & Nişan Sistemi

### Kupa / Madalya
- **Kupa:** lig 1.'liği.
- **Madalya:** lig 2. ve 3.'lüğü.

### Rozetler
- **İlerleme:** ilk galibiyet, 10/50/100/500 maç kazanma, 100/1000/5000 kelime bilme, 7/30/100 gün üst üste oynama (streak).
- **Beceri:** kusursuz maç (3 turu da bilme), şimşek (5 sn'den hızlı doğru cevap), yenilmez (10 maç üst üste kazanma), hatip (sesli modda 50 kelime), kâhin (6 harfli kelimeyi ilk denemede bilme).
- **Lig:** aylık şampiyon, aylık 2./3., yıllık şampiyon, ilk kez top 10.
- **Nadir/Özel:** beta üye (ilk 1000 kullanıcı), günün kelimesi serisi, puan barajı aşma.

### Profilde Gösterim
- Kullanıcı adı altında özet: 🏆(n) · 🥈(n) · 🎖️(n)
- Tıklayınca tüm koleksiyon açılır: kazanılanlar renkli, kilitli olanlar gri (koleksiyon tamamlama motivasyonu).

---

## 8. Profil Sayfası

Detaylı istatistikler:
- En yüksek puan, en hızlı doğru cevap (sn), en uzun kelime serisi
- Toplam maç, galibiyet sayısı, kazanma oranı %
- Toplam bilinen kelime, kelime bilme oranı
- Ortalama cevap süresi, sesli/klavye kullanım oranı
- Favori başlangıç harfi
- Günlük aktivite ısı haritası (GitHub tarzı)
- En çok karşılaşılan rakipler
- Lig geçmişi ve kazanılan nişanlar
- **Solo istatistikleri** (ayrı panel — lige yazılmayan skorlar)

---

## 9. Ek Özellikler (v1'e dahil)

- **Rövanş butonu:** maç bitince aynı rakibe anında yeniden meydan okuma.
- **Emote / sabit hızlı mesaj:** serbest chat yok (moderasyon riski); sabit emoji seti + opsiyonel ses.
- **Günün kelimesi:** herkese aynı kelime, solo modda ayrı sıralama, viral paylaşım.
- **Arkadaş sistemi + özel oda:** link ile arkadaş davet etme.
- **Paylaşılabilir sonuç kartı:** maç sonucu görseli (Instagram / WhatsApp için).

---

## 10. Ses & Müzik Sistemi

Admin panelden mp3 yüklenebilir, aç/kapat ve ses seviyesi ayarlanabilir. Boş slot = sessiz geçer (çökmez). Bazı slotlar çoklu mp3 kabul eder (rastgele/sırayla çalar).

### Müzik Slotları
- Ana sayfa bekleme (random çalma listesi — çoklu mp3)
- Rakip aranıyor
- Rakip bulundu (kısa jingle)
- Maç içi sakin arka plan
- Maç kazanma
- Maç kaybetme
- 3. tur / final maç kazanma

### Ses Efekti Slotları
- Harf deneme sesi (Lingo tarzı tek tek)
- Buzzer sesi (biri sıra kaptığında)
- Sıra sana geçti uyarısı
- Doğru harf / yanlış yer / harf yok (3 farklı ton)
- Kelime doğru bilindi (onay sesi)
- Süre azalıyor uyarısı (son 10 sn tik-tak)
- Süre doldu
- Tur başı geri sayım (3-2-1)
- Rozet/başarım kazanıldı
- Kupa/madalya kazanma
- Emote sesi
- Bildirim sesi (arkadaş isteği / rövanş daveti)
- Buton/UI tıklama sesi (aç/kapat)

### Kullanıcı Tarafı Ses Kontrolü
- Müzik aç/kapat, ses efektleri aç/kapat (ayrı ayrı), genel ses seviyesi.
- Mobil/WebView autoplay politikası: ses ilk kullanıcı etkileşiminden sonra başlar (teknik olarak doğru kurulacak).
- Admin panelde mp3 format/boyut uyarısı (önerilen bitrate, max dosya boyutu) — mobil performansı için.

---

## 11. Kimlik Doğrulama

- **Google OAuth** + **e-posta/şifre** (ikisi de).
- Admin panelde tüm API key alanları boş/hazır gelir (Google Client ID+Secret, ses/STT servisleri, SMTP vb.), sonradan girilir.
- Key boşken sistem graceful davranır: ilgili özellik "yapılandırılmadı" durumunda kalır, çökmez.

---

## 12. Admin Panel

- **Canlı istatistik panosu (dashboard):** anlık online kullanıcı, aktif maç sayısı, bugünkü toplam maç, günlük yeni üye, bot/insan maç oranı ve benzeri metrikler.
- **Oyun ayarları:** harf sayısı, satır sayısı, süreler, puan katsayıları, hız bonusu katsayısı.
- **Bot yönetimi:** on/off, zorluk, bot listesi.
- **Kelime yönetimi:** CRUD (ekle/düzenle/sil), zorluk etiketi, aktif/pasif, kara liste.
- **Kelime üretici:** dile bağlı — dil + harf uzunluğu seç → sözlük kaynağından filtrelenmiş kelime üret → onay akışı (gözden geçir, toplu onayla/reddet) → havuza ekle (bkz. Bölüm 19).
- **Bot üretici:** dile bağlı — dil + adet + zorluk seç → gerçekçi isim + avatarla bot üret → gözden geçir/düzenle (bkz. Bölüm 19).
- **Dil ayarları:** varsayılan sistem dili seçimi (ana kurulumda Türkçe), oyun dili seçimi, **yeni dil ekle** bölümü (bkz. Bölüm 19).
- **Kullanıcı yönetimi.**
- **Lig / sezon kontrolü.**
- **Ses/müzik yönetimi:** mp3 yükleme slotları.
- **API key alanları.**

---

## 13. Ana Sayfa & Ziyaretçi Deneyimi

### Ana Sayfa (heyecanlı, canlı)
- Günlük lig tablosu (canlı ilk 10)
- Son oynanan maçlar akışı
- Aktif/online oyuncu sayısı
- Büyük "Rakip Bul" CTA butonu
- Günün kelimesi kartı
- Kişisel özet (giriş yapmışsa: ELO / streak / son maçlar)

### Ziyaretçi / Giriş Yapmamış Deneyimi
- Sistemi basit ve net anlatan tanıtım bölümleri (nasıl oynanır, 3 tur mekaniği, lig/ödül vitrini), görsellerle.
- "Hemen Başla / Üye Ol" çağrısı.

### Footer — Statik Sayfalar
- Kullanım Koşulları, Gizlilik Politikası, İletişim, Hakkımızda
- + KVKK / Çerez Politikası (Türkiye yasal gerekliliği)
- İçerikler iskelet + doldurulabilir şekilde hazır gelir.

---

## 14. Tasarım Kalitesi

- **Mobile-first:** asıl hedef telefon (WebView app). Önce mobilde kusursuz, sonra desktop'a genişleme.
- Premium his: özenli renk paleti (koyu/açık tema), yumuşak gradyanlar/gölgeler, akıcı animasyonlar (harf flip, renk geçişi, VS ekranı girişi, kazanma konfetisi), mikro-etkileşimler, tutarlı tipografi.
- Responsive: VS ekranı mobilde dikey/kompakt · desktop'ta geniş yan yana; lig tablosu mobilde kaydırılabilir kart · desktop'ta tam tablo; maç sırasında üst bar küçülür.
- Templated/varsayılan görünümden kaçınılacak; "KT" logosu ve marka rengiyle özgün dil.

---

## 15. SEO & ASO

### Web SEO (koda gömülü)
- Title örn.: `Kelime Tahmin Oyunu — Online Kelime Tahmin Maçları | Kelimetahmin.com`
- Meta description: aksiyon çağrısı içeren ~155 karakter, "kelime tahmin oyunu / online kelime tahmin maçları" ekseninde.
- Her sayfaya özel meta etiketler, Open Graph, Twitter Card, `sitemap.xml`, `robots.txt`, semantik başlık yapısı (H1/H2).
- Domain-anahtar kelime uyumu (kelimetahmin.com) avantajı.

### Play Store ASO (ayrı metin paketi)
- Uygulama adı (~30 karakter), kısa açıklama (~80 karakter, anahtar kelime yoğun), uzun açıklama (~4000 karakter), kategori/etiketler.
- "Kelime tahmin oyunu" doğal şekilde yerleştirilmiş.

---

## 19. Çok Dillilik & İçerik Üreticiler

### İki Ayrı Katman (karıştırılmamalı)
1. **Arayüz dili (i18n):** Sistemdeki tüm terimler/metinler çeviri dosyalarıyla yönetilir.
2. **Oyun dili:** Oynanan kelime havuzunun dili. Her kurulum **tek bir oyun dili** için çalışır.

### Arayüz Dili (i18n)
- Hazır diller: **Türkçe, İngilizce, Almanca, Fransızca, İspanyolca, Portekizce.**
- Admin panelde varsayılan sistem dili seçilir (ana kurulum: Türkçe). Sistem seçili dille açılır.
- Kullanıcı kendi dilini seçebilir (tarayıcı diline göre otomatik algılama + manuel değiştirme).
- Eksik çeviri varsa sistem varsayılan dile **fallback** yapar (boş görünmez).
- Tarih/sayı biçimleri ve alfabetik sıralama dile göre doğru çalışır (özellikle Türkçe İ/ı sıralaması).

### Yeni Dil Ekle (admin)
- Mevcut 6 dilin ötesinde yeni **arayüz dili** eklenebilir: dil kodu ekle → çeviri anahtarlarını doldur/düzenle → aktif et.
- Dil eklerken kapsam seçimi: **arayüz için mi / oyun için mi / ikisi için mi?**
  - Arayüz dili → yalnızca çeviri dosyası gerekir.
  - Oyun dili → o dile ait bir **sözlük/kelime kaynağı** bağlanması gerekir. Türkçe ve İngilizce için kaynak hazır gelir; başka bir oyun dili için o dilin sözlük kaynağı sağlanmadan kelime üretilemez (README'de açıkça belirtilir).

### Kelime Üretici (dile bağlı)
- Admin panelde: dil + harf uzunluğu (4/5/6…) seç → sözlük kaynağından filtrelenmiş (isim olmayan, mantıklı, oyuna uygun) kelimeler üret.
- **Onay akışı:** üret → admin gözden geçir → toplu onayla/reddet → havuza gir. Argo/teknik/arkaik/müstehcen ayıklama (özellikle İngilizce için kritik).
- Türkçe: TDK tabanlı. İngilizce: uygun açık İngilizce kelime kaynağı tabanlı.
- Ana kurulum: 4/5/6 harfli Türkçe kelimeler önerilen sayıda **hazır ekli** gelir.
- Yeni domain kurulumu: oyun dili seç → üret → havuz dolar.

### Bot Üretici (dile bağlı)
- Admin panelde: dil + adet + zorluk seç → o dile uygun gerçekçi isim + avatarla bot üret.
- Türkçe kurulum Türkçe isimler, İngilizce kurulum İngilizce isimler.
- Üretilen isimler gözden geçirilip düzenlenebilir; avatar havuzu admin'den yönetilir.
- Ana kurulum: 100 Türkçe bot hazır ekli gelir.

### Çok Dilli SEO / ASO / Statik Sayfalar
- SEO meta etiketleri ve ASO metinleri kurulumun diline göre otomatik gelir (TR kurulum Türkçe, EN kurulum İngilizce).
- Footer statik sayfaları (Kullanım Koşulları, Gizlilik, İletişim, Hakkımızda) çeviri sistemine bağlı, dile göre değiştirilebilir (iskelet olarak hazır, doldurulacak).
- Yasal not: KVKK/Çerez Türkiye kurulumuna özel; İngilizce/AB kurulumunda GDPR metni uygun olur.

### Yeni Domaine Kurulum Özeti
Aynı kod tabanı farklı domaine kurulduğunda: (1) varsayılan sistem dili ve oyun dilini seç, (2) o dilde kelime üret, (3) o dilde bot üret. Kod değişikliği gerekmez — yalnızca admin panel ayarları ve üretim.

---

## 16. Teknik Mimari

- **Backend:** FastAPI (port 8000), WebSocket ile gerçek zamanlı maç. Sunucu otoriter (tüm süre/doğrulama serverda).
- **Frontend:** Next.js 14, responsive, WebView Android uyumlu (mobil meta hazır).
- **Veritabanı:** PostgreSQL.
- **Cache / state / lock / queue:** Redis (buzzer için atomic `SET NX`).
- **Maç state'i:** Redis'te tutulur (grid, sıra, sayaçlar, buzzer sahibi). Client sadece görüntüler.
- **Sesli mod:** Web Speech API (tarayıcı, TR) ana yöntem; iOS/Safari fallback için server-side Whisper `tr`. Doğrulama her durumda serverda (tek kelime tanıma).
- **Anti-cheat:** server-side rate limit, çift hesap/imkansız hız tespiti.
- **Çok dillilik (i18n):** Genişletilebilir çeviri altyapısı (çeviri dosyaları + fallback). Arayüz dili ile oyun dili ayrı katmanlar (bkz. Bölüm 19). Kelime ve bot üreticiler dile bağlı, kaynak-eklenebilir mimaride.
- **Deployment:** Docker Compose ile tüm servisler. Aynı kod tabanı farklı domaine, farklı dil ayarıyla yeniden kurulabilir.

---

## 17. Teslim

Tek zip içinde:
- FastAPI backend
- Next.js 14 frontend
- PostgreSQL şema + migration
- Docker Compose + Redis
- TDK'dan filtrelenmiş kelime listesi (4/5/6 harf, büyük harf)
- Admin panel
- Footer statik sayfalar
- Play Store ASO metin paketi
- Detaylı VPS kurulum README (Contabo Ubuntu 22.04 hedefli: Docker, Nginx + SSL, DNS/A kaydı yönlendirme, systemd, env/API key yapılandırma adımları)

---

## 18. Yapım Fazları

1. Proje iskeleti (Docker Compose, FastAPI, Next.js 14, PostgreSQL, Redis) + kelime motoru + TDK'dan filtrelenmiş kelime listesi
2. Çekirdek WebSocket maç: paylaşımlı ızgara + buzzer + sıra + 3 tur + puanlama + hız bonusu + 0-0 önleme
3. Auth (Google OAuth + e-posta/şifre) + kullanıcı profili temel
4. Matchmaking + 100 bot + solo mod + VS ekranı
5. Lig sistemi (günlük/aylık/yıllık/tüm zamanlar) + scheduler + kupa/madalya
6. Rozet sistemi + detaylı profil + istatistikler + ısı haritası
7. Sesli mod (Web Speech + Whisper fallback)
8. Ek özellikler: rövanş, emote, günün kelimesi, arkadaş/özel oda, sonuç kartı
9. Ana sayfa (canlı lig/son maçlar) + ziyaretçi tanıtım + footer statik sayfalar
10. Ses/müzik sistemi + admin panel (tüm ayarlar + API key alanları + canlı istatistik panosu + kelime/kullanıcı/lig/bot yönetimi + kelime üretici + bot üretici + dil ayarları/yeni dil ekle)
11. Çok dillilik (i18n — 6 dil: TR/EN/DE/FR/ES/PT + genişletilebilir) + çok dilli SEO/ASO/statik sayfalar
12. Tasarım cilası + VPS kurulum README + tek zip teslim

---

**Not:** Ölçek büyük olduğu için üretim fazlara bölünerek her faz çalışır kodla teslim edilecek; sonunda birleşik zip verilecek. Kodlama, "başla" komutuyla başlar.
