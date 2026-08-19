# Arayüz senaryo testleri (Hızlı Giriş)

Gerçek bir tarayıcıda (Chromium/Playwright) çalışır; **canlı siteye ve canlı
veritabanına dokunmaz**. Yerelde ayağa kaldırılan geçici bir kopyayı sürer.

## Kurulum

1) Test backend'i (SQLite, tek kullanımlık — her koşuda SIFIRDAN kurulmalı,
   yoksa IP başına hesap sınırına takılırsın):

```bash
docker rm -f kt-ui-api
docker run -d --name kt-ui-api -p 127.0.0.1:8099:8000 \
  -v /root/projeler/kelimetahmin/backend:/src:ro \
  -e DATABASE_URL='sqlite+aiosqlite:////tmp/ui.db' -e JWT_SECRET=uitest \
  -e GAME_LANG=tr -e FRONTEND_ORIGIN='*' -w /work <backend-imajı> \
  sh -c "cp -r /src/. /work && uvicorn app.main:app --host 0.0.0.0 --port 8000"
```

2) Frontend'i test backend'ine bakacak şekilde derle ve başlat:

```bash
cd frontend
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8099 npm run build
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8099 npx next start -p 3001
```

3) Testleri koştur (Playwright imajı browser'ları içerir):

```bash
docker run --rm --network host -v "$PWD/tests":/w -w /w \
  mcr.microsoft.com/playwright:v1.49.0-noble sh -c \
  "npm i playwright@1.49.0 --silent && node hizli_giris_arayuz.mjs && node hizli_giris_mobil.mjs"
```

## Dosyalar

- `hizli_giris_arayuz.mjs` — isim popup'ı (mobil/masaüstü yerleşim, otomatik odak,
  dışarı tıklama, ✕), hesap açma, doğrulama şeridi, doğrulama sayfası, taşıma
  akışı, misafirliğin kalktığı ekranlar, profil düzenlemede kullanıcı adı.
- `hizli_giris_mobil.mjs` — uygulama (Capacitor) taklidi: jetonun native depoya
  da yazılması ve tarayıcı verisi silinince oturumun oradan geri gelmesi.
  Capacitor Preferences eklentisi SAHTE bir köprüyle taklit edilir.
- `hesap_kaybi_ve_sifre.mjs` — çıkışta hesap kaybının önlenmesi: doğrulanmamış
  kullanıcıya "Çıkış Yap" gösterilmemesi, cihazdaki "son hesap" hatırasıyla
  ("<İsim> olarak devam et") aynı hesaba dönülmesi, "Farklı isimle başla"nın
  hatırayı silmesi, doğrulanmış hesabın hatıra bırakmaması; ayrıca /dogrula
  sayfasındaki şifre tekrarı doğrulaması.
- `hesap_silme_ve_panel.mjs` — hesap silme (profil → ⚠️ Tehlikeli Bölge ve
  girişsiz `/hesap-silme` sayfası), doğrulama şeridinin masaüstü üst boşluğu,
  admin panelinde üye pasife alma/geri alma, cihaz simgeleri, durum süzgeçleri
  ve "Bugün — Ortama Göre" tablosu.
  ÖN KOŞUL: `isim_kontrol_paneli.mjs` ile aynı kurulum (admin hesabı + işaretli isim).
- `app_links_yollar.mjs` — App Links kurulumu: `/.well-known/assetlinks.json`
  sitede yönlendirmesiz ve `application/json` olarak servis ediliyor mu,
  AndroidManifest'te beyan edilen HER yol öneki gerçekten çalışan bir sayfaya
  denk geliyor mu, dışarıda bırakılması gereken yollar (hesap-silme, yasal
  sayfalar, yönetim) gerçekten dışarıda mı. Manifest'i doğrudan okur:
  `MANIFEST=<yol> BASE=<adres> node app_links_yollar.mjs`.
- `mobil_google_yok.mjs` — Aşama 5 kanıtı: uygulama kullanıcı ajanıyla (KelimeApp/)
  açılan sayfada Google KİMLİK trafiği olmadığını, Google/Play Games düğmesinin
  çizilmediğini ve indirilen JS paketlerinde capgo/PlayGames izi kalmadığını
  doğrular. (fonts.googleapis.com yazı tipi isteği ayrı raporlanır — kimlik değil.)
- `isim_kontrol_paneli.mjs` — admin panelindeki 🔎 İsim Kontrol ve ⚡ Hızlı Giriş
  sekmeleri: işaretlenen isimlerin listelenmesi, temiz/pasife al/IP gölge ban
  işlemleri, ayarların kaydedilmesi ve eski sekmelerin bozulmadığı.
  ÖN KOŞUL: test backend'inde `admin@t.com` / `adminsifre` hesabı admin olmalı
  ve en az bir işaretli isim bulunmalı (bkz. dosyanın başındaki not).
