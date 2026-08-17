"use client";

import { useState, useEffect } from "react";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Destek talebi formu — e-posta göndermez, DESTEK BİLETİ açar.
 *
 * Üye açtığında yazışma "Destek Taleplerim" (/destek) altında sürer: ekip
 * yanıtlayınca bildirim gelir, üye bileti açıp okur ve tekrar yazabilir.
 * Misafir de bilet açabilir (ad + e-posta ister) ama yanıtı uygulama içinden
 * okuyamaz — bu yüzden giriş yapması önerilir.
 */
export default function SupportForm() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: number; linked: boolean } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!user) return;
    setName((v) => v || user.display_name || "");
    setEmail((v) => v || user.email || "");
  }, [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("kt_token") : null;
      const r = await fetch(apiUrl("/api/support/tickets"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name, email, subject, message }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        setDone({ id: d?.id ?? 0, linked: !!d?.linked });
        setSubject(""); setMessage("");
      } else {
        setErr(d?.detail || "Destek talebi oluşturulamadı. Lütfen tekrar dene.");
      }
    } catch {
      setErr("Sunucuya ulaşılamadı. Lütfen tekrar dene.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div style={{
        background: "var(--bg-panel)", border: "1px solid var(--tile-correct)",
        borderRadius: 14, padding: 24, textAlign: "center",
      }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🎫</div>
        <h2 className="brand-mono" style={{ fontSize: 20, margin: "0 0 8px" }}>
          Destek talebin oluşturuldu {done.id ? `(#${done.id})` : ""}
        </h2>
        <p style={{ color: "var(--text-soft)", fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>
          {done.linked
            ? "Ekibimiz yanıtladığında bildirim göndereceğiz. Yanıtı “Destek Taleplerim” sayfasından okuyup tekrar yazabilirsin."
            : "Talebini aldık. Yanıtı uygulama içinden okuyabilmen için üye girişi yapman gerekir; giriş yaparak açacağın talepler hesabına bağlanır."}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
          {done.linked && (
            <a href="/destek" style={{
              padding: "12px 20px", borderRadius: 10, textDecoration: "none",
              background: "var(--accent)", color: "#1a1330", fontWeight: 700, fontSize: 14,
            }}>Destek Taleplerim</a>
          )}
          <button onClick={() => setDone(null)} style={{
            padding: "12px 20px", borderRadius: 10, cursor: "pointer",
            border: "1px solid var(--border-soft)", background: "var(--bg-elevated)",
            color: "var(--text-soft)", fontWeight: 600, fontSize: 14,
          }}>Yeni talep aç</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{
      display: "grid", gap: 12,
      background: "var(--bg-panel)", border: "1px solid var(--border-soft)",
      borderRadius: 14, padding: 18,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 className="brand-mono" style={{ fontSize: 18, margin: 0 }}>🎫 Destek talebi aç</h2>
        {user && (
          <a href="/destek" style={{ marginLeft: "auto", fontSize: 13.5, color: "var(--accent)", fontWeight: 600 }}>
            Destek Taleplerim →
          </a>
        )}
      </div>

      {!user && (
        <p style={{
          margin: 0, fontSize: 13, color: "var(--text-soft)", lineHeight: 1.6,
          background: "var(--bg-elevated)", border: "1px solid var(--border-soft)",
          borderRadius: 10, padding: "10px 12px",
        }}>
          <a href="/giris" style={{ color: "var(--accent)", fontWeight: 700 }}>Giriş yaparsan</a> yanıtı
          uygulama içinden okuyabilir ve yazışmayı sürdürebilirsin.
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <label style={labelStyle}>
          Adın
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80}
            placeholder="Adın" required style={inputStyle} />
        </label>
        <label style={labelStyle}>
          E-posta adresin
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={160}
            placeholder="ornek@eposta.com" required={!user} style={inputStyle} />
        </label>
      </div>

      <label style={labelStyle}>
        Konu
        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160}
          placeholder="Kısaca konu" required style={inputStyle} />
      </label>

      <label style={labelStyle}>
        Mesajın
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} rows={7}
          placeholder="Yaşadığın sorunu ya da önerini olabildiğince açık yaz."
          required style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6, fontFamily: "var(--font-body)" }} />
        <span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 400 }}>{message.length}/4000</span>
      </label>

      {err && <p style={{ color: "var(--accent-hot)", fontSize: 14, margin: 0 }}>{err}</p>}

      <button type="submit" disabled={busy} style={{
        padding: "14px", borderRadius: 12, border: "none", cursor: busy ? "default" : "pointer",
        background: "var(--accent)", color: "#1a1330", fontWeight: 800, fontSize: 16,
        fontFamily: "var(--font-display)", opacity: busy ? 0.6 : 1,
      }}>{busy ? "Gönderiliyor…" : "Talebi Gönder"}</button>
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--text-soft)",
};
const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10,
  border: "1px solid var(--border-soft)", background: "var(--bg-elevated)",
  color: "var(--text-strong)", fontSize: 15, fontFamily: "var(--font-body)",
};
