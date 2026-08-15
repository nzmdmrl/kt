"use client";

/**
 * Sonuç paylaşım paneli — maç/arena/günün kelimesi/maraton sonuç ekranlarında.
 *
 * Paylaşılan adres bulunulan sayfadır (lib/shareText.ts → pageUrl); metin
 * sonuca göre zenginleştirilir ("🏆 Nazım, Ahmet'i 200-0 yendi!").
 * Butonlar: WhatsApp · X · Telegram · Facebook · Kopyala (+ mobilde native).
 */

import { useState } from "react";
import ShareButtons from "./ShareButtons";
import { pageUrl } from "@/lib/shareText";

export default function ResultShare({
  text,
  title = "Kelime Tahmin",
  url,
  heading = "📤 Sonucu paylaş",
  compact = false,
}: {
  /** Paylaşılacak tam metin (çok satırlı olabilir). */
  text: string;
  /** Native paylaşımda görünen kısa başlık. */
  title?: string;
  /** Varsayılan: bulunulan sayfanın adresi. */
  url?: string;
  heading?: string;
  /** true ise metin önizlemesi gösterilmez. */
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const link = url || pageUrl();

  function copy() {
    const full = `${text}\n${link}`;
    try {
      navigator.clipboard.writeText(full).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }).catch(() => {});
    } catch {}
  }

  return (
    <div style={{
      background: "var(--bg-elevated)", border: "1px solid var(--border-soft)",
      borderRadius: 14, padding: "14px 14px 12px", textAlign: "center",
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-soft)", marginBottom: 10 }}>{heading}</div>

      {!compact && (
        <pre style={{
          margin: "0 0 12px", padding: "10px 12px", borderRadius: 10,
          background: "var(--bg-panel)", border: "1px solid var(--border-soft)",
          color: "var(--text-strong)", fontSize: 13, lineHeight: 1.45,
          whiteSpace: "pre-wrap", wordBreak: "break-word", textAlign: "left",
          fontFamily: "inherit",
        }}>{text}</pre>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
        <ShareButtons
          url={link}
          title={title}
          text={text}
          label=""
          networks={["whatsapp", "twitter", "telegram", "facebook"]}
        />
        <button
          onClick={copy}
          style={{
            padding: "8px 14px", borderRadius: 18, cursor: "pointer",
            border: "1px solid var(--border-soft)", background: "var(--bg-panel)",
            color: copied ? "var(--tile-correct)" : "var(--text-soft)",
            fontWeight: 700, fontSize: 13,
          }}
        >{copied ? "✓ Kopyalandı" : "📋 Kopyala"}</button>
      </div>
    </div>
  );
}
