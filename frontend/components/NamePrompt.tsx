"use client";

/**
 * "Hoş geldin — sana nasıl hitap edelim?" popup'ı — hesap açmanın TEK adımı.
 *
 * NEDEN POPUP, AYRI SAYFA DEĞİL
 * -----------------------------
 * Uygulama, siteyi bir WebView içinde gösteriyor. Orada tam sayfa yüklemesi
 * (adres değişimi) beyaz flaş, geri tuşu karışıklığı ve klavye sıçraması
 * çıkarıyor. Popup aynı sayfanın üstünde açıldığı için bunların hiçbiri olmaz.
 *
 * GÖRÜNÜM
 *  - mobil (≤720px): alttan yükselen tam genişlikte sayfa (bottom sheet)
 *  - masaüstü      : ortada kart, arkası karartılmış
 * Stiller globals.css → ".np-*".
 *
 * DAVRANIŞ
 *  - Alan otomatik odaklanır; mobilde klavye kendiliğinden açılır.
 *  - Enter = "Oynamaya başla".
 *  - Sağ üstteki ✕ kapatır. DIŞARI TIKLAYINCA KAPANMAZ — kullanıcı yanlışlıkla
 *    kapatıp "hesabım nerede" durumuna düşmesin.
 *  - Kullanıcı adı (aysegul gibi) BURADA GÖSTERİLMEZ; kişi sadece adını yazar.
 *  - Cihazda ÇIKIŞ YAPILMIŞ ama doğrulanmamış bir hesap hatırlanıyorsa, isim
 *    alanı yerine önce "<İsim> olarak devam et" çıkar. Sebep: o hesabın tek
 *    anahtarı jetondu; kişi yeni bir isim yazarsa eski hesabı (ve bütün
 *    ilerlemesi) sonsuza dek erişilemez kalırdı. "Farklı isimle başla"
 *    denince hatıra silinir ve normal form açılır.
 *  - Gönderince BEKLETİLMEZ: popup hemen kapanır, oyun başlar. Hesap açma isteği
 *    arka planda sürer; bir aksilik olursa popup hatayla geri açılır
 *    (bkz. lib/accountGate.tsx → submit).
 */

import { useEffect, useRef, useState } from "react";

export default function NamePrompt({
  error,
  busy,
  lastName,
  onSubmit,
  onContinue,
  onForget,
  onClose,
}: {
  /** Sunucudan dönen hata (ör. IP sınırı) — alanın altında gösterilir. */
  error?: string;
  busy?: boolean;
  /** Cihazda hatırlanan hesabın adı. Verilirse önce "devam et" ekranı çıkar. */
  lastName?: string;
  onSubmit: (name: string) => void;
  /** "<İsim> olarak devam et" — hatırlanan hesaba geri dön. */
  onContinue?: () => void;
  /** "Farklı isimle başla" — hatırayı sil, normal formu aç. */
  onForget?: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [localErr, setLocalErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // Hatırlanan hesap varsa önce "devam et" ekranı; kişi reddedince form açılır.
  const [showForm, setShowForm] = useState(!lastName);

  // Otomatik odak — mobilde klavyenin kendiliğinden açılmasını da bu sağlar.
  // Küçük gecikme: açılış animasyonu bitmeden odaklanınca bazı Android
  // sürümlerinde klavye açılmıyor.
  useEffect(() => {
    if (!showForm) return;   // "devam et" ekranındayken klavye açılmasın
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [showForm]);

  // Sunucu hatası gelince alan tekrar odaklansın (kişi düzeltip gönderebilsin).
  useEffect(() => { if (error) inputRef.current?.focus(); }, [error]);

  function submit() {
    const n = name.trim().replace(/\s+/g, " ");
    // Sunucudaki kuralın aynısı: Türkçe harfler ASCII'ye çevrilince en az
    // 3 harf/rakam kalmalı. Burada erkenden bakıyoruz ki kişi boşuna beklemesin.
    const slug = n
      .toLowerCase()
      .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
      .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
      .replace(/[^a-z0-9]/g, "");
    if (slug.length < 3) {
      setLocalErr("Adın en az 3 harf/rakam içermeli");
      return;
    }
    setLocalErr("");
    onSubmit(n);
  }

  const shown = localErr || error || "";

  // --- Hatırlanan hesap ekranı --------------------------------------------
  if (!showForm && lastName) {
    return (
      <div className="np-backdrop" role="dialog" aria-modal="true" aria-label="Hesabına dön">
        <div className="np-sheet">
          <button className="np-close" onClick={onClose} aria-label="Kapat" type="button">×</button>

          <div className="np-icon" aria-hidden>👋</div>
          <h2 className="np-title">Tekrar hoş geldin</h2>

          {shown && <p className="np-error">{shown}</p>}

          <button className="np-cta" onClick={onContinue} disabled={busy} type="button">
            {lastName} olarak devam et
          </button>

          <p className="np-note">
            Puanların, rozetlerin ve seviyen bu hesapta duruyor.
          </p>

          <button
            className="np-alt np-alt-btn"
            type="button"
            onClick={() => { onForget?.(); setShowForm(true); }}
          >
            Farklı isimle başla
          </button>
        </div>
      </div>
    );
  }

  return (
    // Perde: tıklama KAPATMAZ (onClick yok) — bilinçli.
    <div className="np-backdrop" role="dialog" aria-modal="true" aria-label="Hesap oluştur">
      <div className="np-sheet">
        <button className="np-close" onClick={onClose} aria-label="Kapat" type="button">×</button>

        <div className="np-icon" aria-hidden>👋</div>
        <h2 className="np-title">Hoş geldin — sana nasıl hitap edelim?</h2>

        <input
          ref={inputRef}
          className="np-input"
          value={name}
          onChange={(e) => { setName(e.target.value); setLocalErr(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Adın"
          maxLength={24}
          autoComplete="nickname"
          enterKeyHint="go"
          aria-label="Adın"
        />

        {shown && <p className="np-error">{shown}</p>}

        <button className="np-cta" onClick={submit} disabled={busy} type="button">
          Oynamaya başla
        </button>

        <a className="np-alt" href="/giris">Zaten hesabın var mı? Giriş yap</a>
      </div>
    </div>
  );
}
