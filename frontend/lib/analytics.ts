"use client";

/**
 * Google Analytics 4 + çerez tercihi yönetimi.
 *
 * Model: "bant + varsayılan açık" (opt-out). Ziyaretçi bir karar verene kadar
 * ölçüm çalışır; "Reddet" derse GA anında durdurulur ve sonraki ziyaretlerde
 * hiç yüklenmez. Tercih localStorage'da (kt_cookie_consent) saklanır.
 *
 * GA_ID boşsa (env girilmemişse) hiçbir script yüklenmez — geliştirme ortamı
 * ve önizleme dağıtımları kirlenmesin.
 */

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "";

export const CONSENT_KEY = "kt_cookie_consent";

export type Consent = "accepted" | "rejected" | null;

export function getConsent(): Consent {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "accepted" || v === "rejected" ? v : null;
  } catch {
    return null;
  }
}

/** Reddedilmediyse ölçüm çalışır (varsayılan açık). */
export function analyticsAllowed(): boolean {
  return Boolean(GA_ID) && getConsent() !== "rejected";
}

/** GA'yı anında durdurur — script yüklüyse bile veri göndermez. */
function disableGa() {
  if (typeof window === "undefined" || !GA_ID) return;
  (window as any)[`ga-disable-${GA_ID}`] = true;
}

function enableGa() {
  if (typeof window === "undefined" || !GA_ID) return;
  (window as any)[`ga-disable-${GA_ID}`] = false;
}

export function setConsent(value: Exclude<Consent, null>) {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {}
  if (value === "rejected") disableGa();
  else enableGa();
  notify();
}

// --- tercih değişikliğini dinleyenler (bant ve ayar ekranı) ---
type Listener = (c: Consent) => void;
const listeners = new Set<Listener>();

export function onConsentChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  const c = getConsent();
  listeners.forEach((fn) => fn(c));
}

/** Bandı yeniden göstermek için tercihi sıfırlar (çerez sayfasındaki buton). */
export function resetConsent() {
  try {
    localStorage.removeItem(CONSENT_KEY);
  } catch {}
  enableGa();
  notify();
}

/** GA4'e olay gönder. Ölçüm kapalıysa sessizce yok sayılır. */
export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || !analyticsAllowed()) return;
  (window as any).gtag?.("event", name, params || {});
}
