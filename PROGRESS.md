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
