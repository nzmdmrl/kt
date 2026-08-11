import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// Başlık/açıklama/paylaşım görseli: admin → "🔍 SEO" sekmesi (notifications).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("notifications");
}

export default function BildirimlerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
