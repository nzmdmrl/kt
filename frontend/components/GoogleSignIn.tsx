"use client";

/**
 * Google ile giriş butonu — İKİ AYRI YOL, tek bileşen.
 *
 *  WEB (tarayıcı): Google Identity Services betiği yüklenir, Google'ın kendi
 *  butonu çizilir, dönen id_token /api/auth/google'a gider. (Değişmedi.)
 *
 *  UYGULAMA (Capacitor): Google gömülü WebView'da OAuth'a izin vermediği için
 *  GIS betiği HİÇ YÜKLENMEZ ("google servisi yüklenemedi" hatasının sebebi buydu).
 *  Onun yerine cihazın native hesap seçicisi açılır (lib/nativeGoogle.ts) ve
 *  dönen id_token /api/auth/google/native'e gider.
 *
 * İki yol da aynı yanıtı alır ({token, user}) ve aynı applyAuth'tan geçer; giriş
 * sonrası kullanıcı aynı yere düşer (onDone). Uygulama yolunda hata çıkarsa kısa
 * bir Türkçe mesaj basılır ve e-posta/şifre girişi ekranda durmaya devam eder.
 *
 * Uygulama tarafındaki client id app_settings'ten gelir
 * ('app.flags'.google_web_client_id → /api/app-config); boşsa buton çizilmez.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getJSON } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAppConfig, type FlagsConfig } from "@/lib/appConfig";
import { usePlatform } from "@/lib/platform";
import { effectiveTheme, onThemeChange } from "@/lib/theme";

const GSI_SRC = "https://accounts.google.com/gsi/client";

declare global {
  interface Window {
    google?: any;
  }
}

function loadGsi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("gsi")));
    });
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("gsi"));
    document.head.appendChild(s);
  });
}

export type GoogleButtonText = "signin_with" | "signup_with" | "continue_with";

export default function GoogleSignIn({
  onDone,
  text = "continue_with",
}: {
  onDone?: () => void;
  /** Buton yazısı: signin_with | signup_with | continue_with */
  text?: GoogleButtonText;
}) {
  const { isNative, ready } = usePlatform();

  // Platform tespiti ilk effect'te olur; o ana kadar hiçbir şey çizilmez —
  // uygulamada bir an için web butonunun belirip kaybolması olmasın.
  if (!ready) return null;
  return isNative ? (
    <GoogleSignInNative onDone={onDone} text={text} />
  ) : (
    <GoogleSignInWeb onDone={onDone} text={text} />
  );
}

// ---------------------------------------------------------------- UYGULAMA

/** Uygulamadaki buton yazısı (GIS'in signin_with/signup_with karşılığı). */
const NATIVE_LABEL: Record<GoogleButtonText, string> = {
  signin_with: "Google ile giriş yap",
  signup_with: "Google ile kaydol",
  continue_with: "Google ile devam et",
};

function GoogleSignInNative({
  onDone,
  text,
}: {
  onDone?: () => void;
  text: GoogleButtonText;
}) {
  const { loginGoogleNative } = useAuth();
  const config = useAppConfig();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const flags: FlagsConfig = (config?.["app.flags"] as FlagsConfig) || {};
  const clientId = (flags.google_web_client_id || "").trim();

  const start = useCallback(async () => {
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      // Eklenti YALNIZCA burada, dinamik olarak yüklenir.
      const { nativeGoogleSignIn } = await import("@/lib/nativeGoogle");
      const out = await nativeGoogleSignIn(clientId);

      if (out.status === "cancelled") return;        // sessizce vazgeçildi
      if (out.status === "no-account") {
        setErr("Cihazda Google hesabı bulunamadı. Telefon ayarlarından hesap ekleyip tekrar dene.");
        return;
      }
      if (out.status === "error") {
        setErr("Google girişi açılamadı. E-posta ve şifrenle girebilirsin.");
        return;
      }

      // Buradan sonrası web akışıyla aynı: token saklanır, kullanıcı yazılır ve
      // oturum değiştiği için NativeBootstrap bekleyen push token'ını kaydeder.
      await loginGoogleNative(out.idToken);
      onDone?.();
    } catch (e: any) {
      setErr(e?.message || "Google girişi başarısız.");
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  }, [busy, clientId, loginGoogleNative, onDone]);

  // Kimlik girilmemişse (admin panelde boş) buton hiç çizilmez.
  if (!clientId) return null;

  return (
    <div style={{ display: "grid", gap: 8, justifyItems: "center", width: "100%" }}>
      <button
        onClick={start}
        disabled={busy}
        style={{
          width: "100%",
          maxWidth: 320,
          minHeight: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          padding: "12px 16px",
          borderRadius: 10,
          border: "1px solid var(--border-soft)",
          background: "var(--bg-elevated)",
          color: "var(--text-strong)",
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 15,
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.6 : 1,
        }}
      >
        <GoogleMark />
        {busy ? "Giriş yapılıyor…" : NATIVE_LABEL[text]}
      </button>
      {err && (
        <span style={{ fontSize: 13, color: "var(--accent-hot)", textAlign: "center" }}>{err}</span>
      )}
    </div>
  );
}

/** Google "G" logosu — dış istek olmasın diye satır içi SVG. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

// ---------------------------------------------------------------- WEB (GIS)

function GoogleSignInWeb({
  onDone,
  text,
}: {
  onDone?: () => void;
  text: GoogleButtonText;
}) {
  const { loginGoogle } = useAuth();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Tema değişince butonu yeniden çizmek için takip et.
  useEffect(() => {
    setTheme(effectiveTheme());
    return onThemeChange((_m, eff) => setTheme(eff));
  }, []);

  // Yapılandırma + client id
  useEffect(() => {
    let alive = true;
    getJSON<{ configured: boolean; client_id: string | null }>("/api/auth/google/status")
      .then((d) => {
        if (alive && d.configured && d.client_id) setClientId(d.client_id);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Script yükle + butonu çiz
  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    loadGsi()
      .then(() => {
        if (!alive || !boxRef.current || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (resp: { credential?: string }) => {
            if (!resp?.credential) return;
            setErr("");
            setBusy(true);
            try {
              await loginGoogle(resp.credential);
              onDone?.();
            } catch (e: any) {
              setErr(e?.message || "Google girişi başarısız");
            } finally {
              if (alive) setBusy(false);
            }
          },
        });
        boxRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(boxRef.current, {
          type: "standard",
          theme: theme === "light" ? "outline" : "filled_black",
          size: "large",
          shape: "rectangular",
          text,
          logo_alignment: "left",
          width: 320,
          locale: "tr",
        });
      })
      .catch(() => {
        if (alive) setErr("Google servisi yüklenemedi.");
      });
    return () => {
      alive = false;
    };
  }, [clientId, theme, text, loginGoogle, onDone]);

  if (!clientId) return null;

  return (
    <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
      <div ref={boxRef} style={{ minHeight: 44, opacity: busy ? 0.5 : 1 }} />
      {busy && <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Giriş yapılıyor…</span>}
      {err && <span style={{ fontSize: 13, color: "var(--accent-hot)" }}>{err}</span>}
    </div>
  );
}
