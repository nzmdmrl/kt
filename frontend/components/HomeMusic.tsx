"use client";

import { useEffect, useRef } from "react";
import { initSound, startMusic, stopMusic, isSoundEnabled, onSoundChange } from "@/lib/sound";

// Ana sayfa müzik başlatıcı (görünmez). Tarayıcı autoplay politikası gereği
// müzik ancak kullanıcı etkileşiminden sonra başlar; ilk tıklamada başlatırız.
// Ses aç/kapa kontrolü TopBar'daki SoundToggle'da. Burada ses açılınca (ana
// sayfadayken) müziği yeniden başlatır, kapanınca durdururuz.
export default function HomeMusic() {
  const started = useRef(false);
  const interacted = useRef(false);

  useEffect(() => {
    initSound(true, 70);
    const kick = () => {
      interacted.current = true;
      if (started.current) return;
      started.current = true;
      if (isSoundEnabled()) startMusic();
    };
    window.addEventListener("pointerdown", kick);

    // Ses toggle değişince: açıldıysa müziği başlat (etkileşim olmuşsa), kapandıysa durdur.
    const off = onSoundChange((on) => {
      if (on && interacted.current) startMusic();
      else if (!on) stopMusic();
    });

    return () => { window.removeEventListener("pointerdown", kick); off(); stopMusic(); };
  }, []);

  return null;
}
