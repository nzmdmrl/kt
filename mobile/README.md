# mobile/ — Kelime Tahmin Native Kabuk (Capacitor)

Bu klasör, kelimetahmin.com'u Android/iOS uygulaması olarak paketleyen **Capacitor
kabuğudur**. Web kodu burada **yoktur**: uygulama açıldığında WebView doğrudan
`https://www.kelimetahmin.com` adresini yükler (`capacitor.config.ts` → `server.url`).

Yani **siteye push'ladığın her değişiklik uygulamaya anında yansır**; yeni sürüm
yayınlamak sadece native tarafta (plugin ekleme, ikon, izin) bir şey değişince gerekir.

> `frontend/`, `backend/`, `docker-compose.yml` ve Dockerfile'lara bu klasör hiç
> dokunmaz. Canlı deploy bu klasörden etkilenmez.

---

## Klasör içeriği

| Yol | Ne işe yarar |
|---|---|
| `capacitor.config.ts` | Tek yapılandırma kaynağı (appId, server.url, splash, push, user-agent) |
| `shell/offline.html` | İnternet yokken gösterilen sayfa (`server.errorPath`). Tamamen bağımsız — dış font/istek yok |
| `shell/index.html` | Normalde görünmez. `server.url` devre dışı kalırsa canlı siteye yönlendirir; ayrıca Capacitor'ün webDir için istediği zorunlu dosya |
| `android/` | `npx cap add android` ile üretilen native proje — **repoda tutulur**, Mac'te build alınır |
| `package.json` | Capacitor CLI + eklentiler (7.x hattı) |

### Kurulu eklentiler

`@capacitor/app`, `@capacitor/push-notifications`, `@capacitor/splash-screen`,
`@capacitor/status-bar`, `@capacitor/share`, `@capacitor/browser`,
`@capacitor/preferences`, `@capacitor-community/admob`,
`@capacitor-community/speech-recognition`

Capacitor sürümü: **7.6.8** (core / cli / android). Sürüm hattı bilinçli olarak 7.x'te
tutuldu; 8.x'e geçilecekse tüm eklentiler birlikte yükseltilmeli.

Uygulama kimliği: `com.kelimetahmin.app` · `versionCode 2` / `versionName "1.1"`
(`android/app/build.gradle`) · minSdk 23 · compileSdk 35

---

## Mac'te build almak

```bash
# 1) Repoyu güncelle
git pull

# 2) Bağımlılıklar (mobile/ içinde — node_modules repoda yok)
cd mobile
npm install

# 3) Native projeyi yapılandırmayla senkronla
#    (shell/ dosyalarını kopyalar + eklentileri Gradle'a işler)
npx cap sync android

# 4) Android Studio'da aç ve çalıştır / imzalı APK-AAB üret
npx cap open android
```

Kontrol için: `npx cap doctor` → "Android looking great! 👌" vermeli.

Gereksinimler: Android Studio (Ladybug+), JDK 21, Android SDK 35.

### iOS (henüz eklenmedi)

iOS platformu **bilerek eklenmedi** — `npx cap add ios` yalnızca macOS'ta çalışır
(CocoaPods + Xcode gerekir). Mac'te şunu çalıştır:

```bash
cd mobile
npm install @capacitor/ios@^7
npx cap add ios
npx cap sync ios
npx cap open ios
```

`capacitor.config.ts` içindeki `ios` bloğu (user-agent + `contentInset: "always"`)
zaten hazır bekliyor.

> **iOS eklenince ZORUNLU — sesli tahmin izin metinleri.** `Info.plist` içine şu iki
> anahtar yazılmadan uygulama, mikrofona ilk basışta **çöker** (iOS izin metni olmayan
> API çağrısını sonlandırır):
>
> | Anahtar | Ne için |
> |---|---|
> | `NSSpeechRecognitionUsageDescription` | Konuşmanın metne çevrilmesi (SFSpeechRecognizer) |
> | `NSMicrophoneUsageDescription` | Ses kaydı için mikrofon erişimi |
>
> Örnek metin: "Kelimeyi klavye yerine söyleyerek tahmin edebilmen için mikrofon
> kullanılıyor." Bu görevde iOS projesi **açılmadı**, bu yüzden anahtarlar da eklenmedi.

---

## Repoya girmeyen, elle konması gereken dosyalar

Aşağıdakiler kök `.gitignore`'da hariç tutuldu (gizli anahtar / makineye özel /
build çıktısı). Build alan makinede **elle sağlanmalı**:

| Dosya | Nereden gelir |
|---|---|
| `android/app/google-services.json` | Firebase Console → Android uygulaması (`com.kelimetahmin.app`) → indir. **Push bildirimleri bunsuz çalışmaz.** |
| `android/local.properties` | Android Studio projeyi ilk açtığında SDK yolunu kendisi yazar |
| `*.keystore` + `android/keystore.properties` | Yayın imzası. Keystore'u **repoya koyma**, güvenli yerde sakla — kaybolursa Play Store'da güncelleme yapılamaz |

Ayrıca `android/app/src/main/assets/public/` ve `assets/capacitor.config.json`
Capacitor'ün kendi `.gitignore`'u tarafından hariç tutulur — bunlar `npx cap sync`
ile `shell/` ve `capacitor.config.ts`'ten **her seferinde yeniden üretilir**, elle
konmaz.

`android/` altındaki build çıktıları (`build/`, `.gradle/`) da ignore edilir; native
projenin kaynak dosyaları (Gradle betikleri, manifest, ikonlar, gradle wrapper)
repoda durur.

---

## Yapılandırmayı değiştirme

Native davranış **sadece `capacitor.config.ts`'ten** değiştirilir; `android/` altındaki
üretilmiş dosyaları elle düzenleme (sync üzerine yazabilir). Değişiklikten sonra
`npx cap sync android` çalıştır.

`server.allowNavigation` listesi uygulama içinde kalması gereken alan adlarını tutar
(`www.kelimetahmin.com`, `kelimetahmin.com`, `api.kelimetahmin.com`). Listede olmayan
bir adres harici tarayıcıda açılır.

Backend, uygulamadan gelen istekleri `KelimeApp/1.0 (android|ios)` user-agent
son ekiyle ayırt edebilir (`android.appendUserAgent` / `ios.appendUserAgent`).

---

## AdMob uygulama kimliği (build-time — panelden yönetilemez)

AdMob **uygulama kimliği** (app id) native manifest'e gömülür; uygulama açılışında
Google Play Services SDK'sı onu manifest'ten okur. Panelden/ayarlardan gelen bir
değer olamaz, çünkü SDK bu değeri uygulama daha ağ isteği yapmadan, süreç başlarken
ister. Eksikse uygulama **açılışta çöker**:
`Missing application ID. AdMob publishers should follow the instructions…`
(hata kaynağı: `MobileAdsInitProvider`).

Bu yüzden kimlik iki dosyada, elle tutulur:

| Dosya | Satır |
|---|---|
| `android/app/src/main/res/values/strings.xml` | `<string name="admob_app_id">ca-app-pub-7879889419651461~2548256765</string>` |
| `android/app/src/main/AndroidManifest.xml` | `<application>` içinde `<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="@string/admob_app_id"/>` |

Değiştirmek için bu iki dosyayı düzenle, sonra **yeni bir sürüm derleyip Play
Store'a yükle** — canlıdaki uygulamalar etkilenmez.

> Bu iki dosya `npx cap sync` tarafından **üretilmez**, elle bakılan kaynak
> dosyalardır; sync üzerine yazmaz. (Yukarıdaki "üretilmiş dosyaları elle düzenleme"
> uyarısı `assets/public/`, `capacitor.config.json` gibi çıktı dosyaları içindir.)

**Reklam birimi kimlikleri (banner / interstitial) ise panelden yönetilir.** Onlar
uygulama açıldıktan sonra API'den okunur: `/yonetim` → ⚙️ Ayarlar → **AdMob (mobil
uygulama)** (`ads.admob` anahtarı, `backend/app/api/routes/app_settings.py`). Yani
banner/geçiş birimini değiştirmek için yeni sürüm gerekmez; sadece app id için gerekir.

Not: aynı panelde bir **"Android — uygulama kimliği"** alanı da görünüyor, ama
manifest'i etkilemez — app id yalnızca yukarıdaki `strings.xml`'den gelir. Panel
alanını doldurursan da orayı referans/kayıt amaçlı tutmuş olursun.

iOS eklendiğinde karşılığı `Info.plist` içindeki `GADApplicationIdentifier`
anahtarıdır; o da aynı şekilde build-time'dır.

---

## Sesli tahmin (mikrofon)

Sitedeki 🎤 "basılı tut & söyle" düğmesi **Android System WebView'de çalışmaz**:
WebView, Chrome'un aksine Web Speech API'yi (`webkitSpeechRecognition`) getirmez.
Bu yüzden uygulamada tanıma native tarafa devredildi —
`@capacitor-community/speech-recognition` (Android `SpeechRecognizer`, iOS
`SFSpeechRecognizer`).

Web kodu tek yerden ayrım yapar: `frontend/lib/useSpeech.ts`. Native ise plugin,
tarayıcıda ise eski Web Speech API yolu çalışır; dört oyun ekranı (arena, 1v1,
maraton, günün kelimesi) farkı bilmez. Plugin JS'i **dinamik `import()`** ile
yüklenir, yani normal tarayıcıda paket hiç indirilmez.

Manifest'te elle tutulan iki kayıt var (`android/app/src/main/AndroidManifest.xml`):

| Kayıt | Neden gerekli |
|---|---|
| `<uses-permission android:name="android.permission.RECORD_AUDIO" />` | Mikrofon. İzin **uygulama açılışında değil**, kullanıcı mikrofona ilk basınca istenir |
| `<queries><intent><action android:name="android.speech.RecognitionService" /></intent></queries>` | Android 11+ paket görünürlüğü. Bu blok olmadan sistem tanıma servisi görünmez, `available()` false döner ve düğme hiç çıkmaz |

Davranış: cihazda tanıma servisi yoksa (ör. Google uygulaması devre dışı) mikrofon
düğmesi **görünmez** — bozuk düğme gösterilmez. Kullanıcı izni reddederse kısa bir
uyarı çıkar ve oyun klavyeyle tam olarak oynanmaya devam eder.

Play Store'da uygulama, mikrofon izni yüzünden **veri güvenliği formunda** ses
kullanımını beyan etmeni isteyebilir: ses yalnızca cihazdaki tanıma servisine gider,
kelimetahmin.com sunucularına **ses gönderilmez** (yalnız tanınan metin oyuna yazılır).

---

## Play Games girişi (yerel eklenti — npm paketi yok)

Play Games Services v2 ile giriş için **kendi Capacitor eklentimiz** var; npm'den
eklenti kurulmadı, Firebase de gerekmiyor. Kullanılan tek kütüphane
`com.google.android.gms:play-services-games-v2` (sürüm `android/variables.gradle`
içinde `playServicesGamesVersion`).

| Dosya | Görevi |
|---|---|
| `android/app/src/main/java/com/kelimetahmin/app/PlayGamesPlugin.java` | Eklentinin kendisi |
| `android/app/src/main/java/com/kelimetahmin/app/MainActivity.java` | `registerPlugin(PlayGamesPlugin.class)` |
| `android/app/src/main/res/values/strings.xml` | `game_services_project_id` (Play Console proje kimliği) |
| `android/app/src/main/AndroidManifest.xml` | `com.google.android.gms.games.APP_ID` meta-data |

> Bu dosyaların dördü de `npx cap sync` tarafından **üretilmez**, elle bakılan
> kaynaklardır; sync üzerine yazmaz.

**Neden MainActivity'de kayıt gerekiyor:** npm'den gelen eklentiler `cap sync`'in
ürettiği `capacitor.plugins.json` üzerinden köprüye otomatik tanıtılır. Bizimki
npm paketi olmadığı için o listede yoktur — `registerPlugin` çağrısı olmazsa JS
tarafında eklenti "yok" görünür. Çağrı `super.onCreate()`'ten **önce** olmalıdır.

JS tarafından üç metot çağrılır (`Capacitor.Plugins.PlayGames`):

| Metot | Döndürür | Ne yapar |
|---|---|---|
| `isAuthenticated()` | `{ authenticated }` | Ekran **açmadan** sorar: oturum zaten açık mı |
| `signIn()` | `{ authenticated }` | Gerekirse Play Games giriş ekranını açar |
| `requestServerSideAccess({ serverClientId, forceRefreshToken })` | `{ serverAuthCode }` | Sunucuya verilecek tek kullanımlık yetki kodu |

`serverClientId` = Google Cloud'daki **web** istemci kimliği (Android'inki değil).
Kod içine gömülmedi, JS'ten parametre olarak geçilir.

`PlayGamesSdk.initialize()` eklentinin `load()` metodunda, yani uygulama açılırken
bir kez çalışır; sessiz giriş denemesini SDK kendisi yapar.

**Henüz web/JS tarafı bağlanmadı** — bu adım yalnız native eklentiyi ekler.

### Backend ucu ve kimlik ayrımı (adım 3a)

`POST /api/auth/play-games` — gövde: `{ "server_auth_code": "..." }`, yanıt web
girişiyle **birebir aynı**: `{ token, user }`. Yani giriş yapıldıktan sonraki her
şey (WebSocket kimliği, admin kontrolü, push kaydı) aradaki farkı görmez.

İki adımlı, çünkü Play Games `id_token` vermez:

1. Tek kullanımlık yetki kodu Google'ın token ucunda `access_token`'a takas edilir,
2. O token'la `games.googleapis.com/games/v1/players/me` okunur → oyuncu kimliği
   ve takma ad. Kimliğin **tek** kaynağı bu yanıttır; istemcinin gönderdiği hiçbir
   isim/kimlik alanına güvenilmez.

**İKİ GOOGLE PROJESİ BİRBİRİNE KARIŞTIRILMAZ:**

| Akış | Kimlik nereden |
|---|---|
| Sitedeki web Google girişi (`/auth/google`) | Coolify env: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (ayrı proje) |
| Uygulamadaki native Google girişi (`/auth/google/native`) | Admin panel: `app.flags` → `google_web_client_id` |
| **Play Games** (`/auth/play-games`) | Coolify env: **`PLAY_GAMES_CLIENT_ID` / `PLAY_GAMES_CLIENT_SECRET`** |

Play Games değerleri **958058877022** numaralı projedeki **Web** istemcisine aittir
(Android istemcisinin gizli anahtarı zaten yoktur). Bilerek fallback konmadı: ikisi
birden dolu değilse uç `503` döner, sessizce web girişinin kimliğine düşmez.
Durum kontrolü: `/api/health` → `play_games_configured`, düğme için
`/api/auth/play-games/status` → `{configured, client_id}` (secret asla dönmez).

**Kimlik uzayı ayrı:** Play Games oyuncu kimliği Google `sub` değeri **değildir**;
`users.play_games_id` sütununda ayrı tutulur (benzersiz indeks migration 15).

### Sessiz giriş akışı (adım 3b — backend)

Uygulamada **düğme yok**: Play Games girişi uygulama açılınca kendiliğinden denenir.
`POST /api/auth/play-games` üç sonuçtan birini döner:

| Durum | Yanıt | Uygulama ne yapar |
|---|---|---|
| `Authorization` başlığı var (kişi zaten girişli) | `{token, user}` — kimlik mevcut hesaba bağlandı | devam |
| Kimlik tanınıyor | `{token, user}` — oturum açıldı | devam |
| Kimlik yeni | `{new_account: true, pending_token, suggested_name}` — **hesap AÇILMAZ** | "isim belirle" ekranı |

**Neden yeni kimlikte hesap açılmıyor** — bu akışın en kritik kararı. Sessiz giriş
kullanıcının bir şeye basmasıyla başlamaz. Hemen hesap açsaydık, siteye e-posta ile
kaydolmuş biri uygulamayı ilk açtığında istemediği **ikinci** bir hesap edinirdi.
Dahası "Zaten hesabım var" deyip e-posta ile giriş yaptığında, oyuncu kimliği o
hayalet hesaba bağlı kaldığı için gerçek hesabına **bağlanamazdı** (409).

Onun yerine kimlik, hesap açılana kadar **kısa ömürlü bir ara jetonda** taşınır
(`pending_token`, 20 dk, `app/core/security.py`). İki çıkış var:

| Uç | Ne zaman | Sonuç |
|---|---|---|
| `POST /api/auth/play-games/complete` `{pending_token, name}` | Kullanıcı ismini yazdı | hesap **burada** açılır |
| `POST /api/auth/play-games/link` `{pending_token}` + `Authorization` | "Zaten hesabım var" → e-posta ile giriş yaptı | kimlik mevcut hesaba bağlanır |

İkisi de olmazsa geriye **tek bir kayıt bile kalmaz**.

Ara jeton neden gerekli: Play Games yetki kodu **tek kullanımlıktır**, ikinci adımda
tekrar kullanılamaz. Jeton, Google'a doğrulatılmış oyuncu kimliğini taşır ve sunucu
anahtarıyla imzalıdır — istemci kendi kimliğini yazamaz. Oturum jetonuyla
karışmaması için `typ` alanı taşır; `decode_token` `typ` gören jetonu reddeder.

### İsim → kullanıcı adı dönüşümü

Kullanıcı **tek** bir isim yazar. Görünen ad yazıldığı gibi kalır; kullanıcı adı
ondan türetilir (`name_rules.slugify_username`): Türkçe harfler ASCII karşılığına
çevrilir, boşluk silinir, küçük harfe inilir. Ad doluysa sonuna sıra numarası
eklenir — numara **2'den** başlar.

| Yazılan | Görünen ad | Kullanıcı adı |
|---|---|---|
| `Ayşe Gül` | Ayşe Gül | `aysegul` |
| `Çağrı Öz` | Çağrı Öz | `cagrioz` |
| `Nazım` | Nazım | `nazim` |
| `Ayşe Gül` (aysegul dolu) | Ayşe Gül | `aysegul2` |
| `Ay` | — | **hata:** "Adın en az 3 harf/rakam içermeli." |

Kısalık burada bilerek **hata**: kullanıcı ekranda uyarıyı görüp düzeltsin diye.
Otomatik hesap açan yollarda (Google girişi) kullanıcıya gösterilecek ekran
olmadığı için orada eski davranış sürüyor — kısa ad sonuna `0` eklenerek doldurulur
(`auth_service._unique_username`).

Aynı dönüşüm artık **Google kayıtlarında da** kullanılıyor. Eskiden Türkçe harfler
tamamen atılıyordu ("Ayşe" → `aye`); şimdi `ayse` oluyor. Yalnızca YENİ kayıtları
etkiler, mevcut kullanıcı adlarına dokunmaz.

**Play Games e-posta vermez:** yukarıdaki `complete` ile açılan hesabın e-postası
boştur. Kişi sonradan profilinden e-posta/şifre ekleyebilir.

### Uygulama tarafı (adım 3b — arayüz)

| Dosya | Görevi |
|---|---|
| `frontend/lib/playGames.ts` | Native köprü: eklentiye "oturum var mı?" sorar, varsa yetki kodu ister |
| `frontend/components/PlayGamesAuth.tsx` | Sessiz giriş akışı + "isim belirle" / "Zaten hesabım var" ekranı |
| `frontend/lib/auth.tsx` | `playGamesSilent` / `playGamesComplete` / `playGamesLink` — jeton bu dosyanın dışına çıkmaz |
| `frontend/components/Providers.tsx` | `<PlayGamesAuth />` buraya bağlandı |

**Giriş ekranı asla kendiliğinden açılmaz.** `playGames.ts` yalnızca
`isAuthenticated()` sorar; oturum yoksa `signIn()` **çağırmaz** — çağırsaydı
uygulama açılışında kullanıcının istemediği bir Google ekranı yüzüne çıkardı.
Oturum yoksa sessizce vazgeçilir.

**Hiç kimse kilitli kalmaz.** Şu durumların hepsinde hiçbir şey gösterilmez ve
site her zamanki gibi çalışır (kullanıcı normal giriş ekranını kullanır):
sunucuda `PLAY_GAMES_*` boş, cihazda Play Games yok, eski sürüm uygulamada
eklenti yok, sessiz oturum açılmamış, kod alınamamış, ağ hatası. İsim ekranının
altında ayrıca **"Şimdi değil"** var.

**Eklentiye nasıl ulaşılır — İLK HATANIN SEBEBİ.**
`window.Capacitor.Plugins.PlayGames` **boştur ve boş kalacaktır.** O liste
npm'den kurulan eklentilerle dolar: paketin JS'i yüklenince kendisi
`registerPlugin("SocialLogin")` gibi bir çağrı yapar ve proxy oraya yazılır.
Bizim eklentimizin npm paketi yok (yalnız native tarafta duruyor), o çağrıyı
yapacak kimse de yok. Proxy'yi `lib/playGames.ts` kendisi kurar:
`registerPlugin("PlayGames")` — isim, Java'daki
`@CapacitorPlugin(name = "PlayGames")` ile birebir aynı olmalı.

İlk denemede köprüdeki hazır listeye bakılıyordu; hep `undefined` dönüyor,
fonksiyon sessizce vazgeçiyor ve **tek satır log bile bırakmıyordu**. Bu yüzden
artık her çıkış yolu iz bırakıyor (`recordTrace`): hem konsola yazar hem cihazda
son adımı saklar, `/menu` teşhis kutusundan okunur.

**Tarayıcıda tamamen etkisiz:** bileşen `isNative` değilse tek istek bile yapmaz,
eklenti chunk'ı `import()` ile ayrı tutulduğu için indirilmez bile.

**Bir kez çalışır:** modül düzeyindeki bayrak sayesinde sayfa gezinmelerinde
tekrarlanmaz. Kişi zaten girişliyse sessiz giriş hiç denenmez — kimliği izinsiz
bağlamak yerine kullanıcının kendi seçimine bırakılır.
