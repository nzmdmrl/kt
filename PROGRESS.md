# PROGRESS — Kelime Tahmin

> Bu dosya projenin canlı hafızasıdır. Her yeni oturuma bu dosya + mevcut kod
> okunarak başlanır. "Nerede kaldık" sorusunun tek doğru cevabı burasıdır.
> Referans doküman: `Kelime_Tahmin_Proje_Dokumani_v1.4_FINAL.md`

## Genel Kararlar (değişmez)
- **Marka:** Kelime Tahmin · **Domain:** kelimetahmin.com · **Logo:** KT monogram
- **Stack:** FastAPI (backend) + Next.js 14 (frontend) + PostgreSQL + Redis
- **Deploy:** Coolify, tek `docker-compose.yml` (backend + frontend + db + redis)
- **Tüm API uçları `/api` altında.** WebSocket `/api/ws/...` altında olacak.
- **Kelimeler BÜYÜK harf, Türkçe harf duyarlı** (İ/ı ayrımı word_engine'de).
- **Oyun dili tek** (kurulum başına); arayüz dili çok dilli (i18n, Faz 11).

## Dizin Yapısı
```
kelimetahmin/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py                 # FastAPI app, /api altında rotalar
│       ├── core/config.py          # env tabanlı ayarlar (Coolify)
│       ├── api/routes/
│       │   ├── health.py           # GET /api/health
│       │   └── words.py            # /api/words/{stats,random,validate,evaluate}
│       ├── game/word_engine.py     # Türkçe harf motoru + Wordle renk mantığı
│       └── words/
│           ├── generate_wordlist.py  # ham liste -> tr_N.json (hazırlık)
│           ├── enrich_wordlist.py    # frekansla zorluk etiketi -> tr_N_pool.json
│           ├── word_service.py       # havuz yükle / rastgele / doğrula
│           └── data/tr_{4,5,6}_pool.json  # HAZIR kelime havuzları
└── frontend/  (Next.js 14 — iskelet)
```

## Kelime Havuzu (Faz 1'de hazır)
Kaynak: mertemin/turkish-word-list + hermitdave frekans listesi.
Filtre: özel isim/boşluk/tire/mastar elenmiş, sadece TR küçük harf.
Zorluk: frekans sırası ≤8000 = kolay, listede alt = orta, listede yok = zor.
Oyun varsayılan kolay+orta havuzdan seçer.

| Uzunluk | Toplam | Seçilebilir (kolay+orta) |
|---------|--------|--------------------------|
| 4 harf  | 1956   | 942  |
| 5 harf  | 5114   | 1834 |
| 6 harf  | 5272   | 1364 |

## Fazlar
- [x] **Faz 1** — İskelet + kelime motoru + kelime havuzu + Docker/Compose + frontend iskeleti
- [x] **Faz 2** — WebSocket maç: paylaşımlı ızgara + buzzer + sıra + 3 tur + puanlama + hız bonusu + 0-0 önleme
- [x] **Faz 3** — Auth (Google OAuth + e-posta/şifre) + kullanıcı profili temel
- [ ] **Faz 4** — Matchmaking + 100 bot (ELO'lu, davranış simülasyonu) + solo mod + VS ekranı
- [ ] **Faz 5** — Lig (günlük/aylık/yıllık/tüm zamanlar) + scheduler + kupa/madalya
- [ ] **Faz 6** — Rozet + detaylı profil + istatistik + ısı haritası
- [ ] **Faz 7** — Sesli mod (Web Speech + Whisper fallback)
- [ ] **Faz 8** — Rövanş + emote + günün kelimesi + arkadaş/özel oda + sonuç kartı
- [ ] **Faz 9** — Ana sayfa (canlı) + ziyaretçi tanıtım + footer statik sayfalar
- [ ] **Faz 10** — Ses/müzik sistemi + admin panel (istatistik + üreticiler + dil yönetimi)
- [ ] **Faz 11** — i18n (6 dil, genişletilebilir) + çok dilli SEO/ASO
- [ ] **Faz 12** — Tasarım cilası + VPS/Coolify README + tek zip

## Faz 2'de eklenenler (TAMAMLANDI)
Backend:
- `game/models.py` — RoundState, Player, GuessRow; ROUND_CONFIG (4/5/6 harf, 5/6/7 satır),
  süreler (tur 60s, buzzer 10s), hız bonusu (SPEED_BONUS=10). Hepsi Faz 10'da admin'e taşınacak.
- `game/match.py` — saf maç mantığı (test edilebilir): take_buzzer, submit_guess, tick,
  on_answer_timeout, on_round_timeout, 0-0 önleme (present+correct kadar teselli). Hedef gizli.
- `game/room.py` — oda yöneticisi + asyncio saniyelik timer + buzzer lock + broadcast.
  NOT: Faz 2 buzzer lock'u in-process `asyncio.Lock` (tek backend replikası varsayımı).
  Çok-replika ölçeğinde Redis SET NX'e geçilecek — arayüz korunacak.
- `api/routes/room.py` — POST /api/room/create, GET /api/room/{code}
- `api/routes/match.py` — WebSocket /api/ws/match/{code}?player_id=&name=
  İstemci action: buzzer / guess / ping. Sunucu type: joined/lobby/match_start/
  round_start/state/buzzer_taken/guess_result/turn_timeout/round_over/match_over/error.

Frontend:
- `lib/useMatch.ts` — WebSocket hook (http->ws dönüşümü API_BASE'den).
- `components/Grid.tsx`, `ScoreBar.tsx`, `MatchGame.tsx` — grid, skor, buzzer/klavye, faz yönetimi.
- `app/oyna/page.tsx` — oda kur/katıl + maç ekranı. Anonim player_id (localStorage).
- Ana sayfaya "Oynamaya Başla" CTA eklendi.

### Faz 2 test yöntemi (canlıda)
İki tarayıcı sekmesi: birinde /oyna → Yeni Oda Kur → kod al; diğerinde kodla Katıl.
Maç başlar. Sıra boşken ilk yazan/butona basan buzzer'ı kapar.
WebSocket Coolify/Traefik'ten `/api/ws/...` yoluyla geçer (Traefik ws'i otomatik destekler).
Eğer ws bağlanmazsa: backend domaininin (api.kelimetahmin.com) ws'e izin verdiğini,
NEXT_PUBLIC_API_BASE'in doğru olduğunu kontrol et.

## Faz 3 için notlar (sonraki oturum)
- Google OAuth + e-posta/şifre. `core/config.py`'de GOOGLE_CLIENT_ID/SECRET, JWT_SECRET hazır.
- PostgreSQL şeması ilk kez burada gelecek (users tablosu). SQLAlchemy async + migration.
- Şu an oyuncu kimliği anonim (localStorage). Faz 3'te gerçek hesaba bağlanacak;
  `player_id` yerine kullanıcı id'si kullanılacak, oyna sayfası auth'a bağlanacak.
- Redis (REDIS_URL) hazır ama Faz 2'de kullanılmadı; Faz 3+ session/matchmaking'de devreye girecek.

## SONRA DÜZELTİLECEK — kullanıcı geri bildirimleri (Faz 4/tasarım cilası)
Nazım'ın canlı testte gözlemleri (Faz 2 sonrası):
1. **İlk harf girişi kafa karıştırıyor.** Sistem ilk harfi otomatik koyup kalan
   harfleri istiyor; kullanıcı alışkanlıkla ilk harfi de yazınca çakışıyor
   ("KKUŞ"). Çözüm: Wordle gibi TAM kelimeyi yazdır (ilk harf dahil), sistem
   ilk harf doğruluğunu kontrol etsin — ilk kutu sadece görsel ipucu kalsın.
   MatchGame.tsx onType/submit ve Grid.tsx DraftLine bu mantığa göre elden geçecek.
2. **Sıra göstergesi zayıf.** "Sıra sende / rakipte" ayrımı yeterince net değil;
   tek tarayıcıda test ederken karışıyor. ScoreBar + MatchGame'de sıra durumu
   çok daha belirgin (büyük, renkli, animasyonlu) olmalı.
   → İkisi de Faz 4'te BOTLA gerçek koşulda test edilip düzeltilecek (kullanıcı
     botla oynarken daha iyi değerlendireceğini söyledi).

## Faz 3'te eklenenler (TAMAMLANDI)
Backend:
- `core/database.py` — async SQLAlchemy engine/session; init_models() startup'ta
  create_all yapar (deploy'da migration komutu GEREKMEZ). pool_pre_ping açık.
- `models/user.py` — User tablosu: email/username/password_hash/google_sub,
  display_name/avatar, elo(1000), istatistikler (matches/wins/losses/draws/
  words_solved/total_score), solo istatistikleri, created_at. to_public/to_private.
- `core/security.py` — ÖNEMLİ: passlib DEĞİL, doğrudan `bcrypt` (passlib güncel
  bcrypt ile uyumsuz). Şifre SHA-256+base64 ile 72-byte sınırına indirgeniyor. JWT (30 gün).
- `core/auth_service.py` — register_email/login_email/get_or_create_google_user,
  benzersiz username üretimi.
- `core/deps.py` — get_current_user / get_optional_user (Bearer token).
- `api/routes/auth.py` — POST register/login/google, GET me, GET google/status.
- `main.py` — auth router + startup event (DB init, 10 kez retry; DB gelmezse
  uygulama düşmez, DB'siz uçlar çalışır).
- requirements.txt: passlib ÇIKTI, bcrypt==4.2.1 GİRDİ.

Frontend:
- `lib/auth.tsx` — AuthProvider/useAuth: token localStorage (kt_token), /me ile
  restore, register/login/loginGoogle/logout.
- `components/Providers.tsx` — client wrapper; layout.tsx'e eklendi.
- `components/TopBar.tsx` — giriş durumu (kullanıcı adı+ELO / Giriş-Kayıt); ana sayfada.
- `app/giris/page.tsx` — giriş/kayıt sekmeli form; Google butonu google/status'a göre
  (şu an sadece "yakında" notu — Google JS SDK entegrasyonu key girilince tamamlanacak).
- `app/oyna/page.tsx` — giriş yapan `u{id}` + display_name ile oynar; anonim fallback korunur.

### Google OAuth durumu
Backend HAZIR (id_token doğrulama tokeninfo ile). Frontend'de Google Sign-In JS SDK
butonu henüz BAĞLANMADI — GOOGLE_CLIENT_ID girilince eklenecek (Faz 10 admin veya
key girildiğinde). Şu an e-posta/şifre tam çalışıyor.

## Faz 4 için notlar (sonraki oturum)
- Matchmaking: Redis kuyruğu, ELO'ya yakın eşleşme. 15 sn insan yoksa bot.
- 100 bot: dile bağlı isim+avatar üretici, ELO'lu, davranış simülasyonu
  (ELO×kelime zorluğu → bilme olasılığı, düşünme gecikmesi 2-8sn).
- VS ekranı: iki oyuncu yan yana (avatar, ELO, W/L, son maçlar), sonra maçta küçülür.
- Solo mod (skorlar lige değil profile solo panele).
- Maç bitince istatistik güncelle (matches_played, wins/losses, elo değişimi, words_solved).
  → users tablosu Faz 3'te hazır; Faz 4 maç sonucunu buraya yazacak.
- BURADA "sonra düzeltilecek" UX notlarını (ilk harf girişi + sıra göstergesi) BOTLA test edip düzelt.
