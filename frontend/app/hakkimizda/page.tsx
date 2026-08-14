import type { Metadata } from "next";

import Logo from "@/components/Logo";
import AboutLogo from "@/components/AboutLogo";
import PageBody from "@/components/PageBody";
import { fetchPageContent } from "@/lib/pageContent";
import { pageMetadata } from "@/lib/seo";

// SEO: admin → "🔍 SEO" sekmesi (about).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("about");
}

// İçerik admin panelinden düzenlenir (📄 Sayfalar → Hakkımızda).
export const revalidate = 60;

export default async function HakkimizdaPage() {
  const page = await fetchPageContent("hakkimizda");

  return (
    <main style={{ flex: 1, maxWidth: 720, width: "100%", margin: "0 auto", padding: "24px 20px 64px" }}>
      <div className="kt-mobile-only" style={{ marginBottom: 24 }}>
        <a href="/"><Logo size={36} /></a>
      </div>

      {/* Kare, animasyonlu logo — sayfanın en başında */}
      <AboutLogo />

      <h1 className="brand-mono" style={{ fontSize: 28, marginBottom: 18, textAlign: "center" }}>
        {page.title || "Hakkımızda"}
      </h1>

      <div style={{ fontSize: 15 }}>
        <PageBody body={page.body} />
      </div>

      <div style={{ marginTop: 36, display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <a href="/oyna" style={{
          display: "inline-block", padding: "14px 28px", background: "var(--accent)",
          color: "#1a1330", borderRadius: 12, fontWeight: 700, fontFamily: "var(--font-display)",
        }}>Hemen Oyna →</a>
        <a href="/nasil-oynanir" style={{
          display: "inline-block", padding: "14px 28px", background: "var(--bg-elevated)",
          color: "var(--text-strong)", border: "1px solid var(--border-soft)",
          borderRadius: 12, fontWeight: 700, fontFamily: "var(--font-display)",
        }}>Nasıl Oynanır?</a>
      </div>

      <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid var(--border-soft)" }}>
        <a href="/" style={{ color: "var(--accent)", fontWeight: 600 }}>← Ana sayfaya dön</a>
      </div>
    </main>
  );
}
