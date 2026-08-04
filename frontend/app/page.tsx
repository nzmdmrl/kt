import HomeHero from "@/components/HomeHero";
import HomeDesktop from "@/components/HomeDesktop";
import HomeBoards from "@/components/HomeBoards";
import HomeMusic from "@/components/HomeMusic";

// Ana sayfa: mobilde QuizzLand tarzı (HomeHero + alt nav), masaüstünde eski geniş tasarım
// (HomeDesktop: TopBar + logo + mod butonları). CSS ile ekran genişliğine göre ayrılır.
export default function Home() {
  return (
    <main style={{ flex: 1, width: "100%" }}>
      {/* MOBİL: yeni QuizzLand tarzı */}
      <div className="home-mobile">
        <HomeHero />
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "8px 16px 40px" }}>
          <HomeBoards />
        </div>
      </div>

      {/* MASAÜSTÜ: eski geniş tasarım */}
      <div className="home-desktop">
        <HomeDesktop />
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px 40px" }}>
          <HomeBoards />
        </div>
      </div>

      <HomeMusic />
    </main>
  );
}
