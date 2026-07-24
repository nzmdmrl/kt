"use client";

import { useAuth } from "@/lib/auth";

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
        justifyContent: "flex-end",
        alignItems: "center",
        gap: 12,
      }}
    >
      {loading ? null : user ? (
        <>
          <a href={`/profil/${user.username}`} style={{ fontSize: 14, color: "var(--text-soft)", textDecoration: "none" }}>
            <span style={{ color: "var(--accent)", fontWeight: 600 }}>{user.display_name}</span>
            <span style={{ color: "var(--text-dim)" }}> · ELO {user.elo}</span>
          </a>
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
  );
}
