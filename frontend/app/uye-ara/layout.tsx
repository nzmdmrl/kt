import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// Başlık/açıklama/paylaşım görseli: admin → "🔍 SEO" sekmesi (member_search).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("member_search");
}

export default function UyeAraLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
