"use client";

import { useState, useEffect } from "react";
import { apiUrl } from "@/lib/api";

// Ana sayfa alt bölümleri: son 10 maç + bugünün lig ilk 10'u.
export default function HomeBoards() {
  const [matches, setMatches] = useState<any[]>([]);
  const [top, setTop] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(apiUrl("/api/home/recent-matches")).then((r) => r.json()).catch(() => ({ matches: [] })),
      fetch(apiUrl("/api/home/daily-top")).then((r) => r.json()).catch(() => ({ top: [] })),
    ]).then(([m, d]) => {
      setMatches(m.matches || []);
      setTop(d.top || []);
      setLoaded(true);
    });
  }, []);

  if (!loaded) return null;

  return (
    <div style={{ display: "grid", gap: 32, gridTemplateColumns: "1fr", width: "100%" }}>
      {/* Günlük lig ilk 10 */}
      {top.length > 0 && (
        <section>
          <h2 style={sectionTitle}>🏆 Bugünün Ligi — İlk 10</h2>
          <div style={card}>
            {top.map((row: any, i: number) => (
              <div key={row.user_id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                borderBottom: i < top.length - 1 ? "1px solid var(--border-soft)" : "none",
              }}>
                <span style={{
                  width: 24, textAlign: "center", fontWeight: 700,
                  color: row.rank <= 3 ? "var(--accent)" : "var(--text-dim)",
                  fontSize: row.rank <= 3 ? 15 : 13,
                }}>
                  {row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : row.rank}
                </span>
                <a href={`/profil/${row.username}`} style={{ flex: 1, minWidth: 0, color: "var(--text-strong)", fontWeight: 600, fontSize: 14, textDecoration: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {row.display_name || row.username}
                </a>
                <span className="brand-mono" style={{ color: "var(--accent)", fontSize: 15 }}>{row.score}</span>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 10 }}>
            <a href="/lig" style={{ color: "var(--accent)", fontWeight: 600, fontSize: 14 }}>Tüm ligi gör →</a>
          </div>
        </section>
      )}

      {/* Son 10 maç */}
      {matches.length > 0 && (
        <section>
          <h2 style={sectionTitle}>⚔️ Son Maçlar</h2>
          <div style={card}>
            {matches.map((m: any, i: number) => {
              const p1win = m.winner_name === m.p1_name;
              const p2win = m.winner_name === m.p2_name;
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
                  borderBottom: i < matches.length - 1 ? "1px solid var(--border-soft)" : "none",
                  fontSize: 14,
                }}>
                  <span style={{ flex: 1, minWidth: 0, textAlign: "right", fontWeight: p1win ? 700 : 500, color: p1win ? "var(--accent)" : "var(--text-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {m.p1_name}
                  </span>
                  <span className="brand-mono" style={{ color: "var(--text-strong)", flexShrink: 0, fontSize: 13 }}>
                    {m.p1_score} : {m.p2_score}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, textAlign: "left", fontWeight: p2win ? 700 : 500, color: p2win ? "var(--accent)" : "var(--text-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {m.p2_name}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

const sectionTitle: React.CSSProperties = {
  fontSize: 16, fontWeight: 700, marginBottom: 12, color: "var(--text-strong)",
  fontFamily: "var(--font-display)",
};
const card: React.CSSProperties = {
  background: "var(--bg-panel)", borderRadius: 14, border: "1px solid var(--border-soft)",
  overflow: "hidden",
};
