"use client";

import { useEffect, useRef, useState } from "react";
import { playTileFlip, unlockAudio } from "@/lib/sound";

/**
 * Animasyonlu "KELİME TAHMİN" kutu logosu — arayüz stili 2 (yeni görünüm).
 *
 * Akış: tüm kutular BOŞ (gri) başlar → harfler soldan sağa, satır satır, tek tek
 * 3B (rotateY) çevrilerek açılır → kısa bekleme → kutular yine boşalır → döngü.
 * Her çevrilişte Web Audio ile üretilen kısa "tak" sesi çalar (lib/sound.ts).
 *
 * Kurallar:
 *  - Harf başına ayrı animasyon kodu YOK; tek zamanlayıcı + `revealed` sayacı.
 *  - Ses açık/kapalı ayarına uyar (kt_sound). Ses engelliyse animasyon yine çalışır.
 *  - prefers-reduced-motion: 3B dönüş ve ses kapanır, yumuşak geçiş kalır.
 *
 * Görünüm ayarları globals.css → "ARAYÜZ STİLİ 2" bölümündeki .kt-aw-* sınıfları.
 */

type Kind = "k" | "t" | "plain";
type Tile = { ch: string; kind: Kind };

// Satırlar: KELİME (6 harf) + TAHMİN (6 harf) = 12 kutu.
// Baştaki K yeşil, baştaki T sarı — KT marka kutularıyla aynı dil.
const ROWS: Tile[][] = [
  [...("KELİME")].map((ch, i) => ({ ch, kind: (i === 0 ? "k" : "plain") as Kind })),
  [...("TAHMİN")].map((ch, i) => ({ ch, kind: (i === 0 ? "t" : "plain") as Kind })),
];
const TILES: Tile[] = ROWS.flat();

// Zamanlama (ms) — premium his için ölçülü stagger.
const EMPTY_MS = 700;   // baştaki boş kutu bekleyişi
const STEP_MS = 130;    // harfler arası gecikme
const FLIP_MS = 460;    // tek kutunun dönüş süresi (CSS ile aynı olmalı)
const HOLD_MS = 1800;   // kelime tamamlandıktan sonraki bekleme
const CLEAR_STEP = 30;  // boşaltma dalgası

export default function AnimatedWordmark({ compact = false }: { compact?: boolean }) {
  const [revealed, setRevealed] = useState(0);
  const [clearing, setClearing] = useState(false);
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

  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let timers: number[] = [];
    let alive = true;

    function run() {
      if (!alive) return;
      timers = [];                 // önceki turun zamanlayıcıları çoktan tetiklendi
      setClearing(false);
      setRevealed(0);

      TILES.forEach((_, i) => {
        timers.push(
          window.setTimeout(() => {
            setRevealed(i + 1);
            if (!reducedRef.current) playTileFlip();
          }, EMPTY_MS + i * STEP_MS)
        );
      });

      const doneAt = EMPTY_MS + (TILES.length - 1) * STEP_MS + FLIP_MS;
      // Boşaltma: kutular dalga hâlinde geri döner, sonra döngü baştan başlar.
      timers.push(window.setTimeout(() => { setClearing(true); setRevealed(0); }, doneAt + HOLD_MS));
      timers.push(window.setTimeout(run, doneAt + HOLD_MS + TILES.length * CLEAR_STEP + FLIP_MS + 250));
    }

    run();
    return () => { alive = false; timers.forEach((t) => clearTimeout(t)); };
  }, []);

  let idx = 0;
  return (
    <div className={`kt-aw${compact ? " kt-aw--compact" : ""}`} role="img" aria-label="Kelime Tahmin">
      {ROWS.map((row, r) => (
        <div className="kt-aw-row" key={r}>
          {row.map((tile) => {
            const i = idx++;
            const open = i < revealed;
            return (
              <span
                key={i}
                className={`kt-aw-tile kt-aw-tile--${tile.kind}${open ? " is-open" : ""}`}
                // Açılırken gecikme zamanlayıcıdan gelir (0), boşalırken dalga efekti.
                style={{ transitionDelay: clearing ? `${i * CLEAR_STEP}ms` : "0ms" }}
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
