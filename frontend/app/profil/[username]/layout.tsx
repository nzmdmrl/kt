import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// Profil sayfası — başlık oyuncu adıyla kişiselleşir, geri kalanı admin →
// "🔍 SEO" sekmesindeki "Oyuncu Profili" kaydından gelir.
export async function generateMetadata({ params }: { params: { username: string } }): Promise<Metadata> {
  const name = decodeURIComponent(params.username || "");
  return pageMetadata("profile", {
    titlePrefix: name || undefined,
    path: `/profil/${params.username}`,
  });
}

export default function ProfilLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
