import type { Metadata } from "next";

import Logo from "@/components/Logo";
import PageBody from "@/components/PageBody";
import ContactForm from "@/components/ContactForm";
import { fetchPageContent } from "@/lib/pageContent";
import { pageMetadata } from "@/lib/seo";

// SEO: admin → "🔍 SEO" sekmesi (contact).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("contact");
}

// Metin admin panelinden düzenlenir (📄 Sayfalar → İletişim).
export const revalidate = 60;

export default async function IletisimPage() {
  const page = await fetchPageContent("iletisim");

  return (
    <main style={{ flex: 1, maxWidth: 720, width: "100%", margin: "0 auto", padding: "24px 20px 64px" }}>
      <div className="kt-mobile-only" style={{ marginBottom: 24 }}>
        <a href="/"><Logo size={36} /></a>
      </div>

      <h1 className="brand-mono" style={{ fontSize: 28, marginBottom: 18, textAlign: "center" }}>
        {page.title || "İletişim"}
      </h1>

      <div style={{ fontSize: 15, marginBottom: 28 }}>
        <PageBody body={page.body} />
      </div>

      <ContactForm />

      <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid var(--border-soft)" }}>
        <a href="/" style={{ color: "var(--accent)", fontWeight: 600 }}>← Ana sayfaya dön</a>
      </div>
    </main>
  );
}
