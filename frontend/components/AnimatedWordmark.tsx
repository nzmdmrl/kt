"use client";

import { useEffect, useRef, useState } from "react";
import { playTileFlip, unlockAudio } from "@/lib/sound";

/**
 * Animasyonlu "KELİME TAHMİN" kutu logosu — arayüz stili 2 (yeni görünüm).
 *
 * Akış: tüm kutular BOŞ (gri) başlar → harfler soldan sağa tek tek 3B (rotateY)
 * çevrilerek açılır → açık kalır. Animasyon sayfa başına BİR KEZ çalışır, döngü yok.
 * Her çevrilişte Web Audio ile üretilen kısa "tak" sesi çalar (lib/sound.ts).
 *
 * Renk: KELİME satırı tamamen yeşil, TAHMİN satırı tamamen sarı.
 * Yerleşim: her ekranda TEK SATIR, sabit ölçü (globals.css .kt-aw) — kutular
 * ilk render'dan itibaren son boyutunda durur, giriş durumuna göre büyüyüp
 * küçülmez; böylece yükleme/animasyon sırasında sayfada kayma olmaz.
 *
 * Kurallar:
 *  - Harf başına ayrı animasyon kodu YOK; tek zamanlayıcı + `revealed` sayacı.
 *  - Ses açık/kapalı ayarına uyar (kt_sound). Ses engelliyse animasyon yine çalışır.
 *  - prefers-reduced-motion: 3B dönüş ve ses kapanır, yumuşak geçiş kalır.
 */

type Kind = "k" | "t";
type Tile = { ch: string; kind: Kind };

// KELİME (6 harf, yeşil) + TAHMİN (6 harf, sarı) = 12 kutu.
const ROWS: Tile[][] = [
  [...("KELİME")].map((ch) => ({ ch, kind: "k" as Kind })),
  [...("TAHMİN")].map((ch) => ({ ch, kind: "t" as Kind })),
];
const TILES: Tile[] = ROWS.flat();

// Zamanlama (ms) — ilk sürüme göre %25 daha hızlı.
const EMPTY_MS = 525;   // baştaki boş kutu bekleyişi
const STEP_MS = 98;     // harfler arası gecikme
export const FLIP_MS = 345; // tek kutunun dönüş süresi (globals.css ile aynı olmalı)

export default function AnimatedWordmark() {
  const [revealed, setRevealed] = useState(0);
  const reducedRef = useRef(false);

  // İlk kullanıcı etkileşiminde ses kilidini aç (tarayıcı otomatik oynatma politikası).
  // Ses açılamazsa animasyon etkilenmez — bilerek sessiz devam eder.
  useEffect(() => {
    const unlock = () => unlockAudio();
    const opts = { once: true, passive: true } as AddEventListenerOptions;
    window.addEventListener("pointerdown", unlock, opts);
    window.addEventListener("touchstart", unlock, opts);
    window.addEventListener("keydown", unlock, opts);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Tek seferlik açılış — bittiğinde kutular açık kalır.
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const timers = TILES.map((_, i) =>
      window.setTimeout(() => {
        setRevealed(i + 1);
        if (!reducedRef.current) playTileFlip();
      }, EMPTY_MS + i * STEP_MS)
    );
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  let idx = 0;
  return (
    <div className="kt-aw" role="img" aria-label="Kelime Tahmin">
      {ROWS.map((row, r) => (
        <div className="kt-aw-row" key={r}>
          {row.map((tile) => {
            const i = idx++;
            return (
              <span
                key={i}
                className={`kt-aw-tile kt-aw-tile--${tile.kind}${i < revealed ? " is-open" : ""}`}
                aria-hidden
              >
                <span className="kt-aw-inner">
                  <span className="kt-aw-face kt-aw-front" />
                  <span className="kt-aw-face kt-aw-back">{tile.ch}</span>
                </span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
