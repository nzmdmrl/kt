"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type LevelInfo = { level: number; xp: number; level_xp: number; level_need: number };
type TitleInfo = { title: string; title_icon?: string; title_progress: number };
type Stats = { trophies: number; medals: number; badges: number; score: number };

// Ana sayfa mod ekranı — desktop + mobil ortak. Sıralama: Arena/Özel Arena üstte,
// sonra 1v1 Düello bölümü, sonra Maraton/Günün Kelimesi/Lig.
export default function HomeModes() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [lvl, setLvl] = useState<LevelInfo | null>(null);
  const [title, setTitle] = useState<TitleInfo | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [soloLevel, setSoloLevel] = useState<number | null>(null);
  const [joinCode, setJoinCode] = useState("");

  function token() { return typeof window !== "undefined" ? localStorage.getItem("kt_token") : null; }

  useEffect(() => {
    if (!user) return;
    fetch(apiUrl("/api/account/level"), { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then(setLvl).catch(() => {});
    fetch(apiUrl("/api/solo/progress"), { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then((d) => setSoloLevel(d.current_level ?? null)).catch(() => {});
    if (user.username) {
      fetch(apiUrl(`/api/profile/${user.username}`), { headers: { Authorization: `Bearer ${token()}` } })
        .then((r) => r.json()).then((d) => {
          setTitle(d.title_info || null);
          const earned = Array.isArray(d.badges) ? d.badges.filter((b: any) => b.earned).length : 0;
          setStats({
            trophies: d.trophies ?? 0,
            medals: d.medals ?? 0,
            badges: earned,
            score: d.stats?.total_score ?? 0,
          });
        }).catch(() => {});
    }
  }, [user]);

  const avatar = user?.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(user?.username || "guest")}`;
  const level = lvl?.level ?? user?.level ?? 1;
  const pct = title?.title_progress ?? 0;

  function joinRoom() {
    const c = joinCode.trim().toUpperCase();
    if (c.length < 4) return;
    router.push(`/oyna?join=${encodeURIComponent(c)}`);
  }

  // Üst modlar: Arena + Özel Arena (1v1'in üstünde)
  const topModes = [
    { icon: "⚔️", label: "Arena", href: "/arena", desc: "Çok kişili yarış", bg: "linear-gradient(145deg,#e0940a,#c47a00)" },
    { icon: "🎪", label: "Özel Arena", href: "/arena/ozel", desc: "Arkadaşlarınla", bg: "linear-gradient(145deg,#7b52c4,#5e3a9e)" },
  ];
  // Alt modlar: Maraton, Günün Kelimesi, Lig (başlıksız)
  const bottomModes = [
    { icon: "🏃", label: "Maraton", href: "/solo", desc: soloLevel != null ? `Bölüm ${soloLevel}` : "Bölüm bölüm ilerle", bg: "linear-gradient(145deg,#4a8fc4,#2e6da8)" },
    { icon: "📅", label: "Günün Kelimesi", href: "/gunun-kelimesi", desc: "Günlük bulmaca", bg: "linear-gradient(145deg,#c44a7e,#a23763)" },
    { icon: "🏆", label: "Lig", href: "/lig", desc: "Sıralamalar", bg: "linear-gradient(145deg,#3a7fc4,#2868a8)" },
  ];

  return (
    <div className="home-modes-wrap">
      {/* Profil / karşılama kartı — puan, madalya, rozet sayılarıyla */}
      {user ? (
        <div className="hm-profile">
          <div className="hm-profile-top">
            <img src={avatar} alt="" className="hm-avatar" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="hm-name">{user.display_name || user.username}</span>
                <span className="hm-badge">Lv {level}</span>
              </div>
              {title?.title && <div className="hm-title">{title.title_icon || "🏅"} {title.title}</div>}
              <div className="hm-xpbar"><div className="hm-xpfill" style={{ width: `${Math.round(pct * 100)}%` }} /></div>
            </div>
          </div>
          {/* İstatistik sayaçları (profildeki gibi) */}
          <div className="hm-stats">
            <div className="hm-stat"><span className="hm-stat-num">{(stats?.score ?? 0).toLocaleString("tr")}</span><span className="hm-stat-lbl">⭐ Puan</span></div>
            <div className="hm-stat"><span className="hm-stat-num">{stats?.trophies ?? 0}</span><span className="hm-stat-lbl">🏆 Kupa</span></div>
            <div className="hm-stat"><span className="hm-stat-num">{stats?.medals ?? 0}</span><span className="hm-stat-lbl">🥈 Madalya</span></div>
            <div className="hm-stat"><span className="hm-stat-num">{stats?.badges ?? 0}</span><span className="hm-stat-lbl">🎖️ Rozet</span></div>
          </div>
        </div>
      ) : (
        <div className="hm-guest">
          <div className="brand-mono hm-guest-title">Kelime Tahmin</div>
          {!loading && <a href="/giris" className="hm-guest-cta">Giriş yap / Kayıt ol →</a>}
        </div>
      )}

      {/* ARENA + ÖZEL ARENA (en üstte) */}
      <div className="hm-modes-grid hm-top-modes">
        {topModes.map((m) => (
          <button key={m.href} className="hm-mode" onClick={() => router.push(m.href)} style={{ background: m.bg }}>
            <span className="hm-mode-icon">{m.icon}</span>
            <span className="hm-mode-text">
              <span className="hm-mode-label">{m.label}</span>
              <span className="hm-mode-desc">{m.desc}</span>
            </span>
          </button>
        ))}
      </div>

      {/* 1v1 DÜELLO BÖLÜMÜ */}
      <section className="hm-section">
        <h2 className="hm-h2">🎮 1v1 Düello</h2>

        <button className="hm-hero-btn" onClick={() => router.push("/oyna?mode=search")}>
          <span className="hm-hero-icon">🎮</span>
          <span className="hm-hero-text">
            <span className="hm-hero-title">Oyna</span>
            <span className="hm-hero-sub">1v1 Düello · Rakip bul</span>
          </span>
          <span className="hm-hero-arrow">→</span>
        </button>

        <div className="hm-1v1-grid">
          <button className="hm-tile hm-tile-bot" onClick={() => router.push("/oyna?mode=bot")}>
            <span className="hm-tile-icon">🤖</span>
            <span className="hm-tile-label">1vB Pratik</span>
            <span className="hm-tile-desc">Bota karşı</span>
          </button>
          <button className="hm-tile hm-tile-room" onClick={() => router.push("/oyna?mode=create")}>
            <span className="hm-tile-icon">🚪</span>
            <span className="hm-tile-label">Özel Oda Kur</span>
            <span className="hm-tile-desc">Arkadaşını davet et</span>
          </button>
        </div>

        <div className="hm-join">
          <span className="hm-join-icon">🔑</span>
          <input
            className="hm-join-input"
            placeholder="Oda kodu"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && joinRoom()}
            maxLength={8}
          />
          <button className="hm-join-btn" onClick={joinRoom}>Katıl</button>
        </div>
      </section>

      {/* MARATON / GÜNÜN KELİMESİ / LİG (başlıksız) */}
      <div className="hm-modes-grid">
        {bottomModes.map((m) => (
          <button key={m.href} className="hm-mode" onClick={() => router.push(m.href)} style={{ background: m.bg }}>
            <span className="hm-mode-icon">{m.icon}</span>
            <span className="hm-mode-text">
              <span className="hm-mode-label">{m.label}</span>
              <span className="hm-mode-desc">{m.desc}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
