/**
 * Arka plan (gökyüzü) görünüm ayarı — SUNUCU tarafında okunur.
 *
 * Eskiden bu ayar tarayıcıda fetch ile alınıyordu: sayfa açılınca önce normal
 * zemin boyanıyor, ayar gelince <html data-nightbg> ekleniyor ve zemin
 * "transparent" oluyordu. Animasyon katmanı boyanana kadar geçen o anda
 * tarayıcının kendi BEYAZ zemini görünüyordu (yenilemede beyaz flaş).
 *
 * Artık ayar sunucuda okunup <html data-sky="..."> olarak HTML'e basılıyor ve
 * gökyüzü gradyanı CSS'te tanımlı (globals.css). Böylece daha ilk boyamada
 * doğru zemin var; JS/ağ beklenmiyor.
 */

import { serverApiUrl } from "@/lib/site";

/**
 * `style` = arayüz stili: "stil1" (klasik görünüm) veya "stil2" (yeni görünüm).
 * Admin → ⚙️ Ayarlar → "Arayüz stili" ile değiştirilir; <html data-style="..."> olarak
 * basılır ve globals.css'teki [data-style="stil2"] blokları devreye girer.
 */
export type UiStyle = "stil1" | "stil2";
export type Appearance = { enabled: boolean; theme: string; style: UiStyle };

/** Backend'e ulaşılamazsa varsayılan (backend/app/models/game_setting.py ile aynı). */
const DEFAULT: Appearance = { enabled: true, theme: "night", style: "stil2" };

export async function fetchAppearance(): Promise<Appearance> {
  try {
    // Ayar admin panelinden nadiren değişir; 60 sn'lik tazelik yeterli.
    const r = await fetch(serverApiUrl("/api/home/appearance"), { next: { revalidate: 60 } });
    if (r.ok) {
      const d = await r.json();
      return {
        enabled: !!d.night_bg_enabled,
        theme: d.night_bg_theme || "night",
        style: d.ui_style === "stil1" ? "stil1" : "stil2",
      };
    }
  } catch {}
  return DEFAULT;
}
