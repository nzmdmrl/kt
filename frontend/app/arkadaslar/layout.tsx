import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// Başlık/açıklama/paylaşım görseli: admin → "🔍 SEO" sekmesi (friends).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("friends");
}

export default function ArkadaslarLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
