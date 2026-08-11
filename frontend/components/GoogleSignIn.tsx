"use client";

/**
 * Google ile giriş butonu (Google Identity Services).
 *
 * Client ID backend'den (/api/auth/google/status) gelir — GOOGLE_CLIENT_ID env'i
 * ayarlı değilse bileşen hiçbir şey çizmez. Kullanıcı butona basınca Google bir
 * id_token döndürür, onu /api/auth/google'a gönderip JWT alırız (lib/auth.tsx).
 */

import { useEffect, useRef, useState } from "react";
import { getJSON } from "@/lib/api";
import { useAuth } from "@/lib/auth";
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

export default function GoogleSignIn({
  onDone,
  text = "continue_with",
}: {
  onDone?: () => void;
  /** Buton yazısı: signin_with | signup_with | continue_with */
  text?: "signin_with" | "signup_with" | "continue_with";
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
