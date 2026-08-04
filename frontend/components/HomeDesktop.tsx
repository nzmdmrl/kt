import Logo from "@/components/Logo";
import TopBar from "@/components/TopBar";
import Footer from "@/components/Footer";

// Masaüstü ana içerik — eski geniş tasarım (logo + açıklama + mod butonları).
// Sadece geniş ekranda görünür (mobilde HomeHero gösterilir).
export default function HomeDesktop() {
  const modes = [
    { icon: "🎮", label: "Oyna (1v1)", href: "/oyna", bg: "linear-gradient(145deg,#3fb950,#2ea043)" },
    { icon: "⚔️", label: "Arena", href: "/arena", bg: "linear-gradient(145deg,#e0940a,#c47a00)" },
    { icon: "🗺️", label: "Solo Mod", href: "/solo", bg: "linear-gradient(145deg,#7b52c4,#5e3a9e)" },
    { icon: "📅", label: "Günün Kelimesi", href: "/gunun-kelimesi", bg: "linear-gradient(145deg,#c44a7e,#a23763)" },
    { icon: "🏆", label: "Lig", href: "/lig", bg: "linear-gradient(145deg,#3a7fc4,#2868a8)" },
  ];
  return (
    <>
      <TopBar />
      <main style={{ flex: 1, maxWidth: 720, width: "100%", margin: "0 auto", padding: "20px 20px 64px", display: "grid", gap: 40 }}>
        <header style={{ display: "grid", gap: 20, justifyItems: "center", textAlign: "center" }}>
          <Logo size={52} />
          <div>
            <h1 className="brand-mono" style={{ fontSize: 34, lineHeight: 1.1, marginBottom: 10 }}>
              Kelime Tahmin
            </h1>
            <p style={{ color: "var(--text-soft)", fontSize: 17, maxWidth: 440 }}>
              Gerçek rakiplerle karşılıklı kelime düellosu. Önce davranan tahmin eder — hızlı ol, doğru bil, kazan.
            </p>
          </div>
          {/* Mod butonları */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            {modes.map((m) => (
              <a key={m.href} href={m.href} style={{
                display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 24px",
                background: m.bg, color: "#fff", borderRadius: 12, fontWeight: 700, fontSize: 17,
                fontFamily: "var(--font-display)", textDecoration: "none",
              }}>
                <span style={{ fontSize: 20 }}>{m.icon}</span> {m.label}
              </a>
            ))}
          </div>
        </header>
      </main>
    </>
  );
}
