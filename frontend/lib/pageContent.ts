/**
 * Admin panelinden düzenlenen sayfa içerikleri — SUNUCUDA çekilir (ISR).
 *
 * Backend'e ulaşılamazsa `FALLBACK` kullanılır; sayfa hiçbir durumda boş kalmaz.
 * İçeriğin kaynağı: backend/app/models/site_page.py (varsayılan) + DB kaydı.
 * Yayına yansıma: revalidate 60 sn (SEO metinleriyle aynı davranış).
 */

import { serverApiUrl } from "@/lib/site";

export type PageContent = { key: string; title: string; body: string };

const FALLBACK: Record<string, PageContent> = {
  hakkimizda: {
    key: "hakkimizda",
    title: "Hakkımızda",
    body:
      "Kelime Tahmin, Türkçenin en keyifli hâlini bir oyuna sığdırma fikrinden doğdu. " +
      "Kelime bulmacalarının tadını alıp karşına gerçek bir rakip koyuyoruz.",
  },
  iletisim: {
    key: "iletisim",
    title: "İletişim",
    body:
      "Sorun, öneri ya da iş birliği için aşağıdaki formu doldurabilirsin. " +
      "Mesajın doğrudan destek ekibimize ulaşır.",
  },
  "nasil-oynanir": {
    key: "nasil-oynanir",
    title: "Nasıl Oynanır?",
    body:
      "Kelime Tahmin, gerçek rakiplere karşı oynanan hızlı bir kelime düellosudur. " +
      "Amaç, gizli kelimeyi rakibinden önce bulmaktır.",
  },
};

export async function fetchPageContent(key: string): Promise<PageContent> {
  try {
    const res = await fetch(serverApiUrl(`/api/pages/${key}`), { next: { revalidate: 60 } });
    if (res.ok) {
      const d = await res.json();
      if (d?.body) return { key, title: d.title || "", body: d.body };
    }
  } catch {
    /* backend kapalıysa yedeğe düş */
  }
  return FALLBACK[key] || { key, title: "", body: "" };
}
