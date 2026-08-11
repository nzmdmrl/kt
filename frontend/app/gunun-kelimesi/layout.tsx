import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// Başlık/açıklama/paylaşım görseli: admin → "🔍 SEO" sekmesi (daily).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("daily");
}

export default function GununKelimesiLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
