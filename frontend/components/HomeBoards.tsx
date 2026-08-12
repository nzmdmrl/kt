"use client";

import { useState, useEffect } from "react";
import { apiUrl } from "@/lib/api";
import type { HomeBoardsData } from "@/lib/homeData";

// Ana sayfa alt bölümleri: son 10 maç + bugünün lig ilk 10'u.
// İlk içerik sunucudan gelir (initial) — bölüm sayfa açılır açılmaz yerinde durur,
// sonradan düşüp sayfayı aşağı kaydırmaz. Açılışta bir kez tazelenir (veri canlı).
export default function HomeBoards({ initial }: { initial?: HomeBoardsData }) {
  const [matches, setMatches] = useState<any[]>(initial?.matches || []);
  const [top, setTop] = useState<any[]>(initial?.top || []);
  const [loaded, setLoaded] = useState(!!initial);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(apiUrl("/api/home/recent-matches")).then((r) => r.json()).catch(() => null),
      fetch(apiUrl("/api/home/daily-top")).then((r) => r.json()).catch(() => null),
    ]).then(([m, d]) => {
      if (!alive) return;
      if (m) setMatches(m.matches || []);
      if (d) setTop(d.top || []);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  if (!loaded) return null;
  if (top.length === 0 && matches.length === 0) return null;

  return (
    <div className="home-boards" style={{ display: "grid", gap: 20, width: "100%" }}>
      {/* Günlük lig ilk 10 */}
      {top.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column" }}>
          <h2 style={sectionTitle}>🏆 Bugünün Ligi</h2>
          <div style={{ ...card, flex: 1 }}>
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
        <section style={{ display: "flex", flexDirection: "column" }}>
          <h2 style={sectionTitle}>⚔️ Son Maçlar</h2>
          <div style={{ ...card, flex: 1 }}>
            {matches.map((m: any, i: number) => {
              const p1win = m.winner_name === m.p1_name;
              const p2win = m.winner_name === m.p2_name;
              const nameStyle = (win: boolean): React.CSSProperties => ({
                fontWeight: win ? 700 : 500,
                color: win ? "var(--accent)" : "var(--text-soft)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                textDecoration: "none",
              });
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
                  borderBottom: i < matches.length - 1 ? "1px solid var(--border-soft)" : "none",
                  fontSize: 14,
                }}>
                  <div style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
                    {m.p1_username ? (
                      <a href={`/profil/${m.p1_username}`} style={nameStyle(p1win)}>{m.p1_name}</a>
                    ) : (
                      <span style={nameStyle(p1win)}>{m.p1_name}</span>
                    )}
                  </div>
                  <span className="brand-mono" style={{ color: "var(--text-strong)", flexShrink: 0, fontSize: 13 }}>
                    {m.p1_score} : {m.p2_score}
                  </span>
                  <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    {m.p2_username ? (
                      <a href={`/profil/${m.p2_username}`} style={nameStyle(p2win)}>{m.p2_name}</a>
                    ) : (
                      <span style={nameStyle(p2win)}>{m.p2_name}</span>
                    )}
                  </div>
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
