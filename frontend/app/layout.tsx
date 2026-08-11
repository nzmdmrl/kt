import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import Analytics from "@/components/Analytics";
import CookieConsent from "@/components/CookieConsent";
import Providers from "@/components/Providers";
import BottomNav from "@/components/BottomNav";
import DesktopChrome from "@/components/DesktopChrome";
import NightBackground from "@/components/NightBackground";
import { SITE_URL } from "@/lib/site";
import { SITE_NAME, absoluteImage, fetchSeo, fetchSeoAll } from "@/lib/seo";

// SEO verisi 1 dakikada bir tazelenir — admin panelinden yapılan başlık/açıklama/
// görsel değişikliği kısa sürede yayına yansır. (Next "stale-while-revalidate"
// kullandığı için süre dolduktan sonraki İLK ziyaret eski sayfayı görür,
// yenisi arka planda üretilir; ikinci ziyarette yeni hâli gelir.)
export const revalidate = 60;

// Site geneli metadata. Başlık/açıklama/paylaşım görselleri admin panelindeki
// "🔍 SEO" sekmesinden yönetilir (backend /api/seo/meta).
export async function generateMetadata(): Promise<Metadata> {
  const [home, all] = await Promise.all([fetchSeo("home"), fetchSeoAll()]);
  const image = absoluteImage(home.image_path);
  const favicon = all.favicon_path ? absoluteImage(all.favicon_path) : null;

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: home.title,
      // Alt sayfalar kendi başlığını verir; site adı sona otomatik eklenir.
      template: `%s | ${SITE_NAME}`,
    },
    description: home.description,
    keywords: home.keywords.length ? home.keywords : undefined,
    applicationName: SITE_NAME,
    openGraph: {
      title: home.title,
      description: home.description,
      url: SITE_URL,
      type: "website",
      locale: "tr_TR",
      siteName: SITE_NAME,
      images: image ? [{ url: image, width: 1200, height: 630, alt: home.title }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: home.title,
      description: home.description,
      images: image ? [image] : undefined,
    },
    icons: favicon
      ? { icon: [{ url: favicon }], shortcut: [{ url: favicon }], apple: [{ url: favicon }] }
      : undefined,
    robots: { index: true, follow: true },
  };
}

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
        {/* useSearchParams kullandığı için Suspense şart — yoksa tüm sayfalar CSR'a düşer */}
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
        <Providers><DesktopChrome>{children}</DesktopChrome><BottomNav /></Providers>
        <CookieConsent />
      </body>
    </html>
  );
}
