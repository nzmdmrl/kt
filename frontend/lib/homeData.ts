/**
 * Ana sayfa alt tabloları (bugünün ligi + son maçlar) — SUNUCU tarafında çekilir.
 *
 * Bu veriler eskiden yalnızca tarayıcıda çekiliyordu; gelene kadar bölüm hiç
 * render edilmediği için veri düştüğünde sayfa aşağı kayıyordu. Artık HTML
 * içinde hazır geliyor (kayma yok), HomeBoards ayrıca açılışta bir kez
 * tazeliyor (veri canlı kalıyor).
 */

import { serverApiUrl } from "@/lib/site";

export type HomeBoardsData = { matches: any[]; top: any[] };

export async function fetchHomeBoards(): Promise<HomeBoardsData> {
  const [m, d] = await Promise.all([
    fetch(serverApiUrl("/api/home/recent-matches"), { next: { revalidate: 30 } })
      .then((r) => (r.ok ? r.json() : { matches: [] }))
      .catch(() => ({ matches: [] })),
    fetch(serverApiUrl("/api/home/daily-top"), { next: { revalidate: 30 } })
      .then((r) => (r.ok ? r.json() : { top: [] }))
      .catch(() => ({ top: [] })),
  ]);
  return { matches: m.matches || [], top: d.top || [] };
}
