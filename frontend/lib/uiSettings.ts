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

// Arena oyun ekranı dikey boşlukları (admin → ⚙️ Ayarlar → Arena).
export type ArenaGaps = { wordLetters: number; lettersInput: number };
export const DEFAULT_ARENA_GAPS: ArenaGaps = { wordLetters: 28, lettersInput: 24 };

type Appearance = {
  match_name_max_len?: number;
  match_name_max_len_desktop?: number;
  arena_gap_word_letters?: number;
  arena_gap_letters_input?: number;
};

// Tüm public görünüm ayarları TEK istekte gelir; her tüketici aynı önbelleği kullanır.
let cachedAppearance: Appearance | null = null;
let inflight: Promise<Appearance> | null = null;

function fetchAppearance(): Promise<Appearance> {
  if (cachedAppearance) return Promise.resolve(cachedAppearance);
  if (!inflight) {
    inflight = getJSON<Appearance>("/api/home/appearance")
      .catch(() => ({} as Appearance))
      .then((v) => { cachedAppearance = v; inflight = null; return v; });
  }
  return inflight;
}

function fetchNameMax(): Promise<NameMax> {
  return fetchAppearance().then((d) => ({
    mobile: typeof d.match_name_max_len === "number" ? d.match_name_max_len : FALLBACK.mobile,
    desktop: typeof d.match_name_max_len_desktop === "number" ? d.match_name_max_len_desktop : FALLBACK.desktop,
  }));
}

/** Arena oyun ekranındaki iki dikey boşluk (px) — admin panelden ayarlanır. */
export function useArenaGaps(): ArenaGaps {
  const [gaps, setGaps] = useState<ArenaGaps>(DEFAULT_ARENA_GAPS);
  useEffect(() => {
    let alive = true;
    fetchAppearance().then((d) => {
      if (!alive) return;
      setGaps({
        wordLetters: typeof d.arena_gap_word_letters === "number" ? d.arena_gap_word_letters : DEFAULT_ARENA_GAPS.wordLetters,
        lettersInput: typeof d.arena_gap_letters_input === "number" ? d.arena_gap_letters_input : DEFAULT_ARENA_GAPS.lettersInput,
      });
    });
    return () => { alive = false; };
  }, []);
  return gaps;
}

/**
 * Ekran genişliğine göre geçerli sınır. SSR/ilk boyamada mobil değer kullanılır
 * (dar ekran güvenli taraf), mount sonrası gerçek genişliğe göre güncellenir.
 */
export function useMatchNameMax(): number {
  const [limits, setLimits] = useState<NameMax>(FALLBACK);
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
