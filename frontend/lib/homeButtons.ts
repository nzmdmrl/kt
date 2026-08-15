/**
 * Ana sayfa buton görünümü (ikon · arka plan ikonu · renk).
 *
 * Admin → 🏠 Ana Sayfa sekmesinden düzenlenir. Değerler SUNUCUDA çekilip
 * HomeModes'a prop olarak verilir (ISR 60 sn) — istemcide titreme olmaz.
 *
 * DEFAULTS mevcut tasarımın birebir aynısıdır ve backend'e ulaşılamazsa
 * kullanılır (backend/app/models/home_button.py ile birlikte güncellenmeli).
 * `bg` boşsa buton rengi globals.css'teki varsayılan kalır — 1v1 hero butonu
 * ve ikili kartlar (bot/oda) bilerek boştur.
 */

import { serverApiUrl } from "@/lib/site";

export type HomeButtonCfg = { icon: string; deco_icon: string; bg: string };
export type HomeButtons = Record<string, HomeButtonCfg>;

export const HOME_BUTTON_DEFAULTS: HomeButtons = {
  arena: { icon: "⚔️", deco_icon: "", bg: "linear-gradient(145deg,#e0940a,#c47a00)" },
  custom_arena: { icon: "🎪", deco_icon: "", bg: "linear-gradient(145deg,#7b52c4,#5e3a9e)" },
  marathon: { icon: "🏃", deco_icon: "", bg: "linear-gradient(145deg,#4a8fc4,#2e6da8)" },
  duel: { icon: "🎮", deco_icon: "", bg: "" },
  bot: { icon: "🤖", deco_icon: "", bg: "" },
  room: { icon: "🚪", deco_icon: "", bg: "" },
  daily: { icon: "📅", deco_icon: "", bg: "linear-gradient(145deg,#c44a7e,#a23763)" },
  league: { icon: "🏆", deco_icon: "", bg: "linear-gradient(145deg,#3a7fc4,#2868a8)" },
};

export async function fetchHomeButtons(): Promise<HomeButtons> {
  try {
    const r = await fetch(serverApiUrl("/api/home/buttons"), { next: { revalidate: 60 } });
    if (r.ok) {
      const d = await r.json();
      const out: HomeButtons = { ...HOME_BUTTON_DEFAULTS };
      for (const [key, v] of Object.entries((d.buttons || {}) as Record<string, any>)) {
        out[key] = {
          icon: v?.icon || HOME_BUTTON_DEFAULTS[key]?.icon || "",
          deco_icon: v?.deco_icon || "",
          bg: v?.bg || "",
        };
      }
      return out;
    }
  } catch {}
  return HOME_BUTTON_DEFAULTS;
}
