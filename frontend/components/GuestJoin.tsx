"use client";

/**
 * Misafir katılım kartı — üye olmayan ziyaretçiye gösterilir.
 *
 * İki hâli var:
 *  - allowed=true  : "isim yaz → katıl" + "üye ol" seçeneği
 *  - allowed=false : sadece "üye ol / giriş yap" (admin misafir erişimini kapatmış)
 *
 * Admin ayarları: guest_arena_enabled / guest_match_enabled / guest_daily_enabled.
 */

import { useState } from "react";
import Logo from "@/components/Logo";
import { savedGuestName, saveGuestName } from "@/lib/guestAccess";

export default function GuestJoin({
  allowed,
  icon = "🎪",
  title,
  subtitle,
  note,
  joinLabel = "Misafir Olarak Katıl",
  askName = true,
  onJoin,
}: {
  allowed: boolean;
  icon?: string;
  title: string;
  subtitle?: string;
  note?: string;
  joinLabel?: string;
  /** false ise isim sorulmaz (ör. günün kelimesi) — doğrudan "Devam et". */
  askName?: boolean;
  onJoin?: (name: string) => void;
}) {
  const [name, setName] = useState(savedGuestName());
  const [err, setErr] = useState("");

  function join() {
    const n = name.trim();
    if (askName) {
      if (n.length < 2) { setErr("En az 2 harfli bir isim yaz"); return; }
      saveGuestName(n);
    }
    setErr("");
    onJoin?.(n || "Misafir");
  }

  return (
    <main style={{ maxWidth: 460, margin: "0 auto", padding: "28px 18px 40px" }}>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <a href="/"><Logo size={40} /></a>
      </div>

      <div style={{
        background: "var(--bg-panel)", border: "1px solid var(--border-soft)",
        borderRadius: 20, padding: "26px 22px", textAlign: "center",
        boxShadow: "0 10px 30px rgba(0,0,0,.18)",
      }}>
        <div style={{ fontSize: 42, marginBottom: 8 }}>{icon}</div>
        <h1 className="brand-mono" style={{ fontSize: 24, marginBottom: 6, color: "var(--text-strong)" }}>{title}</h1>
        {subtitle && (
          <p style={{ color: "var(--text-soft)", fontSize: 14, lineHeight: 1.5, marginBottom: 18 }}>{subtitle}</p>
        )}

        {allowed && (
          <>
            {askName && (
              <>
                <label style={{ display: "block", textAlign: "left", fontSize: 12, color: "var(--text-dim)", marginBottom: 6, fontWeight: 600 }}>
                  Görünen adın
                </label>
                <input
                  value={name}
                  onChange={(e) => { setName(e.target.value); setErr(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") join(); }}
                  placeholder="Adın"
                  maxLength={24}
                  style={{
                    width: "100%", padding: "13px 14px", borderRadius: 12, marginBottom: 6,
                    border: "1px solid var(--border-soft)", background: "var(--bg-elevated)",
                    color: "var(--text-strong)", fontSize: 16, textAlign: "center", fontWeight: 600,
                  }}
                />
              </>
            )}
            {err && <p style={{ color: "var(--accent-hot)", fontSize: 13, marginBottom: 8 }}>{err}</p>}

            <button
              onClick={join}
              style={{
                width: "100%", padding: "15px", borderRadius: 13, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, var(--accent), var(--accent-hot))",
                color: "#1a1330", fontWeight: 900, fontSize: 17, marginTop: 8,
                boxShadow: "0 8px 22px var(--accent-glow)",
              }}
            >
              {joinLabel}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-dim)", fontSize: 12, margin: "16px 0 12px" }}>
              <span style={{ flex: 1, height: 1, background: "var(--border-soft)" }} />
              veya
              <span style={{ flex: 1, height: 1, background: "var(--border-soft)" }} />
            </div>
          </>
        )}

        <a
          href="/giris"
          style={{
            display: "block", width: "100%", padding: "14px", borderRadius: 13,
            border: `1px solid ${allowed ? "var(--border-soft)" : "var(--accent)"}`,
            background: allowed ? "transparent" : "var(--accent)",
            color: allowed ? "var(--text-strong)" : "#1a1330",
            fontWeight: 800, fontSize: 16, textDecoration: "none",
          }}
        >
          {allowed ? "🎁 Üye Ol · Puanların kaydedilsin" : "Ücretsiz Üye Ol / Giriş Yap →"}
        </a>

        <p style={{ color: "var(--text-dim)", fontSize: 12, lineHeight: 1.5, marginTop: 14 }}>
          {note ?? (allowed
            ? "Misafir olarak oynayabilirsin; ELO, XP, rozet ve kupalar sadece üyelere işlenir."
            : "Bu mod şu an sadece üyelere açık.")}
        </p>
      </div>
    </main>
  );
}
