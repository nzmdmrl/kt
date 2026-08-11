import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// Başlık/açıklama/paylaşım görseli: admin → "🔍 SEO" sekmesi (menu).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("menu");
}

export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
