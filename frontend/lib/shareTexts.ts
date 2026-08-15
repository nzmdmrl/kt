"use client";

/**
 * Sonuç paylaşım metinleri (admin → 💬 Sonuç PM).
 *
 * Paylaşılan metin üç parçadan oluşur:
 *   1) sabit skor satırı  — koddan üretilir (lib/shareText.ts)
 *   2) yorum satırı       — buradan RASTGELE seçilir (admin düzenler)
 *   3) alt bilgi (footer) — tek alan
 *
 * Backend: GET /api/share-texts (public). Ulaşılamazsa aşağıdaki yedekler
 * kullanılır (backend/app/models/share_line.py ile aynı mantık).
 */

import { useEffect, useState } from "react";
import { getJSON } from "./api";

export type ShareTexts = { footer: string; lines: Record<string, string[]> };

const FALLBACK: ShareTexts = {
  footer: "🎯 Kelime Tahmin — Türkçe kelime oyunu",
  lines: {
    "match:win": ["⚔️ 1v1 Düello — kelimeler konuştu, kazanan belli oldu!"],
    "match:loss": ["⚔️ 1v1 Düello — bugün olmadı, rövanş yakın!"],
    "match:draw": ["⚔️ 1v1 Düello — nefes nefese, kazanan yok!"],
    "arena:win": ["🏟️ Arena — 5 kişilik hız yarışının kazananı!"],
    "arena:podium": ["🏟️ Arena — podyuma çıktım!"],
    "arena:loss": ["🏟️ Arena — 5 kişilik hız yarışı, sen de dene!"],
    "daily:win": ["📅 Günün kelimesi bugün de çözüldü!"],
    "daily:loss": ["📅 Günün kelimesi bugün beni yendi!"],
    "solo:win": ["🏃 Maraton devam ediyor!"],
  },
};

let cached: ShareTexts | null = null;
let inflight: Promise<ShareTexts> | null = null;

export function fetchShareTexts(): Promise<ShareTexts> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = getJSON<ShareTexts>("/api/share-texts")
      .then((d) => ({
        footer: d.footer || FALLBACK.footer,
        lines: d.lines && Object.keys(d.lines).length ? d.lines : FALLBACK.lines,
      }))
      .catch(() => FALLBACK)
      .then((t) => { cached = t; inflight = null; return t; });
  }
  return inflight;
}

/** Ayarlar gelene kadar yedek metinlerle çalışır (ekran boş kalmasın). */
export function useShareTexts(): ShareTexts {
  const [texts, setTexts] = useState<ShareTexts>(cached || FALLBACK);
  useEffect(() => {
    let alive = true;
    fetchShareTexts().then((t) => { if (alive) setTexts(t); });
    return () => { alive = false; };
  }, []);
  return texts;
}

/** Bir modül/durum için rastgele yorum satırı. */
export function randomLine(texts: ShareTexts, module: string, variant: string): string {
  const list = texts.lines[`${module}:${variant}`] || FALLBACK.lines[`${module}:${variant}`] || [];
  if (!list.length) return "";
  return list[Math.floor(Math.random() * list.length)];
}
