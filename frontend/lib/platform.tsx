"use client";

/**
 * Çalışma ortamı (platform) tespiti — web mi, native uygulama mı?
 *
 * Site Capacitor kabuğunda (mobile/) bir WebView içinde açıldığında aynı HTML
 * servis edilir; ayrım SADECE TARAYICIDA yapılabilir:
 *   - Kök layout ISR (revalidate=60) ile üretiliyor ve middleware YOK, yani
 *     sunucuda User-Agent'a bakmak mümkün değil (aynı HTML herkese cache'lenir).
 *   - Bu yüzden tespit ilk effect'te (mount sonrası) çalışır.
 *
 * İşaretler:
 *   1) User-Agent içinde "KelimeApp/" (capacitor.config.ts → appendUserAgent)
 *   2) window.Capacitor.isNativePlatform() === true
 * Native ise UA'da "Android" varsa android, yoksa ios kabul edilir.
 *
 * Native tespit edilince <html> etiketine "is-native" sınıfı eklenir — böylece
 * CSS tarafında da (reklam alanı, mağaza rozeti vb.) ayrım yapılabilir.
 */

import { createContext, useContext, useEffect, useState } from "react";

export type Platform = "android" | "ios" | "web";

type PlatformContextType = {
  platform: Platform;
  isNative: boolean;
  /** İlk effect çalışana kadar false — sunucu ve istemci ilk boyaması aynı kalsın. */
  ready: boolean;
};

/** Provider dışında kullanılırsa güvenli varsayılan: web, henüz hazır değil. */
const DEFAULT: PlatformContextType = { platform: "web", isNative: false, ready: false };

const PlatformContext = createContext<PlatformContextType>(DEFAULT);

const NATIVE_UA_MARKER = "KelimeApp/";
const NATIVE_CLASS = "is-native";

/** Tarayıcıdaki işaretlere bakarak platformu belirler. */
export function detectPlatform(): Platform {
  if (typeof window === "undefined") return "web";

  const ua = navigator.userAgent || "";
  let native = ua.includes(NATIVE_UA_MARKER);
  if (!native) {
    try {
      native = (window as any).Capacitor?.isNativePlatform?.() === true;
    } catch {
      native = false;
    }
  }
  if (!native) return "web";
  return ua.includes("Android") ? "android" : "ios";
}

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<PlatformContextType>(DEFAULT);

  useEffect(() => {
    const platform = detectPlatform();
    const isNative = platform !== "web";
    if (isNative) {
      try {
        document.documentElement.classList.add(NATIVE_CLASS);
      } catch {}
    }
    setValue({ platform, isNative, ready: true });
  }, []);

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformContextType {
  return useContext(PlatformContext);
}
