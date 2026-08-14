"use client";

import { useState, useEffect } from "react";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type LevelInfo = { level: number; level_xp: number; level_need: number };
type TitleInfo = { title: string; title_icon?: string; next_title: string | null; xp_to_next: number; title_progress: number };

// Masaüstü ana sayfa üst özeti — giriş yapınca avatar + unvan + XP + level + solo level.
export default function DesktopUserSummary() {
  const { user } = useAuth();
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

  if (!user) return null;

  const avatar = user.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(user.username || "guest")}`;
  const level = lvl?.level ?? user.level ?? 1;
  const pct = title?.title_progress ?? 0;

  return (
    <div style={{
      maxWidth: 720, margin: "0 auto 24px", padding: "18px 24px",
      background: "var(--bg-panel)", borderRadius: 16, border: "1px solid var(--border-soft)",
      display: "flex", alignItems: "center", gap: 20,
    }}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <img src={avatar} alt="avatar"
          style={{ width: 72, height: 72, borderRadius: "50%", border: "3px solid var(--accent)", background: "var(--bg-elevated)", objectFit: "cover" }} />
        <span style={{
          position: "absolute", bottom: -2, right: -2, minWidth: 26, height: 26, padding: "0 6px",
          borderRadius: 13, background: "var(--accent)", color: "#1a1330",
          fontSize: 12, fontWeight: 800, display: "grid", placeItems: "center",
          border: "2px solid var(--bg-panel)", fontFamily: "var(--font-display)",
        }}>{level}</span>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
          <span className="brand-mono" style={{ fontSize: 20 }}>{user.display_name || user.username}</span>
          {title && (
            <span style={{
              padding: "2px 10px", borderRadius: 11, fontSize: 12, fontWeight: 700,
              background: "rgba(63,185,80,.15)", color: "var(--tile-correct)", border: "1px solid rgba(63,185,80,.3)",
            }}>{title.title_icon} {title.title}</span>
          )}
          {soloLevel != null && (
            <span style={{ padding: "2px 10px", borderRadius: 11, fontSize: 12, fontWeight: 600, background: "var(--bg-elevated)", color: "#a586e0" }}>
              🏃 Maraton {soloLevel}
            </span>
          )}
        </div>
        {/* XP çubuğu */}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
          <span style={{ color: "var(--accent)" }}>💎 {xp.toLocaleString("tr")} XP</span>
          {title?.next_title && (
            <span style={{ color: "var(--text-dim)" }}>{title.next_title} için {title.xp_to_next.toLocaleString("tr")} XP</span>
          )}
        </div>
        <div style={{ height: 8, background: "var(--bg-elevated)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,var(--tile-correct),var(--accent))", transition: "width .4s" }} />
        </div>
      </div>

      <a href={user.username ? `/profil/${user.username}` : "/giris"}
        style={{ flexShrink: 0, padding: "10px 18px", borderRadius: 10, background: "var(--accent)", color: "#1a1330", fontWeight: 700, textDecoration: "none", fontSize: 14 }}>
        Profilim
      </a>
    </div>
  );
}
