import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// Başlık/açıklama/paylaşım görseli: admin → "🔍 SEO" sekmesi (league).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("league");
}

export default function LigLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
