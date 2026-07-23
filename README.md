# Kelime Tahmin

Türkçe karşılıklı (online) kelime tahmin oyunu. Wordle mekaniği + buzzer
(önce davranan tahmin eder) + lig/rozet sistemi. **kelimetahmin.com**

> **Durum: Faz 1 — Çekirdek.** Backend kelime motoru + kelime havuzu + API,
> frontend iskeleti, Docker/Compose hazır. Gerçek karşılıklı maç (WebSocket)
> Faz 2'de gelecek. Fazların tam listesi için `PROGRESS.md`.

---

## Bu fazda ne var?

- **Türkçe kelime motoru** (`backend/app/game/word_engine.py`): İ/ı harf
  duyarlı büyük harf dönüşümü, tekrarlı harfleri doğru işleyen Wordle renk
  hesabı (yeşil/sarı/gri).
- **Kelime havuzu** (`backend/app/words/data/`): 4/5/6 harfli, filtrelenmiş,
  zorluk etiketli (kolay/orta/zor) hazır Türkçe kelimeler.
  - 4 harf: 942 seçilebilir · 5 harf: 1834 · 6 harf: 1364
- **API** (`/api/health`, `/api/words/*`).
- **Frontend iskeleti** (Next.js 14): markalı ana sayfa + motorun çalıştığını
  gösteren grid demosu.
- **Docker Compose**: backend + frontend + PostgreSQL + Redis.

---

## Coolify ile kurulum (adım adım)

### 1. Kodu bir Git deposuna koy
Bu klasörü bir GitHub reposuna yükle (örn. `kelimetahmin`). Coolify Git'ten
deploy eder.

### 2. Coolify'da yeni kaynak oluştur
- Coolify panelinde **+ New Resource → Docker Compose** seç.
- Git deposunu bağla, dalı seç (örn. `main`).
- Compose dosyası: kökteki `docker-compose.yml` (otomatik bulunur).

### 3. Ortam değişkenlerini gir
`.env.example` dosyasındaki değişkenleri Coolify'ın **Environment Variables**
bölümüne ekle. En azından şunları ayarla:
- `POSTGRES_PASSWORD` — güçlü bir şifre
- `JWT_SECRET` — uzun rastgele bir değer
- `NEXT_PUBLIC_API_BASE` — bkz. aşağıdaki "Domain" notu

### 4. Domaini bağla
`kelimetahmin.com` alan adının A kaydını sunucunun IP'sine yönlendir.
Coolify'da domaini **frontend** servisine (port 3000) ata; SSL'i Coolify
otomatik (Let's Encrypt) verir.

Backend'e erişim için iki seçenek:
- **Basit (önerilen):** Backend'e ayrı bir subdomain ver
  (`api.kelimetahmin.com` → backend, port 8000) ve
  `NEXT_PUBLIC_API_BASE=https://api.kelimetahmin.com` yap.
- **Tek domain + proxy:** Reverse proxy ile `/api`'yi backend'e yönlendirirsen
  `NEXT_PUBLIC_API_BASE` boş kalabilir.

### 5. Deploy et
Coolify build alır ve dört servisi ayağa kaldırır. Sağlık kontrolü:
`https://api.kelimetahmin.com/api/health` (veya domainin `/api/health`).

---

## Yerelde çalıştırma (geliştirme)

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# -> http://localhost:8000/api/health

# Frontend (ayrı terminal)
cd frontend
npm install
NEXT_PUBLIC_API_BASE=http://localhost:8000 npm run dev
# -> http://localhost:3000
```

Veya tek komutla her şey:
```bash
docker compose up --build
```

---

## Kelime havuzunu yeniden üretme (opsiyonel)

Havuzlar repoda hazır gelir; yeniden üretmek istersen:

```bash
cd backend
# 1) ham listeleri indir (README'deki kaynaklardan) -> app/words/raw_tr_words.txt, raw_tr_freq.txt
python -m app.words.generate_wordlist   # ham -> tr_N.json
python -m app.words.enrich_wordlist     # frekansla zorluk -> tr_N_pool.json
```

Kaynaklar: `mertemin/turkish-word-list` (kelimeler),
`hermitdave/FrequencyWords` tr_50k (frekans).

---

## Sonraki fazlar
`PROGRESS.md` dosyasına bak — 12 fazlık plan ve her fazın durumu orada.
