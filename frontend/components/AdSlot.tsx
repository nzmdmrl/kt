"use client";

/**
 * Google AdSense reklam alanı (SADECE web).
 *
 * Davranış:
 *  - Native uygulamada (Capacitor WebView) HİÇBİR ŞEY yapmaz — ne script yükler
 *    ne de DOM'a bir şey basar. Mobil tarafta reklam AdMob ile gösterilecek.
 *  - AdSense script'i kök layout'a KONMAZ; ilk gerçek reklam basıldığı anda bu
 *    bileşen tarafından dinamik olarak eklenir (belgede tek kez). Böylece reklam
 *    kapalıyken veya uygulama içinde Google'a hiç istek gitmez.
 *  - Yapılandırma eksik/kapalıysa (enabled=false, client boş, slot id boş) null
 *    döner: sayfada yer kaplamaz, düzen değişmez.
 *
 * Ayarlar admin panelinden yönetilir: app_settings → "ads.adsense"
 * (backend/app/api/routes/app_settings.py).
 */

import { useEffect, useRef, useState } from "react";
import { usePlatform } from "@/lib/platform";
import { useAppConfig } from "@/lib/appConfig";
import { useAdFree } from "@/lib/auth";

export type AdSlotName = "header" | "in_content" | "footer";

const SCRIPT_ID = "adsense-script";

/** AdSense script'ini bir kez ekler (zaten varsa dokunmaz). */
function loadAdSenseScript(client: string) {
  if (document.getElementById(SCRIPT_ID)) return;
  const s = document.createElement("script");
  s.id = SCRIPT_ID;
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  document.head.appendChild(s);
}

export default function AdSlot({
  slot,
  className,
  style,
}: {
  slot: AdSlotName;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { isNative } = usePlatform();
  const config = useAppConfig();
  // Reklamsız hesap: hiç render edilmez. Hak DURUMU NETLEŞENE KADAR da basılmaz
  // (bkz. useAdFree) — reklam bir kez basılırsa GÖSTERİM sayılır, geri alınamaz.
  const { adFree, ready: adFreeReady } = useAdFree();

  const insRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  const ads = config?.["ads.adsense"];
  const client = (ads?.client || "").trim();
  const slotId = (ads?.slots?.[slot] || "").trim();
  const active =
    !isNative && adFreeReady && !adFree && !!ads?.enabled && !!client && !!slotId;

  useEffect(() => {
    if (!active || pushed.current || !insRef.current) return;
    pushed.current = true;
    // Script'i ancak gerçekten bir reklam basılacağı an yükle.
    loadAdSenseScript(client);
    try {
      const w = window as any;
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.push({});
    } catch {
      // AdSense engelleyici vb. — sessizce geç, sayfa etkilenmesin.
    }
  }, [active, client, slotId]);

  if (!active) return null;

  return (
    <ins
      ref={insRef}
      className={`adsbygoogle${className ? ` ${className}` : ""}`}
      style={{ display: "block", ...style }}
      data-ad-client={client}
      data-ad-slot={slotId}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}
