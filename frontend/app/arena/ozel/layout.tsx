import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// Başlık/açıklama/paylaşım görseli: admin → "🔍 SEO" sekmesi (custom_arena).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("custom_arena");
}

export default function OzelArenaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
