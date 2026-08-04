"use client";

import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import SoundToggle from "@/components/SoundToggle";
import { useAuth } from "@/lib/auth";

const LINKS = [
  { icon: "🎮", label: "Oyna (1v1)", href: "/oyna" },
  { icon: "⚔️", label: "Arena", href: "/arena" },
  { icon: "🗺️", label: "Solo Mod", href: "/solo" },
  { icon: "📅", label: "Günün Kelimesi", href: "/gunun-kelimesi" },
  { icon: "🏆", label: "Lig", href: "/lig" },
  { icon: "❓", label: "Nasıl Oynanır", href: "/nasil-oynanir" },
  { icon: "🔒", label: "Gizlilik", href: "/gizlilik" },
  { icon: "📄", label: "Şartlar ve Koşullar", href: "/kosullar" },
];

export default function MenuPage() {
  const { user, logout } = useAuth();
  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "24px 18px 40px" }}>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <a href="/"><Logo size={32} /></a>
        <div style={{ display: "flex", gap: 8 }}><ThemeToggle /><SoundToggle /></div>
      </div>
      <h1 className="brand-mono" style={{ fontSize: 26, marginBottom: 20 }}>☰ Menü</h1>
      <div style={{ display: "grid", gap: 8 }}>
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} style={{
            display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
            background: "var(--bg-panel)", borderRadius: 12, textDecoration: "none",
            color: "var(--text-strong)", fontWeight: 600,
          }}>
            <span style={{ fontSize: 22 }}>{l.icon}</span> {l.label}
          </a>
        ))}
        {user && (
          <button onClick={logout} style={{
            display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
            background: "var(--bg-panel)", borderRadius: 12, border: "none", cursor: "pointer",
            color: "var(--accent-hot)", fontWeight: 600, fontSize: 15, textAlign: "left",
          }}>
            <span style={{ fontSize: 22 }}>🚪</span> Çıkış Yap
          </button>
        )}
      </div>
    </main>
  );
}
