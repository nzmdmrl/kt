import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// Başlık/açıklama/paylaşım görseli: admin → "🔍 SEO" sekmesi (notification_settings).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("notification_settings");
}

export default function BildirimAyarlariLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
