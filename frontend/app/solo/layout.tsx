import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// Başlık/açıklama/paylaşım görseli: admin → "🔍 SEO" sekmesi (solo).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("solo");
}

export default function SoloLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
