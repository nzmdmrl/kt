import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// Başlık/açıklama/paylaşım görseli: admin → "🔍 SEO" sekmesi (support).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("support");
}

export default function DestekLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
