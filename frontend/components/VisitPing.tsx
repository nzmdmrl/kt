"use client";

/**
 * Ziyaret sayacı — admin özet ekranındaki "bugün kaç ziyaretçi" sayıları için.
 *
 * Oturum başına BİR KEZ sunucuya küçük bir sinyal gönderir. Ortamı (mobil
 * uygulama / mobil tarayıcı / masaüstü) SUNUCU user agent'tan çıkarır; buradan
 * bir iddiada bulunulmaz.
 *
 * Girişsiz ziyaretçiyi saymak için tarayıcıda rastgele bir anahtar üretilir
 * (kt_visitor). Kimlik değil, yalnız "aynı kişi mi" ayrımı için — kişisel
 * hiçbir veri gönderilmez, sunucu da IP/user agent saklamaz.
 */

import { useEffect } from "react";
import { apiUrl } from "@/lib/api";

const SESSION_FLAG = "kt_visit_sent";
const VISITOR_KEY = "kt_visitor";

function visitorKey(): string {
  try {
    let k = localStorage.getItem(VISITOR_KEY);
    if (!k) {
      k = Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
      localStorage.setItem(VISITOR_KEY, k);
    }
    return k;
  } catch {
    return "";
  }
}

export default function VisitPing() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_FLAG)) return;
      sessionStorage.setItem(SESSION_FLAG, "1");
    } catch { /* gizli sekme — yine de bir kez gönderilir */ }

    const token = (() => { try { return localStorage.getItem("kt_token"); } catch { return null; } })();
    fetch(apiUrl("/api/stats/visit"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ client_key: visitorKey() }),
    }).catch(() => {});
  }, []);

  return null;
}
