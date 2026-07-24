"use client";

import { useState, useEffect, useRef } from "react";
import { initSound, startMusic, stopMusic } from "@/lib/sound";

// Ana sayfa müzik kontrolü. Tarayıcı politikası gereği müzik ancak kullanıcı
// etkileşiminden sonra başlar; bu yüzden ilk tıklama/dokunmada başlatırız.
// Kullanıcı sağ alttaki düğmeyle sesi açıp kapatabilir.
export default function HomeMusic() {
  const [on, setOn] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    initSound(true, 70);
    // İlk kullanıcı etkileşiminde müziği başlat (autoplay engeline takılmamak için).
    const kick = () => {
      if (started.current) return;
      started.current = true;
      startMusic();
      setOn(true);
      window.removeEventListener("pointerdown", kick);
    };
    window.addEventListener("pointerdown", kick);
    return () => { window.removeEventListener("pointerdown", kick); stopMusic(); };
  }, []);

  function toggle() {
    if (on) { stopMusic(); setOn(false); }
    else { startMusic(); setOn(true); started.current = true; }
  }

  return (
    <button
      onClick={toggle}
      aria-label={on ? "Müziği kapat" : "Müziği aç"}
      style={{
        position: "fixed", bottom: 18, right: 18, zIndex: 50,
        width: 46, height: 46, borderRadius: "50%",
        border: "1px solid var(--border-soft)", background: "var(--bg-panel)",
        cursor: "pointer", fontSize: 20, display: "grid", placeItems: "center",
        boxShadow: "var(--shadow-soft)",
      }}
    >
      {on ? "🔊" : "🔈"}
    </button>
  );
}
