"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getJSON } from "@/lib/api";
import Logo from "@/components/Logo";

export default function GirisPage() {
  const { user, login, register, loading } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState(false);

  // Zaten girişliyse ana sayfaya
  useEffect(() => {
    if (!loading && user) router.push("/");
  }, [user, loading, router]);

  // Google yapılandırılmış mı?
  useEffect(() => {
    getJSON<{ configured: boolean }>("/api/auth/google/status")
      .then((d) => setGoogleConfigured(d.configured))
      .catch(() => setGoogleConfigured(false));
  }, []);

  async function submit() {
    setErr("");
    setBusy(true);
    try {
      if (mode === "register") {
        if (!displayName.trim()) throw new Error("Bir görünen ad gir");
        await register(email, password, displayName);
      } else {
        await login(email, password);
      }
      router.push("/");
    } catch (e: any) {
      setErr(e.message || "Bir hata oluştu");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ flex: 1, maxWidth: 400, width: "100%", margin: "0 auto", padding: "40px 20px" }}>
      <div style={{ display: "grid", gap: 24, justifyItems: "center" }}>
        <a href="/">
          <Logo size={46} />
        </a>

        {/* Sekme */}
        <div style={{ display: "flex", gap: 4, background: "var(--bg-panel)", padding: 4, borderRadius: 12 }}>
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setErr(""); }}
              style={{
                padding: "8px 20px",
                borderRadius: 9,
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: 15,
                background: mode === m ? "var(--accent)" : "transparent",
                color: mode === m ? "#1a1330" : "var(--text-soft)",
              }}
            >
              {m === "login" ? "Giriş" : "Kayıt"}
            </button>
          ))}
        </div>

        <div style={{ width: "100%", display: "grid", gap: 14 }}>
          {mode === "register" && (
            <Field
              label="Görünen ad"
              value={displayName}
              onChange={setDisplayName}
              placeholder="Oyunda görünecek adın"
            />
          )}
          <Field label="E-posta" value={email} onChange={setEmail} type="email" placeholder="ornek@eposta.com" />
          <Field
            label="Şifre"
            value={password}
            onChange={setPassword}
            type="password"
            placeholder="••••••"
            onEnter={submit}
          />

          {err && <p style={{ color: "var(--accent-hot)", fontSize: 14 }}>{err}</p>}

          <button onClick={submit} disabled={busy} style={primaryBtn}>
            {busy ? "..." : mode === "login" ? "Giriş Yap" : "Hesap Oluştur"}
          </button>

          {googleConfigured && (
            <>
              <Divider />
              <div id="google-login-hint" style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
                Google ile giriş yakında bu ekranda.
              </div>
            </>
          )}
        </div>

        <a href="/oyna" style={{ color: "var(--text-dim)", fontSize: 14 }}>
          Üye olmadan dene →
        </a>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  onEnter,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  onEnter?: () => void;
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 13, color: "var(--text-soft)", marginBottom: 6 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: 10,
          border: "2px solid var(--tile-border)",
          background: "var(--bg-elevated)",
          color: "var(--text-strong)",
          fontSize: 16,
          fontFamily: "var(--font-body)",
        }}
      />
    </div>
  );
}

function Divider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-dim)" }}>
      <span style={{ flex: 1, height: 1, background: "var(--border-soft)" }} />
      veya
      <span style={{ flex: 1, height: 1, background: "var(--border-soft)" }} />
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  width: "100%",
  padding: "13px 0",
  borderRadius: 10,
  border: "none",
  background: "var(--accent)",
  color: "#1a1330",
  fontWeight: 700,
  fontSize: 16,
  cursor: "pointer",
  fontFamily: "var(--font-display)",
};
