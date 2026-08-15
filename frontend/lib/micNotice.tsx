"use client";

/**
 * Mikrofon bilgilendirme balonu.
 *
 * Kullanıcı mikrofonu İLK kez kullandığında "sesim karşı tarafa gidiyor mu?"
 * diye tereddüt ediyor. Bu balon o soruyu yanıtlar: metin, kaç kez görüneceği
 * ve kaç saniye duracağı admin panelden yönetilir
 * (app_settings -> "app.mic" -> notice_*).
 *
 * Tasarım kararları:
 *  - Balon MODAL DEĞİL: `pointer-events: none`. Kullanıcı mikrofona BASILI
 *    TUTARKEN çıkıyor; tıklamayı yutan bir katman basılı tutmayı bozardı.
 *  - Kapatma düğmesi yok, süre dolunca kendiliğinden kapanır (aynı sebep).
 *  - Kaç kez gösterildiği CİHAZDA tutulur (localStorage) — üyelik gerekmez,
 *    misafirde de çalışır.
 *
 * Kullanım: <MicNoticeHost /> bir kez Providers'a asılır; tetikleme
 * lib/useSpeech.ts içinden maybeShowMicNotice() ile yapılır. Oyun ekranlarının
 * (ArenaGame, MatchGame, SoloGame, gunun-kelimesi) hiçbir şey yapması gerekmez.
 */

import { useEffect, useState } from "react";

const COUNT_KEY = "kt_mic_notice_count";

/**
 * Varsayılan metin — backend'deki MIC_NOTICE_TEXT ile AYNI olmalı
 * (backend/app/api/routes/app_settings.py). İkisi birlikte güncellenir.
 * Yalnızca ayar HİÇ gelmediğinde kullanılır; admin metni boşaltırsa
 * (boş metin) balon gösterilmez.
 */
export const DEFAULT_MIC_NOTICE_TEXT =
  "Sesiniz karşı tarafa iletilmez, sadece söylediğiniz kelimenin kutuya yazılmasını sağlar.";

export type MicNoticeSettings = {
  enabled?: boolean;
  text?: string;
  /** Kaç kez gösterilsin (cihaz başına). 0 = hiç. */
  times?: number;
  /** Kaç saniye ekranda kalsın. */
  seconds?: number;
};

// --- basit yayın kanalı (modül kapsamı) ---
type Payload = { text: string; seconds: number };
type Listener = (p: Payload) => void;
const listeners = new Set<Listener>();

function readCount(): number {
  try {
    const n = parseInt(localStorage.getItem(COUNT_KEY) || "0", 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function bumpCount(next: number) {
  try {
    localStorage.setItem(COUNT_KEY, String(next));
  } catch {}
}

/**
 * Ayarlar izin veriyorsa balonu gösterir ve sayacı artırır.
 * Gösterildi mi bilgisini döner (tanılama/log için).
 */
export function maybeShowMicNotice(s: MicNoticeSettings): boolean {
  if (typeof window === "undefined") return false;
  if (s.enabled === false) return false;

  // undefined -> ayar hiç gelmemiş, varsayılanı kullan.
  // ""        -> admin bilerek boşaltmış, gösterme.
  const text = (s.text === undefined ? DEFAULT_MIC_NOTICE_TEXT : s.text).trim();
  if (!text) return false;

  // Sayılar bozuk gelirse (boş kutu, metin) varsayılana düş.
  const times = Number.isFinite(s.times as number) ? Math.floor(s.times as number) : 2;
  const seconds = Number.isFinite(s.seconds as number) ? Math.floor(s.seconds as number) : 5;
  if (times <= 0 || seconds <= 0) return false;

  const shown = readCount();
  if (shown >= times) return false;
  bumpCount(shown + 1);

  listeners.forEach((fn) => {
    try {
      fn({ text, seconds });
    } catch {}
  });
  return true;
}

/** Balonu çizen tek bileşen — Providers içinde bir kez asılır. */
export default function MicNoticeHost() {
  const [notice, setNotice] = useState<Payload | null>(null);

  useEffect(() => {
    const listener: Listener = (p) => setNotice(p);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), notice.seconds * 1000);
    return () => clearTimeout(t);
  }, [notice]);

  if (!notice) return null;

  return (
    <div
      // pointer-events: none -> mikrofona basılı tutmayı ASLA engellemez.
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        top: "calc(env(safe-area-inset-top, 0px) + 14px)",
        zIndex: 9000,
        display: "flex",
        justifyContent: "center",
        padding: "0 14px",
        pointerEvents: "none",
      }}
      role="status"
      aria-live="polite"
    >
      <div
        style={{
          maxWidth: 420,
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          background: "var(--bg-panel)",
          border: "1px solid var(--border-soft)",
          borderRadius: 14,
          padding: "12px 14px",
          boxShadow: "0 10px 30px rgba(0,0,0,.35)",
          animation: "ktMicNoticeIn .22s ease-out",
        }}
      >
        <span style={{ fontSize: 20, lineHeight: 1.2 }}>🎤</span>
        <span style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text-strong)" }}>
          {notice.text}
        </span>
      </div>
      <style>{`
        @keyframes ktMicNoticeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}
