"use client";

/**
 * "Ben robot değilim" kutusu (Google reCAPTCHA v2).
 *
 * Site key backend'den (/api/auth/captcha/status) gelir — RECAPTCHA_SITE_KEY env'i
 * boşsa bileşen hiçbir şey çizmez ve onToken(null) ile "gerekli değil" der.
 * Kayıt isteğine token eklenir, backend Google'a doğrulatır.
 */

import { useEffect, useRef, useState } from "react";
import { getJSON } from "@/lib/api";
import { effectiveTheme, onThemeChange } from "@/lib/theme";

const ONLOAD_CB = "__ktRecaptchaOnload";

declare global {
  interface Window {
    grecaptcha?: any;
    [ONLOAD_CB]?: () => void;
  }
}

let loadPromise: Promise<void> | null = null;

function loadRecaptcha(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.grecaptcha?.render) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    (window as any)[ONLOAD_CB] = () => resolve();
    const s = document.createElement("script");
    s.src = `https://www.google.com/recaptcha/api.js?onload=${ONLOAD_CB}&render=explicit&hl=tr`;
    s.async = true;
    s.defer = true;
    s.onerror = () => {
      loadPromise = null;
      reject(new Error("recaptcha"));
    };
    document.head.appendChild(s);
  });
  return loadPromise;
}

export type RecaptchaHandle = { reset: () => void };

export default function Recaptcha({
  onToken,
  onReady,
}: {
  /** Kutu işaretlenince token, süresi dolunca/iptalde null gelir. */
  onToken: (token: string | null) => void;
  /** Captcha kapalıysa false, açıksa true — form "gerekli mi" bilsin diye. */
  onReady?: (required: boolean) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<number | null>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Callback'leri ref'te tut — tema değişiminde widget yeniden kurulmasın.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    setTheme(effectiveTheme());
    return onThemeChange((_m, eff) => setTheme(eff));
  }, []);

  useEffect(() => {
    let alive = true;
    getJSON<{ configured: boolean; site_key: string | null }>("/api/auth/captcha/status")
      .then((d) => {
        if (!alive) return;
        if (d.configured && d.site_key) {
          setSiteKey(d.site_key);
          onReadyRef.current?.(true);
        } else {
          onReadyRef.current?.(false);
        }
      })
      .catch(() => {
        if (alive) onReadyRef.current?.(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!siteKey) return;
    let alive = true;
    loadRecaptcha()
      .then(() => {
        if (!alive || !hostRef.current || !window.grecaptcha?.render) return;
        // Tema değişiminde widget'ı sıfırdan kur (grecaptcha aynı kutuyu iki kez render edemez).
        hostRef.current.innerHTML = "";
        const box = document.createElement("div");
        hostRef.current.appendChild(box);
        widgetId.current = window.grecaptcha.render(box, {
          sitekey: siteKey,
          theme,
          hl: "tr",
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
        onTokenRef.current(null);
      })
      .catch(() => {
        if (alive) setErr("Doğrulama kutusu yüklenemedi. Sayfayı yenile.");
      });
    return () => {
      alive = false;
    };
  }, [siteKey, theme]);

  if (!siteKey) return null;

  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "center" }}>
      {/* reCAPTCHA kutusu 304px sabit — dar ekranda taşmasın diye ölçekle */}
      <div
        ref={hostRef}
        style={{ transformOrigin: "center", maxWidth: "100%", overflow: "hidden" }}
      />
      {err && <span style={{ fontSize: 13, color: "var(--accent-hot)" }}>{err}</span>}
    </div>
  );
}
