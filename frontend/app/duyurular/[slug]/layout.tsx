import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { fetchAnnouncement } from "@/lib/announcements";

// Duyuru sayfası — başlık/açıklama duyurunun kendisinden gelir; duyuru
// bulunamazsa admin → "🔍 SEO" sekmesindeki "Duyurular" kaydına düşer.
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const ann = await fetchAnnouncement(params.slug);
  return pageMetadata("announcements", {
    title: ann?.title || undefined,
    description: ann?.summary || undefined,
    path: `/duyurular/${params.slug}`,
    noindex: !ann,
  });
}

export default function DuyuruLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
