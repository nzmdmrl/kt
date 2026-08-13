"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";
import Logo from "@/components/Logo";
import { formatDate, parseBody, type Announcement } from "@/lib/announcements";

export default function DuyuruPage({ params }: { params: { slug: string } }) {
  const [ann, setAnn] = useState<Announcement | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(apiUrl(`/api/announcements/${encodeURIComponent(params.slug)}`), { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error("404"); return r.json(); })
      .then((d) => { if (alive) setAnn(d); })
      .catch(() => { if (alive) setNotFound(true); });
    return () => { alive = false; };
  }, [params.slug]);

  return (
    <Wrap>
      <a href="/duyurular" style={{ color: "var(--text-soft)", fontSize: 14, display: "inline-block", marginBottom: 16 }}>
        ← Tüm duyurular
      </a>

      {notFound ? (
        <p style={{ color: "var(--text-dim)", textAlign: "center", padding: 40 }}>Duyuru bulunamadı.</p>
      ) : !ann ? (
        <p style={{ color: "var(--text-dim)", textAlign: "center", padding: 40 }}>Yükleniyor…</p>
      ) : (
        <article>
          <h1 className="brand-mono" style={{ fontSize: 24, lineHeight: 1.3, marginBottom: 8 }}>{ann.title}</h1>
          <div style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 18 }}>{formatDate(ann.published_at)}</div>
          {ann.summary && (
            <p style={{
              color: "var(--text-soft)", fontSize: 15, lineHeight: 1.5, marginBottom: 18,
              paddingLeft: 12, borderLeft: "3px solid var(--accent)",
            }}>{ann.summary}</p>
          )}
          {/* Düz metin: satır sonları pre-wrap ile korunur, URL'ler bağlantıya çevrilir. */}
          <div style={{
            color: "var(--text-strong)", fontSize: 15, lineHeight: 1.65,
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {parseBody(ann.body).map((p, i) =>
              p.type === "link" ? (
                <a key={i} href={p.href} target="_blank" rel="noopener noreferrer"
                  style={{ color: "var(--accent)", textDecoration: "underline" }}>{p.label}</a>
              ) : (
                <span key={i}>{p.value}</span>
              )
            )}
          </div>
        </article>
      )}
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 18px 40px", minHeight: "60vh" }}>
      <div className="kt-mobile-only" style={{ marginBottom: 16 }}><a href="/"><Logo size={32} /></a></div>
      {children}
    </main>
  );
}
