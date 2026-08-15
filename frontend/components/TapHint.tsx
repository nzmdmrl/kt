"use client";

/**
 * "Tıkla, tahminini yaz" ipucu — animasyonlu ok.
 *
 * Sadece o modu İLK KEZ oynayanlara gösterilir: oyuncu giriş alanına dokunup
 * (ya da mikrofona basıp) etkileşime geçince `storageKey` localStorage'a yazılır
 * ve bir daha çıkmaz. `show` false olunca (etkileşim başlayınca) kaybolur.
 */

import { useEffect, useState } from "react";

export default function TapHint({
  show,
  storageKey,
  text = "Tıkla, tahminini yaz",
}: {
  /** Etkileşim henüz başlamadıysa true. */
  show: boolean;
  /** localStorage anahtarı — ör. "kt_hint_solo". */
  storageKey: string;
  text?: string;
}) {
  // İlk kez mi oynuyor? (SSR'de bilinmez — bilinene kadar gösterme.)
  const [firstTime, setFirstTime] = useState(false);

  useEffect(() => {
    try { setFirstTime(!localStorage.getItem(storageKey)); } catch { setFirstTime(false); }
  }, [storageKey]);

  // Etkileşim başladı → bir daha gösterme.
  useEffect(() => {
    if (show) return;
    try { localStorage.setItem(storageKey, "1"); } catch {}
  }, [show, storageKey]);

  if (!show || !firstTime) return null;

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
      pointerEvents: "none", userSelect: "none",
    }}>
      <span style={{ fontSize: 26, lineHeight: 1, animation: "kt-hint-bounce 1.1s ease-in-out infinite" }}>👆</span>
      <span style={{ color: "var(--accent)", fontSize: 13, fontWeight: 700 }}>{text}</span>
      <style>{`
        @keyframes kt-hint-bounce {
          0%, 100% { transform: translateY(0); opacity: .85; }
          50% { transform: translateY(-7px); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="kt-hint-bounce"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
