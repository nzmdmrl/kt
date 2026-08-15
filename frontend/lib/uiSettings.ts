"use client";

/**
 * İstemci tarafında okunan public arayüz ayarları (GET /api/home/appearance).
 *
 * Kullanım: 1v1'de görünen oyuncu adının (skor barı + tahmin satırı etiketi)
 * en fazla kaç karakter olacağı. Mobil ve masaüstü AYRI ayarlanır:
 * admin → ⚙️ Ayarlar → "Maçlarda görünen ad — MOBİL / MASAÜSTÜ".
 * Ayar gelene kadar varsayılan kullanılır.
 */

import { useEffect, useState } from "react";
import { getJSON } from "./api";

export const DEFAULT_MATCH_NAME_MAX = 7;          // mobil
export const DEFAULT_MATCH_NAME_MAX_DESKTOP = 14; // masaüstü

// globals.css ile aynı kırılım noktası: 721px ve üzeri masaüstü sayılır.
const DESKTOP_MIN_WIDTH = 721;

type NameMax = { mobile: number; desktop: number };
const FALLBACK: NameMax = { mobile: DEFAULT_MATCH_NAME_MAX, desktop: DEFAULT_MATCH_NAME_MAX_DESKTOP };

let cached: NameMax | null = null;
let inflight: Promise<NameMax> | null = null;

function fetchNameMax(): Promise<NameMax> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = getJSON<{ match_name_max_len?: number; match_name_max_len_desktop?: number }>("/api/home/appearance")
      .then((d) => ({
        mobile: typeof d.match_name_max_len === "number" ? d.match_name_max_len : FALLBACK.mobile,
        desktop: typeof d.match_name_max_len_desktop === "number" ? d.match_name_max_len_desktop : FALLBACK.desktop,
      }))
      .catch(() => FALLBACK)
      .then((v) => { cached = v; inflight = null; return v; });
  }
  return inflight;
}

/**
 * Ekran genişliğine göre geçerli sınır. SSR/ilk boyamada mobil değer kullanılır
 * (dar ekran güvenli taraf), mount sonrası gerçek genişliğe göre güncellenir.
 */
export function useMatchNameMax(): number {
  const [limits, setLimits] = useState<NameMax>(cached ?? FALLBACK);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchNameMax().then((v) => { if (alive) setLimits(v); });

    const mq = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);
    const apply = () => { if (alive) setIsDesktop(mq.matches); };
    apply();
    mq.addEventListener("change", apply);
    return () => { alive = false; mq.removeEventListener("change", apply); };
  }, []);

  return isDesktop ? limits.desktop : limits.mobile;
}

/**
 * Ad etiketini kısalt: ilk kelime + en fazla `max` karakter, sonrası "…".
 *
 * BÜYÜK harfler daha geniş yer kapladığı için sınır yazım şekline göre değişir:
 *   - hepsi BÜYÜK yazılmış adlar (ör. "MUSTAFA")      -> `max` karakter (7)
 *   - normal/küçük yazılmış adlar (ör. "Mustafa")     -> `max + 2` karakter (9)
 * Böylece etiket genişliği iki durumda da yaklaşık aynı kalır.
 */
export function shortMatchName(name: string, max: number): string {
  const first = (name || "").trim().split(" ")[0];
  if (!max || max <= 0) return first;
  const allCaps = first === first.toLocaleUpperCase("tr") && first !== first.toLocaleLowerCase("tr");
  const limit = allCaps ? max : max + 2;
  if (first.length <= limit) return first;
  return first.slice(0, limit) + "…";
}
