import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// Google Play "hesap silme" politikası, uygulama DIŞINDAN da erişilebilen bir
// adres istiyor — bu sayfa o adres. SEO: admin → 🔍 SEO (account_delete).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("account_delete");
}

export default function HesapSilmeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
