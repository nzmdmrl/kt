"use client";

import { useState, useEffect } from "react";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * İletişim formu — mesaj destek adresine iletilir (POST /api/contact).
 * Üye girişi ŞART DEĞİL; giriş yapılmışsa ad/e-posta hazır gelir.
 */
export default function ContactForm() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  // Giriş yapmış kullanıcıda alanları önden doldur (kullanıcı değiştirebilir).
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
      const r = await fetch(apiUrl("/api/contact"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name, email, subject, message }),
      });
      if (r.ok) {
        setDone(true);
        setSubject(""); setMessage("");
      } else {
        const d = await r.json().catch(() => null);
        setErr(d?.detail || "Mesaj gönderilemedi. Lütfen tekrar dene.");
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
        <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
        <h2 className="brand-mono" style={{ fontSize: 20, margin: "0 0 8px" }}>Mesajın bize ulaştı</h2>
        <p style={{ color: "var(--text-soft)", fontSize: 14.5, lineHeight: 1.6, margin: 0 }}>
          En kısa sürede yanıtlayacağız. Yanıtı yazdığın e-posta adresine göndereceğiz.
        </p>
        <button onClick={() => setDone(false)} style={{
          marginTop: 16, padding: "11px 20px", borderRadius: 10, cursor: "pointer",
          border: "1px solid var(--border-soft)", background: "var(--bg-elevated)",
          color: "var(--text-soft)", fontWeight: 600, fontSize: 14,
        }}>Yeni mesaj yaz</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{
      display: "grid", gap: 12,
      background: "var(--bg-panel)", border: "1px solid var(--border-soft)",
      borderRadius: 14, padding: 18,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <label style={labelStyle}>
          Adın
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80}
            placeholder="Adın" required style={inputStyle} />
        </label>
        <label style={labelStyle}>
          E-posta adresin
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={160}
            placeholder="ornek@eposta.com" required style={inputStyle} />
        </label>
      </div>

      <label style={labelStyle}>
        Konu
        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160}
          placeholder="Kısaca konu" style={inputStyle} />
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
      }}>{busy ? "Gönderiliyor…" : "Mesajı Gönder"}</button>

      <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0, lineHeight: 1.6 }}>
        Formu gönderdiğinde adın, e-posta adresin ve mesajın destek ekibimize iletilir;
        yalnızca talebini yanıtlamak için kullanılır.
      </p>
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
