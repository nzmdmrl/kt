import LegalPage from "@/components/LegalPage";
import PageBody from "@/components/PageBody";
import { fetchPageContent } from "@/lib/pageContent";

import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// SEO: admin → "🔍 SEO" sekmesi (how).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("how");
}

// İçerik admin panelinden düzenlenir (📄 Sayfalar → Nasıl Oynanır?).
export const revalidate = 60;

export default async function NasilOynanirPage() {
  const page = await fetchPageContent("nasil-oynanir");

  return (
    <LegalPage title={page.title || "Nasıl Oynanır?"}>
      <PageBody body={page.body} />

      <div style={{ marginTop: 30 }}>
        <a href="/oyna" style={{
          display: "inline-block", padding: "14px 28px", background: "var(--accent)",
          color: "#1a1330", borderRadius: 12, fontWeight: 700, fontFamily: "var(--font-display)",
        }}>Hemen Oyna →</a>
      </div>
    </LegalPage>
  );
}
