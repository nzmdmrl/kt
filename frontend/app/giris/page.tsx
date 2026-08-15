"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getJSON } from "@/lib/api";
import Logo from "@/components/Logo";
import GoogleSignIn from "@/components/GoogleSignIn";
import Recaptcha from "@/components/Recaptcha";
import AlertPopup from "@/components/AlertPopup";

export default function GirisPage() {
  const { user, login, register, loading } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Kayıtta şifre iki kez yazılıp doğrulanır.
  const [password2, setPassword2] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  // "Ben robot değilim" — sadece e-posta ile kayıtta. captchaRequired backend'den gelir.
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Artınca kutu sıfırdan kurulur — token tek kullanımlık, hatalı denemeden sonra tazelenmeli.
  const [captchaKey, setCaptchaKey] = useState(0);
  // Görünen ad karakter limiti (admin panelinden ayarlanır) + hata popup'ı.
  const [nameLimits, setNameLimits] = useState({ display_name_min_len: 2, display_name_max_len: 24 });
  const [popup, setPopup] = useState("");

  useEffect(() => {
    getJSON<{ display_name_min_len: number; display_name_max_len: number }>("/api/account/limits")
      .then((d) => setNameLimits((p) => ({ ...p, ...d })))
      .catch(() => {});
  }, []);

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

  // Giriş/kayıt arasında geçişte tekrar alanı kalmasın.
  useEffect(() => { setPassword2(""); }, [mode]);

  async function submit() {
    setErr("");
    setBusy(true);
    try {
      if (mode === "register") {
        const name = displayName.trim().replace(/\s+/g, " ");
        const { display_name_min_len: lo, display_name_max_len: hi } = nameLimits;
        if (!name) throw new Error("Bir görünen ad gir");
        if (name.length < lo) throw new Error(`Görünen ad en az ${lo} karakter olmalı (girdiğin: ${name.length}).`);
        if (name.length > hi) throw new Error(`Görünen ad en fazla ${hi} karakter olabilir (girdiğin: ${name.length}).`);
        if (!password) throw new Error("Bir şifre gir");
        if (password !== password2) throw new Error("Şifreler birbiriyle uyuşmuyor");
        if (captchaRequired && !captchaToken)
          throw new Error("Lütfen 'Ben robot değilim' kutusunu işaretle");
        await register(email, password, displayName, captchaToken);
      } else {
        await login(email, password);
      }
      router.push("/");
    } catch (e: any) {
      const m = e.message || "Bir hata oluştu";
      setErr(m);
      setPopup(m);   // hatayı popup olarak da göster (gözden kaçmasın)
      // Kullanılan captcha token'ı yanar; kutuyu tazele.
      if (mode === "register" && captchaRequired) {
        setCaptchaToken(null);
        setCaptchaKey((k) => k + 1);
      }
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
              onClick={() => { setMode(m); setErr(""); setCaptchaToken(null); }}
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
          {mode === "register" && (
            <p style={{ fontSize: 12, color: displayName.trim().length > nameLimits.display_name_max_len ? "var(--accent-hot)" : "var(--text-dim)", marginTop: -8 }}>
              {nameLimits.display_name_min_len}-{nameLimits.display_name_max_len} karakter
              {" · "}{displayName.trim().length}/{nameLimits.display_name_max_len}
            </p>
          )}
          <Field label="E-posta" value={email} onChange={setEmail} type="email" placeholder="ornek@eposta.com" />
          <Field
            label="Şifre"
            value={password}
            onChange={setPassword}
            type="password"
            placeholder="••••••"
            onEnter={mode === "register" ? undefined : submit}
          />

          {mode === "register" && (
            <>
              <Field
                label="Şifre (tekrar)"
                value={password2}
                onChange={setPassword2}
                type="password"
                placeholder="••••••"
                onEnter={submit}
              />
              {password2.length > 0 && (
                <p style={{
                  fontSize: 12, marginTop: -8,
                  color: password === password2 ? "var(--tile-correct)" : "var(--accent-hot)",
                }}>
                  {password === password2 ? "✓ Şifreler eşleşiyor" : "Şifreler birbiriyle uyuşmuyor"}
                </p>
              )}
            </>
          )}

          {mode === "register" && (
            <Recaptcha
              key={captchaKey}
              onToken={setCaptchaToken}
              onReady={setCaptchaRequired}
            />
          )}

          {err && <p style={{ color: "var(--accent-hot)", fontSize: 14 }}>{err}</p>}

          {(() => {
            // Kayıtta şifreler eşleşmeden buton çalışmaz.
            const pwMismatch = mode === "register" && (!password || password !== password2);
            return (
              <button onClick={submit} disabled={busy || pwMismatch} style={{ ...primaryBtn, opacity: busy || pwMismatch ? 0.55 : 1, cursor: busy || pwMismatch ? "default" : "pointer" }}>
                {busy ? "..." : mode === "login" ? "Giriş Yap" : "Hesap Oluştur"}
              </button>
            );
          })()}

          {mode === "register" && (
            <p style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", lineHeight: 1.5 }}>
              Hesap oluşturarak{" "}
              <a href="/kosullar" style={{ color: "var(--accent)" }}>Kullanım Koşulları</a> ve{" "}
              <a href="/gizlilik" style={{ color: "var(--accent)" }}>Gizlilik Politikası</a>&apos;nı
              kabul etmiş olursunuz.
            </p>
          )}

          {googleConfigured && (
            <>
              <Divider />
              <GoogleSignIn
                text={mode === "register" ? "signup_with" : "signin_with"}
                onDone={() => router.push("/")}
              />
            </>
          )}
        </div>

        <a href="/oyna" style={{ color: "var(--text-dim)", fontSize: 14 }}>
          Üye olmadan dene →
        </a>
      </div>
      {popup && <AlertPopup message={popup} onClose={() => setPopup("")} />}
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
