"use client";

import { useState, useEffect, useRef } from "react";
import { getThemeMode, setThemeMode, onThemeChange } from "@/lib/theme";

// Gündüz/gece/otomatik geçiş — tıklayınca açılan mini menü (ses butonuna benzer).
const OPTIONS: { mode: "dark" | "light" | "auto"; icon: string; label: string }[] = [
  { mode: "dark", icon: "🌙", label: "Gece" },
  { mode: "light", icon: "☀️", label: "Gündüz" },
  { mode: "auto", icon: "🌗", label: "Otomatik" },
];

export default function ThemeToggle() {
  const [mode, setMode] = useState<"dark" | "light" | "auto">("dark");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    setMode(getThemeMode());
    const off = onThemeChange((m) => setMode(m));
    return off;
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Menü açılırken buton konumunu ölç; menüyü ekran içinde kalacak şekilde (fixed) yerleştir.
  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const MENU_W = 150;
      // Menünün sol kenarı: butonun sağ hizasından menü genişliği kadar sola.
      let left = r.right - MENU_W;
      // Ekranın sol/sağ kenarına taşmayı engelle (8px pay).
      if (left < 8) left = 8;
      if (left + MENU_W > window.innerWidth - 8) left = window.innerWidth - 8 - MENU_W;
      setMenuPos({ top: r.bottom + 6, left });
    }
    setOpen((v) => !v);
  }

  const current = OPTIONS.find((o) => o.mode === mode) || OPTIONS[0];

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={btnRef}
        onClick={toggle}
        aria-label="Tema"
        title={`Tema: ${current.label}`}
        style={{
          width: 34, height: 34, borderRadius: "50%",
          border: "1px solid var(--border-soft)", background: "var(--bg-panel)",
          cursor: "pointer", fontSize: 16, display: "grid", placeItems: "center",
        }}
      >
        {current.icon}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: menuPos.left, top: menuPos.top,
          display: "flex", flexDirection: "column", gap: 2,
          background: "var(--bg-panel)", border: "1px solid var(--border-soft)",
          borderRadius: 12, boxShadow: "var(--shadow-soft)", zIndex: 1000, padding: 4,
          animation: "fadeIn .15s ease", width: 150,
        }}>
          {OPTIONS.map((o) => (
            <button
              key={o.mode}
              onClick={() => { setThemeMode(o.mode); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13,
                textAlign: "left", width: "100%",
                background: mode === o.mode ? "var(--accent-glow)" : "transparent",
                color: mode === o.mode ? "var(--accent)" : "var(--text-soft)",
                fontWeight: mode === o.mode ? 700 : 500,
              }}
            >
              <span style={{ fontSize: 16 }}>{o.icon}</span> {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
