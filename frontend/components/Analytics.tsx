"use client";

/**
 * Google Analytics 4 yükleyici.
 *
 * - NEXT_PUBLIC_GA_ID boşsa hiçbir şey yapmaz.
 * - Ziyaretçi çerez bandından "Reddet" dediyse script hiç yüklenmez.
 * - App Router'da gezinme pushState ile olduğu için sayfa görüntülemeleri
 *   elle gönderilir (gtag'in kendi otomatik sayımı kapatılır → çift sayım olmaz).
 */

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { GA_ID, analyticsAllowed, onConsentChange } from "@/lib/analytics";

function loadGtag() {
  if (document.getElementById("ga-script")) return;
  const s = document.createElement("script");
  s.id = "ga-script";
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);

  const w = window as any;
  w.dataLayer = w.dataLayer || [];
  w.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer.push(arguments);
  };
  w.gtag("js", new Date());
  // Sayfa görüntülemesini biz gönderiyoruz; IP'yi de kısaltarak (anonim) ölç.
  w.gtag("config", GA_ID, { send_page_view: false, anonymize_ip: true });
}

export default function Analytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Script'i yükle; ziyaretçi sonradan "Kabul et" derse o an yükle.
  useEffect(() => {
    if (!GA_ID) return;
    if (analyticsAllowed()) loadGtag();
    return onConsentChange(() => {
      if (analyticsAllowed()) loadGtag();
    });
  }, []);

  // Her gezinmede sayfa görüntüleme gönder.
  useEffect(() => {
    if (!GA_ID || !analyticsAllowed()) return;
    const qs = searchParams?.toString();
    const url = pathname + (qs ? `?${qs}` : "");
    (window as any).gtag?.("event", "page_view", {
      page_path: url,
      page_location: window.location.origin + url,
      page_title: document.title,
    });
  }, [pathname, searchParams]);

  return null;
}
