/**
 * Duyuru yardımcıları.
 *
 * Gövde DÜZ METİN olarak saklanır (backend HTML kabul etmez). Render ederken
 * satır sonları korunur ve çıplak URL'ler bağlantıya çevrilir — markdown
 * kütüphanesi yok, dangerouslySetInnerHTML yok.
 */

import { serverApiUrl } from "@/lib/site";

export type AnnouncementListItem = {
  id: number;
  slug: string;
  title: string;
  summary: string;
  published_at: string | null;
};

export type Announcement = AnnouncementListItem & { body: string };

/** Sunucuda (generateMetadata) tek duyuruyu çeker; yoksa null. */
export async function fetchAnnouncement(slug: string): Promise<Announcement | null> {
  try {
    const r = await fetch(serverApiUrl(`/api/announcements/${encodeURIComponent(slug)}`), {
      next: { revalidate: 60 },
    });
    if (!r.ok) return null;
    return (await r.json()) as Announcement;
  } catch {
    return null;
  }
}

/** "13 Ağustos 2026" */
const TR_AYLAR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getDate()} ${TR_AYLAR[d.getMonth()]} ${d.getFullYear()}`;
}

/** Çıplak URL yakalayıcı (http/https veya www. ile başlayan). */
const URL_RE = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/g;

export type BodyPart = { type: "text"; value: string } | { type: "link"; href: string; label: string };

/**
 * Düz metni parçalara ayırır: düz yazı + bağlantı.
 * Satır sonları parçalanmaz — render tarafı `white-space: pre-wrap` kullanır.
 */
export function parseBody(body: string): BodyPart[] {
  const out: BodyPart[] = [];
  let last = 0;
  const text = body || "";
  for (const m of text.matchAll(URL_RE)) {
    const raw = m[0];
    const start = m.index ?? 0;
    // Cümle sonundaki noktalama bağlantıya dahil olmasın: "...com." -> "...com"
    const trimmed = raw.replace(/[.,;:!?)\]]+$/, "");
    if (start > last) out.push({ type: "text", value: text.slice(last, start) });
    out.push({
      type: "link",
      href: trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed,
      label: trimmed,
    });
    last = start + trimmed.length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}
