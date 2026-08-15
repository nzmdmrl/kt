# Kelime Tahmin — Proje Devir Dokümanı (CLAUDE.md)

Bu dosya, projeyi Claude Code ile devralan asistan için hazırlanmıştır. Proje şu ana kadar
web arayüzü üzerinden (zip paketleriyle) geliştirildi; bundan sonra **doğrudan sunucuda Claude Code**
ile devam edilecek. Bu dosyayı repo kök dizinine koy (`/kelimetahmin/CLAUDE.md`) — Claude Code her
oturumda otomatik okur.

---

## 1. PROJE NEDİR

Türkçe, karşılıklı çok modlu online kelime tahmin oyunu (Wordle + buzzer düello + lig + rozet + arena).
Sahibi: **Nazım** (nzmdmrl@gmail.com). Tüm iletişim ve arayüz **Türkçe**. Hedef kitle Türkiye.
Domain: **kelimetahmin.com** (frontend `www.`, backend `api.`).

### Oyun modları
- **1v1 Düello**: Wordle + sıra tabanlı buzzer. Rakip bul (matchmaking), 1vB Pratik (bota karşı),
  Özel Oda Kur (kod ile davet), Oda Koduyla Katıl.
- **Arena**: 5 kişilik (bot doldurmalı) çok oyunculu hız yarışı. Sorular flip animasyonlu.
- **Özel Arena**: Arkadaşlarla kod ile arena (kupa/madalya/XP YOK, sadece eğlence).
- **Maraton** (eski "Solo Mod"): Bölüm bölüm ilerleyen tek kişilik mod.
- **Günün Kelimesi**: Günlük tek bulmaca.
- **Lig**: Günlük/aylık/tüm zamanlar sıralamaları + kupa/madalya ödülleri.

---

## 2. TEKNİK MİMARİ

### Stack
- **Backend**: FastAPI (Python 3.12), async SQLAlchemy, WebSocket (maç + arena). Port 8000.
- **Frontend**: Next.js 14.2.15 (App Router, mobile-first), TypeScript. Port 3000. `standalone` output.
- **DB**: PostgreSQL 16 (async, asyncpg). **Migration otomatik**: `create_all` + modelde olup DB'de
  olmayan sütunları başlangıçta `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` ile ekler
  (`app/core/database.py`). Yeni model eklerken **satır ~45'teki import listesine** eklemek ŞART,
  yoksa tablo oluşmaz.
- **Cache**: Redis 7.
- **Deploy**: Coolify (Docker Compose). Repo: `github.com/nzmdmrl/kt`, branch `main` → push'ta
  otomatik/manuel deploy.

### Sunucu / Coolify
- Sunucu IP: **169.58.41.191** (Contabo, 11GB RAM, 193GB disk — bol).
- Coolify resource UUID: `mrx9s3fe2zqmkx1xnq1cz6ga`.
- PostgreSQL: kullanıcı `kelime` / şifre `Kt1122334455xYzQ9871` / db `kelimetahmin`.
- Bad Gateway görülürse: `docker restart coolify-proxy`.
- **Apex → www yönlendirmesi**: `kelimetahmin.com` → `https://www.kelimetahmin.com` (301) ve apex
  SSL sertifikası, Coolify'ın domain alanında DEĞİL, Traefik dynamic dosyasında tanımlı:
  `/data/coolify/proxy/dynamic/kelimetahmin-apex-redirect.yaml` (repo dışında, sunucuda).
  Coolify etiketleri her deploy'da yeniden yazıldığı için düzeltme oraya konmadı; dynamic
  dizin kalıcı ve Traefik dosyayı canlı izliyor (yeniden başlatma gerekmez).
- Docker Compose, frontend/backend/db/redis servisleri. Dockerfile'lar repoda
  (`frontend/Dockerfile`, `backend/Dockerfile`) — build-time ARG: `NEXT_PUBLIC_API_BASE` vb.

### Auth
- JWT. `decode_token(token)` → `int(user_id)`. `get_current_user` (`app/core/deps.py`),
  `get_db` (`app/core/database.py`).
- Player id formatı: üye = `u{id}` (örn. `u42`), misafir = `g...` (u ile başlamaz), bot = `bot:...`.
- Frontend localStorage: `kt_token` (JWT), `kt_uid` (user id — auth.tsx me/applyAuth'ta yazılır),
  `kt_theme` (gündüz/gece).
- Admin: `user.is_admin`. Admin panel: `/yonetim`.

### WebSocket uçları
- Maç: `/api/ws/match/{code}?player_id=&name=`
- Arena: `/api/ws/arena?token=...[&custom={code}]`

---

## 3. DİZİN YAPISI

```
kelimetahmin/
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI app, router kayıt, startup seed (unvan/rozet/ayar)
│   │   ├── core/
│   │   │   ├── database.py        # Base, engine, get_db, otomatik migration (model import listesi ~satır 45)
│   │   │   └── deps.py            # get_current_user
│   │   ├── models/                # SQLAlchemy modelleri (18 model)
│   │   │   ├── user.py            # matches_played, wins, elo, xp, arena_first/second/third/played ...
│   │   │   ├── badge_def.py       # DB'deki rozet tanımları (code,name,icon,tier,stat_key,threshold)
│   │   │   ├── title.py           # DB'deki unvan tanımları (name,icon,xp_required)
│   │   │   ├── music_track.py     # Müzik havuzu (section, name, mime, data_b64)
│   │   │   ├── seo_page.py        # Sayfa SEO'su + VARSAYILAN başlık/açıklama listesi (SEO_PAGES)
│   │   │   ├── arena_history.py   # Arena maç kayıtları (her oyuncu 1 satır, match_id YOK)
│   │   │   └── ...
│   │   ├── api/routes/            # 21 route dosyası
│   │   │   ├── admin.py           # /admin/* — dashboard, titles/badges CRUD, settings, bots, words
│   │   │   ├── arena.py           # arena WS + _persist_results (kupa/madalya/XP/rozet)
│   │   │   ├── match.py           # maç WS + maç geçmişi kaydı
│   │   │   ├── music.py           # müzik havuzu API (public liste/dosya + admin upload/sil/ses)
│   │   │   ├── seo.py             # sayfa SEO API (public meta/görsel + admin düzenle/yükle)
│   │   │   ├── profile.py         # profil (stats, achievements, badges, trophies/medals)
│   │   │   ├── home.py            # /home/appearance (gece bg ayarı, public), recent-matches
│   │   │   └── ...
│   │   └── game/                  # oyun mantığı
│   │       ├── arena.py           # ArenaMatch sınıfı (submit, final_ranking, flip için answer)
│   │       ├── room.py            # 1v1 oda/maç yönetimi (_end_match, callback)
│   │       ├── match_result.py    # apply_match_result (elo/xp/rozet/unvan) — dict döner
│   │       ├── badges.py          # earned_badges (DB cache'ten stat_key>=threshold)
│   │       ├── xp_service.py      # unvan (title) DB cache
│   │       └── settings_service.py# cached_int/bool/str + set_setting
│   └── requirements.txt
└── frontend/
    ├── app/
    │   ├── page.tsx               # Ana sayfa (HomeModes: mobil + desktop)
    │   ├── layout.tsx             # NightBackground + Providers + DesktopChrome + BottomNav
    │   ├── globals.css            # tema değişkenleri (gece/gündüz) + .hm-* ana sayfa stilleri
    │   ├── oyna/                  # 1v1 (query: ?mode=search|bot|create, ?join=KOD, ?duel=KOD)
    │   ├── arena/                 # arena + arena/ozel/[code]
    │   ├── solo/                  # Maraton
    │   ├── gunun-kelimesi/, lig/, profil/[username]/, yonetim/, bildirimler/ ...
    ├── components/
    │   ├── HomeModes.tsx          # Ana sayfa mod ekranı (profil sayaçları + gruplu modlar)
    │   ├── ArenaGame.tsx          # Arena oyun ekranı (customCode prop, FlipReveal, müzik hook)
    │   ├── MatchGame.tsx          # 1v1 oyun ekranı (isGuest, MatchRewards, müzik hook)
    │   ├── NightBackground.tsx    # Gece/gündüz gökyüzü animasyonu (fixed, zIndex -1)
    │   ├── TitleCelebration.tsx   # Unvan kutlama modalı
    │   ├── MatchRewards.tsx       # Maç sonu elo/xp/rozet sayaç animasyonu
    │   └── ...
    ├── lib/
    │   ├── auth.tsx               # useAuth, kt_token/kt_uid yönetimi
    │   ├── sound.ts               # playSound (synth sesler) + isSoundEnabled
    │   ├── useSectionMusic.ts     # Bölüm bazlı müzik havuzu çalar (rastgele + fade)
    │   ├── useArena.ts, useMatch.ts # WS hook'ları
    │   └── theme.ts               # effectiveTheme (dark/light)
    └── package.json
```

---

## 4. TAMAMLANMIŞ ÖZELLİKLER (kronolojik, son sürüm)

Aşağıdakiler canlıda çalışıyor veya son push'a dahil. Detaylı geçmiş `backend/PROGRESS.md` içinde.

### Oyun & modlar
- 1v1 buzzer düello (sıra, joker, rövanş, emote), bota karşı, oda kur/katıl.
- Arena: 5 kişilik, bot doldurma, flip animasyonlu cevap gösterimi (harfler tek tek dönerek
  yeşil/kırmızı + her harfte ses), podyum + tablo (✓ doğru / ⚡ hız / puan) sonuç ekranı, XP.
- Özel Arena (arkadaşla, ödülsüz). Maraton (solo). Günün Kelimesi. Lig (günlük/aylık/tüm zamanlar).

### Puan / ödül sistemi
- ELO, XP, seviye. **20 unvan** (Çaylak→Ölümsüz, XP eşikli, admin düzenlenebilir DB'de).
- **Rozetler** DB'de (admin düzenlenebilir): stat_key + threshold mantığı. Arena rozetleri:
  katılım (1/5/10/50/100), Gladyatör (10 şampiyonluk), Spartaküs (50 şampiyonluk).
- **Kupa/Madalya**: Lig + Arena (1.→Arena Şampiyonu, 2.→Arena 2.si, 3.→Arena 3.sü). Profilde
  "Kupalar & Madalyalar" bölümünde gösterilir.
- Maç sonu kazanım animasyonu (elo/xp/rozet sayaç + ses). Unvan kutlama modalı (konfeti + müzik).

### Arkadaşlar
- `/arkadaslar` sayfası (kendi profilindeki "🤝 N arkadaş" çipinden ve menüden): arkadaşı
  **aile / iş / diğer** diye etiketle, listeden **çıkar** (onaylı). Etiket KİŞİYE ÖZELdir —
  ayrı tablo `friend_labels` (owner_id → friend_id), `app/models/friend_label.py`.
- Uçlar: `PUT /friends/label/{id}` (boş = etiketi kaldır), `POST /friends/remove/{id}`.
  `GET /friends` artık `label` + `status` (çevrimiçi/maçta/çevrimdışı) da döner.
- Özel arena davetinde etiket süzgeci (Tümü / Aile / İş / Diğer).
- Profil aksiyon satırı: çevrimiçi rozeti + arkadaşlık + maç teklifi TEK satırda, aynı
  yükseklikte (`profRowBtn`, `PresenceBadge pill`). "🤝 Arkadaşın" butonu arkadaşlıktan çıkarır.

### Sonuç paylaşımı
- `components/ResultShare.tsx`: metin önizlemesi + WhatsApp · X · Telegram · Facebook · 📋 Kopyala
  (+ mobilde native paylaşım). 1v1, Arena, Günün Kelimesi ve Maraton sonuç ekranlarında.
- Metinler `lib/shareText.ts` içinde üretilir: "🏆 Nazım, Ahmet'i 200-0 yendi!",
  "🥈 Nazım arenada 2. oldu!" vb. Türkçe belirtme eki `acc()` ile ("Ayşe'yi", "Nazım'ı").
- Paylaşılan adres bulunulan sayfadır (`pageUrl()` — sorgu parametreleri atılır).
  Facebook metni taşımaz (kendi kısıtı), sadece sayfanın OG başlığını gösterir → OG metinleri
  admin → 🔍 SEO'dan zengin tutulmalı.

### Bildirimler
- `/bildirimler` sayfası. Arkadaşlık, unvan (`title_up`), arena madalya (`arena_medal`) bildirimleri.
- Link'li bildirimler tıklanınca profil/arenaya gider.
- **Silme**: tek (✕), toplu (☑️ Seç → Seçilenleri Sil) ve Tümünü Sil (onay modalı).
  Uçlar: `DELETE /notifications/{id}`, `POST /notifications/delete {ids}`, `DELETE /notifications`.
- **Otomatik temizlik**: `notification_retention_days` (admin ⚙️ Ayarlar → Sosyal, varsayılan 30,
  0 = kapalı) günden eski bildirimler 6 saatte bir silinir
  (`app/services/notification_cleanup.py`, startup'ta task). Süre `GET /notifications` yanıtında
  `retention_days` olarak döner ve sayfanın altında kullanıcıya yazılır.

### Misafir (üye olmayan ziyaretçi) erişimi
- **1v1**: misafir oynayabilir. Maç kaydedilir ama misafir adı gizli → "Misafir" olarak yazılır.
  Üye + misafir maçında ÜYE elo/xp alır (misafir hiçbir şey kazanmaz).
- **Arena**: misafir isim yazıp katılır (normal arena + özel arena). Üyenin beklediği lobiye
  yer varsa doğrudan girer; yoksa yeni lobi açılır ve botlarla oynar. WS: `/api/ws/arena?gid=&name=`,
  pid = `g{gid}` — `u` ile başlamadığı için `_persist_results` ödül/XP/kupa vermez.
- **Günün Kelimesi**: misafir çözebilir (zaten auth'suz; sayaçta `g{cid}` ile tekilleştirilir).
- Maç ve arena sonuç ekranlarında "Ücretsiz Üye Ol / Puanların kaydedilsin" teşviki (`GuestJoin.tsx`
  giriş kartı, `ArenaGame`/`MatchGame` sonuç kartı).
- **Admin ayarı** (⚙️ Ayarlar → 👤 Misafir): `guest_match_enabled`, `guest_arena_enabled`,
  `guest_daily_enabled`. Kapatılırsa arayüzde "sadece üyelere açık" ekranı çıkar; sunucu da
  (WS + `/mm/join` + `/daily/*`) ayrıca engeller. Arayüz bunları `GET /api/home/guest-access`
  (public) ile okur — `frontend/lib/guestAccess.ts`.

### Görsel / ses
- **Gece/gündüz gökyüzü animasyonu** (NightBackground): parlayan yıldızlar + ağır bulutlar (gece),
  mavi gökyüzü + güneş + bulut (gündüz). Admin'den aç/kapa + tema (night/aurora/nebula/snow).
- **Müzik havuzu** (bölüm bazlı, admin sürükle-bırak): home, arena_wait, match_wait, solo, daily.
  Rastgele mp3, fade geçiş, ses seviyesi ayarı. Rakip bulundu sesi (opponent_found slotu).
- Synth ses efektleri (`lib/sound.ts`): tile, count_tick, radar, round_start vb.

### Admin paneli (`/yonetim`)
Sekmeler: 📊 Özet (bugünkü maç/arena, online, canlı maç), ⚙️ Ayarlar, 🤖 Botlar, 📝 Kelimeler,
🔊 Sesler, 🏅 Unvanlar, 🎖️ Rozetler, 🎵 Müzik, 🔍 SEO.

### SEO (sayfa başlığı / açıklaması / paylaşım görseli)
- Varsayılan metinler KODDA: `backend/app/models/seo_page.py` → `SEO_PAGES` (19 kayıt).
  Frontend yedeği: `frontend/lib/seo.ts` → `FALLBACK` (backend'e ulaşılamazsa kullanılır; ikisi
  birlikte güncellenmeli).
- Admin `/yonetim` → 🔍 SEO sekmesinden başlık/açıklama/anahtar kelime ve **og görseli** (1200×630)
  yüklenir. Boş bırakılan alan varsayılana döner. Görseller DB'de base64 (disk volume yok).
- Özel anahtarlar: `default` (görseli olmayan tüm sayfaların og görseli), `favicon` (sekme ikonu).
- Frontend: her sayfanın `layout.tsx`'inde `pageMetadata("<key>")` (`frontend/lib/seo.ts`).
  Yeni sayfa eklerken: SEO_PAGES'e kayıt + sayfaya layout.tsx ekle.
- Yayına yansıma: ISR `revalidate = 60` (kök layout + `lib/seo.ts` fetch'leri). Next
  "stale-while-revalidate" kullanır: süre dolduktan sonraki **ilk** ziyaret hâlâ eski sayfayı
  görür, yeni hâli arka planda üretilir → **ikinci ziyarette** görünür. "Görsel yükledim ama
  çıkmıyor" şikâyetinin sebebi budur; sayfayı 2 kez yenilemek yeter.
- Tarayıcı favicon'u agresif cache'ler — değişikliği görmek için sekmeyi kapatıp Ctrl+F5.
- `/favicon.ico` (www alan adı) `next.config.js` içindeki rewrite ile backend'e yönlendirilir
  (bazı botlar `<link rel="icon">` etiketine bakmadan doğrudan bu adresi ister).
- `/robots.txt` (`app/robots.ts`) ve `/sitemap.xml` (`app/sitemap.ts`) SEO_PAGES'ten üretilir.

### Ana sayfa (son tasarım)
- Profil kartı: avatar, seviye, unvan, XP bar + sayaçlar (⭐ Puan, 🏆 Kupa, 🥈 Madalya, 🎖️ Rozet).
- Sıralama: Arena + Özel Arena (üstte) → 🎮 1v1 Düello bölümü (Oyna + 1vB Pratik + Özel Oda Kur +
  oda kodu) → Maraton + Günün Kelimesi + Lig. Desktop + mobil responsive, büyük fontlar.

---

## 5. ÖNEMLİ KURALLAR & TUZAKLAR

- **Yeni model eklerken** `app/core/database.py` satır ~45 import listesine ekle (yoksa tablo yok).
- **Migration otomatik** ama sadece SÜTUN ekler; sütun tipi değişimi / silme elle yapılır.
- **Test ortamı**: SQLite (`DATABASE_URL='sqlite+aiosqlite:///./test.db' JWT_SECRET=test GAME_LANG=tr`).
  SQLite'ta "ADD COLUMN IF NOT EXISTS" uyarısı ZARARSIZ (canlıda PostgreSQL sorunsuz).
- **Frontend build**: gerçek hataları görmek için `npx tsc --noEmit` çalıştır. "Failed to minify
  font" / CssSyntaxError font uyarıları ZARARSIZ; gerçek hata "Type error" / "Expression expected".
  **Coolify build TypeScript hatalarında durur** — deploy öncesi mutlaka `tsc --noEmit` temiz olmalı.
- **Arena istatistikleri** (arena_played/first/second/third) sadece bu özellik eklendikten SONRAKİ
  maçlardan dolar (geriye dönük değil).
- **ArenaHistory'de match_id YOK** — her oyuncu için 1 satır. "Kaç arena" için `sum(1/player_count)`.
- Özel arenada kupa/madalya/XP verilmez (bilinçli karar).
- Misafir adları hiçbir yerde görünmez ("Misafir" olarak yazılır).

---

## 6. AÇIK / BEKLEYEN İŞLER

- 2v2 takım maçı (ertelendi).
- Google ile giriş kodda hazır (`/giris` sayfası, `GoogleSignIn.tsx`, `/api/auth/google`).
  Çalışması için Coolify'da `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` girilmeli.
- Google Analytics 4 kodda hazır (`lib/analytics.ts`, `Analytics.tsx`, `CookieConsent.tsx`).
  Çalışması için **build-time** `NEXT_PUBLIC_GA_ID` (Coolify build arg) girilmeli — runtime env
  yetmez, Next.js NEXT_PUBLIC_* değişkenlerini build sırasında gömer.
  Model: opt-out — bant çıkar, reddedilene kadar ölçüm çalışır (`kt_cookie_consent`).
- Kayıtta "Ben robot değilim" (reCAPTCHA v2) kodda hazır (`Recaptcha.tsx`, `app/core/captcha.py`).
  Çalışması için `RECAPTCHA_SITE_KEY` + `RECAPTCHA_SECRET` girilmeli; boşsa kayıt captcha'sız çalışır.
  Durum kontrolü: `/api/health` → `google_oauth_configured`, `recaptcha_configured`.
- Whisper (sesli tahmin) fallback.
- Günün kelimesi XP'ye bağlı değil (check_daily_guess auth'suz).
- Arena rozet kazanımında bildirim yok (sadece kupa/madalya bildirimi var).
- Yasal metinler hukukçu onayı bekliyor.
- Otomatik DB yedeği kurulmadı.
- SEO görselleri (og image) ve favicon admin panelden yüklenmeli — yüklenmezse paylaşımlarda
  görsel çıkmaz (metinler zaten hazır).
- Eski kullanılmayan bileşenler duruyor: `HomeHero.tsx`, `HomeDesktop.tsx` (artık import edilmiyor,
  temizlenebilir).

---

## 7. SON DURUM / BİLİNEN SORUN (2026-08-08)

- Kod TypeScript'ten temiz geçiyor; en son eklenen özellikler (ana sayfa profil sayaçları, Arena
  üstte sıralama, profil beyaz XP bar) hazır.
- **Dikkat**: Web arayüzünden zip ile devrederken bazı dosyalar (özellikle `ArenaGame.tsx`,
  `HomeModes.tsx`) Mac'te düzgün kopyalanmadan push edilmiş ve Coolify build'i TypeScript hatasıyla
  durmuştu (`ArenaGame customCode prop'u eksik`). Claude Code doğrudan repoda çalışacağı için bu
  senkron sorunu ortadan kalkacak.
- **İlk iş (Claude Code devralınca)**: `git status` ve `npx tsc --noEmit` ile mevcut durumu doğrula;
  ArenaGame.tsx satır ~12'de `{ onExit, customCode }: { onExit: () => void; customCode?: string }`
  OLMALI ve HomeModes.tsx var OLMALI. Eksikse düzelt, `tsc` temizle, commit + push + deploy.

---

## 8. ÇALIŞMA TARZI (Nazım'ın tercihleri)

- Türkçe iletişim, öz ve net.
- Değişiklikten sonra: `npx tsc --noEmit` (temiz olmalı) → gerekirse `npm run build` → commit + push.
- Nazım küçük UI ayarlarını (renk, boyut, konum) sık ister; hızlı ve net uygula.
- Büyük özelliklerde önce kısa netleştirme sorusu sor, sonra uygula.
- Kod yaz → test et → doğrula → açıkla. Gereksiz uzun açıklama yok.
