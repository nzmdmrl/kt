import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// Başlık/açıklama/paylaşım görseli: admin → "🔍 SEO" sekmesi (announcements).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("announcements");
}

export default function DuyurularLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
