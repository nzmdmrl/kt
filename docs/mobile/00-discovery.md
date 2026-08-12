# Mobil Uygulama Keşif Raporu (Capacitor)

**Tarih:** 2026-08-12
**Branch:** `mobile-app`
**Kapsam:** Siteyi Capacitor ile Android + iOS uygulamasına sarmadan önce mevcut kodun
tam fotoğrafı. Bu belge yalnızca **tespit**tir — hiçbir kod değişikliği önermez/uygulamaz.

Referans: repo kökündeki `CLAUDE.md` (mimari devir dokümanı).

---

## 1. BİLDİRİMLER

### 1.1 DB'ye bildirim yazan TÜM yerler (tam liste — 9 çağrı, 7 tür)

Merkezî bir `notify()` yardımcı fonksiyonu **yok**; her yer `Notification` nesnesini
elle kuruyor.

| # | Dosya:satır | Fonksiyon | `kind` | Tetikleyen olay | `link` |
|---|---|---|---|---|---|
| 1 | `backend/app/api/routes/friends.py:90` | `send_request` | `friend_request` | Arkadaşlık isteği gönderildi | — |
| 2 | `backend/app/api/routes/friends.py:106` | `accept_request` | `friend_accept` | İstek kabul edildi (gönderene) | — |
| 3 | `backend/app/api/routes/friends.py:122` | `reject_request` | `friend_reject` | İstek reddedildi (gönderene) | — |
| 4 | `backend/app/api/routes/room.py:62` | `invite_to_room` | `room_invite` | Özel 1v1 odasına arkadaş daveti (`POST /api/room/invite`) | `/oyna?join={code}` |
| 5 | `backend/app/api/routes/arena.py:175` | `invite_to_custom_arena` | `arena_invite` | Özel arenaya arkadaş daveti | `/arena/ozel/{code}` |
| 6 | `backend/app/api/routes/arena.py:437` | `_persist_results` | `arena_medal` | Arena maçı bitti, oyuncu 1./2./3. oldu (🏆 / 🥈 / 🥉) | `/profil/{username}` |
| 7 | `backend/app/api/routes/arena.py:466` | `_persist_results` | `title_up` | Arena XP'siyle yeni unvana yükseldi | `/profil/{username}` |
| 8 | `backend/app/game/match_result.py:117` | `apply_match_result` | `title_up` | 1v1 maç XP'siyle yeni unvana yükseldi | `/profil/{username}` |
| 9 | `backend/app/game/league_scheduler.py:100` | `award_period` | `award` | Lig dönemi kapandı, ilk 3'e kupa/madalya — **günlük, aylık, yıllık üçü de bu tek çağrıdan** (`period_type` ayırıyor) | — |

**Lig ödül zamanlaması:** `league_scheduler_loop()` (`backend/app/game/league_scheduler.py:146`)
startup'ta `asyncio.create_task` ile başlatılır (`backend/app/main.py:186`) ve **saatte bir**
`check_and_award_closed_periods` çağırır (`league_scheduler.py:132`):

- her çalışmada **dün** için `daily`
- ayın 1'iyse geçen ay için `monthly`
- 1 Ocak'ta geçen yıl için `yearly`

`LeagueAward` tablosu üzerinden idempotent (`_already_awarded`, `league_scheduler.py:34`).

### 1.2 Bildirimi OLMAYAN olaylar

Aşağıdakiler için bugün **hiçbir kalıcı kayıt oluşmuyor**. Mobil push isteniyorsa
yeni kod gerekir:

- **1v1 maç teklifi (challenge)** — DB'ye yazılmıyor.
  `backend/app/game/challenge_service.py`: tamamen **bellekte** (`_challenges` dict'i),
  **TTL 30 sn** (`CHALLENGE_TTL`, satır 15). Frontend `frontend/components/ChallengeWatcher.tsx`
  **3 saniyede bir** `/api/challenge/incoming` polling yapıyor. Uygulama kapalıyken teklif kaybolur.
- **Maç sonucu** (1v1 galibiyet/mağlubiyet/beraberlik) — bildirim yok, sadece maç sonu ekranı.
- **Rozet kazanımı** — bildirim yok. `match_result.py` `new_badges` hesaplıyor ama
  sadece maç sonu ekranına dönüyor (`MatchRewards.tsx`).
- **Seviye atlama** — `xp_service.grant_xp` `leveled_up` döndürüyor
  (`backend/app/game/xp_service.py:137`) ama bildirim üretmiyor.
- **Solo/Maraton ve Günün Kelimesi kaynaklı unvan yükselmesi** — `title_up` bildirimi
  yalnızca 1v1 (`match_result.py:117`) ve arena (`arena.py:466`) yollarında var.
- **Lig terfi / küme düşme / şampiyonluk (arena dışı)** — kodda `division`, `promotion`,
  `terfi` kavramı **hiç yok**.
- **Seri (streak)** — kodda `streak` kavramı **hiç yok**.
- **Sistem duyurusu / toplu bildirim** — yok; admin panelinde bildirim gönderme ekranı yok.
- **Rakip bulundu (matchmaking)** — bildirim değil, WS/polling üzerinden anlık.

### 1.3 Şema

`backend/app/models/notification.py:24` → tablo `notifications`:

| Sütun | Tip | Not |
|---|---|---|
| `id` | int PK | |
| `user_id` | int FK→`users.id`, **index** | |
| `kind` | varchar(24), default `"award"` | |
| `title` | varchar(128) | |
| `body` | Text, default `""` | |
| `icon` | varchar(8), default `"🔔"` | emoji |
| `link` | varchar(128), default `""` | uygulama içi yol |
| `read` | bool, default `False`, **index** | |
| `created_at` | timestamptz, `server_default=func.now()` | |

`backend/app/main.py:88-99` içinde `link` sütunu için ayrıca elle
`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link ...` güvencesi var.

**API** (`backend/app/api/routes/notifications.py`):

- `GET  /api/notifications` — son 50 kayıt (yeni→eski) + `unread` sayısı
- `POST /api/notifications/read` — tümünü okundu işaretle
- `POST /api/notifications/{id}/read` — tek kaydı okundu işaretle

Silme ucu **yok**, sayfalama **yok**, cihaz/push token tablosu **yok**.

**Frontend tüketimi:**

- `frontend/components/NotificationBell.tsx:25` — **30 sn** polling, yalnızca okunmamış sayacı
- `frontend/app/bildirimler/page.tsx:26-31` — listeyi çeker, sayfa açılır açılmaz hepsini
  okundu işaretler, ayrıca bekleyen arkadaşlık isteklerini `/api/friends/requests`'ten çeker

### 1.4 Push / FCM / Service Worker

**Hiçbiri yok.** Tüm repoda (`.git`, `node_modules`, `.next` hariç) şu arama **sıfır** sonuç verdi:

```
serviceWorker | service-worker | sw.js | firebase | fcm | web-push |
PushManager | Notification.requestPermission | navigator.serviceWorker |
manifest.json | capacitor
```

`frontend/public/` klasörü **boş** (sadece `.gitkeep`) — manifest, uygulama ikonu,
service worker dosyası da yok. Push altyapısı sıfırdan kurulacak.

---

## 2. REALTIME

### 2.1 WebSocket

İki uç var:

| Uç | Tanım | Kimlik doğrulama |
|---|---|---|
| `/api/ws/match/{code}` | `backend/app/api/routes/match.py:189` | **Yok** — query'deki `player_id` string'ine güveniliyor (`u42` / `g...` / `bot:...`) |
| `/api/ws/arena` | `backend/app/api/routes/arena.py:487` | **Var** — query'de `token` (JWT) doğrulanıyor; opsiyonel `custom={code}` |

Frontend: `frontend/lib/useMatch.ts:84` ve `frontend/lib/useArena.ts:80`.
URL `wsBase()` ile kuruluyor (`useMatch.ts:7`, `useArena.ts:6`):
`API_BASE` doluysa `http→ws` çevirisi, boşsa `window.location.host` + protokole göre `ws/wss`.

### 2.2 Online durumu — WS'ten DEĞİL, ayrı presence servisinden

`backend/app/game/presence_service.py`:

- Bellekte `dict` (`_presence`), `ONLINE_WINDOW = 60` sn
- Durumlar: `online` / `in_match` / `offline`
- `counts()` admin dashboard'a online sayısını veriyor (`admin.py:49`)

Beslenme kaynakları:

- `POST /api/presence/heartbeat` (`backend/app/api/routes/presence.py:23`) —
  `frontend/components/HeartbeatPinger.tsx` **30 sn**'de bir + sekme görünür olunca
- Maç WS'i `set_in_match(True)` (`match.py:221`) ve çıkışta `set_in_match(False)` (`match.py:282`)

**Sonuç:** backend "kim bağlı"yı WS bağlantı listesinden değil, **son heartbeat zamanından**
biliyor. Arena WS'i presence'a hiç dokunmuyor.

`GET /api/presence/{user_id}` gizliliği dikkate alıyor: `show_online=False` ise `offline` döner.

### 2.3 Ölçek notu

Presence, challenge ve oda/arena lobilerinin **hepsi in-process bellekte**
(`presence_service.py`, `challenge_service.py`, `room.py`, `arena_manager.py`).
Redis compose'da ayakta ama **kodda hiç kullanılmıyor** — `REDIS_URL` yalnızca
`backend/app/core/config.py:31`'de tanımlı, hiçbir yerde import edilmiyor.
Tek backend replikası zorunlu (`backend/app/game/room.py:15` yorumu bunu açıkça söylüyor).

---

## 3. ADMIN PANEL

### 3.1 Yapı

- **Tek dosya, client component:** `frontend/app/yonetim/page.tsx` — 887 satır, `"use client"`
- **Route:** App Router klasör tabanlı, `/yonetim`. Ayrı admin layout'u yok.
  `frontend/components/DesktopChrome.tsx:10` içindeki `HIDE_ON` listesinde olduğu için
  TopBar/Footer bu sayfada gizleniyor.

### 3.2 Yetkilendirme — iki katman

**Frontend (kozmetik, koruma değil):** `page.tsx:26-33`

```
useAuth() → loading ? "Yükleniyor…"
          → !user   ? giriş uyarısı
          → denied  ? "erişim yetkin yok"
```

`denied` bayrağı yalnızca `Dashboard` bileşeni API'den **403** aldığında set ediliyor
(`page.tsx:67`). Yani route seviyesinde koruma **yok**; sayfa herkese açılır, sadece veri gelmez.

**Backend (gerçek koruma):** `backend/app/core/deps.py:44`

```python
async def get_admin_user(user: User = Depends(get_current_user)) -> User:
    if not getattr(user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Bu işlem için yönetici yetkisi gerekli.")
    return user
```

`backend/app/api/routes/admin.py` içindeki **her** endpoint `Depends(get_admin_user)` alıyor.

**İlk admin ataması:** `backend/app/main.py:196-212` — `ADMIN_EMAIL` env değişkeni
dolu ise o e-postaya sahip kullanıcı startup'ta `is_admin=True` yapılıyor.
⚠️ Bu değişken `.env.example`'da ve `docker-compose.yml`'de **yok**, sadece kodda geçiyor.

### 3.3 Sekme ekleme deseni

`page.tsx:13-23` içindeki `TABS` dizisi + `page.tsx:49-57` koşullu render:

```tsx
const TABS = [
  { key: "dashboard", label: "📊 Özet" },
  { key: "settings",  label: "⚙️ Ayarlar" },
  { key: "bots",      label: "🤖 Botlar" },
  { key: "words",     label: "📚 Kelimeler" },
  { key: "sounds",    label: "🔊 Sesler" },
  { key: "titles",    label: "🏅 Unvanlar" },
  { key: "badges",    label: "🎖️ Rozetler" },
  { key: "music",     label: "🎵 Müzik" },
  { key: "seo",       label: "🔍 SEO" },
];
...
{tab === "titles" && <Titles />}
```

Yeni sekme = `TABS`'a bir satır + aynı dosyada bir `function` + bir `{tab === "x" && <X />}`.

Dosyadaki bileşenler: `Dashboard` (61), `Settings` (115), `Bots` (187), `Words` (221),
`Sounds` (344), `Seo` (408), `Titles` (564), `Badges` (686), `MusicPools` (781),
`MusicSection` (793) + yardımcılar `authHeaders` (8), `Stat` (541), `Wrap` (550), `Centered` (559).

### 3.4 Form deseni — canlı örnek: `Titles` (`page.tsx:564-681`)

```
authHeaders()   (page.tsx:8)  → localStorage "kt_token" → { Authorization: Bearer, Content-Type }
load()          → GET    /api/admin/titles           → setTitles + setEvents
updateLocal()   → sadece local state'i patch'ler (kontrollü input)
saveTitle(t)    → PUT    /api/admin/titles/{id}      → "✓" 1.5 sn → load()
addTitle()      → POST   /api/admin/titles           → load()
deleteTitle(id) → DELETE /api/admin/titles/{id}      → load()
saveEvent(k,v)  → POST   /api/admin/settings {key,value}   (input onBlur ile)
```

Özellikler:

- Tüm stil **inline `style={{}}`** + CSS değişkenleri (`var(--accent)`, `var(--bg-panel)`,
  `var(--border-soft)`, `var(--text-strong)` …)
- Form kütüphanesi, validasyon şeması, toast yok
- Hatalar `.catch(() => {})` ile sessizce yutuluyor
- Kaydetme geri bildirimi: butonun `"Kaydet"` → `"✓"` olması (1.5 sn `setTimeout`)

Backend karşılığı (`backend/app/api/routes/admin.py`): Pydantic in-şeması (ör. `TitleIn`,
`BadgeIn`, `SettingIn`) + `Depends(get_admin_user)`. Bellek cache'i etkileyen değişikliklerde
`_reload_titles_cache` (`admin.py:119`) / `_reload_badges_cache` (`admin.py:179`) çağrılıyor.

Dosya yükleyen sekme örneği için `Seo` (`page.tsx:408-540`) ve `MusicSection`
(`page.tsx:793`) bakılmalı — base64/upload deseni orada.

---

## 4. REKLAMLAR

**Bugün hiç reklam yok.** Kod tarafında şu arama **sıfır** sonuç verdi:

```
adsbygoogle | adsense | ca-pub | data-ad- | googlesyndication | <ins  | AdSlot
```

"reklam" kelimesi yalnızca yasal metinlerde geçiyor ve orada **tersi taahhüt ediliyor**:

| Dosya:satır | İçerik |
|---|---|
| `frontend/app/gizlilik/page.tsx:25` | "Kişisel verilerinizi satmayız ve reklam amacıyla üçüncü taraflara…" |
| `frontend/app/gizlilik/page.tsx:164` | "Platform, reklam veya profilleme amaçlı çerez kullanmaz." |
| `frontend/app/gizlilik/page.tsx:175` | "…reklam amacıyla üçüncü taraflara aktarmayız" |
| `frontend/app/cerez/page.tsx:22` | "reklam veya takip amaçlı çerez kullanmıyoruz" |
| `frontend/app/cerez/page.tsx:160-163` | Kullanılmayanlar listesi: reklam/retargeting çerezleri, reklam ağlarına aktarım, GA reklam özellikleri |
| `frontend/components/CookieConsent.tsx:52` | "Reklam veya takip çerezi kullanmıyoruz." |

⚠️ İleride AdSense eklenirse **bu üç metin ve çerez bandı da güncellenmeli**, aksi hâlde
KVKK/aydınlatma beyanıyla çelişir.

Mevcut tek üçüncü taraf ölçüm script'i: GA4 — `frontend/components/Analytics.tsx:21`
(`NEXT_PUBLIC_GA_ID` boş olduğu için şu an pasif; opt-out modeli, `kt_cookie_consent`).

---

## 5. LAYOUT

### 5.1 Kök layout

`frontend/app/layout.tsx` — **her sayfayı sarar**.

| Satır | İçerik |
|---|---|
| 18 | `export const revalidate = 60` |
| 22 | `generateMetadata()` — backend `/api/seo/meta`'dan başlık/açıklama/og görsel |
| 60-66 | `export const viewport` — `themeColor: "#0e0b1e"`, `width: device-width`, `initialScale: 1`, **`maximumScale: 1`**; `viewportFit` **yok** |
| 68 | `RootLayout` — `fetchAppearance()` ile `<html data-sky=...>` |
| 74-78 | Google Fonts `preconnect` + `<link>` (Space Grotesk, Inter) |
| 80-84 | Tema-flash önleyici inline `<script>` (`kt_theme` okuyup `data-theme` basıyor) |
| 87 | `<NightBackground enabled theme>` |
| 89-91 | `<Suspense><Analytics /></Suspense>` |
| 92 | `<Providers><DesktopChrome>{children}</DesktopChrome><BottomNav /></Providers>` |
| 93 | `<CookieConsent />` |

`frontend/components/Providers.tsx` içinde global olarak koşanlar:
`AuthProvider` + `HeartbeatPinger` + `ChallengeWatcher` + `UiClickSound`.

### 5.2 Middleware

**YOK.** `frontend/` altında `middleware.ts` / `middleware.js` dosyası bulunmuyor.

### 5.3 Footer

`frontend/components/Footer.tsx` — linkler: Nasıl Oynanır, Gizlilik & KVKK,
Kullanım Koşulları, Çerez Politikası + telif satırı (`lib/legal.ts` → `COMPANY`).

İki yerden render ediliyor:

1. `frontend/components/DesktopChrome.tsx:23` — `.kt-desktop-chrome` sarmalıyla, yani
   **CSS ile mobilde gizli**. Ayrıca şu yollarda hiç render edilmiyor:
   `HIDE_ON = ["/oyna", "/arena", "/solo", "/gunun-kelimesi", "/giris", "/yonetim"]` ve `/`
2. `frontend/app/page.tsx:41` — ana sayfa kendi `TopBar` + `Footer`'ını basıyor

Mobil navigasyon: `frontend/components/BottomNav.tsx:76` — `position: fixed; bottom: 0`,
üstünde 76px'lik spacer div, `maxWidth: 560`. **`env(safe-area-inset-bottom)` kullanmıyor.**

### 5.4 Alt layout'lar

13 adet (`app/arena/layout.tsx`, `app/lig/layout.tsx`, `app/profil/[username]/layout.tsx` …)
— hepsi sadece `pageMetadata("<key>")` ile SEO metası üretiyor.

---

## 6. AUTH

### 6.1 Oturum mekanizması

**Saf JWT + `localStorage`. Cookie hiç kullanılmıyor** — backend'de
`set_cookie` / `SameSite` / `cookies` araması sıfır sonuç verdi.
Dolayısıyla SameSite / Secure / HttpOnly gibi bir cookie politikası **yok**.

| Konu | Değer |
|---|---|
| Token üretimi | `backend/app/core/security.py:44` `create_access_token` |
| Algoritma | HS256 (`config.py:47` `JWT_ALGORITHM`) |
| Payload | `{"sub": str(user_id), "exp": ...}` |
| Ömür | **30 gün** (`security.py:24` `TOKEN_EXPIRE_DAYS = 30`) |
| Refresh / revocation | **Yok** |
| Taşıma | `Authorization: Bearer <token>` header |
| Doğrulama | `backend/app/core/deps.py:14` `get_current_user`; ayrıca `get_optional_user` (31), `get_admin_user` (44) |
| WS auth | Arena: query `?token=`; Maç: **doğrulama yok** |

**Frontend saklama** (`frontend/lib/auth.tsx`):

| Anahtar | Satır | İçerik |
|---|---|---|
| `kt_token` | 41 (`TOKEN_KEY`) | JWT |
| `kt_user` | 43 (`USER_CACHE_KEY`) | Son bilinen profil (ilk boyamada iskelet göstermemek için) |
| `kt_uid` | 90, 101 | Kullanıcı id'si |

Ayrıca `kt_theme` (tema) ve `kt_cookie_consent` (çerez onayı) da `localStorage`'da.

**CORS:** `backend/app/main.py:30-46` — `FRONTEND_ORIGIN` boş veya `*` ise
`allow_origin_regex=".*"` + `allow_credentials=True`, yani pratikte **tüm origin'lere açık**.
Capacitor'ün `capacitor://localhost` / `https://localhost` origin'i için sorun çıkarmaz.

### 6.2 Google OAuth akışı (bugünkü hâli)

Redirect tabanlı klasik OAuth **değil** — Google Identity Services (GIS) ile
tarayıcı içi `id_token` akışı:

1. `frontend/components/GoogleSignIn.tsx:74` → `GET /api/auth/google/status`
   (`backend/app/api/routes/auth.py:79`). `GOOGLE_CLIENT_ID` boşsa `configured:false`
   döner ve bileşen **hiçbir şey çizmez** (`GoogleSignIn.tsx:130` → `if (!clientId) return null`).
2. `client_id` gelirse `https://accounts.google.com/gsi/client` script'i `<head>`'e
   dinamik olarak enjekte edilir (`GoogleSignIn.tsx:16`, `44-49`).
3. `google.accounts.id.initialize({ client_id, callback })` + `renderButton()`
   (`GoogleSignIn.tsx:94-118`) — Google'ın kendi butonu, kendi popup/One Tap akışı.
4. Callback bir `credential` (**id_token**) verir → `loginGoogle(idToken)`
   (`frontend/lib/auth.tsx:139`) → `POST /api/auth/google`.
5. Backend (`backend/app/api/routes/auth.py:88-125`):
   - id_token'ı `https://oauth2.googleapis.com/tokeninfo`'ya sorar
   - `aud == GOOGLE_CLIENT_ID` kontrolü
   - `iss ∈ {accounts.google.com, https://accounts.google.com}` kontrolü
   - `email_verified` değilse e-postayı **yok sayar** (hesap ele geçirme koruması)
   - `auth_service.get_or_create_google_user(sub, email, name, picture)`
   - kendi JWT'sini döner (`_auth_response`, `auth.py:41`)

**Durum: canlıda kapalı.** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` Coolify'da
girilmemiş (bkz. `CLAUDE.md` §6), dolayısıyla buton hiç görünmüyor.
Kontrol ucu: `GET /api/health` → `google_oauth_configured`.

reCAPTCHA v2 aynı desende ve o da kapalı: `frontend/components/Recaptcha.tsx:33`,
`backend/app/core/captcha.py`, `GET /api/auth/captcha/status`.

---

## 7. CACHING

Cloudflare / Traefik konfigürasyonu **repoda yok** (Coolify panelinde tutuluyor);
o katman bu incelemeden doğrulanamadı. Next.js tarafında ise ISR **var ve aktif**:

| Yer | Ayar |
|---|---|
| `frontend/app/layout.tsx:18` | `export const revalidate = 60` — **her sayfayı etkiler** |
| `frontend/app/page.tsx:19` | `export const revalidate = 30` (ana sayfa) |
| `frontend/app/sitemap.ts:6` | `export const revalidate = 3600` |
| `frontend/lib/seo.ts:143,155` | `fetch(..., { next: { revalidate: 60 } })` |
| `frontend/lib/appearance.ts:24` | `next: { revalidate: 60 }` |
| `frontend/lib/homeData.ts:16,19` | `next: { revalidate: 30 }` |
| `frontend/app/oda/[code]/page.tsx:5,10` | `dynamic = "force-dynamic"` + `cache: "no-store"` |
| `frontend/app/arena/ozel/[code]/layout.tsx:4,11` | `dynamic = "force-dynamic"` + `cache: "no-store"` |
| `frontend/app/profil/[username]/page.tsx:100` | `cache: "no-store"` |
| `frontend/lib/api.ts:12` | client `getJSON` → `cache: "no-store"` |

`frontend/next.config.js`: `output: "standalone"`, `reactStrictMode: true`,
`/favicon.ico` → backend rewrite. Özel `headers()` bloğu **yok**.

### 7.1 User-Agent'a göre farklı HTML mümkün mü?

**Hayır.** Hiçbir yerde `headers()`, `userAgent()`, `Vary: User-Agent` veya UA'ya göre
dallanma yok. Kök layout'taki `revalidate = 60` sayesinde **aynı HTML herkese servis edilir**.

Sonuç: Capacitor webview'a özel **sunucu tarafı** HTML üretmek bu kurulumda çalışmaz.
Uygulamaya özel davranış ya client-side (custom UA'yı JS'te okuyup state'e almak),
ya query parametresiyle, ya da ilgili sayfaları `force-dynamic`'e çekip `Vary` ekleyerek
yapılmalı.

ISR'nin bilinen yan etkisi (`CLAUDE.md` §4'te de yazılı): stale-while-revalidate nedeniyle
süre dolduktan sonraki **ilk** ziyaret hâlâ eski sayfayı görür, yenisi arka planda üretilir.

---

## 8. CAPACITOR RİSKLERİ

### Yüksek

1. **Google girişi embedded webview'da çalışmaz.**
   Google `accounts.google.com/gsi/client`'ı embedded webview'da bloklar
   (`disallowed_useragent`). Özellik bugün zaten kapalı olduğu için regresyon değil,
   ama mobilde açılmak istenirse native SDK ile alınan `id_token`'ın mevcut
   `POST /api/auth/google` ucuna gönderilmesi gerekir — backend akışı olduğu gibi
   kullanılabilir, yalnızca token'ın kaynağı değişir.
   Ayrıca sosyal giriş sunan uygulamalarda Google Play **hesap silme yolu** ister
   (`/api/account/...` uçları kontrol edilmeli).

2. **Bildirimler tamamen polling — arka planda hiçbir şey gelmez.**
   Zil 30 sn (`NotificationBell.tsx:25`), challenge 3 sn (`ChallengeWatcher.tsx:57`),
   heartbeat 30 sn (`HeartbeatPinger.tsx:22`). Native push olmadan "mobil uygulama"
   hissi oluşmaz.
   Ek olarak: **maç teklifi 30 sn TTL ile bellekte** (`challenge_service.py:15`).
   Push eklense bile kullanıcı uygulamayı 30 sn içinde açmazsa teklif ölmüş olur —
   challenge'ın kalıcılaştırılması gerekir.

3. **`position: fixed` + safe-area uyumsuzluğu.**
   11 yerde fixed konumlama var, ama `env(safe-area-inset-*)` yalnızca 2 yerde:
   `frontend/app/globals.css:223` ve `frontend/components/CookieConsent.tsx:34`.
   Kritik olan `frontend/components/BottomNav.tsx:76` (`bottom: 0` + 76px spacer) —
   iPhone home indicator'ı ve Android gesture bar'ının altında kalır.
   Ayrıca `frontend/app/layout.tsx:60` `viewport`'unda **`viewportFit: "cover"` yok**;
   o eklenmeden `env(safe-area-*)` zaten 0 döner.
   Diğer fixed noktalar: `ChallengeWatcher.tsx:91`, `NightBackground.tsx:55,85`,
   `ThemeToggle.tsx:69`, `ArenaGame.tsx:160`, `TitleCelebration.tsx:59`,
   `TutorialDemo.tsx:103`, `ProfileEditModal.tsx:131`, `globals.css:452`.

4. **Tek instance zorunluluğu.**
   Presence, challenge, oda ve arena lobileri in-process bellekte. Mobil trafikle
   ölçekleme gerekirse Redis'e taşınması şart — Redis ayakta ama kodda hiç kullanılmıyor.

### Orta

5. **`window.open` popup.**
   `frontend/components/ShareButtons.tsx:56` →
   `window.open(href, "_blank", "noopener,noreferrer,width=640,height=620")`.
   Capacitor webview'da ya hiç açılmaz ya da uygulama içinde kilitli bir pencere açar.
   `@capacitor/browser` veya native paylaşım gerekir.

6. **`navigator.share` + yanlış URL.**
   `frontend/components/MatchGame.tsx:784` — `url: "https://kelimetahmin.com"` sabit
   (www'suz). Webview'da Web Share API çoğu zaman yok; `@capacitor/share`'a düşülmeli.

7. **Dış CDN bağımlılıkları (offline/kısıtlı ağda bozulma + mağaza gizlilik beyanı).**

   | Servis | Yer |
   |---|---|
   | Google Fonts | `app/layout.tsx:74-78` |
   | `api.dicebear.com` (avatar) | `HomeModes.tsx:70`, `ArenaGame.tsx:193,460,511,719`, `ProfileEditModal.tsx:158`, `RoomInvite.tsx:75`, `DesktopUserSummary.tsx:34`, `HomeHero.tsx:34`, `app/bildirimler/page.tsx:49`, `app/arena/ozel/page.tsx:131`, `app/arena/ozel/[code]/page.tsx:70` |
   | Google Analytics | `Analytics.tsx:21` |
   | reCAPTCHA | `Recaptcha.tsx:33` |
   | Google Identity | `GoogleSignIn.tsx:16` |

8. **Sabit mutlak URL'ler.**
   `frontend/lib/site.ts:2` — `SITE_URL` varsayılanı `https://www.kelimetahmin.com`.
   `NEXT_PUBLIC_SITE_URL` `docker-compose.yml`'de build arg olarak **geçirilmiyor**,
   yani pratikte her zaman bu değer derleniyor. `frontend/lib/legal.ts:19` de sabit.

9. **`window.location.href` ile tam sayfa yenileme.**
   `frontend/components/ChallengeWatcher.tsx:48` ve `:74` — router yerine hard navigation.
   Webview'da beyaz flaş + tüm JS state kaybı; `useAuth` sıfırdan kurulur.

10. **WebSocket + arka plan.**
    Android/iOS uygulamayı arka plana alınca webview'ı dondurur → WS kopar.
    `useMatch.ts` ve `useArena.ts`'te **otomatik yeniden bağlanma yok**
    (`ws.onclose` yalnızca `setConnected(false)` yapıyor).
    Maç ortasında gelen bir telefon çağrısı maçı fiilen bitirir.

11. **`maximumScale: 1`** (`app/layout.tsx:64`) — pinch-zoom engelli; mağaza
    erişilebilirlik denetimlerinde uyarı üretebilir.

### Düşük

12. **Dosya indirme yok** — `download=` attribute'u hiç kullanılmıyor.
    Ses/müzik backend'den `<audio>` ile çalınıyor (iOS'ta otomatik oynatma
    kullanıcı etkileşimi ister — `lib/useSectionMusic.ts` ayrıca incelenmeli).

13. **Mevcut service worker yok** → eski bir SW'nin uygulamada takılı kalması riski
    **yok**, temiz başlangıç.

14. **`localStorage` kalıcılığı.**
    JWT `localStorage`'da; iOS WKWebView agresif depolama temizliği yapabilir →
    beklenmedik oturum düşmesi. `@capacitor/preferences` daha güvenli.
    Ayrıca token 30 gün ömürlü ve refresh yok → mobilde 30 günde bir zorunlu yeniden giriş.

15. **CORS zaten `*`** (`main.py:34-40`) — Capacitor origin'i sorunsuz geçer.
    WS uçları CORS'a tabi değil, onlar da sorunsuz.

---

## 9. Doğrulanamayan / varsayılan noktalar

Bu belgedeki tespitler yalnızca **repo içeriğine** dayanır. Aşağıdakiler doğrulanamadı:

1. **Cloudflare veya Traefik seviyesinde cache var mı** — repoda hiçbir proxy config'i yok,
   hepsi Coolify panelinde. `Vary: User-Agent` davranışı sadece Next.js katmanı için doğrulandı.
2. **Coolify'da hangi env değişkenlerinin gerçekten dolu olduğu** — `GOOGLE_CLIENT_ID`,
   `NEXT_PUBLIC_GA_ID`, `ADMIN_EMAIL`, `RECAPTCHA_*` kodda hazır. "Kapalı" değerlendirmeleri
   `CLAUDE.md` §6'daki nota dayanıyor.
3. **`NEXT_PUBLIC_SITE_URL`'in canlıdaki değeri** — compose'da build arg olarak geçirilmediği
   için "her zaman varsayılan" kabul edildi; Coolify'da Dockerfile dışı bir override varsa bu yanlış.
4. **Backend'in kaç replika koştuğu** — kod tek instance varsayıyor (`room.py:15`),
   canlı durum doğrulanmadı.
5. **Mevcut mobil kullanım oranı ve hedef platform önceliği** (önce Android mı?) —
   bilinmiyor; risk sıralaması iki platforma eşit ağırlıkla yapıldı.
6. **Push için hangi sağlayıcının düşünüldüğü** (FCM / OneSignal / APNs doğrudan) —
   kodda hiçbiri yok; yalnızca "yok" tespiti yapıldı, öneri yapılmadı.
7. **Ses/müzik otomatik oynatmanın iOS'ta bugünkü davranışı** — `lib/useSectionMusic.ts`
   bu turda satır satır okunmadı, yalnızca risk işaretlendi.
8. **`app/menu`, `app/gecmis`, `app/nasil-oynanir` gibi bazı sayfalarda** ek `position: fixed`
   veya dış URL olup olmadığı — grep'ler tüm `app/` ve `components/`'i taradı, ancak
   her dosya satır satır okunmadı.
9. **Google Play / App Store'un bu içerik için ek gereksinimleri** (hesap silme, yaş
   derecelendirmesi, gizlilik etiketleri) — mağaza politikası tarafı değerlendirilmedi.
