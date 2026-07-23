import type { Metadata, Viewport } from "next";
import "./globals.css";

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
      </head>
      <body>{children}</body>
    </html>
  );
}
