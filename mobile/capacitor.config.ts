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
  },
};

export default config;
