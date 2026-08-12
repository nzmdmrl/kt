import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import HomeModes from "@/components/HomeModes";
import HomeBoards from "@/components/HomeBoards";
import { fetchHomeBoards } from "@/lib/homeData";
import HomeMusic from "@/components/HomeMusic";
import TopBar from "@/components/TopBar";
import Footer from "@/components/Footer";

// Ana sayfa: 1v1 modları tek bölümde gruplu (Oyna, 1vB Pratik, Özel Oda Kur, Katıl),
// diğer modlar ayrı bölümde. Desktop + mobil ortak HomeModes bileşeni; masaüstünde
// üstte TopBar (logo) + altta skor tabloları ve footer.
// SEO: admin → "🔍 SEO" sekmesi (Ana Sayfa). Başlık site adını zaten içerir.
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("home", { absoluteTitle: true });
}

// Alt tablolar (bugünün ligi + son maçlar) sunucuda çekilir; 30 sn'de bir tazelenir.
export const revalidate = 30;

export default async function Home() {
  const boards = await fetchHomeBoards();

  return (
    <main style={{ flex: 1, width: "100%" }}>
      {/* MOBİL */}
      <div className="home-mobile">
        <HomeModes />
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 16px 40px" }}>
          <HomeBoards initial={boards} />
        </div>
      </div>

      {/* MASAÜSTÜ */}
      <div className="home-desktop">
        <TopBar />
        <HomeModes />
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 18px 40px" }}>
          <HomeBoards initial={boards} />
        </div>
        <Footer />
      </div>

      <HomeMusic />
    </main>
  );
}
