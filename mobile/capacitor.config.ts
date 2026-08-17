import type { CapacitorConfig } from '@capacitor/cli';

// Kelime Tahmin native kabuk yapılandırması.
// Uygulama kendi içinde web varlığı taşımaz; canlı siteyi yükler. webDir sadece
// bağlantı yokken gösterilen offline.html'i barındırır (server.errorPath).
const config: CapacitorConfig = {
  appId: 'com.kelimetahmin.app',
  appName: 'Kelime Tahmin',
  webDir: 'shell',
  server: {
    url: 'https://www.kelimetahmin.com',
    androidScheme: 'https',
    cleartext: false,
    errorPath: 'offline.html',
    allowNavigation: [
      'www.kelimetahmin.com',
      'kelimetahmin.com',
      'api.kelimetahmin.com',
    ],
  },
  android: {
    appendUserAgent: 'KelimeApp/1.0 (android)',
  },
  ios: {
    appendUserAgent: 'KelimeApp/1.0 (ios)',
    contentInset: 'always',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#0e0b1e',
    },
    // Google ile giriş (@capgo/capacitor-social-login).
    // Eklenti dört sağlayıcıyı da destekliyor ve VARSAYILAN OLARAK HEPSİNİN SDK'sını
    // pakete koyuyor (Facebook Login SDK dahil). Biz yalnız Google kullanıyoruz:
    // diğerleri false -> 'compileOnly', yani eklenti derlenir ama o SDK'lar APK'ya
    // GİRMEZ (boyut ve gereksiz izin/veri güvenliği beyanı olmaz).
    // DİKKAT: bu ayarı okuyan betik eklentinin KENDİ node_modules'ündeki
    // gradle.properties'i yazar; yani Mac'te `npm install` sonrası `npx cap sync`
    // ÇALIŞTIRILMALIDIR, yoksa dördü birden pakete girer.
    //
    // Web istemci kimliği BURADA DEĞİL: admin panelden yönetilsin diye
    // app_settings'te ('app.flags'.google_web_client_id) tutuluyor ve çalışma
    // anında initialize()'a veriliyor (frontend/lib/nativeGoogle.ts).
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
      },
    },
  },
};

export default config;
