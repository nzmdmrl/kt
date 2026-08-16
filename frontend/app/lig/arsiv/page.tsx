"use client";

import { useState, useEffect } from "react";
import { getJSON } from "@/lib/api";
import Logo from "@/components/Logo";
import MiniAvatar from "@/components/MiniAvatar";

const TYPES = [
  { key: "daily", label: "Günlük" },
  { key: "monthly", label: "Aylık" },
  { key: "yearly", label: "Yıllık" },
];

const TR_AY = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function fmtPeriod(type: string, key: string) {
  if (type === "daily") { const [y, m, d] = key.split("-").map(Number); return `${d} ${TR_AY[m - 1]} ${y}`; }
  if (type === "monthly") { const [y, m] = key.split("-").map(Number); return `${TR_AY[m - 1]} ${y}`; }
  return key;
}

export default function LigArsivPage() {
  const [type, setType] = useState("daily");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getJSON<any>(`/api/league/archive?period_type=${type}&page=${page}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [type, page]);

  return (
    <main style={{ flex: 1, maxWidth: 640, width: "100%", margin: "0 auto", padding: "28px 18px 60px" }}>
      <div className="kt-mobile-only" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <a href="/"><Logo size={38} /></a>
        <a href="/lig" style={{ color: "var(--accent)", fontWeight: 600 }}>← Lig</a>
      </div>

      <h1 className="brand-mono" style={{ fontSize: 26, marginBottom: 16 }}>Lig Arşivi</h1>

      {/* Tip seçici */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => { setType(t.key); setPage(1); }}
            style={{
              flex: 1, padding: "10px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 600,
              border: "none",
              background: type === t.key ? "var(--accent)" : "var(--bg-panel)",
              color: type === t.key ? "#1a1330" : "var(--text-soft)",
            }}
          >{t.label}</button>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", color: "var(--text-dim)", padding: 40 }}>Yükleniyor…</div>}

      {!loading && data && data.periods.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--text-dim)", padding: 40 }}>
          Bu dönem tipinde henüz arşiv kaydı yok.
        </div>
      )}

      {!loading && data && data.periods.length > 0 && (
        <div style={{ display: "grid", gap: 14 }}>
          {data.periods.map((p: any) => (
            <div key={p.period_key} style={{ background: "var(--bg-panel)", borderRadius: 14, padding: 16, border: "1px solid var(--border-soft)" }}>
              <div style={{ fontWeight: 700, color: "var(--text-strong)", fontSize: 15, marginBottom: 10 }}>
                {fmtPeriod(type, p.period_key)}
              </div>
              {p.top3.map((e: any) => (
                <div key={e.rank} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                  <span style={{ fontSize: 16 }}>{e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : "🥉"}</span>
                  <MiniAvatar url={e.avatar_url} name={e.name || e.display_name || e.username} size={24} />
                  <a href={`/profil/${e.username}`} style={{ flex: 1, minWidth: 0, color: "var(--text-strong)", fontWeight: 600, fontSize: 14, textDecoration: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {e.name || e.display_name || e.username}
                  </a>
                  <span className="brand-mono" style={{ color: "var(--accent)", fontSize: 14 }}>{e.score}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Sayfalama */}
      {!loading && data && data.pages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 24 }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={data.page <= 1}
            style={pageBtn(data.page <= 1)}
          >← Önceki</button>
          <span style={{ color: "var(--text-soft)", fontSize: 14 }}>{data.page} / {data.pages}</span>
          <button
            onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
            disabled={data.page >= data.pages}
            style={pageBtn(data.page >= data.pages)}
          >Sonraki →</button>
        </div>
      )}
    </main>
  );
}

function pageBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "9px 16px", borderRadius: 9, border: "1px solid var(--border-soft)",
    background: "var(--bg-panel)", color: disabled ? "var(--text-dim)" : "var(--text-strong)",
    fontSize: 14, fontWeight: 600, cursor: disabled ? "default" : "pointer",
  };
}
