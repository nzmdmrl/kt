"use client";

import { useEffect, useState } from "react";
import Logo from "@/components/Logo";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Msg = { id: number; sender: "user" | "admin"; body: string; created_at: string | null };
type Ticket = { id: number; subject: string; status: string; created_at: string | null };

const STATUS_TR: Record<string, { label: string; color: string }> = {
  open: { label: "Yanıt bekliyor", color: "var(--accent)" },
  answered: { label: "Yanıtlandı", color: "var(--tile-correct)" },
  closed: { label: "Kapatıldı", color: "var(--text-dim)" },
};

/** Tek destek talebinin yazışması — yanıtı oku, tekrar yaz. */
export default function DestekDetayPage({ params }: { params: { id: string } }) {
  const { user, loading } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notFound, setNotFound] = useState(false);

  function token() { return typeof window !== "undefined" ? localStorage.getItem("kt_token") : null; }

  function load() {
    fetch(apiUrl(`/api/support/my/${params.id}`), { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setTicket(d.ticket); setMsgs(d.messages || []); })
      .catch(() => setNotFound(true));
  }
  useEffect(() => { if (user) load(); }, [user, params.id]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy || reply.trim().length < 2) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch(apiUrl(`/api/support/my/${params.id}/reply`), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ message: reply }),
      });
      if (r.ok) { setReply(""); load(); }
      else {
        const d = await r.json().catch(() => null);
        setErr(d?.detail || "Yanıt gönderilemedi.");
      }
    } catch {
      setErr("Sunucuya ulaşılamadı.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Wrap><Center>Yükleniyor…</Center></Wrap>;
  if (!user) {
    return <Wrap><Center>Bu sayfa için giriş yapmalısın. <a href="/giris" style={{ color: "var(--accent)", fontWeight: 700 }}>Giriş →</a></Center></Wrap>;
  }
  if (notFound) return <Wrap><Center>Destek talebi bulunamadı.</Center></Wrap>;
  if (!ticket) return <Wrap><Center>Yükleniyor…</Center></Wrap>;

  const st = STATUS_TR[ticket.status] || STATUS_TR.open;

  return (
    <Wrap>
      <a href="/destek" style={{ color: "var(--text-soft)", fontSize: 14 }}>← Destek Taleplerim</a>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0 4px", flexWrap: "wrap" }}>
        <h1 className="brand-mono" style={{ fontSize: 22, margin: 0 }}>{ticket.subject}</h1>
        <span style={{ marginLeft: "auto", fontSize: 12.5, color: st.color, fontWeight: 700 }}>{st.label}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 18 }}>
        Talep #{ticket.id}
        {ticket.created_at ? ` · ${new Date(ticket.created_at).toLocaleString("tr-TR")}` : ""}
      </div>

      <div style={{ display: "grid", gap: 10, marginBottom: 22 }}>
        {msgs.map((m) => {
          const mine = m.sender === "user";
          return (
            <div key={m.id} style={{
              justifySelf: mine ? "end" : "start", maxWidth: "88%",
              background: mine ? "var(--bg-elevated)" : "var(--bg-panel)",
              border: `1px solid ${mine ? "var(--border-soft)" : "var(--accent)"}`,
              borderRadius: 14, padding: "12px 14px",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: mine ? "var(--text-dim)" : "var(--accent)", marginBottom: 4 }}>
                {mine ? "Sen" : "🎧 Destek ekibi"}
                {m.created_at ? ` · ${new Date(m.created_at).toLocaleString("tr-TR")}` : ""}
              </div>
              <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--text-strong)", fontSize: 14.5, lineHeight: 1.65 }}>
                {m.body}
              </p>
            </div>
          );
        })}
      </div>

      {ticket.status === "closed" ? (
        <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>
          Bu talep kapatıldı. Yeni bir konu için{" "}
          <a href="/iletisim" style={{ color: "var(--accent)", fontWeight: 600 }}>yeni talep</a> açabilirsin.
        </p>
      ) : (
        <form onSubmit={send} style={{ display: "grid", gap: 10 }}>
          <textarea
            value={reply} onChange={(e) => setReply(e.target.value)} rows={5} maxLength={4000}
            placeholder="Yanıtını yaz…"
            style={{
              width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12,
              border: "1px solid var(--border-soft)", background: "var(--bg-elevated)",
              color: "var(--text-strong)", fontSize: 15, fontFamily: "var(--font-body)",
              lineHeight: 1.6, resize: "vertical",
            }}
          />
          {err && <p style={{ color: "var(--accent-hot)", fontSize: 14, margin: 0 }}>{err}</p>}
          <button type="submit" disabled={busy || reply.trim().length < 2} style={{
            padding: "13px", borderRadius: 12, border: "none",
            background: "var(--accent)", color: "#1a1330", fontWeight: 800, fontSize: 15,
            fontFamily: "var(--font-display)",
            cursor: busy || reply.trim().length < 2 ? "default" : "pointer",
            opacity: busy || reply.trim().length < 2 ? 0.5 : 1,
          }}>{busy ? "Gönderiliyor…" : "Yanıtla"}</button>
        </form>
      )}
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
