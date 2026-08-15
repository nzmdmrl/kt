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
