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

  const current = OPTIONS.find((o) => o.mode === mode) || OPTIONS[0];

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen(!open)}
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
          position: "absolute", right: 0, top: 40, display: "flex", flexDirection: "column", gap: 2,
          background: "var(--bg-panel)", border: "1px solid var(--border-soft)",
          borderRadius: 12, boxShadow: "var(--shadow-soft)", zIndex: 100, padding: 4,
          animation: "fadeIn .15s ease", minWidth: 130,
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
