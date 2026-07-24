"use client";

import { useState, useEffect } from "react";
import { isSoundEnabled, toggleSound, onSoundChange } from "@/lib/sound";

// Mini ses aç/kapa düğmesi (kaydırmalı switch).
// Sağda = açık (🔊), sola kayınca = kapalı (🔇). Durum global + kalıcı (localStorage).
export default function SoundToggle({ size = 1 }: { size?: number }) {
  const [on, setOn] = useState(true);

  useEffect(() => {
    setOn(isSoundEnabled());
    const off = onSoundChange((v) => setOn(v));
    return off;
  }, []);

  const w = 44 * size, h = 24 * size, knob = 18 * size;

  return (
    <button
      onClick={() => setOn(toggleSound())}
      aria-label={on ? "Sesi kapat" : "Sesi aç"}
      title={on ? "Ses açık" : "Ses kapalı"}
      style={{
        position: "relative",
        width: w, height: h,
        borderRadius: h,
        border: "none",
        cursor: "pointer",
        padding: 0,
        background: on ? "var(--accent)" : "var(--bg-elevated)",
        transition: "background .2s",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: (h - knob) / 2,
          left: on ? w - knob - (h - knob) / 2 : (h - knob) / 2,
          width: knob, height: knob,
          borderRadius: "50%",
          background: "#fff",
          transition: "left .2s",
          display: "grid",
          placeItems: "center",
          fontSize: knob * 0.55,
          boxShadow: "0 1px 3px rgba(0,0,0,.3)",
        }}
      >
        {on ? "🔊" : "🔇"}
      </span>
    </button>
  );
}
