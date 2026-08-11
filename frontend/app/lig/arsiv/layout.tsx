import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// Başlık/açıklama/paylaşım görseli: admin → "🔍 SEO" sekmesi (league_archive).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("league_archive");
}

export default function LigArsivLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
