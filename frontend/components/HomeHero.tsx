"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type LevelInfo = { level: number; xp: number; level_xp: number; level_need: number };
type TitleInfo = { title: string; title_icon?: string; next_title: string | null; xp_to_next: number; title_progress: number };

// Mobil ana ekran: gelişmiş profil kartı + mod kartları (Arena / Özel Arena ayrı).
export default function HomeHero() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [lvl, setLvl] = useState<LevelInfo | null>(null);
  const [title, setTitle] = useState<TitleInfo | null>(null);
  const [xp, setXp] = useState(0);
  const [soloLevel, setSoloLevel] = useState<number | null>(null);

  function token() { return typeof window !== "undefined" ? localStorage.getItem("kt_token") : null; }

  useEffect(() => {
    if (!user) return;
    fetch(apiUrl("/api/account/level"), { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then(setLvl).catch(() => {});
    fetch(apiUrl("/api/solo/progress"), { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then((d) => setSoloLevel(d.current_level ?? null)).catch(() => {});
    if (user.username) {
      fetch(apiUrl(`/api/profile/${user.username}`), { headers: { Authorization: `Bearer ${token()}` } })
        .then((r) => r.json()).then((d) => { setTitle(d.title_info || null); setXp(d.xp || 0); }).catch(() => {});
    }
  }, [user]);

  const avatar = user?.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(user?.username || "guest")}`;
  const level = lvl?.level ?? user?.level ?? 1;
  const pct = title?.title_progress ?? 0;

  // Mod kartları — Arena ve Özel Arena AYRI.
  const cards = [
    { icon: "⚔️", label: "Arena", href: "/arena", bg: "linear-gradient(145deg,#e0940a,#c47a00)", desc: "Rakip bul" },
    { icon: "🎪", label: "Özel Arena", href: "/arena/ozel", bg: "linear-gradient(145deg,#7b52c4,#5e3a9e)", desc: "Arkadaşlarınla" },
    { icon: "🗺️", label: "Maraton", href: "/solo", bg: "linear-gradient(145deg,#4a8fc4,#2e6da8)", desc: "Bölümler" },
    { icon: "📅", label: "Günün Kelimesi", href: "/gunun-kelimesi", bg: "linear-gradient(145deg,#c44a7e,#a23763)", desc: "Günlük" },
    { icon: "🏆", label: "Lig", href: "/lig", bg: "linear-gradient(145deg,#3a7fc4,#2868a8)", desc: "Sıralama" },
  ];

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "16px 16px 20px" }}>
      {/* Gelişmiş profil kartı */}
      {user ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 16, padding: "16px 18px", marginBottom: 20,
          background: "var(--bg-panel)", borderRadius: 16, border: "1px solid var(--border-soft)",
        }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <img src={avatar} alt="avatar"
              style={{ width: 68, height: 68, borderRadius: "50%", border: "3px solid var(--accent)", background: "var(--bg-elevated)", objectFit: "cover" }} />
            <span style={{
              position: "absolute", bottom: -2, right: -2, minWidth: 26, height: 26, padding: "0 6px",
              borderRadius: 13, background: "var(--accent)", color: "#1a1330",
              fontSize: 12, fontWeight: 800, display: "grid", placeItems: "center",
              border: "2px solid var(--bg-panel)", fontFamily: "var(--font-display)",
            }}>{level}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
              <span className="brand-mono" style={{ fontSize: 18 }}>{user.display_name || user.username}</span>
              {title && (
                <span style={{ padding: "2px 9px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: "rgba(63,185,80,.15)", color: "var(--tile-correct)", border: "1px solid rgba(63,185,80,.3)" }}>
                  {title.title_icon} {title.title}
                </span>
              )}
              {soloLevel != null && (
                <span style={{ padding: "2px 9px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "var(--bg-elevated)", color: "#a586e0" }}>
                  🏃 Maraton {soloLevel}
                </span>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
              <span style={{ color: "var(--accent)" }}>💎 {xp.toLocaleString("tr")} XP</span>
              {title?.next_title && (
                <span style={{ color: "var(--text-dim)" }}>{title.next_title} · {title.xp_to_next.toLocaleString("tr")} XP</span>
              )}
            </div>
            <div style={{ height: 7, background: "var(--bg-elevated)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,var(--tile-correct),var(--accent))", transition: "width .4s" }} />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div className="brand-mono" style={{ fontSize: 28, marginBottom: 6 }}>Kelime Tahmin</div>
          {!loading && <a href="/giris" style={{ color: "var(--accent)", fontWeight: 700 }}>Giriş yap / Kayıt ol →</a>}
        </div>
      )}

      {/* Büyük Oyna butonu */}
      <button onClick={() => router.push("/oyna")}
        style={{
          width: "100%", padding: "20px 24px", borderRadius: 16, border: "none",
          background: "linear-gradient(145deg,#3fb950,#2ea043)", color: "#fff",
          cursor: "pointer", marginBottom: 18, display: "flex", alignItems: "center",
          justifyContent: "space-between", boxShadow: "0 4px 16px rgba(46,160,67,.35)",
        }}>
        <span className="brand-mono" style={{ fontSize: 26, fontWeight: 800 }}>Oyna</span>
        <span style={{ fontSize: 15, opacity: 0.9 }}>1v1 Düello →</span>
      </button>

      {/* Mod kartları (2 sütun) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {cards.map((c) => (
          <button key={c.href} onClick={() => router.push(c.href)}
            style={{
              padding: "18px 16px", borderRadius: 14, border: "none", background: c.bg,
              color: "#fff", cursor: "pointer", textAlign: "left", minHeight: 104,
              display: "flex", flexDirection: "column", justifyContent: "space-between",
              boxShadow: "0 2px 10px rgba(0,0,0,.2)",
            }}>
            <span style={{ fontSize: 28 }}>{c.icon}</span>
            <div>
              <div className="brand-mono" style={{ fontSize: 16, fontWeight: 700 }}>{c.label}</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>{c.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
