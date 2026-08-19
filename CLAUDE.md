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

### Özel oda (1v1 + 3-4 kişilik)
- **Kurulum ekranı** (`/oyna?mode=create`): kişi sayısı (2/3/4), tur sayısı (1-5),
  bekleme süresi (1/2/5/10 dk). Her turda 5 veya 6 harfli RASTGELE kelime
  (`custom_round_plan`). Oda dolunca maç otomatik başlar; süre dolarsa oda kapanır
  (`Room.watch_expiry` → `room_expired` mesajı, kod geçersiz).
  DİKKAT: `/room/create` **async** olmalı — senkron def'te `asyncio.create_task` çalışmaz.
- **3-4 kişilik buzzer akışı** (`Match.is_multi`): ilk buzzer'ı kapan cevaplar; bilemezse
  `blocked_ids`'e girer ve KALANLAR yarışır; tek kişi kalırsa ona doğrudan sıra; herkes
  bilemezse liste sıfırlanır, yarış baştan başlar. **2 kişilik akış DEĞİŞMEDİ** (yanlış/timeout →
  sıra doğrudan rakibe).
- 3-4 kişilikte **ELO/XP/rozet/lig YOK** ve maç geçmişine yazılmaz (özel arena gibi):
  `match.py` istatistik callback'i yalnız 2 kişilik maçlara bağlanır.
- Arayüz: `MultiScoreBar` (üstte foto, altında kısa ad + puan, sıra/eleme durumu),
  `MultiResult` (sıralama tablosu + paylaşım). Biri ayrılırsa maç devam eder (≥2 kişi).
- Paylaşım grubu: `room` (win/podium/loss) — admin → 💬 Sonuç PM.

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

### Ana sayfa buton görünümü (admin)
- Admin → **🏠 Ana Sayfa** sekmesi: her mod butonunun **sol ikonu**, **arka plan (dekor) ikonu**
  ve **rengi** ayrı ayrı düzenlenir + "Varsayılana dön". 8 buton: arena, custom_arena, marathon,
  duel (hero), bot, room, daily, league.
- Model `app/models/home_button.py` (DEFAULT_HOME_BUTTONS = MEVCUT tasarım), uçlar
  `app/api/routes/home_buttons.py` (public `GET /api/home/buttons`).
- Arka plan ikonu boşsa sol ikonun aynısı kullanılır. **`bg` boşsa** buton rengi
  globals.css'teki varsayılan kalır — duel/bot/room bilerek boştur (stil2 tonları bozulmasın).
- Frontend: `lib/homeButtons.ts` (DEFAULTS burada da var, ikisi birlikte güncellenmeli);
  `app/page.tsx` sunucuda çekip `HomeModes buttons={...}` ile verir (ISR 60 sn, titreme yok).

### Sonuç paylaşımı
- `components/ResultShare.tsx`: metin önizlemesi + WhatsApp · X · Telegram · Facebook · 📋 Kopyala
  (+ mobilde native paylaşım). 1v1, Arena, Günün Kelimesi ve Maraton sonuç ekranlarında.
- Metin üç parçadır: **sabit skor satırı** (`lib/shareText.ts` — "🏆 Nazım, Ahmet'i 200-0 yendi!",
  Türkçe belirtme eki `acc()` ile) + **rastgele yorum satırı** + **alt bilgi**.
- Yorum satırları ve alt bilgi admin panelden yönetilir: **💬 Sonuç PM** sekmesi.
  Gruplar: 1v1 (kazandı/kaybetti/berabere), Arena (1./podyum/podyum dışı), Günün Kelimesi
  (bildi/bilemedi), Maraton. Her grupta varsayılan 5 satır; istenirse eklenir/pasifleştirilir.
  Model `app/models/share_line.py` (startup'ta BOŞ gruplara seed), uçlar
  `app/api/routes/share_texts.py` (public `GET /api/share-texts`), arayüz `lib/shareTexts.ts`.
  Alt bilgi tek alan: `game_settings.share_footer`.
- Paylaşılan adres bulunulan sayfadır (`pageUrl()` — sorgu parametreleri atılır).
  Facebook metni taşımaz (kendi kısıtı), sadece sayfanın OG başlığını gösterir → OG metinleri
  admin → 🔍 SEO'dan zengin tutulmalı.

### Profil fotoğrafı & moderasyon
- **Yükleme**: profil düzenle → "Profil Fotoğrafı Yükle" (sürükle-bırak / göz at). Küçültme
  TARAYICIDA: kareye kırp → 200×200 → orta kaliteli JPEG (`PhotoUpload.tsx`). Orijinal dosya
  sunucuya hiç gitmez. İstemci sınırı 15 MB, sunucu sınırı 400.000 karakter (`/account/photo`).
- **Görünürlük**: `User.avatar_photo` = ONAYLI foto (herkese), `User.avatar_pending` = onay bekleyen
  (yalnız sahibine). `User.public_avatar` = `avatar_photo or avatar_url` — tüm public uçlar bunu
  kullanır (profil, lig, arkadaşlar, son maçlar, arena, maç). Sahibi kendi bekleyen fotoğrafını
  profilinde ve maç barlarında görür (istemci `useAuth().user.avatar_url` ile kendi satırını basar).
- **Admin → 🖼️ Foto Mod**: bekleyen fotoğraflar, Onayla/Reddet; ikisi de bildirim gönderir.
- **Admin → 🏷️ Ad Mod**: `User.name_status` (pending/approved/rejected). Yeni kayıt ve her ad/kullanıcı
  adı değişikliği pending'e düşer. Reddedilince ad+username `user{id}{3 hane}` olur, kullanıcıya
  bildirim gider (`name_rejected`).
- Sekme başlıklarında bekleyen sayısı rozeti (`GET /admin/moderation/counts`, 60 sn'de bir tazelenir).
- **Aç/kapa anahtarları** (sekmelerin en başında; ⚙️ Ayarlar → Moderasyon ile aynı kayıtlar,
  `GET/PUT /admin/moderation/settings`):
  - `photo_upload_enabled` — kapalıysa yükleme bölümü gizlenir + `/account/photo` 403 döner;
    eski sistem (hazır DiceBear avatarı) devam eder. Foto yüklemeyen herkes zaten avatar kullanır.
  - `photo_moderation_enabled` — kapalıysa yüklenen foto ONAYSIZ yayınlanır (`avatar_photo`).
  - `name_moderation_enabled` — kapalıysa yeni kayıt/ad değişikliği doğrudan `approved`, rozet çıkmaz.
  Kapatmak eski BEKLEYEN kayıtları silmez; admin isterse yine onaylayabilir.

### Bildirimler
- `/bildirimler` sayfası. Arkadaşlık, unvan (`title_up`), arena madalya (`arena_medal`) bildirimleri.
- Link'li bildirimler tıklanınca profil/arenaya gider.
- **Silme**: tek (✕), toplu (☑️ Seç → Seçilenleri Sil) ve Tümünü Sil (onay modalı).
  Uçlar: `DELETE /notifications/{id}`, `POST /notifications/delete {ids}`, `DELETE /notifications`.
- **Otomatik temizlik**: `notification_retention_days` (admin ⚙️ Ayarlar → Sosyal, varsayılan 30,
  0 = kapalı) günden eski bildirimler 6 saatte bir silinir
  (`app/services/notification_cleanup.py`, startup'ta task). Süre `GET /notifications` yanıtında
  `retention_days` olarak döner ve sayfanın altında kullanıcıya yazılır.

### Hızlı Giriş (isimle hesap) — Aşama 1: BACKEND TAMAM
Mobil uygulamada Google girişi ("[16] Account reauth failed") ve Play Games
(SIGN_IN_REQUIRED) çalışmadığı için Google'a bağımlı olmayan giriş yolu.
Aynı kod hem sitede hem uygulamada çalışır (uygulama web içeriğini canlıdan yükler).

- `POST /auth/quick {name}` → `{token, user}` (web girişiyle **birebir aynı** biçim).
  Görünen ad yazıldığı gibi kalır, username ondan türetilir (`unique_username_from_name` —
  Play Games ile AYNI fonksiyon: Türkçe→ASCII, boşluk silinir, küçük harf, doluysa
  2'den başlayan sıra no). En az 3 harf/rakam. E-posta boş, `verified=False`.
- `GET /auth/quick/status` → `{enabled}` (public).
- `POST /auth/verify {email, password}` (girişli) → e-posta+şifre ekler, `verified=True`.
  E-posta BAŞKASINDAYSA **hata değil**: HTTP 200 + `{ok:false, email_in_use:true,
  transfer_token, progress}` döner (60 dk ömürlü jeton).
- `POST /auth/transfer {transfer_token}` (hedef hesapla girişli) → ilerlemeyi taşır.
  Mantık `app/core/account_transfer.py`: sayaçlar toplanır, ELO/en iyi skor MAX alınır,
  benzersizlik kısıtlı tablolar (lig puanı, maraton bölümü, toplanan kelime, arkadaşlık,
  günün kelimesi) birleştirilir, maç geçmişindeki username yeniden yazılır, kaynak SİLİNİR.
  **Güvenlik**: kaynak yalnızca e-postasız/şifresiz/Google'sız, doğrulanmamış, admin
  olmayan hesap olabilir (`can_absorb`) — aksi halde 409.
- `users` yeni sütunlar: `verified`, `signup_ip`, `shadow_banned` (sonuncusu Aşama 4 için
  şimdilik sadece alan). Mevcut kullanıcılar migration 16 ile `verified=True` yapılır.
- Admin ayarları (⚙️ Ayarlar → **Hızlı Giriş** grubu): `quick_signup_enabled`,
  `quick_signup_ip_limit` (varsayılan 10, 0 = sınırsız). IP sayımı `signup_ip` üzerinden,
  her yöntemle açılan hesabı kapsar.
- **Oturum jetonu ömrü 30 gün → 365 gün** (`TOKEN_EXPIRE_DAYS`): doğrulanmamış hesabın
  tek dayanağı o jeton; mobilde Capacitor Preferences'ta saklanacak (Aşama 2).
- Testler: `backend/tests/hizli_giris_senaryo.py` — 82 senaryo, SQLite + PostgreSQL'de
  geçiyor. Canlı DB'ye bağlanmayı reddeder (adında `kt_test` yoksa durur).

**Aşama 2 (arayüz) — TAMAM:**
- **İsim popup'ı** `components/NamePrompt.tsx` + sağlayıcı `lib/accountGate.tsx`
  (Providers'a bağlı). Ayrı sayfa DEĞİL — WebView'de tam sayfa geçişi sorunluydu.
  Mobilde bottom sheet, masaüstünde ortada kart (`globals.css` → `.np-*`).
  Otomatik odak, Enter ile gönder, ✕ ile kapanır, DIŞARI TIKLAYINCA KAPANMAZ.
  Gönderince beklenmez: popup kapanır, hesap arka planda açılır, iş sürer.
  Kullanılışı: `const { ensureAccount } = useAccountGate(); ensureAccount(() => router.push("/arena"))`.
  Ne zaman çıkar: ana sayfada oturumda BİR KEZ kendiliğinden (`autoPrompt`,
  sessionStorage `kt_name_prompt_seen`) + hesapsız kişi bir oyuna tıkladığında.
  Admin `quick_signup_enabled` kapatırsa popup açılmaz, `/giris`'e düşer.
- **Misafirlik KALKTI**: `GuestJoin.tsx` SİLİNDİ, yerine `AccountRequired.tsx`
  (oyna, arena, arena/ozel, arena/ozel/[code], solo, gunun-kelimesi, arkadaslar).
  Not: `ArenaGame`/`useArena` içindeki `guestName` yolu artık ÇAĞRILMIYOR (ölü kod,
  ilerde temizlenebilir); backend'in misafir uçları da duruyor ama arayüzden girilmiyor.
- **Doğrulama şeridi** `components/VerifyBanner.tsx` — ana sayfanın en üstünde,
  yalnız `verified === false` hesaplara. ✕ ile gizlenir, `verify_banner_days`
  (admin ayarı, varsayılan 3) gün sonra geri gelir. Kapatma kaydı kullanıcıya özel
  (`kt_verify_hide_{id}`). Süre `GET /api/auth/quick/status` ile gelir.
- **Doğrulama sayfası** `/dogrula` — üstte ad + @username, boş e-posta/şifre,
  e-posta başkasındaysa taşıma adımı (eski hesabın şifresi → login → /auth/transfer).
  SEO anahtarı `verify` (indexable=False).
- **Mobilde jeton native depoda**: `lib/tokenStore.ts`. localStorage HEMEN (senkron,
  web davranışı birebir aynı) + uygulamada Capacitor Preferences'a da yazılır.
  Açılışta localStorage boşsa native depodan geri yüklenir (`restoreToken`).
  Eklenti npm'den KURULMAZ — `registerPlugin("Preferences")` ile köprüye bağlanılır
  (lib/playGames.ts'teki yöntem); eklenti mobile/ tarafında zaten kurulu.
- Profil düzenlemede kullanıcı adı alanı ZATEN VARDI (ProfileEditModal → "Kullanıcı
  Adı", 30 günde 2 hak); üstüne "Profil adresin: .../profil/<ad>" açıklaması eklendi.
- Testler: `frontend/tests/` (Playwright, 49 + 9 senaryo) — kurulum README'de.
  Backend senaryoları: `backend/tests/hizli_giris_senaryo.py` (83 senaryo).


**Aşama 3 (bildirimler) — TAMAM:**
- Yeni bildirim türü **`verify_reminder`** (katalog grubu `system`, rota `/dogrula`).
  Birinci ve ikinci hatırlatma AYNI türü kullanır — kullanıcı tek anahtarla
  ikisini birden kapatabilsin. Katalog satırı `is_active=True`: ikinci hatırlatma
  türden değil, AYARDAN kapalıdır (admin tek düğmeyle açsın).
- Servis `app/services/verify_reminder.py`, startup'ta **saatte bir** çalışan döngü
  (main.py). Maç/arena koduna HİÇ dokunulmadı — riski sıfır tutmak için.
- Kime gider: `verified=false` **VE** e-posta/şifre/Google/Play Games'i olmayan
  (emniyet kemeri) **VE** en az `verify_reminder_min_games` (varsayılan 3) oyun
  oynamış (1v1 + arena + maraton) **VE** daha önce gönderilmemiş.
  Doğrulanmış hesaba ASLA gitmez (sorguda süzülür + gönderim öncesi tekrar bakılır).
- **Kalıcı damga tablosu `verify_reminders`** (`app/models/verify_reminder.py`,
  database.py import listesinde): user_id + first_sent_at / second_sent_at /
  cancelled_at. NEDEN AYRI TABLO: `notifications` satırları 30 günde bir siliniyor;
  onlara bakarak "iki kez gitmesin" kuralı uygulanamazdı.
- İkinci hatırlatma: birinciden `verify_reminder_2_days` (7) gün sonra, **ama
  `verify_reminder_2_enabled` VARSAYILAN OLARAK false** — panelden açılana kadar
  tek satır bile gitmez. Kişi arada doğrularsa `cancelled_at` yazılır, bir daha gitmez.
- Push, uygulama içi satır COMMIT EDİLDİKTEN SONRA ateşle-unut gönderilir; push
  izni/tercihi kapalı kullanıcı hatırlatmayı yine zil listesinde görür.
- Metinler kodda varsayılan; `notification_types.title_template/body_template`
  doluysa ONLAR kullanılır → Aşama 4'te panelden deploy'suz düzenlenebilir.
- Ayarlar (⚙️ → Hızlı Giriş): `verify_reminder_enabled`, `verify_reminder_min_games`,
  `verify_reminder_2_enabled`, `verify_reminder_2_days`.
- Frontend: `/bildirimler` eylem etiketi "Profili doğrula →" eklendi (başka
  değişiklik gerekmedi, liste tür-bağımsız çalışıyor).
- Testler: `backend/tests/dogrulama_hatirlatma_senaryo.py` — 51 senaryo,
  SQLite + PostgreSQL'de geçiyor.


**Aşama 4 (isim denetimi + admin paneli) — TAMAM:**
- **İki katmanlı isim denetimi**, hesap açmayı HİÇ BEKLETMEZ (arka plan görevi):
  1. `app/game/name_filter.py` — yerel Türkçe kara liste. Normalleştirme:
     Türkçe/Kiril→ASCII, leet (1→i, 0→o, $→s…), harf tekrarı, boşluk/nokta.
     İki ölçekte bakar: bütün isim + her kelime ayrı (yoksa "Admin Yardımcı"
     yakalanmıyordu). Üç eşleşme biçimi: içinde-geçme / tam-kelime / yalnız-tam-isim.
     **YANLIŞ ALARM KORUMASI**: whitelist, eşleşen küfür masum bir kelimenin
     parçasıysa (ve harf tekrarı sadeleşmiş hâlinde de) o eşleşmeyi düşürür.
     Gerçek örnekler: "Nazım"→"nazi", "Gaye"→"gay", "Sikke"→"sik", "Betül"→"bet",
     "Mal Müdürü"→"mal" hepsi yakalanıyordu; hepsi düzeltildi.
  2. `app/services/name_ai.py` — OpenAI (`OPENAI_API_KEY`, Coolify backend env).
     Model admin ayarı (`name_ai_model`, varsayılan gpt-4o-mini), JSON yanıt,
     isim VERİ olarak verilir (prompt injection'a karşı), bellek içi önbellek.
     Anahtar yoksa/hata olursa sessizce atlanır, yerel katmanla devam edilir.
- Karar `app/services/name_review.py`: `max(kara liste, yapay zekâ)`.
  `>= name_flag_threshold` (40) → İsim Kontrol listesine düşer, kullanıcı oynar.
  `>= name_auto_disable_threshold` (85) → hesap **pasife alınır** + adminlere
  bildirim + push. İkisini eşitlersen işaretlenen her isim kapanır; 100 yaparsan
  hiçbiri kapanmaz. Kara liste zaten pasife alma eşiğini geçtiyse modele
  SORULMAZ (para tasarrufu).
- Tetiklenen yerler: `/auth/quick`, `/auth/register`, `/account/display-name`,
  `/account/username` — hepsi commit sonrası `review_name_bg()`.
- `users` yeni sütunlar: `disabled`, `disabled_reason`, `disabled_at`.
  `get_current_user` pasif hesaba 403 + neden döner (`get_optional_user` → None).
- **Gölge ban artık GERÇEKTEN gizliyor** (Aşama 1'deki `shadow_banned` alanı):
  lig sıralaması + sayacı (`league_service`), üye arama (`profile.py`) ve
  eşleşme (izole kuyruk → yalnız botla oynar, `matchmaking.py`).
  Banlı IP'den açılan YENİ hesap da işaretli doğar (`auth_service.create_quick_user`).
  Kullanıcıya hiçbir yerde bildirilmez; `to_private()` de sızdırmaz.
- Yeni tablolar: `name_flags` (`app/models/name_flag.py`), `ip_bans`
  (`app/models/ip_ban.py`) — ikisi de database.py import listesinde.
- Admin uçları `app/api/routes/quick_auth.py`: `/admin/name-flags` (+ counts,
  clean / disable / ban-ip), `/admin/ip-bans` (liste, sil), `/admin/quick-auth`
  (GET tüm ayarlar + durum sayıları, PUT tek ayar — doğrulamalı).
- Admin paneli iki yeni sekme (`frontend/app/yonetim/page.tsx`):
  **🔎 İsim Kontrol** (rozetli; isim, katman, %güven, IP, hesap durumu, gerekçe +
  üç işlem + IP ban listesi) ve **⚡ Hızlı Giriş** (durum kutuları + Aşama 1-4'ün
  tüm ayarları tek ekranda, bildirim metinleri dahil).
- Hatırlatma metinleri artık `game_settings`'ten okunuyor
  (`verify_reminder_title/body`, `_2_title/_2_body`; boş = koddaki varsayılan) —
  panelden değiştirilir, deploy gerekmez.
- Testler: `backend/tests/isim_denetimi_senaryo.py` (151 senaryo, SQLite +
  PostgreSQL) ve `frontend/tests/isim_kontrol_paneli.mjs` (36 tarayıcı senaryosu).
- **OpenAI maliyeti**: isim başına ~300 girdi + ~25 çıktı jetonu →
  gpt-4o-mini ile ~0,00006 $ (1.000 isim ≈ 6 sent, 10.000 yeni kullanıcı ≈ 0,60 $).


**Ara iş (çıkışta hesap kaybı + şifre tekrarı) — TAMAM:**
- SORUN: doğrulanmamış hesabın tek anahtarı jetondu. "Çıkış yap"a basan kişi
  aynı ismi yazınca `nazim2` diye YENİ hesap açıyor, eskisi ve bütün ilerlemesi
  sonsuza dek erişilemez kalıyordu. İki katmanlı çözüldü:
  1. **Çıkış düğmesi gizlendi**: `user.verified === false` iken `/menu` ve
     `TopBar` "Çıkış Yap" yerine "Profili doğrula ve kaydet" gösterir.
     Doğrulandıktan sonra normal çıkış geri gelir.
  2. **"Son hesap" hatırası**: `lib/tokenStore.ts` → `LAST_KEY`
     (`kt_last_account`, {token, name}). ÇIKIŞ BU ANAHTARI SİLMEZ; web'de
     localStorage, mobilde ayrıca Capacitor Preferences. İsim popup'ı hatıra
     varsa önce "Tekrar hoş geldin + <İsim> olarak devam et" gösterir
     (`NamePrompt` → `lastName/onContinue/onForget`), isim alanını hiç açmaz.
     "Farklı isimle başla" hatırayı siler ve formu açar; yeni isim yazmak da siler.
  - GÜVENLİK: hatıra YALNIZCA doğrulanmamış hesaplarda tutulur. `applyAuth` ve
    `/auth/me` her seferinde `syncLastAccount` çağırır: doğrulanınca hatıra
    SİLİNİR, doğrulanmış hesap çıkış yaptığında da bırakılmaz (e-postasıyla girer).
  - `useAuth().continueAsLast(token)`: /auth/me ile jetonu doğrular; geçersiz ya
    da hesap kapatılmışsa hatırayı siler ve Türkçe hata döner.
- `/dogrula`: şifre **iki kez** yazılır. Uyuşmazsa alan altında uyarı, Kaydet
  pasif. Sebep: yanlış yazılan şifreyle kişi hesabını "kaydettim" sanır ama
  başka cihazdan bir daha giremez ve nedenini anlayamaz.
- Testler: `frontend/tests/hesap_kaybi_ve_sifre.mjs` (31 tarayıcı senaryosu).
  `hizli_giris_arayuz.mjs` şifre tekrarına göre güncellendi (50 senaryo).


**Ara iş 2 (hesap silme + üye yönetimi + ortam istatistikleri) — TAMAM:**
- **Şerit boşluğu**: `.vb-row` masaüstünde `margin-top: 18px` aldı (yalnız
  ≥721px medya sorgusunda — mobil görünüm dokunulmadan bırakıldı).
- **Kullanıcının kendi hesabını silmesi** (Google Play / App Store zorunluluğu):
  - `app/services/account_delete.py` → satır SİLİNMEZ, **anonimleştirilir**:
    ad "Silinmiş üye", username `silinmisuye001` (sıralı), e-posta/şifre/
    Google/Play Games/avatar temizlenir, `deleted=True` + `disabled=True`.
    NEDEN: satır silinseydi RAKİPLERİN maç geçmişi de bozulurdu.
  - Maç geçmişi satırları KALIR; adı "Silinmiş üye" olur, profil bağlantısı
    kaldırılır. Arkadaşlıklar, etiketler, push cihazları gerçekten silinir.
  - Sıralama, üye arama, arkadaş listesi ve profil sayfası `deleted` süzgeciyle
    kapatıldı (league_service, profile.py, friends.py).
  - Onay: şifresi olan ŞİFRESİNİ, olmayan GÖRÜNEN ADINI yazar
    (`GET /account/delete-info` hangisini isteyeceğini söyler).
    HERKES silebilir — doğrulanmış da doğrulanmamış da (Play şartı).
  - Arayüz: profil → Düzenle → **⚠️ Tehlikeli Bölge** (ne kaybedileceği madde
    madde yazılı). `?duzenle=1` ile doğrudan açılır.
  - **Girişsiz sayfa `/hesap-silme`** (Play'in istediği uygulama dışı adres):
    ne silinir/ne kalır + girişsizler için talep formu (destek biletine düşer).
    Altbilgide bağlantısı var, SEO anahtarı `account_delete`.
- **Admin → 👥 Üyeler**: `PUT /admin/users/{id}/status` ile **pasife alma /
  geri alma** (giriş engellenir, maç geçmişi ve sıralamalar BOZULMAZ) ve
  **gölge ban** (kullanıcı fark etmez, listelerden gizlenir). Gerçek silme YOK.
  Süzgeçler: Tümü / Aktif / Pasif / Gölge banlı / Silinmiş (sayılarıyla).
  Satırlarda PASİF / GÖLGE BAN / SİLİNMİŞ / DOĞRULANMAMIŞ rozetleri.
- **Cihaz simgesi**: 📱 mobil uygulama · 🌐 mobil tarayıcı · 🖥️ masaüstü.
  Ayrım `app/core/platform.py` → user agent'taki `KelimeApp/` işareti.
  `users.signup_platform` kayıtta, `users.last_platform` heartbeat/ziyarette yazılır.
- **Özet → "Bugün — Ortama Göre"**: ziyaretçi / yeni üye / doğrulama sayıları
  üç ortam için. Ziyaretçi kaynağı yeni `daily_visits` tablosu
  (`POST /api/stats/visit`, oturum başına bir kez, `components/VisitPing.tsx`).
  Kişisel veri tutulmaz (IP/user agent SAKLANMAZ). Mevcut özet alanları aynen duruyor.
- `users` yeni sütunlar: `deleted`, `deleted_at`, `signup_platform`,
  `last_platform`, `verified_at`, `verified_platform`.
- Testler: `backend/tests/hesap_silme_ve_uye_yonetimi_senaryo.py` (96 senaryo,
  SQLite + PostgreSQL) ve `frontend/tests/hesap_silme_ve_panel.mjs` (41 tarayıcı).
  NOT: testlerde lig ucu `/api/league/leaderboard` — `/api/league` 404 döner
  (Aşama 4 testindeki bir kontrol bu yüzden boşa geçiyordu, düzeltildi).


**Ara iş 3 (ziyaret sayacı + aralıklar) — TAMAM:**
- **Ziyaret kaydı SAYACA çevrildi.** Eski `daily_visits` ZİYARETÇİ BAŞINA satır
  yazıyordu (visit_date, platform, visitor_key) — tablo ziyaretçi sayısıyla
  büyüyordu. Yeni `daily_stats` gün + ortam + ölçü başına TEK satır tutar
  (`app/models/daily_stat.py`). Günde en fazla 3 satır oluşur.
- **Mevcut veri korunarak taşındı**: migration 17
  (`2026_08_daily_visits_to_counter`) eski satırları gün/ortam bazında toplayıp
  sayaca yazar, sonra eski tabloyu düşürür. `ON CONFLICT DO NOTHING` sayesinde
  tekrar çalışsa da sayılar iki katlanmaz. Gerçek Postgres'te veriyle sınandı.
- **Tekilleştirme cihaza taşındı**: `VisitPing.tsx` artık oturum başına değil
  GÜNDE BİR KEZ sinyal gönderir (localStorage'da tarih damgası). Sunucuda
  kimlik tutulmuyor; IP/user agent hâlâ SAKLANMIYOR.
- **Aralıklar**: `GET /admin/platform-stats?range=today|yesterday|week|month`
  (`app/game/platform_stats.py`). YENİ VERİ YAZMAZ:
  ziyaretçi = aralıktaki GÜNLÜK sayaç satırlarının toplamı,
  yeni üye/doğrulama = `users` tablosundan tarih aralığıyla KESİN hesap.
  "Bu hafta" pazartesiden bugüne, "bu ay" ayın 1'inden bugüne.
- Arayüz: 📊 Özet'te tablonun üstünde aralık seçici; tablo aynı (3 ortam ×
  ziyaretçi/yeni üye/doğrulama). Altında "ziyaretçi = günlük tekil toplamı"
  açıklaması. `/admin/dashboard` yanıtındaki `platforms` (bugün) DURUYOR.
- **Kilitlenme notu**: sayaç `INSERT ... ON CONFLICT DO UPDATE count = count+1`
  tek cümledir; PostgreSQL satır kilidini yalnız o cümle boyunca tutar. Aynı
  gün+ortam satırına yazan istekler sıraya girer ("hot row"). Bugünkü hacimde
  (günde birkaç bin yazım) görünmez; saniyede yüzlerce yazıma çıkılırsa
  çözümler: satırı N parçaya bölmek (okurken toplamak), bellekte biriktirip
  periyodik yazmak ya da Redis INCR + periyodik aktarım.
- Testler: `hesap_silme_ve_uye_yonetimi_senaryo.py` 110 senaryoya çıktı
  (sayaç kurgusu + dört aralık), `frontend/tests/hesap_silme_ve_panel.mjs` 49.


**Ara iş 4 (kullanıcı adı kuralı + harf duyarsız benzersizlik) — TAMAM:**
- BULUNAN HATA: benzersizlik büyük/küçük harfe DUYARLIYDI; canlıda "yasemin"
  (#2) ve "Yasemin" (#7) yan yana oluşmuştu.
- **Karakter kuralı**: kullanıcı adı artık yalnız `a-z` ve `0-9`. Türkçe harfler
  çevrilir (ş→s, ı/I/İ→i, ç→c, ğ→g, ö→o, ü→u), büyük harf küçüğe iner, alt
  çizgi ve noktalama SİLİNİR. "IŞIK" = "Işık" = "ışık" → **isik**.
  Görünen ad Türkçe harfleri KORUR — kısıt yalnız kullanıcı adında.
  Tek fonksiyon: `app/game/name_rules.py` → `slugify_username()`; isimden
  türetme, ad değiştirme, Google ve e-posta kaydı hepsi buradan geçer.
  `clean_username` artık REDDETMEZ, ÇEVİRİR (arayüz "Kaydedilecek: …" gösterir).
- **Benzersizlik harf duyarsız**: `auth_service.get_user_by_username` artık
  `lower(username)` ile arar; bütün çakışma kontrolleri oradan geçer.
  Ayrıca DB'de `ux_users_username_lower` (unique index on `lower(username)`)
  — uygulama kodu atlansa bile çakışma oluşamaz.
- **Aramalar**: profil adresi (`/profil/Yasemin` de açar), maç geçmişi, karşılıklı
  skor, üye arama ve moderasyon yedek adı — hepsi harf duyarsız.
  Giriş zaten e-posta ile ve e-posta küçük harfe indiriliyor.
- **Mevcut kayıtlara DOKUNULMADI**: `app/services/username_audit.py` yalnız
  LİSTELER. Açılışta indeksi kurmayı dener; çakışma varsa kurmaz, log'a
  uyarı + liste yazar. Çakışmalar çözülünce indeks ilk açılışta kendiliğinden
  kurulur. Admin → 👥 Üyeler sekmesinin üstünde uyarı kutusu
  (`GET /admin/username-audit`), "ne olurdu" önizlemesiyle.
- Testler: `backend/tests/kullanici_adi_senaryo.py` (78 senaryo, SQLite +
  PostgreSQL). Canlıdaki çakışma durumu Postgres'te birebir taklit edilip
  açılışın çökmediği ve kayıtlara dokunmadığı doğrulandı.


**Ara iş 5 (rezerve kullanıcı adları) — TAMAM:**
- `admin`, `yonetici`, `destek`, `kelimetahmin`, `sistem`, `bot`, `me` gibi
  adları kimse alamıyor. Liste **kodda sabit DEĞİL**: `reserved_usernames`
  tablosu, admin → **🔒 Rezerve Adlar** sekmesinden ekle/sil/listele.
  Başlangıçta 45 ad seed edilir (yalnız tablo BOŞSA; admin silerse geri gelmez).
- Kontrol `app/game/reserved_names.py`: süreç içi cache, admin değişince
  invalidate. HARF DUYARSIZ ve `slugify_username`'den geçmiş hâle bakar —
  `ADMIN`, `Admin`, `admın`, `A-d-m-i-n` hepsi yakalanır. Eşleşme TAM addır
  (ör. `destekekibi` serbest; bulanık taklitleri Aşama 4'ün isim denetimi yakalar).
- Nerede çalışır: `_first_free` (isimden türetme, Google, e-posta kaydı, Play
  Games — hepsi buradan geçer) ve `clean_username` (ad değiştirme).
- Davranış:
  - **ad değiştirirken** → açık hata ("bu ad site tarafından ayrılmış"),
  - **isim popup'ında** → kullanıcı DURDURULMAZ. Varsayılan `neutral`:
    kullanıcı adı tarafsız tabana kaydırılır (`oyuncu`, `oyuncu2`…).
    NEDEN: `admin2` hâlâ "ikinci admin" izlenimi verir. Görünen ad yazıldığı
    gibi kalır ve zaten isim denetiminden geçer.
    Admin ayarı `reserved_fallback` = `neutral` | `number` (panelde iki seçenek).
  - `oyuncu` tabanı rezerve EDİLEMEZ (yedek yol tıkanmasın diye uç engelliyor).
- Panel ayrıca rezerve bir adı ŞU AN kullanan hesapları listeler — değiştirmez.
- Canlı kontrol: rezerve listedeki bir adı kullanan hesap YOK (13 üye).
- Testler: `backend/tests/rezerve_adlar_senaryo.py` (90 senaryo, SQLite +
  PostgreSQL), tarayıcı paketi 62 senaryoya çıktı.

**Aşama 5 (mobil temizlik) — TAMAM. Hızlı Giriş projesi bitti.**
İki adımda yapıldı (önce JS, doğrulandı; sonra native, doğrulandı).

*Arayüz / JS:*
- `lib/nativeGoogle.ts`, `lib/playGames.ts`, `components/PlayGamesAuth.tsx`,
  `lib/debugLastError.ts` ve (artıksız kalan) `lib/guestAccess.ts` SİLİNDİ.
- `GoogleSignIn.tsx` artık YALNIZ WEB: uygulamada `isNative` ise hiç çizilmez.
  `/giris` → `googleAvailable = platformReady && !isNative && googleConfigured`.
- `lib/auth.tsx`: `loginGoogleNative`, `playGamesSilent/Complete/Link` ve
  çıkıştaki native Google oturum bırakma adımı kalktı. `loginGoogle` (web) DURUYOR.
- `/menu` teşhis kutusundan Google/SocialLogin/PlayGames satırları ve
  "signIn dene" düğmesi çıktı; yerine `Preferences (jeton deposu): VAR/YOK`
  satırı kondu (kritik olan o).
- Ölü misafir kodu: `ArenaGame` + `MatchGame` (`isGuest` teşvik kartları),
  `useArena` (gid+ad ile bağlanma yolu).

*Native:*
- `PlayGamesPlugin.java` SİLİNDİ; `MainActivity` sade `BridgeActivity` oldu.
- `play-services-games-v2` bağımlılığı ve `playServicesGamesVersion` kalktı.
- Manifest'ten `com.google.android.gms.games.APP_ID`, strings.xml'den
  `game_services_project_id` kalktı.
- `@capgo/capacitor-social-login` hem `mobile/package.json` hem
  `frontend/package.json` içinden kalktı; `capacitor.config.ts`'teki
  `SocialLogin` bloğu ve üretilmiş gradle/asset kayıtları temizlendi.
- `androidx.browser` force bloğu KALDI ama gerekçesi güncellendi: artık capgo
  için değil, compileSdk 35 tavanı için bir emniyet.
- versionCode 8→9, versionName 1.7→1.8.

*Dokunulmayanlar (tek tek doğrulandı):* AdMob (bağımlılık + manifest
APPLICATION_ID + admob_app_id), Firebase Messaging (push-notifications eklentisi
+ google-services plugin), POST_NOTIFICATIONS izni, **Capacitor Preferences**
(jeton deposu — `native_test.mjs` ile çalıştığı kanıtlandı), app/browser/share/
splash-screen/status-bar/speech-recognition. Backend'e HİÇ dokunulmadı
(Google ve Play Games uçları duruyor, sitede Google girişi çalışıyor).

*Not:* `google-services.json` repoda YOK (`.gitignore:32`), yalnız Mac'te
duruyor — bu yüzden değişmesi mümkün değil.

*Kalan tek Google isteği:* `fonts.googleapis.com` (yazı tipi). Kimlik/giriş
değil; istenirse yazı tipleri self-host edilerek o da kaldırılabilir.

- Testler: `frontend/tests/mobil_google_yok.mjs` (7 senaryo) + mevcut tarayıcı
  paketleri (62 / 50 / 31 / 9) — hepsi 0 hata.

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
