import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// Başlık/açıklama/paylaşım görseli: admin → "🔍 SEO" sekmesi (arena).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("arena");
}

export default function ArenaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
