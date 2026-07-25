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
- [x] **Faz 4** — Matchmaking + 100 bot (ELO'lu, davranış simülasyonu) + solo/bot mod + VS ekranı
- [x] **Faz 5** — Lig (günlük/aylık/yıllık/tüm zamanlar) + scheduler + kupa/madalya
- [x] **Faz 6** — Rozet + detaylı profil + istatistik + ısı haritası
- [x] **Faz 7** — Sesli mod (Web Speech + Whisper fallback)
- [x] **Faz 8** — Rövanş + emote + günün kelimesi + arkadaş/özel oda + sonuç kartı
- [x] **Faz 9** — Ana sayfa (canlı) + ziyaretçi tanıtım + footer statik sayfalar
- [x] **Faz 10** — Ses/müzik sistemi + admin panel (istatistik + üreticiler + dil yönetimi)
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

## Faz 4'te eklenenler (TAMAMLANDI)
Backend:
- `models/bot.py` — Bot tablosu (name, avatar_url, lang, elo, active). init_models'a eklendi.
- `game/bot_names.py` — TR/EN gerçekçi isim havuzları + DiceBear avatar URL.
- `game/bot_engine.py` — ELO→beceri, solve_probability(elo,zorluk), think_delay(2-8s),
  decide_action, pick_guess (ipuçlarını kullanan inandırıcı yanlış tahmin).
- `game/bot_controller.py` — botun maçta otomatik oynamasını yürüten asyncio görevi.
  Room.handle_buzzer/handle_guess'i gerçek oyuncu gibi çağırır.
- `game/matchmaking.py` — in-process ELO kuyruğu (±300 eşleşme), 15sn sonra bot atar.
- `game/bot_generator.py` — dile bağlı bot üretici; startup'ta 100 TR bot seed eder.
- `game/match_result.py` — ELO formülü (K=32), apply_match_result (istatistik+elo), pick_bot.
- `api/routes/matchmaking.py` — POST /api/mm/join, GET /api/mm/poll, POST /api/mm/leave, GET /api/mm/status.
- `api/routes/match.py` — GÜNCELLENDİ: bot=1&bot_elo= paramıyla odaya bot ekler;
  maç sonu istatistik callback'i (on_match_over) bağlar.
- `game/room.py` — GÜNCELLENDİ: add_bot(), _bot_controllers, on_match_over callback,
  start_match bot controller başlatır, _end_match bot durdurur + callback çağırır.
- `game/models.py` — Player'a avatar_url eklendi.
- `main.py` — matchmaking router + startup'ta bot seed.

Frontend:
- `components/VsScreen.tsx` — iki oyuncu yan yana (avatar, ELO, W/L), 3-2-1 geri sayım.
- `components/MatchGame.tsx` — YENİDEN YAZILDI (UX düzeltmeleri, aşağıda).
- `lib/useMatch.ts` — bot/botElo paramları (WebSocket URL'ine bot=1 ekler).
- `components/Grid.tsx` — DraftLine tam kelime girişine uyarlandı.
- `app/oyna/page.tsx` — YENİDEN KURULDU: Rakip Bul (mm), Bota Karşı Oyna, Özel Oda,
  arama ekranı, VS ekranı akışı.
- `globals.css` — slideIn animasyonları.

### UX DÜZELTMELERİ YAPILDI (önceki "sonra düzeltilecek" notları)
1. ✅ İlk harf girişi: artık kullanıcı TAM kelimeyi yazıyor (ilk harf dahil, Wordle gibi).
   İlk kutu boşken soluk ipucu gösterir ama çakışma yok. Backend ilk harf doğruluğunu kontrol eder.
2. ✅ Sıra göstergesi: büyük renkli banner ("SIRA SENDE" yeşil / "İLK YAZAN KAPAR" amber /
   "RAKİBİN SIRASI" gri) + input rengi sıraya göre değişir.
   → Nazım botla test edip yeterli mi görecek; değilse ince ayar yapılır.

## Faz 5 için notlar (sonraki oturum)
- Lig sistemi: günlük/aylık/yıllık/tüm zamanlar. Günlük = o günkü en yüksek tek-maç puanı,
  aylık = günlük puanların toplamı (her gün oynayan birikim).
- Yeni tablo: LeagueScore veya DailyScore (user_id, date, best_score, ...).
- Maç sonu (match_result.apply_match_result) lig puanını da yazacak.
- Scheduler: ay sonu kupa/madalya dağıtımı (1. kupa, 2-3 madalya).
- NOT: bot maçları lige YAZILMAMALI mı? Karar: bot maçı da sayılır (oyuncu puanı gerçek),
  ama istersen admin'de kapatılabilir yapılır. Şimdilik sayılıyor.
- matches_played/wins/losses/elo zaten güncelleniyor (Faz 4). Lig bunun üstüne skor tablosu ekler.

## Faz 4 bilinen sınırlar (Faz 5+ veya cila)
- words_solved maç sonunda 0 yazılıyor (placeholder); Faz 5'te gerçek sayıya bağlanacak.
- Bot maçında rakip ELO'su istatistik callback'inde 1000 varsayılıyor; bot_elo'ya bağlanabilir.
- İki insan matchmaking'i test için: iki farklı tarayıcıdan aynı anda "Rakip Bul" gerekir;
  tek kişi test ederken 15sn sonra bot gelir (normal).

## Faz 4 UX DÜZELTMELERİ v2 (Nazım botla test sonrası)
1. ✅ İlk harf çift basma: onType artık buzzer'dan bağımsız harfi hemen kaydeder.
2. ✅ Süre görünürlüğü: ScoreBar'da 40px büyük geri sayım + cevap süresi ÇUBUĞU (progress bar).
3. ✅ EN ÖNEMLİ — Sıra dönüşümü düzeltildi (match.py):
   - Yanlış tahmin → sıra BOŞA değil DOĞRUDAN rakibe geçer (opponent_of) + yeni 10sn pencere.
   - on_answer_timeout → sıra karşıya geçer (dönüşümlü), boşa bırakmaz.
   - Artık aynı oyuncu ARD ARDA tahmin YAPAMAZ. Test edildi ve doğrulandı.
4. ✅ Sıra netliği: aktif oyuncunun ScoreBar kartı PARLIYOR (accent border+glow+bg) +
   banner "▶ SIRA SENDE" / "⏳ RAKİBİN SIRASI".

## Faz 4 UX DÜZELTMELERİ v3 (Nazım ikinci test sonrası)
- Süreler: tur 60→90sn, cevap penceresi 10→20sn (models.py). reveal 10sn.
- Tüm turlar 5 satır BAŞLANGIÇ (4/5/6 harf hepsi rows=5).
- Satır sınırı artık turu BİTİRMEZ — 5'ten fazla tahmin yapılabilir, ızgara aşağı
  genişler ve kaydırılabilir frame olur (Grid.tsx maxHeight+overflow+autoscroll).
  Tur yalnızca süre bitince veya kelime bilinince biter.
- Doğru cevap gösterimi: RoundState.reveal_word (bilinince VEYA süre bitince target).
  Grid'de RevealLine ile amber kutucuklarda flip animasyonuyla gösterilir.
- Tur arası 4→10sn (REVEAL_SECONDS) — doğru cevabı görme süresi.

## Faz 4 UX DÜZELTMELERİ v4 (Nazım üçüncü test — kritik buglar)
1. ✅ SEVGİ/SERGİ "listede yok" BUG: tahmin doğrulaması gevşetildi (match.py).
   Havuz üyeliği ŞART DEĞİL — is_valid_word_shape (uzunluk+TR harf+ilk harf) yeter.
   Wordle mantığı: tahmin serbest, hedef havuzdan. Artık SEVGİ ile SE serisi görünür.
2. ✅ Cevap çubuğu 20sn'ye ayarlandı (ScoreBar answerLeft/20, kırmızı eşik son 5sn).
3. ✅ Arka arkaya tahmin (frontend): locked state eklendi. Tahmin gönderilince input
   kilitlenir, guess_result gelince çözülür. canType = !locked && (myTurn||turnFree).
   (Backend zaten sağlamdı; sorun frontend input kilidinde idi.)
4. ✅ Çift basma (K'ya 2 kez): harf artık HER ZAMAN kaydedilir (setDraft önce),
   buzzer ayrı tetiklenir. onType canType'a bağlı, buzzer'dan bağımsız.
5. ✅ Harfler sırayla belirir: Grid Line animate prop, son satır flipIn ile
   harf harf (0.22s stagger). RevealLine de animasyonlu.
6. ✅ Tempo: handle_guess'te tahmin sonrası 1.6sn duraklama (harfler görünsün);
   bot yazma gecikmesi 0.8-1.8 → 1.8-3.2sn (bot çok hızlı geçmesin).

## Faz 4 UX DÜZELTMELERİ v5 (Nazım ekran görüntülü test)
1. ✅ Aynı kelime tekrar denenemez (match.py): r.rows'daki denenmiş kelimeler
   kontrol edilir, "Bu kelime zaten denendi" hatası. (Resimde UMMA iki kez vardı.)
2. ✅ Bot temposu: _consider_turn'de think_delay + 2.5-5.0sn taban eklendi.
   Bot artık tur başında hemen dalmaz, insana yazma alanı bırakır.
3. ✅ Banner sonuç durumu (MatchGame): tur bitince solved_by'a göre:
   "🎉 DOĞRU! Bildin!" (yeşil) / "Rakip bildi" (turuncu) / "Kimse bilemedi" (gri).
   Artık kazanınca "sıra sende" yazmıyor; kazanan farklı renkte.
4. ✅ Uygunsuz kelime temizliği: app/words/blacklist.py; havuzlardan KALTAK vb.
   küfür/argo çıkarıldı (4h:-3, 5h:-6, 6h:-6). Admin (Faz 10) genişletecek.

## Faz 4 UX DÜZELTMELERİ v6 (bot controller yeniden yazıldı — KRİTİK)
Sorun: v5'te "aynı tahmin engeli" ve "bot tempo" eklendiği halde bot HÂLÂ
insanla aynı anda/hemen tahmin yapıyordu. Kök neden bulundu (bot_controller.py):
  - _acted_this_round yanlış tahmin sonrası discard ediliyordu -> bot aynı turda
    hemen tekrar deneyebiliyordu.
  - Sıra bota geçince gecikmesiz _make_guess çağrılıyordu -> bot anında oynuyordu.
Çözüm: bot_controller.py TAMAMEN yeniden yazıldı (v6):
  - _busy flag: paralel hamle imkansız (aynı anda iki tahmin olamaz).
  - Sıra insanda ise bot HİÇBİR ŞEY yapmaz (araya girmez).
  - Sıra boşsa _consider_open_turn: think_delay + 3-6sn taban (insana öncelik).
  - Sıra bota geçince _take_my_turn: 2-3.5sn yazma gecikmesi (ani değil).
  - _guess_now: denenmiş kelimeyi tekrar seçmez (8 deneme).
Test: insan yanlış -> bot ~2.6sn sonra oynadı (ani değil); bot spam yapmadı.
Not: İ/I ayrımı korunuyor (Türkçede farklı harfler); PİPİ≠PIPI teknik olarak doğru.

## Faz 4 UX DÜZELTMESİ v7 (Türkçe İ/I büyük harf bug)
Sorun: İ (noktalı) harfine basınca I (noktasız) giriyordu. Kök neden: frontend'de
JS toUpperCase() Türkçe bilmez, küçük "i" -> "I" yapıyordu (İngilizce kuralı).
Çözüm: lib/turkish.ts -> toUpperTr() (i->İ, ı->I, ş/ğ/ü/ö/ç doğru).
MatchGame kelime girişi + ScoreBar/VsScreen isim baş harfi bunu kullanıyor.
Backend normalize() zaten doğruydu (mazi->MAZİ), sadece frontend hatalıydı.
Test: mazi->MAZİ, ışık->IŞIK doğru ayrılıyor.

## Faz 4 UX v8 (tur arası geri sayım)
- Tur bitince (round_over) frontend 10sn geri sayım başlatır (REVEAL_SECONDS).
- Banner altında çizgi + "sonraki tur: Xs" gösterilir (doğru cevabı görürken
  ne kadar bekleneceği belli olur). Yeni tur başlayınca sıfırlanır.

## Faz 4 UX v9 (harf düşme sorunu — kalıcı çözüm)
Sorun: yazarken harf düşüyordu (ilk harfte buzzer tetikleme + React render çakışması).
Çözüm: buzzer artık input FOCUS'ta alınıyor (onFocus) — yazmaya başlamadan sıra
alınır, harf/buzzer çakışması biter. writeBlocked mantığı: yazma sadece kesin
rakip sırasında/kilitliyken engellenir; sıra bende veya boşsa input hep açık.
onType artık sadece harf kaydeder (emniyet buzzer'ı korunur).

## SESLİ MOD (Faz 7) — Nazım sordu, öncelik kararı bekleniyor
İstenen tasarım: mikrofona bas -> söz hakkı o oyuncuya geçer -> sesli cevap ->
ses tanıma (Web Speech API, TR; fallback Whisper) -> oluşan kelime kutucuklara yazılır.
Not: Faz 7'de planlı. Nazım isterse Faz 5 (lig) yerine öne alınabilir.
Teknik dikkat: tarayıcı mikrofon izni, TR ses tanıma doğruluğu, mobil uyumu, WebView izni.

## Faz 4 UX v10 (autoFocus kaldırıldı — ilk tur kutu seçili gelmiyor)
Sorun: autoFocus yüzünden (1) oyun başında input otomatik seçili geliyordu
(kim tıklarsa söz hakkı ona geçmeli), (2) ilk harf düşüp ikinci harfte aktif oluyordu.
Çözüm: autoFocus kaldırıldı. hasFocus state + onFocus/onBlur eklendi. Kullanıcı
input'a TIKLAYINCA buzzer alınır (söz hakkı geçer). writeBlocked'a hasFocus istisnası:
focus varken input açık kalır, ilk harf düşmez. Tur/sıra değişince hasFocus sıfırlanır.

## YENİ ÖZELLİK NOTU — Öğretici / Onboarding (Faz 8 veya 9'a eklenecek)
Nazım'ın isteği (ileriki faz):
1. İlk kez oynayana ÖĞRETİCİ (tutorial/onboarding):
   - Nasıl oynanır, nereye tıklanır, buzzer nasıl alınır.
   - Sesli cevap özelliği nasıl kullanılır (Faz 7 geldiyse).
   - Muhtemelen ilk maçta adım adım baloncuk/highlight ile rehberlik (interaktif),
     veya maç öncesi kısa bir tanıtım ekranı.
2. Rakip DENEYİMLİYSE (eski üye) ve karşısındaki oyuncu İLK MAÇINI oynuyorsa:
   - Deneyimli rakibe bildirim: "Biraz bekleyin, rakibiniz sistemi ilk kez öğreniyor"
     gibi bir mesaj. Sabır/empati oluşturur, kötü ilk deneyimi önler.
   - Gerekli veri: user.matches_played == 0 mı (ilk maç mı) kontrolü. Zaten var.
   - Matchmaking/oda kurulurken bu bilgi rakibe iletilir (is_first_match flag).
Teknik not: is_first_match = (matches_played == 0). Maç başında karşı tarafa
"opponent_is_new" bilgisi WebSocket ile gönderilebilir. Öğretici için ilk kez
oynayanı tespit: giriş yapmışsa matches_played==0, misafirse localStorage flag.

## ÖZELLİK NOTU — Misafir Modu (mevcut durum + geliştirme)
Nazım misafir modunu beğendi. MEVCUT DURUM (Faz 3-4'te zaten var):
- Giriş yapmadan oynanabiliyor. localStorage'da kt_player_id + kt_name tutulur.
- Misafir "Rakip Bul", "Bota Karşı Oyna", "Özel Oda" kullanabiliyor.
- Misafir ELO'su varsayılan 1000 (matchmaking için), ama İSTATİSTİK/ELO KAYDEDİLMİYOR
  (sadece giriş yapmış kullanıcılar için apply_match_result çalışıyor, pid 'u{id}').
EKSİK / GELİŞTİRİLEBİLİR (ileriki faz):
- Misafir ilerlemesi kaydedilmiyor (maç sonrası ELO/istatistik yok). İstenirse
  localStorage'da geçici istatistik tutulabilir.
- Misafir lige giremez (lig üyelik gerektirir — Faz 5).
- "Misafir olarak devam et" butonu ana sayfada daha belirgin olabilir.
- Misafiri üyeliğe teşvik: birkaç maç sonra "kaydol, ilerlemen kaybolmasın" mesajı.
- Misafir -> üye geçişinde localStorage istatistiğini hesaba aktarma (opsiyonel).
Karar: temel misafir modu ÇALIŞIYOR; bu notlar onu tam özelliğe çevirmek için.

## Faz 5 TAMAMLANDI — Lig sistemi
Backend:
- models/daily_score.py — DailyScore (user_id, score_date, best_score, matches).
  Günün en iyi maç puanı tutulur (upsert). init_models'a eklendi.
- models/league_award.py — LeagueAward (kupa/madalya, period_type/key, rank).
- game/league_service.py — record_daily_score (upsert, günün en iyisi),
  leaderboard (daily/monthly/yearly/all; daily=best, diğerleri=SUM), user_rank.
- game/league_scheduler.py — award_period (dönem ilk 3'e kupa/madalya, idempotent),
  check_and_award_closed_periods, league_scheduler_loop (günde bir, startup task).
- game/match_result.py — apply_match_result artık record_daily_score de çağırıyor.
- api/routes/league.py — GET /leaderboard?scope=, /me?scope=, /awards/{user_id}.
- main.py — league router + scheduler startup task + yeni modeller init.

Frontend:
- app/lig/page.tsx — 4 sekmeli liderlik tablosu (Günlük/Aylık/Yıllık/Tüm Zamanlar).
  Kendi satırın vurgulu; ilk 3'te madalya emoji; boş durum mesajı.
- app/page.tsx — ana sayfaya "🏆 Lig" butonu eklendi.

Lig mantığı (kilitli): günlük = o günün en yüksek TEK maç puanı; aylık/yıllık/tüm =
günlük puanların toplamı. Ay sonu ilk 3'e otomatik kupa(1)/madalya(2-3).
Test: günün en iyisi mantığı + SUM + ödül dağıtımı + maç->lig zinciri doğrulandı.

## Faz 5 bilinen sınırlar / sonraki
- Bot maçları da lige yazılıyor (oyuncu puanı gerçek). Admin'de kapatılabilir yapılabilir (Faz 10).
- /api/league/me get_current_user gerektirir (giriş şart); misafir lige yazılmaz.
- Yıllık ödül sadece Ocak'ta önceki yıl için verilir; aylık her ay başı önceki ay.
- Frontend'de kullanıcının kendi kup/madalya vitrini Faz 6'da (profil) gösterilecek.

## Faz 5 BUG ARAŞTIRMASI v2 (yasemin: bota karşı kazandı ama lige yansımadı)
Gerçek veri: yasemin matches_played=8, wins=0, elo 1000->890 (hep kaybetmiş sayılmış),
daily_scores BOŞ. Tablolar mevcut (daily_scores, league_awards var).
Local test: _end_match->callback->apply_match_result->lig zinciri DOĞRU çalışıyor
(insan kazanınca won=True, elo artıyor, lig yazılıyor). Yani kod mantığı sağlam.
Şüphe: maç sen KAZANMADAN bitiyor olabilir (bağlantı kopması / 3 tur dolmadan /
"Yeni Maç"a basma). Debug logları eklendi:
  - _attach_stats_callback: order/scores/winner/won/draw/score/yeni_elo loglanıyor.
  - record_daily_score çağrısı: [lig] logu; except artık traceback basıyor.
Sonraki adım: bu versiyonu deploy et, 1 maç oyna, backend loglarına bak:
  docker logs -f <backend> --tail 30   -> [stats] ve [lig] satırlarını incele.
Bu loglar won'un neden False geldiğini / maçın ne zaman bittiğini gösterecek.

## Faz 5 v3 — tur arası süre 10->5sn + lig doğrulandı
- Lig ÇALIŞIYOR (yasemin test etti, puan yansıdı).
- REVEAL_SECONDS 10 -> 5 (models.py). Frontend MatchGame REVEAL_SECONDS=5 (uyumlu).
  Tur bitince doğru cevabı görme + geri sayım çizgisi artık 5sn.
- Debug logları sadeleştirildi (çalıştığı doğrulandı); [stats]/[lig] HATA logları kaldı.

## Faz 6 TAMAMLANDI — Rozet + Profil + İstatistik
Backend:
- game/badges.py — 11 rozet, istatistikten TÜRETİLİR (ayrı tablo yok, geriye dönük çalışır).
  Rozetler: İlk Adım/Zafer, Yükselen(10G), Usta(50G), Düzenli(10maç), Bağımlı(100maç),
  Kelime Avcısı(100kelime), Rekabetçi(1200elo), Şampiyon(1500elo), Kupa Sahibi, Puan Canavarı.
  earned_badges(stats) -> kazanılan+kilitli liste. tier: bronze/silver/gold.
- api/routes/profile.py — GET /profile/{username} (public), /profile/me/stats (kendi).
  Profil: istatistik + win_rate + rozetler + kupa/madalya + lig sıraları (daily/monthly/all).
- main.py — profile router eklendi.

Frontend:
- app/profil/[username]/page.tsx — üst kart (avatar/ELO), kupa/madalya, istatistik ızgarası,
  lig sıraları, rozet vitrini (kazanılan renkli+tier border, kilitli gri/soluk).
- components/TopBar.tsx — kullanıcı adı artık kendi profiline link.
- app/lig/page.tsx — liderlik tablosundaki isimler profile tıklanabilir.

Test: 11G/1250elo/120kelime kullanıcı 6 rozet kazandı, kilitliler doğru; win_rate %73 doğru.

## Faz 6 notlar / sonraki
- Isı haritası (aktivite takvimi) planda vardı — DailyScore'dan üretilebilir, şimdilik eklenmedi.
  İstenirse profND'e "son 30 gün aktivite" grid'i eklenir (Faz 6.1 veya cila).
- Rozet kazanımı anlık bildirim (maç sonu "Yeni rozet!") Faz 8'de eklenebilir.
- Admin'den yeni rozet ekleme Faz 10.

## Faz 7 TAMAMLANDI — Sesli mod (Web Speech API)
Yaklaşım: Web Speech API (tarayıcı yerleşik, Türkçe tr-TR). Whisper fallback
ERTELENDİ (Faz 10 API key alanı gelince eklenecek). Sunucu değişikliği YOK —
tamamen frontend/tarayıcı.
Frontend:
- lib/useSpeech.ts — Web Speech hook (supported/listening/error/start/stop).
  tr-TR, tek kelime (continuous=false), 3 alternatif. Mikrofon izni/no-speech hataları.
- components/MatchGame.tsx — "🎤 Bas & Konuş" butonu (mouse+touch, basılı tutunca dinler).
  onVoiceResult: tanınan metni toUpperTr + harf filtresi + length kırpma -> input'a yazar.
  Sıra boşsa sesle buzzer alınır. Kullanıcı tanınan kelimeyi GÖRÜP Gönder'e basar
  (otomatik gönderilmez — yanlış tanımaya karşı güvenli).
  micSupported false ise buton gizlenir (klavye girişi çalışmaya devam eder).
Test: metin işleme (kalem->KALEM, şeker->ŞEKER, noktalama/boşluk temizliği) doğrulandı.
NOT: Web Speech HTTPS gerektirir (site zaten HTTPS). Chrome/Edge iyi, Safari kısıtlı,
Android WebView cihaza bağlı. supported=false olursa sorunsuz klavyeye düşer.

## Faz 7 sonraki / notlar
- Whisper fallback: supported=false veya düşük doğrulukta sunucuya ses gönderme.
  Gerekli: Whisper API (veya self-host) + /api/speech/transcribe ucu. Faz 10 API key ile.
- Sesli mod WebView (Android app) izni: manifest'te RECORD_AUDIO + WebView mic izni gerekir.

## Faz 7 v2 (mikrofon buton düzeltmesi)
Sorun: basılı-tut (press-hold) butonu mobilde text selection tetikliyordu, basılamıyordu.
Çözüm: buton TOGGLE oldu (tek dokunuş aç/kapa). onClick ile micStart/micStop.
userSelect:none, WebkitTouchCallout:none, WebkitTapHighlightColor:transparent,
touchAction:manipulation eklendi (metin seçme + dokunma vurgusu engellendi).
Web Speech continuous=false zaten -> konuşma bitince otomatik durur; manuel de durdurulur.

## Faz 7 v3 (mikrofon: basılı-tut'a geri dönüş + konumlandırma)
Nazım: basılı-tut daha iyi çalışıyordu (ses net alınıyordu), sadece buton basması zordu.
Çözüm:
- Basılı-tut geri geldi ama onPointerDown/Up (mouse+touch birleşik, güvenilir).
  e.preventDefault + touchAction:none + userSelect/tapHighlight engelleri -> basma sorunu çözüldü.
  onPointerLeave ile parmak kayınca durur.
- Mikrofon artık input satırında, Gönder'in solunda KÜÇÜK SİMGE buton (52px, sadece 🎤/🔴).
- Gönder butonu daraltıldı (padding 24->14px, whiteSpace:nowrap). input 220->190px.
- Dinlerken "🔴 Dinliyorum… kelimeyi söyle" mesajı input altında.

## Faz 8 TAMAMLANDI — Rövanş + Emote + Günün Kelimesi + Sonuç Kartı
Sonuç kartı + Rövanş (frontend):
- MatchGame maç sonu ekranı yeniden tasarlandı: büyük emoji + başlık + skor
  karşılaştırması + "kelimetahmin.com" (paylaşılabilir kart görünümü).
- Butonlar: 🔄 Rövanş (onRematch -> yeni oda+vs), Yeni Rakip, 📤 Paylaş (Web Share/clipboard).
- oyna/page.tsx onRematch bağladı (yeni kod + vs ekranı).

Emote (backend + frontend):
- match.py WS: action=emote -> room.broadcast({type:emote, player_id, emoji}).
- useMatch.ts: emote(emoji) fonksiyonu.
- MatchGame: 6 emoji çubuğu (👍😂😮🔥😢👏) + gelen emote uçan animasyon (emoteFloat CSS).
  Kendi emote'un solda, rakip sağda belirir.

Günün Kelimesi (backend + frontend):
- api/routes/daily.py: word_of_day (tarih->sha256->havuz indeksi, deterministik,
  herkese aynı). GET /daily/word (uzunluk+ilk harf, ÇÖZÜM GİZLİ), /daily/check (Wordle renk).
- word_service.py: selectable_words() eklendi.
- app/gunun-kelimesi/page.tsx: tek kişilik 6 haklı Wordle. Emoji grid paylaşımı
  (🟩🟨⬛, Wordle tarzı). Yarın yeni kelime.
- Ana sayfaya 📅 Günün Kelimesi + 🏆 Lig butonları.

Test: günün kelimesi deterministik + çözüm gizli + emote WS + sonuç kartı doğrulandı.

## Faz 8 notlar / sonraki
- Günün kelimesi ilerlemesi kaydedilmiyor (sayfa yenilenince sıfırlanır). İstenirse
  localStorage'a günlük durum yazılır (aynı gün tekrar oynanmasın). Cila.
- Rövanş şu an bot maçında yeni bot atar; insan rövanşı için karşı tarafın da kabul
  akışı (Faz 9/sosyal) gerekebilir. Şimdilik bota karşı ve yeni rakip çalışıyor.
- Emote bottan gelmez (bot emote atmaz); insan-insan maçında iki yönlü çalışır.

## Faz 8 v2 — rövanş bug + onay notu
Bug: rövanş deyince son turun son sahnesine dönüyordu. Kök neden: MatchGame yeni
oda koduyla yeniden başlarken React aynı bileşeni (eski WS + eski state/lastEvent ile)
kullanıyordu. Çözüm: <MatchGame key={code} ...> -> oda kodu değişince bileşen
SIFIRDAN kurulur, eski WebSocket ve state temizlenir. Rövanş VS ekranından geçer.

NOT — İnsan-insan rövanş ONAYI (ileride, insan matchmaking yaygınlaşınca):
Nazım haklı: gerçek rövanş "rakip rövanş istiyor, kabul? [Evet/Hayır]" sormalı.
Şu an bota karşı anında yeni maç (bot her zaman kabul). İnsan-insan için gerekli:
- WS action=rematch_request -> karşıya "rakip rövanş istiyor" bildirimi.
- WS action=rematch_accept/decline -> kabulde iki taraf yeni odaya, rette menüye.
- Süre aşımı (10-15sn cevap yoksa iptal).
Bu Faz 9 (sosyal/lobi) veya insan matchmaking testleri sırasında eklenecek.

## Faz 8 v3 — İnsan-insan rövanş ONAYI (Nazım 2 kişi test edebiliyor)
Backend:
- match.py WS: rematch_request (rakibe ilet), rematch_accept (broadcast + restart_match),
  rematch_decline (rakibe ilet).
- room.py: send_to_others(sender, msg) — göndereni hariç tutar.
  restart_match() — skorları sıfırlar, timer'ları iptal eder, aynı odada yeni maç.
Frontend:
- useMatch: rematchRequest/Accept/Decline fonksiyonları.
- MatchGame: rematchState (idle/requested/incoming/declined).
  Bota karşı: eski davranış (onRematch, anında). İnsana karşı: "🔄 Rövanş İste" ->
  rakipte "Rakibin rövanş istiyor [Kabul/Reddet]" -> kabulde restart_match iki tarafı
  da yeni maça alır (match_start gelince maç sonu ekranı kapanır). Ret/bekleme durumları da var.
Test: restart_match skorları sıfırlayıp yeni maç başlatıyor (doğrulandı).

## Faz 8 v4 — rövanş isteği penceresi gitmiyordu (BUG düzeltme)
Kök neden: maç sonu ekranı koşulu `lastEvent?.type === "match_over"` idi. Rakibe
rematch_request gelince lastEvent "rematch_request" oluyor -> maç sonu ekranı KAYBOLUYOR,
rakip "incoming" penceresini göremiyor.
Çözüm: matchOverData kalıcı state eklendi (match_over'da set, match_start/rematch_accepted'da
temizlenir). Ekran koşulu artık `phase==finished || matchOverData` — lastEvent değişse de
maç sonu ekranı açık kalır, rövanş isteği penceresi görünür.
Backend'e [rematch] debug logları eklendi (soket listesi, kabul/ret) — sorun sürerse görünür.

## Faz 9 TAMAMLANDI — Ana sayfa + tanıtım + footer
Frontend:
- app/page.tsx yenilendi: geliştirme içerikleri (Kelime Havuzu, Motor Denemesi) KALDIRILDI.
  Eklendi: "Nasıl Oynanır 3 adım" (Önce Davran/Renkleri Oku/Ligde Yarış),
  özellik vitrini (sesli/bot/günün kelimesi/rövanş), kelime sayısı özeti, Footer.
- components/Footer.tsx — yasal + tanıtım linkleri, her sayfada kullanılabilir.
- components/LegalPage.tsx — statik sayfa sarmalayıcı.
- app/nasil-oynanir — detaylı oynanış (kurallar, buzzer, sesli, lig, günün kelimesi).
- app/gizlilik — Gizlilik & KVKK aydınlatma (şablon, hukukçu notu var).
- app/kosullar — Kullanım koşulları (şablon, hukukçu notu var).
- globals.css — .legal-content h2/p stilleri.
Backend: match.py [rematch] debug print'leri temizlendi (rövanş çalıştığı doğrulandı).

ÖNEMLİ NOT: Yasal metinler (gizlilik/koşullar) GENEL ŞABLONDUR. Yayına/ticari kullanıma
geçmeden önce bir hukuk danışmanına inceletilmeli (sayfalarda da not düşüldü).

## Faz 9 sonraki / notlar
- Footer şu an sadece ana sayfada. İstenirse lig/profil/oyna sayfalarına da eklenir.
- Google OAuth butonu hâlâ bağlı değil (GOOGLE_CLIENT_ID girilince aktif olur) — Faz 3 notu.
- İletişim/destek sayfası veya e-posta eklenebilir (footer'a).

## Faz 10 (KISIM 1) TAMAMLANDI — Admin panel çekirdeği
Backend:
- models/user.py: is_admin bool alanı (Boolean import).
- models/game_setting.py: GameSetting (key-value) + DEFAULT_SETTINGS (9 ayar: süreler,
  satır sayıları, hız bonusu, bot bekleme, bot-lige-sayılsın).
- game/settings_service.py: DB okuma + in-memory cache. load_settings, get_str/int/bool,
  set_setting (cache'i hemen günceller), all_settings. cached_int/cached_bool (SENKRON —
  oyun kodu için, fallback DEFAULT_SETTINGS).
- core/deps.py: get_admin_user (is_admin değilse 403).
- api/routes/admin.py: dashboard, settings GET/POST, bots GET/generate/toggle,
  words GET(ara)/POST(ekle)/remove. Kelime yönetimi havuz JSON dosyalarına yazar.
- match.py: start_next_round süreleri+satır cached_int'ten okur (rows_{length},
  round_total_seconds, buzzer_answer_seconds). Ayar panelden değişince maçlara yansır.
- main.py: admin router + startup'ta settings yükleme + ADMIN_EMAIL env'i ile ilk admin ataması.
- database.py: game_setting init_models'a eklendi.
Frontend:
- app/yonetim/page.tsx: 4 sekmeli panel (Özet/Ayarlar/Botlar/Kelimeler).
  authHeaders kt_token (auth.tsx ile uyumlu — doğrulandı). 403'te "yetkin yok".
  Dashboard: kullanıcı/maç/bot sayıları + top 5. Ayarlar: inline düzenle+kaydet.
  Botlar: üret + aktif/pasif toggle. Kelimeler: uzunluk+ara+ekle+sil.
Test: 403 koruması, dashboard, ayar yaz->cache(120), bot listesi, kelime arama(164),
maç ayarlı süreyle başlıyor, regresyon tam. ✓

İLK ADMIN ATAMA: Coolify env'e ADMIN_EMAIL=<hesabının emaili> eklenir -> deploy'da
o kullanıcı is_admin=True olur -> /yonetim erişilir.

## Faz 10 KISIM 2 (sonraki) — Ses/müzik sistemi [YAPILMADI]
- Admin'den mp3 slot yükleme (buton sesi, kazanma, kaybetme, tur başı, arka plan müziği).
- Ayar: ses açık/kapalı, ses seviyesi.
- Frontend: oyun olaylarında ses çalma (Web Audio / <audio>).
- Yükleme depolama: statik dosya klasörü veya küçük obje deposu (VPS'te path).

## Faz 10 HOTFIX — is_admin sütunu / otomatik migration
Sorun: deploy sonrası login 500 verdi -> "column users.is_admin does not exist".
Kök neden: create_all mevcut tabloya YENİ SÜTUN eklemez (migration yok). is_admin
User'a eklendi ama canlı DB'de yoktu -> her user sorgusu çöküyordu (CORS hatası bunun yan etkisi).
Acil çözüm (sunucuda elle): ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
KALICI çözüm: database.py init_models'a _add_missing_columns eklendi. create_all sonrası
her tabloyu inspect eder, modelde olup DB'de olmayan sütunları ALTER TABLE ADD COLUMN ile
ekler (Postgres IF NOT EXISTS; default değerleriyle). Veri korunur. Test: eski şemaya
is_admin otomatik eklendi, kullanıcı silinmedi. Gelecekte yeni sütunlar da otomatik eklenecek.

## Faz 10 (KISIM 2) TAMAMLANDI — Ses/müzik sistemi (hibrit: sentetik + yüklenebilir)
Nazım kararı: İKİSİ BİRDEN — admin her slot için mp3 yükleyebilir, yüklemezse sentetik çalar.
Backend:
- models/sound_asset.py: SoundAsset (slot->filename). SOUND_SLOTS: button/correct/wrong/
  win/lose/round_start/music.
- models/game_setting.py: sound_enabled, music_enabled, sound_volume ayarları eklendi (12 ayar).
- core/config.py: AUDIO_DIR (env, varsayılan /app/uploads/audio).
- api/routes/sounds.py: GET /sounds (herkes: slot listesi+uploaded), POST /sounds/{slot}
  (admin mp3 yükle, 3MB, mp3/ogg/wav/m4a), DELETE /sounds/{slot}, GET /sounds/file/{slot}.
- main.py + database.py: sounds router + sound_asset modeli.
Frontend:
- lib/sound.ts: initSound (slot durumunu sunucudan al), playSound (yüklüyse mp3, yoksa
  Web Audio SENTETİK ton), startMusic/stopMusic. Sentetik sesler: button/correct(yükselen)/
  wrong/win(fanfar)/lose(düşen)/round_start.
- MatchGame.tsx: initSound + oyun olaylarına ses (round_start, guess_result correct/wrong,
  match_over win/lose).
- yonetim/page.tsx: 🔊 Sesler sekmesi — her slot için Yükle/Sil, "sentetik/kendi sesin" durumu.
Test: 7 slot, yetkisiz yükleme 401, admin yükleme+servis, ayar 12, regresyon tam. ✓

ÖNEMLİ — Coolify KALICI VOLUME gerekli (yoksa yüklenen sesler her deploy'da silinir):
docker-compose.yml backend service'ine volume: ./uploads:/app/uploads ekle (veya Coolify
Persistent Storage: /app/uploads). AUDIO_DIR=/app/uploads/audio (varsayılan zaten bu).
Sentetik sesler her zaman çalışır (dosya gerekmez); volume sadece YÜKLENEN mp3'ler için.

## Faz 10 TAMAMEN BİTTİ. Kalan fazlar: Faz 11 (i18n çoklu dil + SEO), Faz 12 (cila+README).

## Faz 10 ses v2 — DB tabanlı ses (volume gerekmez)
Sorun: yüklenen mp3'ler için Coolify volume gerekiyordu; compose docker-compose.yaml
Coolify tarafından yönetiliyor (kaynak .yml sunucuda yok), volume eklemek zahmetli.
Çözüm: ses dosyaları artık DİSK yerine VERİTABANINDA (base64) saklanıyor. PostgreSQL
zaten kalıcı volume'da (db-data) -> sesler deploy'da kaybolmaz, compose değişikliği YOK.
- sound_asset.py: mime + data_b64 (Text) alanları. (Otomatik migration bunları ekler.)
- sounds.py: upload base64 encode->DB, file/{slot} DB'den decode->Response(bytes).
Dosyalar max 3MB, DB için uygun. Test: yükle/servis(birebir içerik)/sil doğrulandı.
AUDIO_DIR config'te kaldı ama artık kullanılmıyor (zararsız).
NOT: Coolify managed compose = /data/coolify/applications/mrx9s3.../docker-compose.yaml
(kaynak .yml GitHub'da; sunucuda build sonrası yok). Volume yaklaşımı TERK EDİLDİ.

## Faz 10 ses v3 — Zengin ses sistemi (Nazım detaylı istek)
Yeni slotlar (19 toplam): tile_correct/present/absent (harf renk sesleri),
match_start, radar, opponent_found, tick, music1..music6. Hepsi sentetik + yüklenebilir.
Frontend lib/sound.ts baştan yazıldı:
- Sentetik tonlar: harf renklerine göre farklı (yeşil tiz/sarı orta/gri boğuk).
- startTicking(getSecondsLeft): sıra birindeyken saniyede tık; SON 5 SN intensity 0.2->1.0
  (frekans+ses yükselir). stopTicking.
- startRadar/stopRadar: rakip aranırken döngüsel radar biip (yüklüyse mp3 loop).
- Ambient müzik motoru: 6 sentetik varyasyon (rastgele akorlar+LFO), 30sn'de değişir.
  Yüklü music1..6 varsa onlardan RASTGELE çalar, biri bitince diğeri (onended).
Bağlantılar:
- components/HomeMusic.tsx: ana sayfa müzik düğmesi (🔊/🔈), ilk pointerdown'da başlar
  (autoplay engeli için). app/page.tsx'e eklendi.
- app/oyna: mode=searching -> startRadar; searching->vs geçişi -> opponent_found sesi.
- MatchGame: match_start sesi; guess_result -> harfler tek tek renk sesiyle (180ms stagger),
  bulunca correct; turnActive -> startTicking(answer_time_left) son 5sn yükselen.
Test: 19 slot mevcut, build ok, backend ok. Sentetik hepsi çalışır; mp3 slotları hazır.
NOT: ana sayfa müziği tarayıcı autoplay politikası -> ilk tıklamadan sonra başlar (normal).

## Faz 10 ses v4 — tık-tık ince ayar (Nazım geri bildirimi)
1. Rakibin geri sayımı DUYULMAZ: tık artık sadece myTurn'de çalar (myTurnActive),
   rakibin sırasında sessiz.
2. Kademeli seviye: >10sn çok kısık (0.08), 10-6sn hafif (0.2->0.35),
   <=5sn belirgin yükselir (0.5->1.0).
3. Yumuşak ton: square yerine sine, 330->530Hz (az tiz), yumuşak attack(15ms)/decay(120ms).
Sadece frontend (lib/sound.ts + MatchGame turnActive->myTurnActive). Backend değişmedi.

## Faz 10 ses v5 — ses aç/kapa toggle switch
Nazım: ana sayfada username solunda, maç ekranında "ana sayfa" linkinin sağında
mini kaydırmalı ses düğmesi. Sağda açık, sola kayınca kapalı.
- components/SoundToggle.tsx: kaydırmalı switch (sağ=açık 🔊, sol=kapalı 🔇).
  Global durum + localStorage("kt_sound") kalıcı. onSoundChange ile tüm UI senkron.
- lib/sound.ts: isSoundEnabled/toggleSound/onSoundChange + soundListeners. setSoundEnabled
  kapatınca müzik+tık+radar durur, localStorage'a yazar, dinleyicilere bildirir.
  initSound kayıtlı tercihi okur (kapalıysa kapalı açılır).
- TopBar: SoundToggle en solda (username/giriş solunda). oyna maç ekranı: "← ana sayfa"
  sağında SoundToggle. HomeMusic sadeleşti (görünmez müzik başlatıcı; toggle açık+etkileşim
  varsa müzik başlar/kapanınca durur). Eski sağ-alt yuvarlak düğme kaldırıldı.
Sadece frontend. Backend değişmedi.

## Faz 10 ses v6 — harf sesi senkronu (Nazım: sesler erken geliyor)
Sorun: harf sesleri 180ms staggerle çalıyordu ama Grid flip animasyonu i*220ms.
Bu yüzden ses görselden önce geliyordu.
Çözüm: Grid'in GERÇEK değerleriyle senkron. Grid Line: animation flipIn .4s ease i*0.22s.
flipIn: rotateX(-90->0), harf ~yarıda (200ms) görünür. Ses zamanlaması:
i * 220ms (STAGGER) + 210ms (REVEAL_OFFSET). Bulunca correct sesi sonda +150ms.
Sadece MatchGame guess_result ses effect'i. İkisi aynı lastEvent'le tetiklenir -> eşzaman.

## Faz 10 ses v7 — melodi iyileştirme + bot rakip sesi + ana sayfa müzik
Nazım geri bildirimi:
1. round_start sentetik ses daha melodik: yükselen re-fa#-la + yüksek re parlaklık.
   match_start ve opponent_found de melodik yükselen üçlüye çevrildi.
2. Bota karşı maçta rakip bulundu sesi YOKTU: createBotSolo'ya playSound("opponent_found")
   eklendi (menu->vs direkt geçiş, mode effect searching->vs'i yakalamıyordu).
3. Ana sayfa sentetik ambient KALDIRILDI. startMusic sadece yüklü mp3 (music1..6) çalar;
   yoksa sessiz. startSyntheticAmbient + ambientNodes/Timer temizlendi. stopMusic sadeleşti.
Sadece frontend (lib/sound.ts + oyna/page.tsx). Backend değişmedi.

## Faz 10+ — Rakip ayrılma bildirimi + terk ceza sistemi (Nazım fark etti)
Sorun: insan-insan maçta biri ayrılınca (ana sayfa/sekme kapatma/kopma) diğeri
boşuna bekliyordu; haberi olmuyordu. Ayrıca sürekli terk edenlere ceza yoktu.
Backend:
- match.py disconnect: maç DEVAM EDİYORSA (phase != FINISHED) ve kalan bağlıysa
  room.handle_opponent_left(left) çağrılır (eskiden sadece lobby mesajı).
- room.py handle_opponent_left: timer'ları durdurur, kalan oyuncuyu KAZANAN ilan eder,
  match_over + opponent_left=True broadcast, istatistik/lig callback (kalan kazanır,
  ayrılan kaybeder), ayrılan için record_abandon.
- abandon_service.py: record_abandon (abandons++, eşik üstü kademeli engel),
  is_matchmaking_banned (banned, kalan_sn). ADİL: ilk N terk cezasız (bağlantı affı),
  sonra (terk-limit)*base_dk artan engel. Sadece MATCHMAKING'i engeller (bot/oda serbest).
- user.py: abandons, matchmaking_banned_until alanları (otomatik migration ekler).
- game_setting.py: abandon_free_limit(2), abandon_ban_minutes(10) — panelden ayarlanır.
- matchmaking.py join: engelliyse banned=True + mesaj döner (auth header ile kontrol).
Frontend:
- MatchGame maç sonu: opponent_left ise "🚪 Rakibin maçtan ayrıldı" gösterir.
- oyna startSearch: auth header eklendi; banned yanıtında aramaya girmez, mesaj gösterir.
Test: 2 terke kadar cezasız, 3.'te 10dk, 4.'te 20dk kademeli; rakip ayrılınca kalan
match_over+opponent_left alıyor (uçtan uca WS testi). ✓

## Mobil taşma düzeltmesi — maç ekranı yanlardan taşıyordu
Sorun: Grid kutuları sabit 50px + gap. 6 harfli kelimede 6*50+5*6=330px + padding ->
dar telefonlarda (360px) yatay taşma.
Çözüm:
- Grid tileStyle: sabit 50px yerine responsive: width/height min(50px, calc((100vw-52px)/6.4)),
  aspectRatio 1, fontSize de responsive min(22px, calc((100vw-52px)/15)).
- MatchGame input: width 190 + maxWidth calc(100vw-130px) + minWidth 0 (dar ekranda daralır).
- globals.css html/body: overflow-x hidden + max-width 100vw (güvenlik ağı).
Sadece frontend. Kutular geniş ekranda 50px, dar ekranda orantılı küçülür; taşma yok.

## Mobil taşma v3 — GERÇEK sebep (Nazım fotoğrafı)
Fotoğraf: taşan kutular DEĞİL, iki eleman:
1. Grid tahmin satırı yanındaki Tag (nameOf oyuncu adı) position:absolute right:-6
   translate(100%) ile satırın SAĞ DIŞINA taşıyordu -> uzun isim (Selin Aydın) ekran dışı.
   Düzeltme: Tag artık satırın sağ-ÜST köşesinde mini rozet (right:2 top:-7, bg-deep,
   ilk ad max 8 char, ellipsis). Grid genişliğini AŞMAZ.
2. ScoreBar PlayerChip flex:1 ama minWidth:0 YOKTU -> uzun isim kartı büyütüp taşırıyordu.
   Düzeltme: PlayerChip'e minWidth:0 (isim ellipsis ile kesilir, kart taşmaz).
mobil2'deki kutu responsive + container overflow engelleri de korundu.

## Mobil taşma v4 — input satırı (Gönder "Gönd" diye kesiliyordu)
Sorun: input + mikrofon + Gönder tek satıra sığmıyordu, Gönder kesiliyordu.
Düzeltme:
- Satır container: flexWrap:wrap + width:100% (sığmazsa alt satıra iner).
- input: width:190 -> flex "1 1 150px", maxWidth 240, minWidth 0 (esner, daralır).
- sendBtn: flexShrink:0 + padding 14->16 (küçülmez, kesilmez).
Artık dar ekranda input üstte, mikrofon+Gönder altında; geniş ekranda üçü yan yana.

## Mobil düzen v5 — ScoreBar yeniden düzen + emoji açılır buton (Nazım tasarımı)
YEDEK: _yedek_mobil_oncesi/ (MatchGame, ScoreBar, Grid, globals.css, oyna_page) —
yeni tasarım tutmazsa geri dönülür.
ScoreBar mobil düzen (desktop AYNI, media query 640px):
- Desktop: player1 - büyük sayaç - player2 (eski hal, .sb-*-desktop class'ları).
- Mobil (.sb-info-mobile): satır1 iki oyuncu kartı; satır2 solda sayaç+"Tur X/3·N harf",
  sağda "cevap: Ns"; satır3 zaman çizgisi. Masaüstü ortadaki sayaç/tur/cevap gizlenir.
Emoji:
- Eski 6'lı çubuk (satır harcıyordu) KALDIRILDI.
- Bildirim satırının SAĞINDA tek 😀 buton; tıkla -> 6 emoji açılır (fadeIn), seç -> gönder+kapan.
- TUR BAŞINA 2 emoji limiti (emoteCount, round_start'ta sıfırlanır). Limit dolunca 🚫 + disabled.
globals.css: mobil scorebar media query + fadeIn.
Sadece frontend. Backend değişmedi.

## Mobil v6 — emoji ses düğmesi soluna + geçersiz tahmin kilit bug'ı
1. BUG (önemli): T ile başlaması gereken kelimeye Y yazınca uyarı geliyor ama input
   kilitli kalıyordu, tekrar yazılamıyordu (süre boşa akıyor).
   Kök neden: submit() geçersiz kelimede guess() gönderip setLocked(true) yapıyor;
   backend 'error' gönderiyor ama 'guess_result' GÖNDERMİYOR; kilit sadece guess_result'ta
   çözülüyordu -> locked=true kalıyordu.
   Çözüm: lastEvent.type === "error" gelince de setLocked(false) (kullanıcı düzeltip
   tekrar yazar, süre devam eder).
2. Emoji butonu bildirim satırından ALINDI, MatchGame en üstüne taşındı; SoundToggle ile
   yan yana, sağa yaslı: [emoji açılır] [ses düğmesi]. oyna/page.tsx üst satırından
   SoundToggle kaldırıldı (artık MatchGame içinde). Emoji hâlâ turda 2 limit + açılır panel.
Sadece frontend.

## Mobil v7 — üst satır tek sıra: ana sayfa ikonu + sabit emojiler + ses
Nazım: "← ana sayfa" yazısı yerine 🏠 ikon; ana sayfa + emojiler + ses TEK SATIR;
mobilde sığsın; emojiler AÇILIR değil SABİT açık (6'sı görünür); desktop da aynı.
- oyna/page.tsx: maç ekranı "← ana sayfa" satırı KALDIRILDI, SoundToggle import kaldırıldı.
- MatchGame üst satır: [🏠 ana sayfa ikonu] [6 sabit emoji, esner] [SoundToggle], tek flex satır.
  Emojiler clamp(28-38px) + flexShrink -> dar ekranda küçülüp sığar. Turda 2 limit korundu
  (dolunca opacity düşer + disabled). emoteOpen state kaldırıldı (artık hep açık).
Sadece frontend.

## Bot davranışı iyileştirme — kademeli öğrenme (Nazım: bot fazla iyi/hızlı)
Sorun: bot ilk tahminden itibaren biliyor ve insandan hemen sonra hızlı yazıyordu.
Yeni oyuncuyu eziyordu. İstenen: bot oyunu SEVDİRSİN — erken bilmesin, 3. tahminden
sonra ipuçlarını kullanmaya başlasın (hatalı da yapabilir), 5-6. tahminden sonra bilsin.
bot_engine.py:
- solve_probability_at(elo, diff, attempt_index): bilme olasılığı tahmin SAYISINA bağlı.
  ramp: attempt 0=0.0, 1=0.05, 2=0.20, 3=0.45, 4=0.70, 5+=1.0 (beceriyle çarpılır).
- use_hints_level(attempt): ipucu kullanımı 0=0.0,1=0.1,2=0.5,3=0.75,4=0.9,5+=1.0.
- pick_guess(..., hint_level): hint_level olasılığıyla ipuçlarını KULLANIR; yoksa görmezden
  gelip ilk harfi tutan rastgele kelime (inandırıcı erken yanlış).
bot_controller.py:
- _guess_now: bot_attempts = botun o turdaki tahmin sayısı (r.rows player_id sayımı).
  solve_probability_at + use_hints_level(bot_attempts) kullanılır.
- _take_my_turn gecikmesi 2-3.5s -> 3.5-6.0s (daha insani, aceleci değil).
Test (1000 tur, ELO1000 orta): 1.tahmin %0 bilme, 3.'te ipuçları girer, 6-7'de bilir,
%30 hiç bilemiyor (oyuncu kazanabilir). İstenen sevdirme eğrisi ✓.

## Desktop = mobil ortak ScoreBar düzeni (Nazım: 3 blok yan yana)
Desktop artık mobil ile AYNI düzen. Orta satır 3 blok yan yana:
[tur saniyesi] — [Tur X/3 · N harf sabit orta] — [cevap süresi sağ].
- ScoreBar: media query kaldırıldı, tek düzen. Satır1 iki oyuncu kartı; satır2 flex
  space-between 3 blok (sol sayaç flex:0, orta tur bilgisi flex:1 ortalı, sağ cevap flex:0);
  satır3 zaman çizgisi. .sb-*-desktop/.sb-info-mobile class'ları ve globals.css media query
  temizlendi (artık gereksiz).
Sadece frontend.

## Kelime havuzu ayrımı: üye vs bot + admin sayfalama (Nazım)
İstek: bot saçma değil GERÇEK Türkçe kelime yazsın ama üye (bilindik/temiz) kelimeleri
bilmek zorunda olmasın. İki havuz: ÜYE (maçta hedef) + BOT (bot tahminleri).
- word_service WordPool: her kelimede member (üyeye çıkar) + bot (bot kullanır) bayrağı.
  Alan yoksa True (geriye uyumlu). random_word -> member+selectable. bot_words() -> bot:true.
- bot_engine.pick_guess: artık pool.bot_words()'tan seçer (JSON direkt okumak yerine).
- admin.py /words: sayfalama (page/per_page), filtre (all/member/bot/member_only/bot_only),
  counts (total/member/bot/member_only/bot_only), her kelime {word,difficulty,member,bot}.
  /words/flags: member/bot bayrağı değiştir. add_word member/bot alır. Yazınca get_pool.cache_clear.
- yonetim Words: sayaç özeti, filtre butonları, sayfalama (60/sayfa, «‹ x/y ›»), her kelimede
  👤/🤖 toggle, yeni kelimede üye/bot seçimi.
Test: sayfalama 196 sayfa, flag değiştir, filtreler ✓.
NOT: kelime havuzu JSON container'da (git'ten). Admin değişiklikleri DEPLOY'da sıfırlanır!
(Kalıcı temizlik için JSON'u git'te düzenleyip push etmek gerekir; ya da havuzu DB'ye
taşımak gerekir — ileride yapılabilir.)

## Kelime havuzu DB'ye taşındı — KALICI (Nazım)
Artık kelime havuzu JSON değil VERİTABANINDA. Admin değişiklikleri (temizlik, üye/bot
ayrımı, ekle/çıkar) deploy'da SIFIRLANMAZ.
- models/word.py: Word (id, length, word, difficulty, member, bot, active). unique(length,word).
  database.py init_models import listesine 'word' eklendi (tablo otomatik oluşur+migration).
- word_service.py YENİDEN: bellek cache _POOLS (length->WordPool). get_pool senkron cache'ten
  okur (oyun kodu senkron). refresh_pools(db): DB'den okuyup cache yeniler. seed_words_from_json(db):
  words tablosu boşsa JSON'ları DB'ye aktarır (ilk açılış; mevcut kelimeler korunur).
- main.py startup: seed_words_from_json + refresh_pools (bot seed'den sonra).
- admin.py kelime uçları (list/add/remove/flags) TAMAMEN DB tabanlı; her yazımda refresh_pools.
  Eski JSON _pool_path + get_pool.cache_clear kaldırıldı.
- bot_engine pick_guess zaten pool.bot_words() kullanıyor (DB'den gelir).
Test: seed (1953+5108+5266 kelime), random_word, bot_words, admin list/flag/add(member/bot),
sayfalama hepsi DB üzerinden ✓. Frontend değişmedi.
NOT: İlk deploy'da JSON'dan DB'ye seed olur (mevcut kelimeler taşınır). Sonrası kalıcı DB.

## ScoreBar 3-blok sabit genişlik (Nazım: saniye değişince kayıyor + hafif taşma)
Sorun: 3 blok space-between + değişken genişlik. Tur saniyesi 9->10->100 basamak
değişince sol blok genişleyip orta/sağı itiyordu; toplam sabit olmadığı için hafif taşma.
Çözüm: sol+sağ blok SABİT 72px (flexShrink:0), orta blok flex:1 minWidth:0 (hep ortada,
ellipsis). width:100% ile taşma yok. Saniye kaç basamak olursa olsun bloklar sabit.
Cevap süresi "cevap: 18s" -> "18s" kısaltıldı (72px'e sığsın). Sadece frontend.

## [YAPILACAK — SONRA] Toplu kelime yükleme (Nazım isteği)
Admin panele TOPLU kelime yükleme eklenecek:
- Kullanıcı temiz kelime listesini (metin/satır satır) yükler + uzunluk seçer.
- Sistem her kelimeyi o uzunluğun havuzuna atar (4 harfli liste -> 4 harf havuzu).
- Kelime ZATEN VARSA es geç (mevcut member/bot durumuna DOKUNMA).
- YOKSA ekle: member=True, bot=True olarak.
- DB tabanlı (words tablosu), refresh_pools ile havuz güncellenir.
- Not: geçersiz uzunluk/şekil olanları atla, kaç eklendi/kaç atlandı raporu döndür.
Nazım bu işi en son yapmak istiyor (önce temiz listeyi kendi hazırlayacak).

## Faz 11 — DİL LİSTESİ GÜNCELLENDİ (Nazım, 15 dil)
Önceki plan 6 dildi; Nazım 15 dile çıkardı. Sıralamasıyla:
1. 🇬🇧 English (en)
2. 🇪🇸 Español (es)
3. 🇵🇹 Português (pt)
4. 🇫🇷 Français (fr)
5. 🇩🇪 Deutsch (de)
6. 🇮🇹 Italiano (it)
7. 🇹🇷 Türkçe (tr)
8. 🇳🇱 Nederlands (nl)
9. 🇵🇱 Polski (pl)
10. 🇷🇴 Română (ro)
11. 🇸🇪 Svenska (sv)
12. 🇩🇰 Dansk (da)
13. 🇳🇴 Norsk (no)
14. 🇫🇮 Suomi (fi)
15. 🇨🇿 Čeština (cs)
Her dil için gerekecek: arayüz çevirisi (i18n), o dile ait KELİME HAVUZU (4/5/6 harf,
üye+bot), dile bağlı bot tahmin üretici, çok dilli SEO (hreflang, meta, URL yapısı).
NOT: Kelime havuzları en büyük iş — her dil için binlerce kelime + geçerlilik/aksан
(ç,ğ,ü / ñ / ą,ę / å,ø / ě,ř vb.) kuralları. Aşamalı yapılmalı.

## Faz 11 STRATEJİSİ netleşti (Nazım) — SONRAYA ERTELENDİ
- Faz 11 (çoklu dil) ŞİMDİ YAPILMAYACAK. Önce YENİ ÖZELLİKLER var.
- Nazım kelime havuzlarını her dil için AYRI bir alandan import edecek (kendisi).
- MİMARİ KARAR: Nazım "her dil için ayrı uygulama yapacağım" diyor -> muhtemelen her dil
  ayrı deployment/instance (tek kod tabanı, dil başına ayrı DB/domain) modeli.
- i18n yapıldığında: tüm sistem ilgili dilde çalışacak; VARSAYILAN DİL kullanıcının
  ülkesine/tarayıcı diline göre otomatik seçilecek (geo veya Accept-Language).
- Sıraya alındı; önce Nazım'ın isteyeceği yeni özellikler yapılacak.

## Faz YENİ — JOKER SİSTEMİ (Nazım detaylı istek)
Maç başına oyuncu başına: 🟡 sarı harf×2, 🟢 yeşil harf×1, ⏱️ süre uzatma(+10sn)×1.
Backend (match.py):
- Match.jokers: oyuncu başına haklar; admin ayarından okunur (jokers_enabled kapalıysa hepsi 0).
- use_joker(pid, kind): yeşil=doğru yere harf, sarı=kelimede olan harfi YANLIŞ yere,
  time=+10sn. Kullanınca buzzer o oyuncuya geçer (turn devri). Hak/koşul kontrolü.
- can_use_letter_joker: bilinen ek harf < length-3 (4:0, 5:0-1, 6:0-2 aktif; eşikte pasif).
  RoundState.known_extra_letters (yeşiller + joker yeşilleri). joker_greens/yellows round'da,
  tahmin yapılınca temizlenir (sadece o tahminde geçerli).
- RoundState.to_public: joker_greens/yellows gider. jokers_public: haklar + enabled.
- room.handle_joker: use_joker + joker_used broadcast + buzzer_taken + state.
- match.py WS action=joker. broadcast_state'e jokers eklendi.
Frontend:
- useMatch: useJoker + jokers state.
- MatchGame: JokerColumn (grid solunda dikey, kalan hak rozeti, koşula göre aktif/pasif,
  enabled=false ise gizli). canUseJokerNow (turun başı/sıra bende + aktif). joker_used ->
  ses + rakip kullanınca POPUP (bildirim alanında 2.5sn, fadeIn). Grid DraftLine joker
  yeşil/sarı harfleri renkli gösterir.
- lib/sound.ts: joker_yellow/green/time sentetik sesler + admin mp3 slotları (sound_asset).
Admin: game_setting jokers_enabled(bool) + joker_yellow/green/time_count. yonetim Ayarlar
sekmesi bool ayarları SWITCH olarak gösterir (anında kaydeder).
Test: WS joker akışı, yeşil doğru/sarı yanlış yer, koşul (5harf 0-1 aktif/2 pasif),
kapalıyken hak 0 + gizli. Build ok. Bot joker kullanmaz (sadece insan).

## Joker HOTFIX — kilitlenme (Nazım: ilk tahminde maç kilitlendi + joker görünmedi)
KÖK NEDEN: use_joker eklenirken str_replace, submit_guess'in BAŞLIK satırını (def + docstring)
sildi; gövdesi jokers_public'in return'ünden sonra ölü kod olarak kaldı. Yani Match.submit_guess
metodu YOKTU -> tahmin gönderilince AttributeError -> maç kilitlendi. Joker görünmemesi de
bu genel bozukluğun yan etkisiydi.
ÇÖZÜM: submit_guess başlığı (def submit_guess + docstring + self._require_active...) geri eklendi.
AST doğrulaması: Match metodları sırayla tam. Test: submit_guess çalışıyor, joker sonrası tahmin
çalışıyor, joker_greens tahmin sonrası temizleniyor. Build ok.

## Joker v2 — yüzen J butonu + turda tek joker + bildirim popup (Nazım)
1. 6 harfte joker sütunu tasarımı kaydırıyordu -> grid solundaki JokerColumn KALDIRILDI.
   Yerine FloatingJoker: bildirim alanında sağda yüzen "J" butonu (accent renkli, toplam
   hak rozeti). Tıkla -> altında 3 joker açılır (🟡🟢⏱️ + hak rozetleri), seç+kapan.
   Grid artık tam genişlik (kayma yok).
2. TURDA TEK JOKER: RoundState.joker_used_by listesi. use_joker'da "bu turda zaten
   kullandın" kontrolü. round_start'ta liste sıfırlanır (yeni RoundState). J butonu
   usedThisRound ise pasif. Test: 1. joker OK, 2. engellendi, rakip etkilenmez.
3. Bildirim POPUP: eski minHeight:18 bildirim satırı (yer kaplıyordu) -> height:0 +
   absolute popup. error/flash/jokerPopup hepsi tek popup (üstte, fadeIn). "Süre doldu"
   vb. artık popup, boşluk harf bloklarına kaldı.
Frontend only + backend joker_used_by (models to_public). Build ok.

## Joker v3 — J butonu sola + altın tema + popup süre (Nazım)
- FloatingJoker sola alındı (right:4 -> left:4, açılır panel de left:0).
- J butonu altın temalı: border 2px #D4AF37, bg linear-gradient(#FFD86B->#D4AF37),
  yazı #4a3b00, altın gölge. Pasifken gri.
- Popup süreleri +2sn: flash 1200->3200, turn_timeout 1400->3400, error 2500->4500.
Frontend only.

## Lig ödülleri + Bildirim sistemi + Başarılar (Nazım detaylı istek)
İstek: dün ligte 1. olduğumu haber alamadım. Günün/Ayın/Yılın Şampiyonu + 2./3. madalyalar,
zamanlı otomatik verilsin, bildirim düşsün. Rozetler->Başarılar, aynı ödül ×N gösterilsin.
Backend:
- models/notification.py: Notification (user_id, kind, title, body, icon, read, created_at).
  init_models + main.py router.
- api/routes/notifications.py: GET /notifications (liste+unread), POST /read (tümü),
  POST /{id}/read.
- league_scheduler.py: award_title (Günün/Ayın/Yılın + Şampiyonu/2.si/3.sü), RANK_ICON
  (🏆🥈🥉). award_period artık "daily" de destekler + her ödülde Notification oluşturur.
  check_and_award_closed_periods: dün(daily her gün) + ayın 1'i(monthly) + yılbaşı(yearly).
  Loop günde bir -> SAATTE BİR (gün dönümü yakalansın).
- profile.py: _group_achievements (period_type+rank grupla, count=×N). profil'e achievements.
Frontend:
- components/NotificationBell.tsx: username solunda 🔔 zil + okunmamış rozet + açılır liste,
  açınca okundu işaretler, 60sn'de yenilenir. TopBar'a eklendi.
- profil sayfası: "Kupalar & Madalyalar" (achievements ×N, 1.'ye altın border) + eski
  "Rozetler" başlığı -> "Başarılar".
Test: günlük ödül 1/2/3 + bildirimler, achievements ×2 sayımı, unread sayısı ✓.
NOT: ödüller o günün/ayın/yılın DailyScore/lig verisinden hesaplanır; ilk deploy'da geçmiş
günler için otomatik dağıtılmaz (sadece kapanan yeni dönemler). Geçmişe dönük istenirse
ayrı script gerekir.

## Başarı özeti oyuncu kartında (Nazım: en baştaki plan — username altında kupa/madalya/rozet)
İlk konuşmada: rakip bulununca username altında 🏆(1) 🥈(6) 🎖️(6) gibi basit başarı özeti
gösterilecekti; hiç eklenmemişti. Eklendi:
- models.py Player: trophies/medals/badges alanları + to_public.
- match.py _fill_achievements: Player oluşturulurken DB'den kupa (trophy award), madalya
  (medal award), rozet (earned_badges sayısı) doldurulur (u{id} kullanıcıları için).
- ScoreBar PlayerChip: username altında 🏆N 🥈N 🎖️N (0 olanlar gizli).
- PublicPlayer + PlayerChip inline tip: trophies/medals/badges eklendi.
Skor çubuğunda maç boyunca sürekli görünür. VS ekranına (VsScreen) EKLENMEDİ — orada maç
WS verisi yok, ayrı API gerekir; skor çubuğu yeterli (sonra istenirse VS'e de eklenebilir).
Test: Player.to_public başarı alanları ✓, build ok.

## Başarı özeti mobilde görünmüyordu (Nazım: desktop'ta gördüm, mobilde göremedim)
Sebep: dar kartta avatar(44px sabit)+metin sığmayınca başarı satırı sıkışıp kesiliyordu.
Çözüm: PlayerChip başarı satırı whiteSpace:nowrap + flexWrap:nowrap + gap 6->4, her span
nowrap. Avatar responsive: clamp(34-44px) + fontSize clamp. img objectFit cover. Sadece frontend.

## Bildirim popup mobil + tarih (Nazım)
1. Mobilde bildirim popup solda kalıp kesiliyordu (position:absolute right:0). Çözüldü:
   position:fixed, right:12, top:60, width:min(320px, calc(100vw-24px)), maxHeight:70vh.
   Artık ekran içinde, sağ üstte, taşmadan.
2. Bildirime TARİH eklendi: _period_label (league_scheduler) period_key -> Türkçe tarih.
   daily "2026-07-24"->"24 Temmuz 2026", monthly->"Temmuz 2026", yearly->"2026".
   Body: "24 Temmuz 2026 liginde Günün Şampiyonu oldun. Tebrikler!". _TR_MONTHS dizisi.

## Gündüz/Gece modu (Nazım)
- globals.css: [data-theme="light"] açık tema değişkenleri (zemin/metin açık, accent amber
  gündüzde biraz koyu #e0940a okunur, grid yeşil/sarı aynı). light body gradyanı da açık.
- lib/theme.ts: mod "auto"(cihaz saati 07-19 gündüz)/"dark"/"light". localStorage kt_theme.
  applyTheme documentElement[data-theme] set/remove. auto'da dakikada bir kontrol.
  cycleThemeMode, onThemeChange dinleyici.
- components/ThemeToggle.tsx: tıkla-açılır mini menü (🌙 Gece / ☀️ Gündüz / 🌗 Otomatik),
  aktif seçili vurgulu. TopBar + MatchGame'de ses butonunun SOLUNA eklendi.
- layout.tsx head: flash önleyici inline script (sayfa boyanmadan doğru tema uygulanır).
Varsayılan: dark (mevcut gece modu). Frontend only. Build ok.
NOT: themeColor meta hâlâ gece rengi (statik); istenirse dinamik yapılabilir.

## Ana sayfa: son 10 maç + günlük lig ilk 10 (Nazım)
Backend:
- models/match_history.py: MatchHistory (p1/p2 name+score, winner_name, has_bot, created_at).
  init_models'a eklendi. match.py on_over: maç bitince MatchHistory kaydı (botlar dahil).
- api/routes/home.py (public, giriş gerektirmez): GET /home/recent-matches (son 10),
  GET /home/daily-top (bugün lig ilk 10, leaderboard daily). main.py'ye router eklendi.
Frontend:
- components/HomeBoards.tsx (client): iki bölüm — "🏆 Bugünün Ligi İlk 10" (madalya ikonları,
  profile link, puan) + "⚔️ Son Maçlar" (p1 skor:skor p2, kazanan accent+bold). Boşsa gizli.
- app/page.tsx: header'dan sonra <HomeBoards/> eklendi.
Test: recent-matches + daily-top ✓, build ok.
NOT: leaderboard display_name döndürmüyor (username fallback). Maç geçmişi bu deploy'dan
sonra dolmaya başlar (eski maçlar kayıtlı değil).

## Gündüz modu okunabilirlik fix (Nazım: yazılan harf beyaz, açık zeminde okunmuyor)
- Grid DraftLine: kullanıcının yazdığı taslak harf rengi "#fff" -> "var(--text-strong)"
  (gece açık, gündüz koyu). Joker harfleri renkli zeminde #fff kalır.
- globals.css light tema: --tile-absent #c9c2df -> #8b83a6 (koyulaştı, dolu gri kutuda
  beyaz harf gündüzde de okunur).
Frontend only. Build ok.

## Ana sayfa 2 sütun + maç sonu butonları (Nazım)
- HomeBoards: lig + son maçlar artık yan yana 2 blok (.home-boards grid 1fr 1fr,
  mobilde <=640px tek sütun). section flex column + kart flex:1 + align-items:stretch ->
  10'ar satırda eşit yükseklik. Başlık "Bugünün Ligi" (— İlk 10 kaldırıldı, sığsın).
- MatchGame maç sonu: tek "Lig sıralaması" linki -> buton görünümlü 🏠 Ana Sayfa + 🏆 Lig
  (endLinkBtn stili: panel bg, border, radius). Frontend only. Build ok.

## Son maçlarda user link (Nazım)
- MatchHistory'ye p1_username/p2_username eklendi (link için; ""=bot/link yok).
  match.py on_over: _uname helper ile kayıtlı kullanıcı (u{id}, bot değil) username DB'den çekilir.
- HomeBoards son maçlar: username varsa <a href=/profil/{username}>, yoksa <span> (bot/eski kayıt).
Test: kayıtlı user linkli, bot linksiz ✓. NOT: eski maç kayıtlarında username="" (link yok);
bu deploy'dan sonraki maçlar linkli olur. Frontend+backend. Build ok.

## Profil düzenle + gizlilik (Nazım — PARÇA 1/3; sonra online, sonra maç teklifi)
Plan: 3 parça. Bu parça: profil düzenleme + gizlilik ayarları.
Backend:
- user.py: show_online(bool, default True), allow_challenges(bool, default True).
- api/routes/account.py: GET /account/me, POST /account/username (3-20 harf/rakam/_, benzersiz),
  /account/email (format+benzersiz), /account/password (mevcut şifre doğrulaması, min 6),
  /account/privacy (show_online, allow_challenges). main.py router.
Frontend:
- components/ProfileEditModal.tsx: modal — gizlilik toggle (2), username/email/şifre değiştir.
- profil sayfası: isMe ise "⚙️ Profili Düzenle" butonu -> modal. Kaydedince load() ile yenile.
Test: account/me varsayılan açık, username/privacy/password (yanlış 403, doğru 200) ✓. Build ok.
SONRAKİ: online durumu (presence) + profilde göster; sonra maç teklifi (popup, 30sn, kabul->maç).
Karar: kabul edince teklif EDEN yönlendirilir (diğeri zaten hazır). Teklif popup'ı maç hariç her yerde.

## Online durumu / presence (Nazım — PARÇA 2/3)
Backend:
- game/presence_service.py: bellekte _presence {uid: {last_seen, in_match}}. heartbeat,
  set_in_match, get_status (online/in_match/offline, ONLINE_WINDOW=60sn), is_online.
- api/routes/presence.py: POST /presence/heartbeat (auth), GET /presence/{uid} (gizlilik:
  show_online=False -> offline; allow_challenges de döner). main.py router.
- match.py WS: bağlanınca set_in_match(True), disconnect'te set_in_match(False).
- profile.py: profil yanıtına "id" eklendi (presence sorgusu için).
Frontend:
- components/HeartbeatPinger.tsx: 30sn'de bir + sekme görünürlüğünde heartbeat. TopBar'da
  giriş yapmışsa çalışır.
- components/PresenceBadge.tsx: online(yeşil "Maça hazır")/maçta(mavi)/çevrimdışı(gri) nokta+etiket.
  20sn'de bir tazeler, onStatus callback (parça 3 için allow_challenges verir).
- profil sayfası: başka birinin profilinde <PresenceBadge/> (kendinde değil). Profile.id eklendi.
Test: heartbeat->online ✓, build ok.
SONRAKİ (PARÇA 3): maç teklifi — online+maçta değil+allow_challenges ise "Maç Teklifi Gönder"
butonu; karşıya 30sn popup (kabul/reddet); kabul edince teklif EDEN maça yönlenir.

## Maç teklifi sistemi (Nazım — PARÇA 3/3, TAMAMLANDI)
Backend:
- game/challenge_service.py: bellekte _challenges. create_challenge (aynı çifte pending varsa
  tekrar kullan), pending_for(to_id), accept (room_code=duel-xxx üretir), decline,
  outgoing_status(from_id). CHALLENGE_TTL=30sn, cleanup (expired/eski sil).
- api/routes/challenge.py: POST /challenge/send/{to_id} (hedef allow_challenges + online +
  maçta değil kontrolü, değilse 403/409), GET /challenge/incoming (alıcı popup),
  POST /{cid}/accept (oda kodu döner), /{cid}/decline, GET /challenge/outgoing (gönderen
  kabul durumu+oda). main.py router.
Frontend:
- components/ChallengeWatcher.tsx: GLOBAL (TopBar, giriş yapmışsa). 3sn'de bir yoklar:
  (1) /incoming -> gelen teklif POPUP (⚔️ Maç Teklifi, from_name, 30sn geri sayım, Kabul/Reddet).
  Kabul -> /oyna?duel=CODE. (2) /outgoing accepted -> gönffdereni /oyna?duel=CODE'a yönlendirir.
  Maç ekranında (/oyna) gelen popup gösterilmez.
- profil sayfası: başka birinin profilinde online+allow_challenges ise "⚔️ Maç Teklifi Gönder"
  butonu (PresenceBadge onStatus callback ile status+allow alınır). Gönderince "bekleniyor…".
- oyna sayfası: ?duel=CODE ile gelince menu yerine direkt VS moduna geçer, o odaya bağlanır.
  İki taraf aynı duel-xxx koduna bağlandığı için aynı odada buluşur.
Test: gönder->incoming->accept->iki taraf aynı oda ✓, offline'a 409 ✓, build ok.
Karar (uygulandı): kabul edince teklif EDEN de yönlenir (outgoing polling ile). 30sn TTL.
Popup maç hariç her yerde. PROFİL DÜZENLE+GİZLİLİK+ONLINE+TEKLİF üçlemesi tamam.

## Maç teklifi HOTFIX (Nazım: Yasemin kabul etti ama Nazım yönlenmedi, "kod paylaş" çıktı)
KÖK NEDEN: ChallengeWatcher + HeartbeatPinger sadece TopBar'daydı; PROFİL SAYFASI TopBar
kullanmıyor (kendi Wrap'i). Nazım teklif gönderip profil sayfasında beklerken outgoing
polling HİÇ çalışmadı -> kabul edilince yönlenmedi. Yasemin odaya tek girince "kod paylaş" gördü.
ÇÖZÜM:
- HeartbeatPinger + ChallengeWatcher TopBar'dan ALINDI, Providers.tsx'e (AuthProvider içinde,
  her sayfada) taşındı. Artık profil dahil TÜM sayfalarda çalışır.
- MatchGame bekleme: code "duel-" ile başlıyorsa "kod paylaş" yerine "Rakibin bağlanıyor…"
  gösterir (duel maçında kod paylaşmaya gerek yok).
- ChallengeWatcher: outgoing yönlendirmesi de onMatchPage() ise durur (zaten /oyna'dayken tekrar
  yönlenmesin).
Frontend only. Build ok.

## Profil avatar galerisi (Nazım — botların DiceBear avatarlarından seçme)
Açıklama: botların "fotoğrafı" = DiceBear (api.dicebear.com, ücretsiz, key yok). bot_names.py
avatar_url_for(seed) -> thumbs stili. Kullanıcılara da açıldı.
Backend:
- account.py POST /account/avatar: sadece https://api.dicebear.com/ URL kabul (güvenlik),
  max 512 char. account/me'ye avatar_url eklendi.
Frontend:
- ProfileEditModal: "Profil Fotoğrafı" bölümü + AvatarPicker. 8 stil (thumbs, bottts,
  fun-emoji, adventurer, big-smile, avataaars, micah, notionists) x tohumlardan 18 seçenek
  ızgarası (6 sütun). Seç -> /account/avatar kaydet, seçili olana accent border.
Test: geçerli dicebear kabul, kötü URL 400 ✓. Build ok.
NOT: gerçek foto yükleme yapılmadı (sadece galeri, Nazım tercihi).

## Avatar galerisi: rastgele + yenile (Nazım)
AvatarPicker artık rastgele üretir: 10 stil x rastgele tohum. İlk açılışta mevcut avatar başa
eklenir + 17 rastgele. "🎲 Yeni Seçenekler Üret" butonu 18 yeni rastgele avatar üretir (state).
Frontend only. Build ok.

## Lig sayfası: önceki dönem + arşiv + dinamik sekme (Nazım)
Backend league.py:
- _period_top3(db, type, key): dönemin ilk 3'ü (LeagueAward join User, username/display/avatar/score).
- GET /league/previous: dün(daily)+geçen ay(monthly)+geçen yıl(yearly) ilk 3.
- GET /league/archive?period_type&page&per_page(10): o tipin geçmiş dönemleri (distinct period_key,
  yeni->eski, sayfalı), her dönemin top3'ü.
Frontend:
- lig sayfası SCOPES etiketleri dinamik: "26 Tem"(daily) / "Temmuz"(monthly) / "2026"(yearly) /
  "Tüm Zamanlar". scopeLabels() bugünün tarihinden üretir.
- PreviousWinners bileşeni: sıralama altında "Önceki Dönem Kazananları" (Dün/Geçen Ay/Geçen Yıl
  ilk 3, profile linkli) + "Lig Arşivi →" linki. Boşsa gizli.
- app/lig/arsiv/page.tsx: Günlük/Aylık/Yıllık sekmeli, sayfalı (Önceki/Sonraki), her dönemin
  ilk 3'ü, tarih formatlı (26 Temmuz 2026 / Temmuz 2026 / 2026).
Test: previous + archive ✓. Build ok. NOT: sadece kapanmış dönemler ödül kaydına düştükçe dolar.

## Avatar maç/VS ekranında görünmüyordu (Nazım)
Sebep: WS bağlanınca Player avatar_url boştu (URL'de avatar yok). Çözüm:
- match.py _fill_achievements: Player oluşturulurken DB'den u.avatar_url de doldurulur
  (en güncel seçili avatar). Player.to_public zaten avatar_url içeriyor -> ScoreBar gösterir.
- oyna sayfası VS ekranı: me'ye avatar_url: user?.avatar_url eklendi (kendi avatarım VS'te görünür).
Test: maçta player avatar_url dicebear geliyor ✓. Build ok.
NOT: VS ekranında RAKİP avatarı yok (maç öncesi WS verisi yok); skor çubuğunda iki avatar da var.

## Admin panel canlı istatistikler (Nazım)
Backend:
- presence_service.counts(): online + in_match kullanıcı sayısı (heartbeat penceresi).
- admin.py /dashboard "live" bloğu: online, in_match_users, live_matches (room_manager.rooms'ta
  match!=None + 2 oyuncu), matches_today + matches_month (MatchHistory created_at UTC gün/ay başı).
Frontend:
- yonetim Dashboard: "Canlı Durum" bölümü (Online kişi, Anlık maç, Bugünkü maç, Bu ay maç) +
  "Genel" (kullanıcı/toplam maç/bot) + En İyi Oyuncular. 10sn'de bir otomatik yenilenir.
  Stat'a accent prop (border) eklendi.
Test: online=2, matches_today=2 ✓. Build ok.
NOT: online/anlık maç sunucu belleğinden (tek instance). matches_today/month MatchHistory'den
(bu deploy'dan sonra dolan maçlar).
