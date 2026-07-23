// Backend API taban adresi. Coolify'da NEXT_PUBLIC_API_BASE ile ayarlanır.
// Boşsa aynı origin'in /api yolu kullanılır (tek domain arkasında proxy senaryosu).
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "";

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
}

export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { cache: "no-store" });
  if (!res.ok) throw new Error(`API hatası: ${res.status}`);
  return res.json() as Promise<T>;
}
