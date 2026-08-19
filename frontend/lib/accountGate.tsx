"use client";

/**
 * Hesap kapısı — "oynamak için hesap gerekir, ama hesap açmak tek isim yazmaktır".
 *
 * NE İŞE YARAR
 * ------------
 * Herhangi bir yerden şunu diyebilirsin:
 *
 *     const { ensureAccount } = useAccountGate();
 *     ensureAccount(() => router.push("/arena"));
 *
 * Kişinin hesabı varsa arenaya gider. Yoksa isim popup'ı açılır; adını yazıp
 * "Oynamaya başla"ya basınca hesap açılır ve AYNI iş kaldığı yerden sürer.
 *
 * MİSAFİRLİK KALKTI
 * -----------------
 * Eskiden bu ekranlarda "Misafir Olarak Katıl" kartı (GuestJoin) çıkıyordu.
 * Artık herkesin hesabı var: hesap açmak isim yazmak kadar kolay olduğu için
 * misafirlik hem gereksiz hem de zararlıydı (misafirin puanı, rozeti, geçmişi
 * hiçbir yere yazılmıyordu).
 *
 * POPUP NE ZAMAN KENDİLİĞİNDEN AÇILIR
 * -----------------------------------
 * Ana sayfa `autoPrompt` ile çağırır: hesapsız ziyaretçiye oturumda BİR KEZ
 * kendiliğinden açılır. Kişi ✕ ile kapatırsa bir daha kendiliğinden açılmaz —
 * ama bir oyuna tıkladığında yine çıkar (o zaman gerçekten gerekiyor).
 *
 * ÇIKIŞ YAPMIŞ DOĞRULANMAMIŞ HESAP
 * --------------------------------
 * Cihazda "son hesap" hatırası varsa popup önce "<İsim> olarak devam et" der.
 * O hesabın tek anahtarı jetondu; yeni bir isim yazılsaydı eski hesap sonsuza
 * dek erişilemez kalırdı (bkz. lib/tokenStore.ts → LAST_KEY).
 *
 * ADMİN KAPATIRSA
 * ---------------
 * quick_signup_enabled kapalıysa popup hiç açılmaz; kişi normal giriş sayfasına
 * yönlendirilir. Böylece özellik tek anahtarla geri alınabilir.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import NamePrompt from "@/components/NamePrompt";
import { useAuth } from "./auth";
import { getJSON } from "./api";
import {
  readLastAccountSync, restoreLastAccount, forgetLastAccount, type LastAccount,
} from "./tokenStore";

type QuickStatus = { enabled: boolean; verify_banner_days: number };

const DEFAULT_STATUS: QuickStatus = { enabled: true, verify_banner_days: 3 };

/** Oturum başına bir kez kendiliğinden açma bayrağı. */
const AUTO_KEY = "kt_name_prompt_seen";

type GateContextType = {
  /**
   * Hesap varsa `next` HEMEN çalışır ve true döner.
   * Yoksa popup açılır, `next` hesap açılınca çalışır ve false döner.
   */
  ensureAccount: (next?: () => void) => boolean;
  /** Popup'ı koşulsuz aç (ör. "İsimle başla" düğmesi). */
  openNamePrompt: (next?: () => void) => void;
  /** Hesapsız ziyaretçiye oturumda bir kez kendiliğinden aç (ana sayfa çağırır). */
  autoPrompt: () => void;
  /** Public ayarlar — doğrulama şeridi süresi de buradan okunur. */
  status: QuickStatus;
};

const GateContext = createContext<GateContextType | null>(null);

let statusCache: QuickStatus | null = null;

export function AccountGateProvider({ children }: { children: React.ReactNode }) {
  const { user, loading, quickSignup, continueAsLast } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Cihazda hatırlanan (çıkış yapılmış, doğrulanmamış) hesap.
  const [last, setLast] = useState<LastAccount | null>(null);
  const [status, setStatus] = useState<QuickStatus>(statusCache || DEFAULT_STATUS);
  // Popup kapanınca çalışacak iş (ör. "arenaya git"). Render'ı tetiklemesine
  // gerek yok, bu yüzden state değil ref.
  const pending = useRef<(() => void) | null>(null);

  // Hatırayı oku: önce hızlı yol (localStorage), uygulamada gerekirse native
  // depodan geri yükle. Girişliyken hatırlatmaya gerek yok.
  useEffect(() => {
    if (user) { setLast(null); return; }
    const sync = readLastAccountSync();
    if (sync) { setLast(sync); return; }
    let alive = true;
    restoreLastAccount().then((l) => { if (alive && l) setLast(l); }).catch(() => {});
    return () => { alive = false; };
  }, [user, open]);

  useEffect(() => {
    if (statusCache) return;
    getJSON<Partial<QuickStatus>>("/api/auth/quick/status")
      .then((d) => {
        const s: QuickStatus = {
          enabled: d.enabled !== false,
          verify_banner_days: typeof d.verify_banner_days === "number" ? d.verify_banner_days : 3,
        };
        statusCache = s;
        setStatus(s);
      })
      .catch(() => {});
  }, []);

  const openNamePrompt = useCallback((next?: () => void) => {
    // Admin hızlı girişi kapattıysa eski yol: normal giriş/kayıt sayfası.
    if (!status.enabled) { window.location.href = "/giris"; return; }
    pending.current = next || null;
    setError("");
    setOpen(true);
  }, [status.enabled]);

  const ensureAccount = useCallback((next?: () => void) => {
    if (user) { next?.(); return true; }
    // Oturum henüz çözülüyorsa (jeton doğrulanıyor) popup açma — bir saniye
    // sonra "zaten girişlisin" çıkacak kişiye isim sordurmayalım.
    if (loading) return false;
    openNamePrompt(next);
    return false;
  }, [user, loading, openNamePrompt]);

  const autoPrompt = useCallback(() => {
    if (user || loading || open) return;
    try { if (sessionStorage.getItem(AUTO_KEY)) return; } catch {}
    try { sessionStorage.setItem(AUTO_KEY, "1"); } catch {}
    openNamePrompt();
  }, [user, loading, open, openNamePrompt]);

  const continueAs = useCallback(() => {
    if (!last) return;
    const next = pending.current;
    setOpen(false);
    setBusy(true);
    continueAsLast(last.token)
      .then(() => { next?.(); })
      .catch((e: any) => {
        pending.current = next;
        setLast(null);   // hatıra geçersizdi, normal forma düş
        setError(e?.message || "Bu hesaba dönülemedi.");
        setOpen(true);
      })
      .finally(() => setBusy(false));
  }, [last, continueAsLast]);

  const forget = useCallback(() => {
    forgetLastAccount();
    setLast(null);
  }, []);

  const close = useCallback(() => {
    // ✕ ile kapatma: iş iptal. Kişi giriş yapmamış olur; oyuna tıklayınca
    // popup yeniden çıkar.
    pending.current = null;
    setOpen(false);
    setError("");
  }, []);

  const submit = useCallback((name: string) => {
    // Kişi yeni bir isim yazdıysa eski hatıra artık geçersiz.
    forgetLastAccount();
    // BEKLETME: popup hemen kapanır. İstek arka planda sürer; başarılıysa
    // bekleyen iş (oyuna gitmek) çalışır, aksilikte popup hatayla geri açılır.
    const next = pending.current;
    setOpen(false);
    setBusy(true);
    quickSignup(name)
      .then(() => { next?.(); })
      .catch((e: any) => {
        pending.current = next;
        setError(e?.message || "Hesap oluşturulamadı, tekrar dene.");
        setOpen(true);
      })
      .finally(() => setBusy(false));
  }, [quickSignup]);

  return (
    <GateContext.Provider value={{ ensureAccount, openNamePrompt, autoPrompt, status }}>
      {children}
      {open && (
        <NamePrompt
          error={error}
          busy={busy}
          lastName={last?.name || undefined}
          onSubmit={submit}
          onContinue={continueAs}
          onForget={forget}
          onClose={close}
        />
      )}
    </GateContext.Provider>
  );
}

export function useAccountGate(): GateContextType {
  const ctx = useContext(GateContext);
  // Sağlayıcı dışında da patlamasın: hesapsızsa giriş sayfasına düşer.
  if (!ctx) {
    return {
      ensureAccount: (next) => { next?.(); return true; },
      openNamePrompt: () => { window.location.href = "/giris"; },
      autoPrompt: () => {},
      status: DEFAULT_STATUS,
    };
  }
  return ctx;
}
