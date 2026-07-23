import Logo from "@/components/Logo";
import GridDemo from "@/components/GridDemo";
import TopBar from "@/components/TopBar";
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
      </header>

      {/* Sistem durumu */}
      <section
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border-soft)",
          borderRadius: "var(--radius)",
          padding: 22,
          boxShadow: "var(--shadow-soft)",
        }}
      >
        <h2 className="brand-mono" style={{ fontSize: 18, marginBottom: 16 }}>
          Kelime Havuzu
        </h2>
        {health ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {["4", "5", "6"].map((n) => (
              <div
                key={n}
                style={{
                  flex: "1 1 140px",
                  background: "var(--bg-elevated)",
                  borderRadius: "var(--radius-sm)",
                  padding: 16,
                  border: "1px solid var(--tile-border)",
                }}
              >
                <div className="brand-mono" style={{ fontSize: 28, color: "var(--accent)" }}>
                  {health.word_pools[n]?.selectable ?? 0}
                </div>
                <div style={{ color: "var(--text-soft)", fontSize: 14 }}>
                  {n} harfli oyun kelimesi
                </div>
                <div style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 4 }}>
                  havuzda {health.word_pools[n]?.total ?? 0} kayıt
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--accent-hot)" }}>
            Backend'e bağlanılamadı. API adresini (NEXT_PUBLIC_API_BASE) kontrol et.
          </p>
        )}
      </section>

      {/* Grid demo */}
      <section
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border-soft)",
          borderRadius: "var(--radius)",
          padding: 22,
          boxShadow: "var(--shadow-soft)",
        }}
      >
        <h2 className="brand-mono" style={{ fontSize: 18, marginBottom: 6 }}>
          Kelime Motoru Denemesi
        </h2>
        <p style={{ color: "var(--text-dim)", fontSize: 14, marginBottom: 18 }}>
          Türkçe harf duyarlı motor çalışıyor. Bir kelime yaz, renkleri gör.
          Gerçek karşılıklı maç hazır — üstten \"Oynamaya Başla\".
        </p>
        <GridDemo />
      </section>

      <footer
        style={{
          textAlign: "center",
          color: "var(--text-dim)",
          fontSize: 13,
          borderTop: "1px solid var(--border-soft)",
          paddingTop: 20,
        }}
      >
        Kelime Tahmin · kelimetahmin.com — kurulum aşamasında
      </footer>
      </main>
    </>
  );
}
