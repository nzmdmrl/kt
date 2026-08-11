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

    const onClick = (e: MouseEvent) => {
      if (isUiClickSuppressed()) return;
      const target = e.target as HTMLElement | null;
      if (!target || typeof target.closest !== "function") return;
      if (target.closest("[data-no-click-sound]")) return;
      const el = target.closest(CLICKABLE) as HTMLElement | null;
      if (!el) return;
      // Pasif öğede ses yok.
      if ((el as HTMLButtonElement).disabled) return;
      if (el.getAttribute("aria-disabled") === "true") return;
      if (el.hasAttribute("data-disabled")) return;
      if (el.closest("fieldset[disabled]")) return;
      try {
        const cs = getComputedStyle(el);
        if (cs.pointerEvents === "none" || cs.cursor === "not-allowed") return;
      } catch {}
      playSound("ui_click");
    };

    // click: sadece gerçekten tıklanan (basıp aynı öğede bırakılan) öğede çalar.
    // pointerdown kullanılmıyordu -> basılı tutup kaydırmada ve pasif butonlarda
    // (disabled öğe click üretmez ama pointerdown'ı üst öğeye hedefler) yanlış ses
    // çıkıyordu. Capture fazı: handler'lar propagation'ı durdursa bile yakalanır.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
