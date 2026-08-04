"use client";

import { useState, useEffect } from "react";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/Logo";

type Match = {
  opp_name: string; opp_username: string; my_score: number; opp_score: number;
  result: "win" | "loss" | "draw"; has_bot: boolean;
};
type ArenaMatch = {
  rank: number; score: number; correct_count: number; total_words: number;
  player_count: number; created_at: string;
};

export default function GecmisPage() {
  const { user, loading } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [arenaMatches, setArenaMatches] = useState<ArenaMatch[]>([]);

  function token() { return typeof window !== "undefined" ? localStorage.getItem("kt_token") : null; }

  useEffect(() => {
    if (!user?.username) return;
    fetch(apiUrl(`/api/profile/${user.username}/matches?limit=30`))
      .then((r) => r.json()).then((d) => setMatches(d.matches || [])).catch(() => {});
    fetch(apiUrl("/api/arena/history?limit=30"), { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then((d) => setArenaMatches(d.matches || [])).catch(() => {});
  }, [user]);

  if (loading) return <Wrap><Center>Yükleniyor…</Center></Wrap>;
  if (!user) return <Wrap><Center><a href="/giris" style={{ color: "var(--accent)" }}>Giriş yap →</a></Center></Wrap>;

  return (
    <Wrap>
      <h1 className="brand-mono" style={{ fontSize: 26, marginBottom: 20 }}>🕐 Geçmiş</h1>
      <h2 style={{ fontSize: 15, color: "var(--text-soft)", marginBottom: 10 }}>Son maçların</h2>
      {matches.length === 0 ? (
        <p style={{ color: "var(--text-dim)", textAlign: "center", padding: 30 }}>Henüz maç oynamadın.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {matches.map((m, i) => {
            const color = m.result === "win" ? "var(--tile-correct)" : m.result === "loss" ? "var(--accent-hot)" : "var(--text-dim)";
            const label = m.result === "win" ? "Galibiyet" : m.result === "loss" ? "Mağlubiyet" : "Beraberlik";
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                background: "var(--bg-panel)", borderRadius: 10, borderLeft: `3px solid ${color}`,
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color, width: 78, flexShrink: 0 }}>{label}</span>
                <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                  <span style={{ color: "var(--text-dim)" }}>vs </span>
                  {m.opp_username ? (
                    <a href={`/profil/${m.opp_username}`} style={{ color: "var(--text-strong)", fontWeight: 600, textDecoration: "none" }}>{m.opp_name}</a>
                  ) : (
                    <span style={{ color: "var(--text-strong)", fontWeight: 600 }}>{m.opp_name}</span>
                  )}
                  {m.has_bot && <span style={{ color: "var(--text-dim)", fontSize: 12 }}> 🤖</span>}
                </div>
                <span className="brand-mono" style={{ fontSize: 15, color: "var(--text-strong)" }}>{m.my_score} : {m.opp_score}</span>
              </div>
            );
          })}
        </div>
      )}
      {/* Arena geçmişi */}
      <h2 style={{ fontSize: 15, color: "var(--text-soft)", margin: "24px 0 10px" }}>⚔️ Arena maçların</h2>
      {arenaMatches.length === 0 ? (
        <p style={{ color: "var(--text-dim)", textAlign: "center", padding: 20, fontSize: 14 }}>Henüz Arena'ya katılmadın.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {arenaMatches.map((a, i) => {
            const medal = a.rank === 1 ? "🏆" : a.rank === 2 ? "🥈" : a.rank === 3 ? "🥉" : `${a.rank}.`;
            const color = a.rank === 1 ? "var(--accent)" : a.rank <= 3 ? "var(--text-soft)" : "var(--text-dim)";
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                background: "var(--bg-panel)", borderRadius: 10, borderLeft: `3px solid ${color}`,
              }}>
                <span className="brand-mono" style={{ fontSize: 20, width: 40, textAlign: "center" }}>{medal}</span>
                <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                  <span style={{ color: "var(--text-strong)", fontWeight: 600 }}>
                    {a.player_count} oyuncu arasında {a.rank}.
                  </span>
                  <div style={{ color: "var(--text-dim)", fontSize: 12 }}>
                    {a.correct_count}/{a.total_words} doğru
                  </div>
                </div>
                <span className="brand-mono" style={{ fontSize: 15, color: "var(--accent)" }}>{a.score} ⭐</span>
              </div>
            );
          })}
        </div>
      )}
      {/* Arena geçmişi Parça 3'te eklenecek */}
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "24px 18px 40px", minHeight: "60vh" }}>
      <div style={{ marginBottom: 16 }}><a href="/"><Logo size={32} /></a></div>
      {children}
    </main>
  );
}
function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", placeItems: "center", minHeight: "40vh", color: "var(--text-soft)" }}>{children}</div>;
}
