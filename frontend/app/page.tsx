import Logo from "@/components/Logo";
import TopBar from "@/components/TopBar";
import Footer from "@/components/Footer";
import { getJSON } from "@/lib/api";

type Health = {
  status: string;
  app: string;
  word_pools: Record<string, { total: number; selectable: number }>;
};

async function fetchHealth(): Promise<Health | null> {
  try {
    return await getJSON<Health>("/api/health");
  } catch {
    return null;
  }
}

export default async function Home() {
  const health = await fetchHealth();

  return (
    <>
      <TopBar />
      <main
        style={{
          flex: 1,
          maxWidth: 720,
          width: "100%",
          margin: "0 auto",
          padding: "20px 20px 64px",
          display: "grid",
          gap: 40,
        }}
      >
      {/* Başlık */}
      <header style={{ display: "grid", gap: 20, justifyItems: "center", textAlign: "center" }}>
        <Logo size={52} />
        <div>
          <h1
            className="brand-mono"
            style={{ fontSize: 34, lineHeight: 1.1, marginBottom: 10 }}
          >
            Kelime Tahmin
          </h1>
          <p style={{ color: "var(--text-soft)", fontSize: 17, maxWidth: 440 }}>
            Gerçek rakiplerle karşılıklı kelime düellosu. Önce davranan tahmin eder —
            ligde yarış, kupa ve rozet kazan.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a
            href="/oyna"
            style={{
              display: "inline-block",
              padding: "14px 32px",
              background: "var(--accent)",
              color: "#1a1330",
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 18,
              fontFamily: "var(--font-display)",
              boxShadow: "0 8px 28px var(--accent-glow)",
            }}
          >
            Oynamaya Başla →
          </a>
          <a
            href="/lig"
            style={{
              display: "inline-block",
              padding: "14px 28px",
              background: "var(--bg-panel)",
              color: "var(--text-strong)",
              borderRadius: 12,
              fontWeight: 600,
              fontSize: 18,
              fontFamily: "var(--font-display)",
              border: "1px solid var(--border-soft)",
            }}
          >
            🏆 Lig
          </a>
          <a
            href="/gunun-kelimesi"
            style={{
              display: "inline-block",
              padding: "14px 28px",
              background: "var(--bg-panel)",
              color: "var(--text-strong)",
              borderRadius: 12,
              fontWeight: 600,
              fontSize: 18,
              fontFamily: "var(--font-display)",
              border: "1px solid var(--border-soft)",
            }}
          >
            📅 Günün Kelimesi
          </a>
        </div>
      </header>

      {/* Nasıl oynanır — 3 adım */}
      <section>
        <h2 className="brand-mono" style={{ fontSize: 22, marginBottom: 18, textAlign: "center" }}>
          Nasıl Oynanır?
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
          {[
            { icon: "⚡", title: "Önce Davran", text: "Tur başında sıra boş. Kim önce yazmaya başlarsa söz hakkı onda." },
            { icon: "🎨", title: "Renkleri Oku", text: "Yeşil doğru yerde, sarı kelimede var ama yanlış yerde, gri yok." },
            { icon: "🏆", title: "Ligde Yarış", text: "Puan topla, sıralamada yüksel. Ay sonunda kupa ve madalya kazan." },
          ].map((s) => (
            <div key={s.title} style={{ background: "var(--bg-panel)", borderRadius: 14, padding: 20, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{s.icon}</div>
              <div className="brand-mono" style={{ fontSize: 16, marginBottom: 6 }}>{s.title}</div>
              <p style={{ color: "var(--text-soft)", fontSize: 14, lineHeight: 1.5 }}>{s.text}</p>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 18 }}>
          <a href="/nasil-oynanir" style={{ color: "var(--accent)", fontWeight: 600 }}>Detaylı anlatım →</a>
        </div>
      </section>

      {/* Özellikler vitrini */}
      <section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          {[
            { icon: "🎤", label: "Sesli cevap" },
            { icon: "🤖", label: "Botlara karşı pratik" },
            { icon: "📅", label: "Günün kelimesi" },
            { icon: "🔄", label: "Rövanş & emote" },
          ].map((f) => (
            <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg-panel)", borderRadius: 12, padding: "14px 16px" }}>
              <span style={{ fontSize: 22 }}>{f.icon}</span>
              <span style={{ fontSize: 14, color: "var(--text-strong)" }}>{f.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Sistem durumu (özet) */}
      {health && (
        <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
          {(health.word_pools["4"]?.selectable ?? 0) +
            (health.word_pools["5"]?.selectable ?? 0) +
            (health.word_pools["6"]?.selectable ?? 0)}{" "}
          Türkçe kelimeyle oyna
        </p>
      )}
      </main>
      <Footer />
    </>
  );
}
