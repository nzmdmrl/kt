"use client";

import Logo from "./Logo";

// Yasal/statik sayfalar için ortak sarmalayıcı (KVKK, gizlilik, koşullar, hakkında).
export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <main style={{ flex: 1, maxWidth: 720, width: "100%", margin: "0 auto", padding: "24px 20px 64px" }}>
      <div style={{ marginBottom: 24 }}>
        <a href="/"><Logo size={36} /></a>
      </div>
      <h1 className="brand-mono" style={{ fontSize: 28, marginBottom: 6 }}>{title}</h1>
      {updated && (
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 24 }}>
          Son güncelleme: {updated}
        </p>
      )}
      <div
        style={{
          color: "var(--text-soft)",
          fontSize: 15,
          lineHeight: 1.7,
        }}
        className="legal-content"
      >
        {children}
      </div>
      <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid var(--border-soft)" }}>
        <a href="/" style={{ color: "var(--accent)", fontWeight: 600 }}>← Ana sayfaya dön</a>
      </div>
    </main>
  );
}
