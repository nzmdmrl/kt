"use client";

/**
 * Web push (FCM) — tarayıcı tarafı.
 *
 * KURAL: enableWebPush() YALNIZCA kullanıcı tıklamasından çağrılabilir.
 * Sayfa açılışında çağrılırsa tarayıcı izin kutusunu ya reddeder ya da
 * kullanıcı "engelle" der ve bir daha sorulamaz.
 *
 * firebase paketi SADECE dinamik import() ile yüklenir — ana pakete girmez,
 * bildirim açmayan kullanıcı tek byte indirmez.
 */

import { apiUrl } from "./api";

export type WebPushStatus =
  | "ok"             // token alındı ve kaydedildi
  | "native"         // uygulama içindeyiz: web push kullanılmaz (native token gelecek)
  | "unsupported"    // tarayıcı desteklemiyor
  | "ios-needs-pwa"  // iOS Safari: önce ana ekrana eklenmeli
  | "denied"         // kullanıcı/tarayıcı engelledi
  | "no-config"      // Firebase ayarları admin panelinde boş
  | "error";

export type WebPushResult = { status: WebPushStatus; message?: string };

const SW_PATH = "/firebase-messaging-sw.js";

type FirebaseWebConfig = {
  apiKey?: string; projectId?: string; appId?: string; messagingSenderId?: string;
};

// ---------------------------------------------------------------- ortam tespiti

function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (ua.includes("KelimeApp/")) return true;
  try {
    return (window as any).Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

function isIOS(): boolean {
  const ua = navigator.userAgent || "";
  // iPadOS 13+ kendini "Macintosh" olarak tanıtır; dokunmatik nokta sayısıyla ayrılır.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    (window.navigator as any).standalone === true ||
    window.matchMedia?.("(display-mode: standalone)")?.matches === true
  );
}

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

/** Tarayıcı ve işletim sisteminden okunabilir cihaz adı: "Chrome · Windows". */
export function deviceLabel(): string {
  const ua = navigator.userAgent || "";
  let browser = "Tarayıcı";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/SamsungBrowser/.test(ua)) browser = "Samsung Internet";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua)) browser = "Safari";

  let os = "";
  if (/Windows/.test(ua)) os = "Windows";
  else if (/Android/.test(ua)) os = "Android";
  else if (isIOS()) os = "iOS";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";

  return (os ? `${browser} · ${os}` : browser).slice(0, 80);
}

/**
 * İzin kutusu AÇMADAN mevcut durumu söyler — ayar sayfasındaki satır için.
 */
export function currentWebPushStatus(): WebPushStatus {
  if (typeof window === "undefined") return "unsupported";
  if (isNativeApp()) return "native";
  if (!supported()) return "unsupported";
  if (isIOS() && !isStandalone()) return "ios-needs-pwa";
  const p = Notification.permission;
  if (p === "denied") return "denied";
  if (p === "granted") return "ok";
  return "error";   // "default" — henüz sorulmadı; arayüz bunu "kapalı" gösterir
}

// ---------------------------------------------------------------- yapılandırma

async function fetchFirebaseConfig(): Promise<{ web: FirebaseWebConfig; vapid: string } | null> {
  try {
    const r = await fetch(apiUrl("/api/app-config?platform=web"), { cache: "no-store" });
    if (!r.ok) return null;
    const d = await r.json();
    const fb = d?.config?.["push.firebase"] || {};
    const web: FirebaseWebConfig = fb.web || {};
    const vapid: string = fb.vapid_key || "";
    if (!web.apiKey || !web.projectId || !web.appId || !web.messagingSenderId || !vapid) return null;
    return { web, vapid };
  } catch {
    return null;
  }
}

function swUrl(web: FirebaseWebConfig): string {
  const q = new URLSearchParams({
    apiKey: web.apiKey || "",
    projectId: web.projectId || "",
    appId: web.appId || "",
    messagingSenderId: web.messagingSenderId || "",
  });
  return `${SW_PATH}?${q.toString()}`;
}

// ---------------------------------------------------------------- ana akış

/**
 * Bu tarayıcıda push bildirimlerini açar. SADECE kullanıcı tıklamasından çağır.
 */
export async function enableWebPush(): Promise<WebPushResult> {
  try {
    if (isNativeApp()) return { status: "native" };
    if (!supported()) {
      return { status: "unsupported", message: "Bu tarayıcı bildirimleri desteklemiyor." };
    }
    if (isIOS() && !isStandalone()) {
      return {
        status: "ios-needs-pwa",
        message: "iPhone/iPad'de bildirim için önce Paylaş → “Ana Ekrana Ekle” ile uygulamayı ekle.",
      };
    }
    if (Notification.permission === "denied") {
      return { status: "denied" };
    }

    const cfg = await fetchFirebaseConfig();
    if (!cfg) {
      return { status: "no-config", message: "Bildirim altyapısı henüz yapılandırılmamış." };
    }

    // İzin: tıklama bağlamında sorulur.
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { status: "denied" };

    const reg = await navigator.serviceWorker.register(swUrl(cfg.web), { scope: "/" });
    await navigator.serviceWorker.ready;

    // firebase SADECE burada, dinamik olarak yüklenir.
    const [{ initializeApp, getApps, getApp }, { getMessaging, getToken, onMessage }] =
      await Promise.all([import("firebase/app"), import("firebase/messaging")]);

    const options = {
      apiKey: cfg.web.apiKey!,
      authDomain: `${cfg.web.projectId}.firebaseapp.com`,
      projectId: cfg.web.projectId!,
      messagingSenderId: cfg.web.messagingSenderId!,
      appId: cfg.web.appId!,
    };
    const app = getApps().length ? getApp() : initializeApp(options);
    const messaging = getMessaging(app);

    const token = await getToken(messaging, {
      vapidKey: cfg.vapid,
      serviceWorkerRegistration: reg,
    });
    if (!token) return { status: "error", message: "Bildirim anahtarı alınamadı." };

    const jwt = localStorage.getItem("kt_token");
    const res = await fetch(apiUrl("/api/devices/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ token, platform: "web", device_label: deviceLabel() }),
    });
    if (!res.ok) return { status: "error", message: "Cihaz kaydedilemedi." };

    // Sekme açıkken gelen bildirim: sistem bildirimi değil, hafif iç uyarı.
    onMessage(messaging, (payload: any) => {
      const n = payload?.notification || {};
      showToast(n.title || "Kelime Tahmin", n.body || "", payload?.data?.route);
    });

    return { status: "ok" };
  } catch (e: any) {
    return { status: "error", message: e?.message || "Bilinmeyen hata" };
  }
}

// ---------------------------------------------------------------- iç uyarı (toast)

/** Bağımlılıksız, tek seferlik hafif bildirim kutusu. */
export function showToast(title: string, body: string, route?: string) {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.setAttribute("role", "status");
  el.style.cssText = [
    "position:fixed",
    "left:50%",
    "transform:translateX(-50%)",
    "bottom:calc(90px + env(safe-area-inset-bottom, 0px))",
    "z-index:900",
    "max-width:min(420px, calc(100vw - 24px))",
    "padding:12px 16px",
    "border-radius:12px",
    "background:var(--bg-panel, #171331)",
    "border:1px solid var(--accent, #ffb020)",
    "color:var(--text-strong, #f5f3ff)",
    "box-shadow:0 8px 28px rgba(0,0,0,.35)",
    "font-size:14px",
    "line-height:1.4",
    "cursor:" + (route ? "pointer" : "default"),
    "opacity:0",
    "transition:opacity .2s ease",
  ].join(";");

  const t = document.createElement("div");
  t.style.cssText = "font-weight:700;margin-bottom:2px";
  t.textContent = `🔔 ${title}`;
  el.appendChild(t);
  if (body) {
    const b = document.createElement("div");
    b.style.cssText = "color:var(--text-soft, #b4acd8);font-size:13px";
    b.textContent = body;
    el.appendChild(b);
  }
  if (route) el.addEventListener("click", () => { window.location.href = route; });

  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = "1"; });
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 250);
  }, 5000);
}
