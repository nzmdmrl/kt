"use client";

import { useEffect, useState } from "react";
import { getJSON } from "@/lib/api";
import Logo from "@/components/Logo";
import { formatDate, type AnnouncementListItem } from "@/lib/announcements";

type Payload = { announcements: AnnouncementListItem[]; page: number; pages: number; total: number };

export default function DuyurularPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let alive = true;
    getJSON<Payload>(`/api/announcements?page=${page}`)
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData({ announcements: [], page: 1, pages: 1, total: 0 }); });
    return () => { alive = false; };
  }, [page]);

  const items = data?.announcements || [];

  return (
    <Wrap>
      <h1 className="brand-mono" style={{ fontSize: 26, marginBottom: 6 }}>📢 Duyurular</h1>
      <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 22 }}>
        Yenilikler, güncellemeler ve etkinlikler.
      </p>

      {!data ? (
        <p style={{ color: "var(--text-dim)", textAlign: "center", padding: 40 }}>Yükleniyor…</p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--text-dim)", textAlign: "center", padding: 40 }}>Henüz duyuru yok.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((a) => (
            <a key={a.id} href={`/duyurular/${a.slug}`} style={{
              display: "block", padding: "14px 16px", background: "var(--bg-panel)",
              borderRadius: 12, border: "1px solid var(--border-soft)",
              textDecoration: "none", boxShadow: "0 1px 3px rgba(0,0,0,.15)",
            }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-strong)", lineHeight: 1.35 }}>{a.title}</div>
              {a.summary && (
                <div style={{ color: "var(--text-soft)", fontSize: 14, marginTop: 5, lineHeight: 1.45 }}>{a.summary}</div>
              )}
              <div style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 8 }}>{formatDate(a.published_at)}</div>
            </a>
          ))}
        </div>
      )}

      {data && data.pages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 22 }}>
          <PageBtn disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Önceki</PageBtn>
          <span style={{ color: "var(--text-dim)", fontSize: 13 }}>{data.page} / {data.pages}</span>
          <PageBtn disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Sonraki →</PageBtn>
        </div>
      )}
    </Wrap>
  );
}

function PageBtn({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "8px 14px", fontSize: 13, fontWeight: 600, borderRadius: 9,
      background: "var(--bg-elevated)", color: disabled ? "var(--text-dim)" : "var(--text-strong)",
      border: "1px solid var(--border-soft)", cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
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
