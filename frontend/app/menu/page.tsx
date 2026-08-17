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
    // Masaüstünde 520px'lik kolon; MOBİLDE tam genişlik (globals.css .kt-menu-wrap).
    <main className="kt-menu-wrap">
      <div className="kt-mobile-only" style={{ marginBottom: 16 }}><a href="/"><Logo size={32} /></a></div>
      {/* Ayarlar (toggle'lar) */}
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-soft)", marginBottom: 10, marginTop: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Ayarlar</div>
      <div style={{ display: "grid", gap: 10, marginBottom: 28 }}>
        <ToggleRow icon={dark ? "🌙" : "☀️"} label={dark ? "Gece modu" : "Gündüz modu"} on={dark} onClick={toggleTheme} />
        <ToggleRow icon="🔊" label="Ses" on={sound} onClick={toggleSound} />
        {user && (
          <button onClick={() => router.push("/ayarlar/bildirimler")} style={{ ...rowStyle, cursor: "pointer", width: "100%", textAlign: "left" }}>
            <span style={{
              fontSize: 22, width: 40, height: 40, flexShrink: 0, borderRadius: 11,
              background: "var(--bg-elevated)", display: "grid", placeItems: "center",
            }}>🔔</span>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 16, color: "var(--text-strong)" }}>Bildirim ayarları</span>
            <span style={{ color: "var(--text-dim)", fontSize: 18 }}>›</span>
          </button>
        )}
      </div>

      {/* Yönetici — sadece admin görür */}
      {user?.is_admin && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-soft)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Yönetici</div>
          <div style={{ display: "grid", gap: 10, marginBottom: 28 }}>
            <button onClick={() => router.push("/oyna?mode=reklam")} style={{ ...rowStyle, cursor: "pointer", width: "100%", textAlign: "left" }}>
              <span style={{
                fontSize: 22, width: 40, height: 40, flexShrink: 0, borderRadius: 11,
                background: "var(--bg-elevated)", display: "grid", placeItems: "center",
              }}>📣</span>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 16, color: "var(--text-strong)" }}>Reklam Oyunu</span>
              <span style={{ color: "var(--text-dim)", fontSize: 18 }}>›</span>
            </button>
          </div>
        </>
      )}

      {/* Hesap & bilgi butonları */}
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-soft)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Hesap & Bilgi</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {user && (
          <NavRow icon="👤" label="Profilim" onClick={() => router.push(`/profil/${user.username}`)} />
        )}
        {user && <NavRow icon="🤝" label="Arkadaşlarım" onClick={() => router.push("/arkadaslar")} />}
        <NavRow icon="🔎" label="Üye Ara" onClick={() => router.push("/uye-ara")} />
        <NavRow icon="🔔" label="Bildirimler" onClick={() => router.push("/bildirimler")} />
        <NavRow icon="🕐" label="Geçmiş" onClick={() => router.push("/gecmis")} />
        <NavRow icon="❓" label="Nasıl Oynanır" onClick={() => router.push("/nasil-oynanir")} />
        <NavRow icon="ℹ️" label="Hakkımızda" onClick={() => router.push("/hakkimizda")} />
        <NavRow icon="🔒" label="Gizlilik" onClick={() => router.push("/gizlilik")} />
        <NavRow icon="📄" label="Şartlar" onClick={() => router.push("/kosullar")} />
        <NavRow icon="🍪" label="Çerezler" onClick={() => router.push("/cerez")} />
        <NavRow icon="✉️" label="İletişim" onClick={() => router.push("/iletisim")} />
        {user && (
          <button onClick={logout} style={{ ...rowStyle, color: "var(--accent-hot)", cursor: "pointer", width: "100%", textAlign: "left", gridColumn: "1 / -1" }}>
            <span style={{ fontSize: 22, width: 40, height: 40, flexShrink: 0, borderRadius: 11, background: "rgba(217,90,90,.12)", display: "grid", placeItems: "center" }}>🚪</span>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 16, color: "var(--accent-hot)" }}>Çıkış Yap</span>
          </button>
        )}
      </div>
    </main>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 16, padding: "17px 18px",
  background: "var(--bg-panel)", borderRadius: 14, color: "var(--text-strong)",
  border: "1px solid var(--border-soft)", boxShadow: "0 1px 3px rgba(0,0,0,.15)",
  fontSize: 16,
};

function NavRow({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
      padding: "16px 8px", background: "var(--bg-panel)", borderRadius: 14,
      border: "1px solid var(--border-soft)", boxShadow: "0 1px 3px rgba(0,0,0,.15)",
      cursor: "pointer", width: "100%", minHeight: 92,
    }}>
      <span style={{
        fontSize: 24, width: 46, height: 46, flexShrink: 0, borderRadius: 13,
        background: "var(--bg-elevated)", display: "grid", placeItems: "center",
      }}>{icon}</span>
      <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text-strong)", textAlign: "center", lineHeight: 1.2, wordBreak: "break-word" }}>{label}</span>
    </button>
  );
}

function ToggleRow({ icon, label, on, onClick }: { icon: string; label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ ...rowStyle, cursor: "pointer", width: "100%", textAlign: "left" }}>
      <span style={{
        fontSize: 22, width: 40, height: 40, flexShrink: 0, borderRadius: 11,
        background: "var(--bg-elevated)", display: "grid", placeItems: "center",
      }}>{icon}</span>
      <span style={{ flex: 1, fontWeight: 600, fontSize: 16, color: "var(--text-strong)" }}>{label}</span>
      <span style={{
        width: 48, height: 28, borderRadius: 14, background: on ? "var(--accent)" : "var(--bg-elevated)",
        position: "relative", transition: "background .2s", flexShrink: 0,
        border: on ? "none" : "1px solid var(--border-soft)",
      }}>
        <span style={{
          position: "absolute", top: 2, left: on ? 22 : 2, width: 22, height: 22, borderRadius: "50%",
          background: "#fff", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.3)",
        }} />
      </span>
    </button>
  );
}
