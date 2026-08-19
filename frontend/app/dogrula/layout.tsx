import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// Başlık/açıklama: admin → "🔍 SEO" sekmesi (verify).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("verify");
}

export default function DogrulaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
