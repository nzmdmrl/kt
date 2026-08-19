"use client";

/**
 * "Profili doğrula ve kaydet" şeridi — ana sayfanın EN ÜSTÜNDE tek satır.
 *
 * KİME GÖRÜNÜR
 * ------------
 * Yalnızca DOĞRULANMAMIŞ hesaplara: isimle açılmış, e-postası/şifresi olmayan
 * kullanıcılar. Onların hesabı sadece cihazdaki jetona bağlı; telefon değişirse
 * ya da uygulama silinirse hesap kaybolur. Şerit tam da bunu anlatmak için var.
 *
 * KAPATILINCA GERİ GELİR
 * ----------------------
 * ✕ ile kapatmak kalıcı DEĞİL: kapatma anı cihaza yazılır ve admin panelindeki
 * `verify_banner_days` (varsayılan 3) gün geçince şerit yeniden çıkar. Süre
 * sunucudan okunur (GET /api/auth/quick/status) — 0 yazılırsa bir daha çıkmaz.
 *
 * Kapatma kaydı kullanıcıya özeldir (anahtar kullanıcı kimliğini içerir): aynı
 * cihazda başka biri giriş yaparsa onun şeridi kapanmış sayılmaz.
 */

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useAccountGate } from "@/lib/accountGate";

function dismissKey(uid: number) { return `kt_verify_hide_${uid}`; }

export default function VerifyBanner() {
  const { user, loading } = useAuth();
  const { status } = useAccountGate();
  // null = henüz karar verilmedi (sunucu/cihaz okunuyor) -> hiçbir şey çizme.
  const [show, setShow] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user || user.verified !== false) { setShow(false); return; }

    const days = status.verify_banner_days;
    let hiddenUntil = 0;
    try {
      hiddenUntil = Number(localStorage.getItem(dismissKey(user.id)) || 0);
    } catch {}
    // days = 0 -> kapatma kalıcıdır (kayıt varsa bir daha gösterme).
    if (hiddenUntil && (days <= 0 || Date.now() < hiddenUntil)) { setShow(false); return; }
    setShow(true);
  }, [user, loading, status.verify_banner_days]);

  function dismiss() {
    setShow(false);
    if (!user) return;
    const days = status.verify_banner_days;
    // 0 = bir daha çıkmasın: uzak bir tarih yazılır ama kural yine de yukarıdaki
    // `days <= 0` dalında uygulanır (admin süreyi sonradan açarsa şerit döner).
    const until = days > 0 ? Date.now() + days * 86400000 : Date.now() + 3650 * 86400000;
    try { localStorage.setItem(dismissKey(user.id), String(until)); } catch {}
  }

  if (!show) return null;

  return (
    <div className="vb-row">
      <a className="vb-btn" href="/dogrula">
        <span className="vb-btn-icon" aria-hidden>🔒</span>
        <span>Profili doğrula ve kaydet</span>
        <span className="vb-btn-arrow" aria-hidden>→</span>
      </a>
      <button className="vb-close" onClick={dismiss} aria-label="Şimdilik gizle" type="button">×</button>
    </div>
  );
}
