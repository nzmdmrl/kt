"use client";

import { useAuth } from "@/lib/auth";
import Logo from "./Logo";
import SoundToggle from "./SoundToggle";
import ThemeToggle from "./ThemeToggle";
import NotificationBell from "./NotificationBell";

export default function TopBar() {
  const { user, logout, loading } = useAuth();

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 720,
        margin: "0 auto",
        padding: "14px 20px 0",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      <a href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}>
        <Logo size={34} />
      </a>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <ThemeToggle />
      <SoundToggle />
      {loading ? null : user ? (
        <>
          <NotificationBell />
          <a href={`/profil/${user.username}`} style={{ fontSize: 14, color: "var(--text-soft)", textDecoration: "none" }}>
            <span style={{ color: "var(--accent)", fontWeight: 600 }}>{user.display_name}</span>
          </a>
          {/* Doğrulanmamış hesaba "Çıkış" GÖSTERİLMEZ — jeton o hesabın tek
              anahtarı; çıkış yapan kişi hesabını kaybederdi. Yerine hesabı
              kalıcı hâle getiren düğme durur (aynı kural /menu sayfasında da). */}
          {user.verified === false ? (
            <a
              href="/dogrula"
              style={{
                background: "rgba(255,193,74,.16)",
                border: "1px solid rgba(255,193,74,.42)",
                color: "var(--text-strong)",
                borderRadius: 8,
                padding: "6px 12px",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              🔒 Profili doğrula
            </a>
          ) : (
            <button
              onClick={logout}
              style={{
                background: "transparent",
                border: "1px solid var(--border-soft)",
                color: "var(--text-soft)",
                borderRadius: 8,
                padding: "6px 12px",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Çıkış
            </button>
          )}
        </>
      ) : (
        <a
          href="/giris"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-soft)",
            color: "var(--text-strong)",
            borderRadius: 8,
            padding: "7px 16px",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Giriş / Kayıt
        </a>
      )}
      </div>
    </div>
  );
}
