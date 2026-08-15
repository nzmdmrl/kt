"use client";

/**
 * Misafir (üye olmayan ziyaretçi) erişim izinleri.
 *
 * Admin → ⚙️ Ayarlar → "Misafir" grubundaki anahtarlar belirler:
 *   guest_match_enabled / guest_arena_enabled / guest_daily_enabled
 * Backend: GET /api/home/guest-access (public). Sunucu tarafı da aynı ayarlara
 * bakar — bu değerler yalnızca ekranı şekillendirir, güvenlik sınırı değildir.
 */

import { useEffect, useState } from "react";
import { getJSON } from "./api";

export type GuestAccess = { match: boolean; arena: boolean; daily: boolean };

/** Backend'e ulaşılamazsa: misafir serbest (backend varsayılanıyla aynı). */
const DEFAULT: GuestAccess = { match: true, arena: true, daily: true };

let cached: GuestAccess | null = null;
let inflight: Promise<GuestAccess> | null = null;

export function fetchGuestAccess(): Promise<GuestAccess> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = getJSON<Partial<GuestAccess>>("/api/home/guest-access")
      .then((d) => ({
        match: d.match !== false,
        arena: d.arena !== false,
        daily: d.daily !== false,
      }))
      .catch(() => DEFAULT)
      .then((a) => { cached = a; inflight = null; return a; });
  }
  return inflight;
}

/** Ayar gelene kadar `null` döner — ekran "yükleniyor" gösterebilsin. */
export function useGuestAccess(): GuestAccess | null {
  const [access, setAccess] = useState<GuestAccess | null>(cached);
  useEffect(() => {
    if (cached) { setAccess(cached); return; }
    let alive = true;
    fetchGuestAccess().then((a) => { if (alive) setAccess(a); });
    return () => { alive = false; };
  }, []);
  return access;
}

/** Misafirin tarayıcıya sabitlenmiş oyuncu anahtarı (1v1 ile ortak). */
export function guestId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("kt_player_id");
  if (!id) {
    id = "p_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("kt_player_id", id);
  }
  return id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);
}

/** Arenada misafirin sunucudaki pid'i (backend: 'g' + temizlenmiş gid). */
export function guestPid(): string {
  const g = guestId();
  return g ? `g${g}` : "";
}

/** Misafirin son kullandığı görünen ad (1v1 ekranıyla ortak anahtar). */
export function savedGuestName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("kt_name") || "";
}

export function saveGuestName(name: string) {
  if (typeof window !== "undefined") localStorage.setItem("kt_name", name);
}
