"use client";

/**
 * İstemci tarafında okunan public arayüz ayarları (GET /api/home/appearance).
 *
 * Şimdilik tek kullanım: 1v1 tahmin satırının sağ üstündeki mini ad
 * etiketinin en fazla kaç karakter olacağı (admin → ⚙️ Ayarlar →
 * "Maçlarda görünen ad uzunluğu"). Ayar gelene kadar varsayılan kullanılır.
 */

import { useEffect, useState } from "react";
import { getJSON } from "./api";

export const DEFAULT_MATCH_NAME_MAX = 7;

let cached: number | null = null;
let inflight: Promise<number> | null = null;

function fetchMatchNameMax(): Promise<number> {
  if (cached != null) return Promise.resolve(cached);
  if (!inflight) {
    inflight = getJSON<{ match_name_max_len?: number }>("/api/home/appearance")
      .then((d) => (typeof d.match_name_max_len === "number" ? d.match_name_max_len : DEFAULT_MATCH_NAME_MAX))
      .catch(() => DEFAULT_MATCH_NAME_MAX)
      .then((n) => { cached = n; inflight = null; return n; });
  }
  return inflight;
}

export function useMatchNameMax(): number {
  const [n, setN] = useState<number>(cached ?? DEFAULT_MATCH_NAME_MAX);
  useEffect(() => {
    let alive = true;
    fetchMatchNameMax().then((v) => { if (alive) setN(v); });
    return () => { alive = false; };
  }, []);
  return n;
}

/** Ad etiketini kısalt: ilk kelime + en fazla `max` karakter, sonrası "…". */
export function shortMatchName(name: string, max: number): string {
  const first = (name || "").trim().split(" ")[0];
  if (!max || max <= 0 || first.length <= max) return first;
  return first.slice(0, max) + "…";
}
