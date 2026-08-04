"use client";

import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import { useState, useEffect } from "react";
import { getThemeMode, setThemeMode, effectiveTheme } from "@/lib/theme";
import { isSoundEnabled, setSoundEnabled } from "@/lib/sound";

// Menü — ayar odaklı. Mod butonları ana sayfada olduğu için burada YOK.
export default function MenuPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [dark, setDark] = useState(true);
  const [sound, setSound] = useState(true);

  useEffect(() => {
    try { setDark(effectiveTheme() !== "light"); } catch {}
    try { setSound(isSoundEnabled()); } catch {}
  }, []);

  function toggleTheme() {
    const next = dark ? "light" : "dark";
    setThemeMode(next); setDark(!dark);
  }
  function toggleSound() {
    const next = !sound;
    setSoundEnabled(next); setSound(next);
  }

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "24px 18px 40px" }}>
      <div style={{ marginBottom: 16 }}><a href="/"><Logo size={32} /></a></div>
      <h1 className="brand-mono" style={{ fontSize: 26, marginBottom: 20 }}>☰ Menü</h1>

      {/* Ayarlar (toggle'lar) */}
      <div style={{ display: "grid", gap: 10, marginBottom: 24 }}>
        <ToggleRow icon={dark ? "🌙" : "☀️"} label={dark ? "Gece modu" : "Gündüz modu"} on={dark} onClick={toggleTheme} />
        <ToggleRow icon="🔊" label="Ses" on={sound} onClick={toggleSound} />
      </div>

      {/* Hesap & bilgi butonları */}
      <div style={{ display: "grid", gap: 10 }}>
        {user && (
          <NavRow icon="👤" label="Profilim" onClick={() => router.push(`/profil/${user.username}`)} />
        )}
        <NavRow icon="🔔" label="Bildirimler" onClick={() => router.push("/bildirimler")} />
        <NavRow icon="🕐" label="Geçmiş" onClick={() => router.push("/gecmis")} />
        <NavRow icon="❓" label="Nasıl Oynanır" onClick={() => router.push("/nasil-oynanir")} />
        <NavRow icon="🔒" label="Gizlilik" onClick={() => router.push("/gizlilik")} />
        <NavRow icon="📄" label="Şartlar ve Koşullar" onClick={() => router.push("/kosullar")} />
        {user && (
          <button onClick={logout} style={{ ...rowStyle, color: "var(--accent-hot)", cursor: "pointer", border: "none", width: "100%", textAlign: "left" }}>
            <span style={{ fontSize: 22, width: 28, textAlign: "center" }}>🚪</span>
            <span style={{ flex: 1, fontWeight: 600 }}>Çıkış Yap</span>
          </button>
        )}
      </div>
    </main>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 14, padding: "15px 16px",
  background: "var(--bg-panel)", borderRadius: 12, color: "var(--text-strong)",
};

function NavRow({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ ...rowStyle, border: "none", cursor: "pointer", width: "100%", textAlign: "left" }}>
      <span style={{ fontSize: 22, width: 28, textAlign: "center" }}>{icon}</span>
      <span style={{ flex: 1, fontWeight: 600 }}>{label}</span>
      <span style={{ color: "var(--text-dim)" }}>›</span>
    </button>
  );
}

function ToggleRow({ icon, label, on, onClick }: { icon: string; label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ ...rowStyle, border: "none", cursor: "pointer", width: "100%", textAlign: "left" }}>
      <span style={{ fontSize: 22, width: 28, textAlign: "center" }}>{icon}</span>
      <span style={{ flex: 1, fontWeight: 600 }}>{label}</span>
      <span style={{
        width: 44, height: 26, borderRadius: 13, background: on ? "var(--accent)" : "var(--bg-elevated)",
        position: "relative", transition: "background .2s", flexShrink: 0, border: "1px solid var(--border-soft)",
      }}>
        <span style={{
          position: "absolute", top: 2, left: on ? 20 : 2, width: 20, height: 20, borderRadius: "50%",
          background: "#fff", transition: "left .2s",
        }} />
      </span>
    </button>
  );
}
