import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// Başlık/açıklama/paylaşım görseli: admin → "🔍 SEO" sekmesi (duel).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("duel");
}

export default function OynaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
