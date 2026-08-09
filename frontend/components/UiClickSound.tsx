"use client";

import { useEffect } from "react";
import { initSound, playSound, isUiClickSuppressed } from "@/lib/sound";

// Global arayüz tıklama sesi.
// Ana sayfa, menüler, lig, profil vb. yerlerde buton/link tıklamalarında kısa
// bir "tink" çalar. Maç ekranlarında (1v1, arena, maraton) suppressUiClick ile
// susturulur — oyunun kendi sesleri var.
//
// Admin "🔊 Sesler" sekmesinden `ui_click` slotuna mp3 yüklerse sentetik ses
// yerine o mp3 çalınır (lib/sound.ts playSound mantığı).

// Ses çalınacak öğeler. Herhangi bir öğeye `data-no-click-sound` koyulursa
// (kendisi veya bir üst öğesi) o alanda ses çalmaz.
const CLICKABLE =
  'button, a[href], [role="button"], summary, input[type="submit"], input[type="button"], [data-click-sound]';

export default function UiClickSound() {
  useEffect(() => {
    // Yüklü mp3 listesini al (yoksa sentetik sese düşer).
    initSound(true, 70);

    const onDown = (e: PointerEvent) => {
      if (isUiClickSuppressed()) return;
      const target = e.target as HTMLElement | null;
      if (!target || typeof target.closest !== "function") return;
      if (target.closest("[data-no-click-sound]")) return;
      const el = target.closest(CLICKABLE) as HTMLElement | null;
      if (!el) return;
      if ((el as HTMLButtonElement).disabled) return;
      if (el.getAttribute("aria-disabled") === "true") return;
      playSound("ui_click");
    };

    // pointerdown: anında geri bildirim; handler'lar propagation'ı durdursa bile
    // capture fazında yakalanır.
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, []);

  return null;
}
