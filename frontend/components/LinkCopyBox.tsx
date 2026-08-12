"use client";

import { useState } from "react";

/**
 * Davet linki kutusu: linkin tamamı görünür (dar ekranda satır kırar, taşmaz)
 * + altında tam genişlik "kopyala" butonu. Özel oda ve özel arena ortak kullanır.
 */
export default function LinkCopyBox({ link, label = "🔗 Linki kopyala" }: { link: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(link).then(done).catch(() => fallback(link, done));
    } else {
      fallback(link, done);
    }
  }

  return (
    <div style={{ width: "100%", minWidth: 0, boxSizing: "border-box", display: "grid", gap: 8 }}>
      <div
        title={link}
        style={{
          width: "100%", minWidth: 0, boxSizing: "border-box",
          padding: "10px 12px", borderRadius: 10, fontSize: 13, lineHeight: 1.4,
          background: "var(--bg-panel)", border: "1px solid var(--border-soft)",
          color: "var(--text-soft)", textAlign: "center",
          wordBreak: "break-all", overflowWrap: "anywhere",
        }}
      >
        {link}
      </div>
      <button
        onClick={copy}
        style={{
          width: "100%", minWidth: 0, boxSizing: "border-box",
          padding: "12px", borderRadius: 10, border: "none", background: "var(--accent)",
          color: "#1a1330", fontWeight: 700, fontSize: 14, cursor: "pointer",
        }}
      >
        {copied ? "✓ Kopyalandı" : label}
      </button>
    </div>
  );
}

/** clipboard API yoksa (http / eski tarayıcı) gizli input ile kopyala. */
function fallback(text: string, done: () => void) {
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    done();
  } catch {
    /* yoksay */
  }
}
