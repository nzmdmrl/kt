// Site adresi ve sunucu tarafı API adresi (OG/metadata üretimi için).
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.kelimetahmin.com").replace(/\/$/, "");

/** Sunucuda (generateMetadata) çağrılabilen mutlak API adresi. */
export function serverApiUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_API_BASE || SITE_URL).replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Tarayıcıda paylaşım linki üretir (origin bilinmiyorsa SITE_URL). */
export function shareUrl(path: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : SITE_URL;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
