"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Ticket = {
  id: number; code: string; subject: string; status: string; unread: boolean;
  messages: number; last: string; updated_at: string | null;
};

const STATUS_TR: Record<string, { label: string; color: string }> = {
  open: { label: "Yanıt bekliyor", color: "var(--accent)" },
  answered: { label: "Yanıtlandı", color: "var(--tile-correct)" },
  closed: { label: "Kapatıldı", color: "var(--text-dim)" },
};

/** Destek Taleplerim — açtığın biletler ve ekibin yanıtları. */
export default function DestekPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [list, setList] = useState<Ticket[] | null>(null);
  const [loadErr, setLoadErr] = useState("");

  function token() { return typeof window !== "undefined" ? localStorage.getItem("kt_token") : null; }

  // Uygulamada bildirimle açılışta ağ bazen hazır olmuyor ("Failed to fetch") —
  // ağ hatasında kısa aralıklarla yeniden denenir, sonra "Tekrar dene" çıkar.
  async function load(retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const r = await fetch(apiUrl("/api/support/my"), {
          headers: { Authorization: `Bearer ${token()}` },
          cache: "no-store",
        });
        if (!r.ok) { setLoadErr("Destek talepleri yüklenemedi."); return; }
        const d = await r.json();
        setList(d?.tickets || []); setLoadErr("");
        return;
      } catch {
        if (i < retries - 1) await new Promise((res) => setTimeout(res, 500 * (i + 1)));
      }
    }
    setLoadErr("Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.");
  }
  useEffect(() => { if (user) load(); }, [user]);

  // Silmek kaydı yok etmez: talep yalnız senin listenden kalkar, destek ekibi
  // yazışmayı görmeye devam eder (sunucu tarafında "üye sildi" işaretlenir).
  async function removeTicket(code: string) {
    if (!confirm("Bu destek talebi listenden kaldırılsın mı?")) return;
    await fetch(apiUrl(`/api/support/my/${encodeURIComponent(code)}`), {
      method: "DELETE", headers: { Authorization: `Bearer ${token()}` },
    });
    load();
  }

  if (loading) return <Wrap><Center>Yükleniyor…</Center></Wrap>;
  if (!user) {
    return (
      <Wrap>
        <Center>
          Destek taleplerini görmek için giriş yapmalısın.{" "}
          <a href="/giris" style={{ color: "var(--accent)", fontWeight: 700 }}>Giriş →</a>
        </Center>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <h1 className="brand-mono" style={{ fontSize: 24, margin: 0 }}>🎫 Destek Taleplerim</h1>
        <a href="/iletisim" style={{
          marginLeft: "auto", padding: "10px 16px", borderRadius: 10, textDecoration: "none",
          background: "var(--accent)", color: "#1a1330", fontWeight: 700, fontSize: 14,
        }}>Yeni talep</a>
      </div>

      {loadErr && (
        <div style={{ display: "grid", gap: 12, justifyItems: "center", padding: "24px 0", textAlign: "center", color: "var(--text-soft)" }}>
          <span>{loadErr}</span>
          <button onClick={() => { setLoadErr(""); load(); }} style={{
            padding: "11px 20px", borderRadius: 10, border: "none", cursor: "pointer",
            background: "var(--accent)", color: "#1a1330", fontWeight: 700, fontSize: 14,
          }}>Tekrar dene</button>
        </div>
      )}

      {list === null && !loadErr && <Center>Yükleniyor…</Center>}

      {list && list.length === 0 && !loadErr && (
        <p style={{ color: "var(--text-soft)", lineHeight: 1.7 }}>
          Henüz destek talebin yok. Bir sorun ya da önerin varsa{" "}
          <a href="/iletisim" style={{ color: "var(--accent)", fontWeight: 600 }}>İletişim</a>{" "}
          sayfasından talep açabilirsin.
        </p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {(list || []).map((t) => {
          const st = STATUS_TR[t.status] || STATUS_TR.open;
          return (
            <div key={t.id} onClick={() => router.push(`/destek/${t.code}`)} style={{
              textAlign: "left", cursor: "pointer", width: "100%", boxSizing: "border-box",
              background: "var(--bg-panel)", borderRadius: 14, padding: 16,
              border: `1px solid ${t.unread ? "var(--accent)" : "var(--border-soft)"}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ color: "var(--text-strong)", fontSize: 15.5 }}>{t.subject}</strong>
                {t.unread && (
                  <span style={{
                    fontSize: 11, fontWeight: 800, color: "#1a1330", background: "var(--accent)",
                    padding: "2px 8px", borderRadius: 20,
                  }}>YENİ YANIT</span>
                )}
                <span style={{ marginLeft: "auto", fontSize: 12, color: st.color, fontWeight: 700 }}>{st.label}</span>
                <button
                  title="Listemden kaldır"
                  onClick={(e) => { e.stopPropagation(); removeTicket(t.code); }}
                  style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0, cursor: "pointer",
                    border: "1px solid var(--border-soft)", background: "var(--bg-elevated)",
                    color: "var(--text-dim)", fontSize: 13, lineHeight: 1,
                  }}
                >✕</button>
              </div>
              <p style={{
                margin: "6px 0 0", color: "var(--text-dim)", fontSize: 13.5,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{t.last}</p>
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-dim)" }}>
                #{t.code} · {t.messages} mesaj
                {t.updated_at ? ` · ${new Date(t.updated_at).toLocaleDateString("tr-TR")}` : ""}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 32, paddingTop: 18, borderTop: "1px solid var(--border-soft)" }}>
        <a href="/" style={{ color: "var(--accent)", fontWeight: 600 }}>← Ana sayfaya dön</a>
      </div>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ flex: 1, maxWidth: 720, width: "100%", margin: "0 auto", padding: "24px 18px 60px" }}>
      <div className="kt-mobile-only" style={{ marginBottom: 18 }}><a href="/"><Logo size={32} /></a></div>
      {children}
    </main>
  );
}
function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", placeItems: "center", minHeight: "35vh", color: "var(--text-soft)", textAlign: "center" }}>{children}</div>;
}
