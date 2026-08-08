"use client";

import { useEffect, useState } from "react";
import { initSound } from "@/lib/sound";
import { useSectionMusic } from "@/lib/useSectionMusic";

// Ana sayfa müziği — "home" havuzundan rastgele çalar (fade geçişli).
// Tarayıcı autoplay politikası gereği ilk kullanıcı etkileşiminden sonra başlar.
export default function HomeMusic() {
  const [interacted, setInteracted] = useState(false);

  useEffect(() => {
    initSound(true, 70);
    const kick = () => setInteracted(true);
    window.addEventListener("pointerdown", kick, { once: true });
    window.addEventListener("keydown", kick, { once: true });
    return () => {
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
    };
  }, []);

  useSectionMusic("home", interacted);
  return null;
}
