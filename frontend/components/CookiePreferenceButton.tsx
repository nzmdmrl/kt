"use client";

/**
 * Çerez sayfasındaki tercih anahtarı — ziyaret istatistiklerini aç/kapa.
 * Kararı localStorage'a yazar; GA anında durur veya yeniden başlar.
 */

import { useEffect, useState } from "react";
import { GA_ID, getConsent, setConsent, onConsentChange, type Consent } from "@/lib/analytics";

export default function CookiePreferenceButton() {
  const [consent, setLocal] = useState<Consent>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setLocal(getConsent());
    return onConsentChange(setLocal);
  }, []);

  if (!mounted) return null;

  if (!GA_ID) {
    return (
      <p style={{ fontSize: 14, color: "var(--text-dim)" }}>
        Şu anda bu sitede ziyaret istatistiği ölçümü yapılmıyor.
      </p>
    );
  }

  const on = consent !== "rejected";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        flexWrap: "wrap",
        background: "var(--bg-panel)",
        border: "1px solid var(--border-soft)",
        borderRadius: 12,
        padding: "14px 16px",
        marginBottom: 12,
      }}
    >
      <div style={{ flex: "1 1 220px" }}>
        <div style={{ fontWeight: 700, color: "var(--text-strong)", fontSize: 15 }}>
          Ziyaret istatistikleri
        </div>
        <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
          {on ? "Açık — Google Analytics ölçüm yapıyor." : "Kapalı — ölçüm yapılmıyor."}
        </div>
      </div>
      <button
        onClick={() => setConsent(on ? "rejected" : "accepted")}
        style={{
          padding: "10px 18px",
          borderRadius: 9,
          border: on ? "1px solid var(--border-soft)" : "none",
          background: on ? "transparent" : "var(--accent)",
          color: on ? "var(--text-soft)" : "#1a1330",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "var(--font-display)",
          flexShrink: 0,
        }}
      >
        {on ? "Ölçümü kapat" : "Ölçüme izin ver"}
      </button>
    </div>
  );
}
