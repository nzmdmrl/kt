"use client";

/**
 * Ziyaret sayacı — admin özet ekranındaki "bugün kaç ziyaretçi" sayıları için.
 *
 * GÜNDE BİR KEZ sunucuya küçük bir sinyal gönderir; sunucu yalnızca sayacı
 * bir artırır. Ortamı (mobil uygulama / mobil tarayıcı / masaüstü) SUNUCU
 * user agent'tan çıkarır; buradan bir iddiada bulunulmaz.
 *
 * TEKİLLEŞTİRME BURADA
 * --------------------
 * Sunucu artık ziyaretçi başına satır tutmuyor (sayaca geçildi), bu yüzden
 * "aynı kişiyi gün içinde bir kez say" işi cihaza taşındı: son gönderilen gün
 * localStorage'da tutulur, aynı gün ikinci kez gönderilmez.
 *
 * Oturum yerine GÜN kullanılmasının sebebi: uygulamayı gün içinde beş kez açan
 * kişi beş oturum açar ama tek ziyaretçidir.
 *
 * Kişisel hiçbir veri gönderilmez; sunucu da IP/user agent saklamaz.
 */

import { useEffect } from "react";
import { apiUrl } from "@/lib/api";

/** En son hangi gün sinyal gönderildi (YYYY-AA-GG). */
const DAY_KEY = "kt_visit_day";

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function VisitPing() {
  useEffect(() => {
    const day = today();
    try {
      if (localStorage.getItem(DAY_KEY) === day) return;   // bugün zaten sayıldı
      localStorage.setItem(DAY_KEY, day);
    } catch { /* gizli sekme — yine de bir kez gönderilir */ }

    const token = (() => { try { return localStorage.getItem("kt_token"); } catch { return null; } })();
    fetch(apiUrl("/api/stats/visit"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({}),
    }).catch(() => {});
  }, []);

  return null;
}
