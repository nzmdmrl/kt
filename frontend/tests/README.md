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
