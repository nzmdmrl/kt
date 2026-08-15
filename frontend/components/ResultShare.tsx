"use client";

/**
 * Sonuç paylaşım paneli — maç/arena/günün kelimesi/maraton sonuç ekranlarında.
 *
 * Paylaşılan adres bulunulan sayfadır (lib/shareText.ts → pageUrl); metin
 * sonuca göre zenginleştirilir ("🏆 Nazım, Ahmet'i 200-0 yendi!").
 * Butonlar: WhatsApp · X · Telegram · Facebook · Kopyala (+ mobilde native).
 */

import { useMemo, useState } from "react";
import ShareButtons from "./ShareButtons";
import { pageUrl } from "@/lib/shareText";
import { useShareTexts, randomLine } from "@/lib/shareTexts";

export default function ResultShare({
  text,
  module,
  variant,
  title = "Kelime Tahmin",
  url,
  heading = "📤 Sonucu paylaş",
  compact = false,
}: {
  /** Sabit skor satırı (lib/shareText.ts üretir). */
  text: string;
  /** Yorum satırının çekileceği grup: match | arena | daily | solo */
  module?: string;
  /** Grup durumu: win | loss | draw | podium */
  variant?: string;
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
  const texts = useShareTexts();

  // Yorum satırı: admin panelindeki metinlerden rastgele biri.
  // Metinler yüklenene kadar yedek listeden seçilir; liste değişince tazelenir.
  const comment = useMemo(
    () => (module ? randomLine(texts, module, variant || "") : ""),
    [texts, module, variant],
  );
  const full = [text, comment].filter(Boolean).join("\n") + (texts.footer ? `\n${texts.footer}` : "");

  function copy() {
    const payload = `${full}\n${link}`;
    try {
      navigator.clipboard.writeText(payload).then(() => {
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
        }}>{full}</pre>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
        <ShareButtons
          url={link}
          title={title}
          text={full}
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
