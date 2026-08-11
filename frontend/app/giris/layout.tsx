import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// Başlık/açıklama/paylaşım görseli: admin → "🔍 SEO" sekmesi (login).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("login");
}

export default function GirisLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
