"use client";

import { useEffect, useState } from "react";

/**
 * "Nasıl Oynanır?" sayfasındaki canlı renk demosu.
 *
 * Gizli kelime KİTAP. Önce KALEM yazılır (harfler tek tek belirir), sonra
 * kutular sırayla çevrilerek renklenir: K yeşil, A sarı, kalanlar gri.
 * Ardından doğru cevap KİTAP yazılır ve hepsi yeşile döner; kısa bir bekleyişin
 * sonunda baştan başlar.
 *
 * TAMAMEN KOD İÇİNDEDİR — admin panelindeki "📄 Sayfalar" metni değiştirse bile
 * bu bölüm etkilenmez.
 * prefers-reduced-motion: animasyon çalışmaz, son hâl doğrudan gösterilir.
 */

type State = "correct" | "present" | "absent";
type Row = { word: string; states: State[] };

const ROWS: Row[] = [
  { word: "KALEM", states: ["correct", "present", "absent", "absent", "absent"] },
  { word: "KİTAP", states: ["correct", "correct", "correct", "correct", "correct"] },
];

const TYPE_MS = 130;    // harfler arası yazma hızı
const FLIP_MS = 260;    // kutular arası çevirme gecikmesi
const HOLD_MS = 2600;   // tur sonunda bekleme

export default function GuessDemo() {
  // typed[r] = o satırda kaç harf yazıldı · flipped[r] = kaç kutu çevrildi
  const [typed, setTyped] = useState([0, 0]);
  const [flipped, setFlipped] = useState([0, 0]);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setTyped([5, 5]); setFlipped([5, 5]); return; }

    let timers: number[] = [];
    const at = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms)); };

    function run() {
      setTyped([0, 0]);
      setFlipped([0, 0]);
      let t = 400;
      ROWS.forEach((row, r) => {
        for (let i = 1; i <= row.word.length; i++) {
          at(t, () => setTyped((p) => { const n = [...p]; n[r] = i; return n; }));
          t += TYPE_MS;
        }
        t += 350;
        for (let i = 1; i <= row.word.length; i++) {
          at(t, () => setFlipped((p) => { const n = [...p]; n[r] = i; return n; }));
          t += FLIP_MS;
        }
        t += 500;
      });
      at(t + HOLD_MS, run);   // döngü
    }
    run();
    return () => { timers.forEach(clearTimeout); timers = []; };
  }, []);

  return (
    <div className="ho-demo" aria-label="Renk örneği: KALEM tahmininden KİTAP cevabına">
      {ROWS.map((row, r) => (
        <div className="ho-demo-row" key={r}>
          {[...row.word].map((ch, i) => {
            const isTyped = i < typed[r];
            const isOpen = i < flipped[r];
            return (
              <span
                key={i}
                className={`ho-tile${isTyped ? " is-typed" : ""}${isOpen ? " is-open" : ""}`}
                aria-hidden
              >
                <span className="ho-tile-inner">
                  <span className="ho-face ho-front">{isTyped ? ch : ""}</span>
                  <span className={`ho-face ho-back ho-${row.states[i]}`}>{ch}</span>
                </span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
