"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type LevelInfo = { level: number; xp: number; level_xp: number; level_need: number };

// QuizzLand tarzı ana ekran: üst bar (avatar+seviye+XP) + büyük Oyna + kart ızgarası.
export default function HomeHero() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [lvl, setLvl] = useState<LevelInfo | null>(null);
  const [soloLevel, setSoloLevel] = useState<number | null>(null);

  function token() { return typeof window !== "undefined" ? localStorage.getItem("kt_token") : null; }

  useEffect(() => {
    if (!user) return;
    fetch(apiUrl("/api/account/level"), { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then(setLvl).catch(() => {});
    fetch(apiUrl("/api/solo/progress"), { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then((d) => setSoloLevel(d.current_level ?? null)).catch(() => {});
  }, [user]);

  const avatar = user?.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(user?.username || "guest")}`;
  const level = lvl?.level ?? user?.level ?? 1;
  const pct = lvl ? Math.min(100, (lvl.level_xp / Math.max(1, lvl.level_need)) * 100) : 0;

  // Kart ızgarası — sadece çalışan modlar
  const cards = [
    { icon: "⚔️", label: "Arena", href: "/arena", bg: "linear-gradient(145deg,#e0940a,#c47a00)", desc: "5 kişilik yarış" },
    { icon: "🏆", label: "Lig", href: "/lig", bg: "linear-gradient(145deg,#3a7fc4,#2868a8)", desc: "Sıralama" },
    { icon: "🗺️", label: "Solo Mod", href: "/solo", bg: "linear-gradient(145deg,#7b52c4,#5e3a9e)", desc: "Bölümler" },
    { icon: "📅", label: "Günün Kelimesi", href: "/gunun-kelimesi", bg: "linear-gradient(145deg,#c44a7e,#a23763)", desc: "Günlük" },
  ];

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "16px 16px 20px" }}>
      {/* Üst bar: avatar + isim + seviye + XP çubuğu */}
      {user ? (
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ position: "relative", width: 88, height: 88, margin: "0 auto 8px" }}>
            <img src={avatar} alt="avatar"
              style={{ width: 88, height: 88, borderRadius: "50%", border: "3px solid var(--accent)", background: "var(--bg-elevated)", objectFit: "cover" }} />
            <span style={{
              position: "absolute", bottom: -2, right: -2, minWidth: 28, height: 28, padding: "0 6px",
              borderRadius: 14, background: "var(--accent)", color: "#1a1330",
              fontSize: 13, fontWeight: 800, display: "grid", placeItems: "center",
              border: "2px solid var(--bg)", fontFamily: "var(--font-display)",
            }}>{level}</span>
          </div>
          <div className="brand-mono" style={{ fontSize: 18, marginBottom: 6 }}>{user.display_name || user.username}</div>
          {/* Solo level + seviye rozetleri */}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 10, background: "var(--bg-panel)", color: "var(--accent)", fontWeight: 600 }}>
              💎 Seviye {level}
            </span>
            {soloLevel != null && (
              <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 10, background: "var(--bg-panel)", color: "#7b52c4", fontWeight: 600 }}>
                🗺️ Solo Level {soloLevel}
              </span>
            )}
          </div>
          {/* XP çubuğu */}
          <div style={{ maxWidth: 260, margin: "0 auto" }}>
            <div style={{ height: 8, background: "var(--bg-panel)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,var(--accent),var(--accent-hot))", transition: "width .4s" }} />
            </div>
            {lvl && (
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                Seviye {level} · {lvl.level_xp}/{lvl.level_need} XP
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div className="brand-mono" style={{ fontSize: 28, marginBottom: 6 }}>Kelime Tahmin</div>
          {!loading && (
            <a href="/giris" style={{ color: "var(--accent)", fontWeight: 700 }}>Giriş yap / Kayıt ol →</a>
          )}
        </div>
      )}

      {/* Büyük Oyna butonu */}
      <button
        onClick={() => router.push("/oyna")}
        style={{
          width: "100%", padding: "20px 24px", borderRadius: 16, border: "none",
          background: "linear-gradient(145deg,#3fb950,#2ea043)", color: "#fff",
          cursor: "pointer", marginBottom: 18, display: "flex", alignItems: "center",
          justifyContent: "space-between", boxShadow: "0 4px 16px rgba(46,160,67,.35)",
        }}>
        <span className="brand-mono" style={{ fontSize: 26, fontWeight: 800 }}>Oyna</span>
        <span style={{ fontSize: 15, opacity: 0.9 }}>1v1 Düello →</span>
      </button>

      {/* Kart ızgarası (2 sütun) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {cards.map((c) => (
          <button key={c.href} onClick={() => router.push(c.href)}
            style={{
              padding: "20px 16px", borderRadius: 14, border: "none", background: c.bg,
              color: "#fff", cursor: "pointer", textAlign: "left", minHeight: 110,
              display: "flex", flexDirection: "column", justifyContent: "space-between",
              boxShadow: "0 2px 10px rgba(0,0,0,.2)",
            }}>
            <span style={{ fontSize: 30 }}>{c.icon}</span>
            <div>
              <div className="brand-mono" style={{ fontSize: 17, fontWeight: 700 }}>{c.label}</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>{c.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
