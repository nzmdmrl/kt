import HomeHero from "@/components/HomeHero";
import HomeBoards from "@/components/HomeBoards";
import HomeMusic from "@/components/HomeMusic";

// Ana sayfa — QuizzLand tarzı: üst bar (avatar+seviye+XP) + Oyna + kart ızgarası,
// altında canlı lig/son maçlar panoları.
export default function Home() {
  return (
    <main style={{ flex: 1, width: "100%" }}>
      <HomeHero />
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "8px 16px 40px" }}>
        <HomeBoards />
      </div>
      <HomeMusic />
    </main>
  );
}
