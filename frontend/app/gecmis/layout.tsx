import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// Başlık/açıklama/paylaşım görseli: admin → "🔍 SEO" sekmesi (history).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("history");
}

export default function GecmisLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
