import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { fetchSeoAll } from "@/lib/seo";

// /sitemap.xml — SEO tanımlarındaki indexlenebilir sayfalardan üretilir.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { pages } = await fetchSeoAll();
  const now = new Date();
  return pages
    .filter((p) => p.indexable && p.path && p.path !== "/profil")
    .map((p) => ({
      url: `${SITE_URL}${p.path}`,
      lastModified: now,
      changeFrequency: p.path === "/" || p.path === "/gunun-kelimesi" ? "daily" : "weekly",
      priority: p.priority,
    }));
}
