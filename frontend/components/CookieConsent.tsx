"use client";

/**
 * Çerez bilgilendirme bandı (alt kısımda).
 *
 * "Bant + varsayılan açık" modeli: ziyaretçi karar verene kadar ölçüm çalışır,
 * "Reddet" derse anında durur. Karar verildikten sonra bant bir daha gösterilmez;
 * tercih /cerez sayfasından değiştirilebilir.
 *
 * MOBİL UYGULAMADA GÖSTERİLMEZ: uygulama bir web sitesi değil, kurulmuş bir
 * uygulamadır; çerez bandı oyun ekranının üstünde gereksiz yer kaplıyordu.
 * Tercih yolu kapanmaz — aynı anahtar uygulama içinden de erişilebilen
 * ☰ Menü → 🍪 Çerezler (/cerez) sayfasında duruyor.
 *
 * Tespit `detectPlatform()` ile YAPILIR, usePlatform() ile değil: bu bileşen
 * layout'ta <Providers> DIŞINDA duruyor, yani platform context'ine erişemez.
 */

import { useEffect, useState } from "react";
import { GA_ID, getConsent, setConsent, onConsentChange } from "@/lib/analytics";
import { detectPlatform } from "@/lib/platform";

export default function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!GA_ID) return; // ölçüm yapılandırılmamışsa bant da gösterme
    if (detectPlatform() !== "web") return;   // mobil uygulamada bant yok
    if (getConsent() === null) setShow(true);
    // /cerez sayfasından tercih sıfırlanırsa bandı tekrar aç
    return onConsentChange((c) => setShow(c === null));
  }, []);

  if (!show) return null;

  return (
    <div
      role="region"
      aria-label="Çerez bilgilendirmesi"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        // Native reklam bandının üstünde dursun (web'de --kt-banner-space = 0px).
        bottom: "max(calc(12px + env(safe-area-inset-bottom, 0px)), calc(var(--kt-banner-space, 0px) + 12px))",
        zIndex: 900,
        maxWidth: 720,
        margin: "0 auto",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-soft)",
        borderRadius: 14,
        boxShadow: "0 8px 28px rgba(0,0,0,.35)",
        padding: "14px 16px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 12,
      }}
      className="kt-cookie-bar"
    >
      <p style={{ flex: "1 1 260px", margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--text-soft)" }}>
        🍪 Oyunun çalışması için gerekli verileri ve siteyi geliştirmemize yardımcı olan anonim
        ziyaret istatistiklerini kullanıyoruz. Reklam veya takip çerezi kullanmıyoruz.{" "}
        <a href="/cerez" style={{ color: "var(--accent)" }}>Ayrıntılar</a>
      </p>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          onClick={() => { setConsent("rejected"); setShow(false); }}
          style={{
            padding: "9px 16px",
            borderRadius: 9,
            border: "1px solid var(--border-soft)",
            background: "transparent",
            color: "var(--text-soft)",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "var(--font-display)",
          }}
        >
          Reddet
        </button>
        <button
          onClick={() => { setConsent("accepted"); setShow(false); }}
          style={{
            padding: "9px 18px",
            borderRadius: 9,
            border: "none",
            background: "var(--accent)",
            color: "#1a1330",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "var(--font-display)",
          }}
        >
          Kabul et
        </button>
      </div>
    </div>
  );
}
