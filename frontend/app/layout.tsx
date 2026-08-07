import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import BottomNav from "@/components/BottomNav";
import DesktopChrome from "@/components/DesktopChrome";
import NightBackground from "@/components/NightBackground";

export const metadata: Metadata = {
  title: "Kelime Tahmin Oyunu — Online Kelime Tahmin Maçları | kelimetahmin.com",
  description:
    "Karşılıklı kelime tahmin oyunu oyna! Gerçek rakiplerle online kelime tahmin maçları yap, ligde yarış, kupalar kazan. Hemen ücretsiz oyna.",
  keywords: [
    "kelime tahmin oyunu",
    "online kelime tahmin",
    "kelime oyunu",
    "kelime düellosu",
    "türkçe kelime oyunu",
  ],
  openGraph: {
    title: "Kelime Tahmin Oyunu — Online Kelime Tahmin Maçları",
    description:
      "Gerçek rakiplerle karşılıklı kelime tahmin maçları. Ligde yarış, kupa ve rozet kazan.",
    type: "website",
    locale: "tr_TR",
    siteName: "Kelime Tahmin",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0e0b1e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // WebView'de istenmeyen zoom'u engelle
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        {/* Tema flash önleyici — sayfa boyanmadan doğru temayı uygula */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('kt_theme')||'dark';var h=new Date().getHours();var eff=m==='auto'?((h>=7&&h<19)?'light':'dark'):m;if(eff==='light'){document.documentElement.setAttribute('data-theme','light');}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <NightBackground />
        <Providers><DesktopChrome>{children}</DesktopChrome><BottomNav /></Providers>
      </body>
    </html>
  );
}
