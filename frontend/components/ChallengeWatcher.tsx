"use client";

import { useState, useEffect, useRef } from "react";
import { apiUrl } from "@/lib/api";

// Global maç teklifi izleyici (giriş yapmış kullanıcı, maç ekranı hariç her yerde):
// 1) Bana gelen bekleyen teklifi popup olarak gösterir (Kabul / Reddet).
//    Geri sayım SABİT DEĞİL: teklifin gerçek son kullanma anından türetilir
//    (/api/challenge/incoming -> expires_in). TTL admin panelinden değişebilir
//    (app.flags.challenge_ttl_seconds), popup da onunla birlikte değişir.
// 2) Benim gönderdiğim teklif kabul edilince beni maç odasına yönlendirir.
//    /challenge/outgoing YALNIZCA teklif gönderen kullanıcıda yoklanır
//    (waitingAccept); teklif sonuçlanınca durur. Diğer herkes için o uç hiç
//    çağrılmaz.
// 3) Sekme görünmezken HİÇBİR yoklama yapılmaz (visibilitychange); sekme
//    görünür olur olmaz anında bir kez yoklanır.

// Backend expires_in/expires_at vermezse (eski sürüm) kullanılacak süre.
const FALLBACK_SECONDS = 30;

// Görünür sekmede yoklama aralığı.
const POLL_MS = 3000;

// "Teklif gönderdim" işareti: sayfa değişse/yenilense de gönderen kullanıcı
// outgoing'i yoklamaya devam etsin diye localStorage'da tutulur.
const SENT_KEY = "kt_challenge_sent_at";
// Emniyet freni: normalde yoklama sunucunun verdiği sonuç durumunda (accepted/
// declined/cancelled/expired ya da boş yanıt) durur. Ağ tamamen koparsa bu
// süre sonunda yine de durur — sonsuza kadar yoklama yapılmaz.
const OUTGOING_MAX_MS = 5 * 60 * 1000;
// Teklif gönderen sayfanın (profil) haber verdiği olay.
export const CHALLENGE_SENT_EVENT = "kt:challenge-sent";

export default function ChallengeWatcher() {
  const [incoming, setIncoming] = useState<any>(null);
  // Teklifin bitiş anı — İSTEMCİ saatinde ms. expires_in ile kurulur, böylece
  // istemci/sunucu saat farkı geri sayımı bozmaz.
  const [deadline, setDeadline] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [waitingAccept, setWaitingAccept] = useState(false); // ben teklif gönderdim, bekliyorum
  const handledOutgoing = useRef(false);
  // poll() tek bir zamanlayıcıya bağlı ve mount'ta bir kez kurulur; güncel
  // değerleri state yerine ref'ten okur (yoksa her değişimde interval yeniden
  // kurulur ve fazladan istek atılırdı).
  const incomingRef = useRef<any>(null);
  const waitingRef = useRef(false);
  useEffect(() => { incomingRef.current = incoming; }, [incoming]);
  useEffect(() => { waitingRef.current = waitingAccept; }, [waitingAccept]);

  function token() { return typeof window !== "undefined" ? localStorage.getItem("kt_token") : null; }
  function headers() { return { "Content-Type": "application/json", Authorization: `Bearer ${token()}` }; }

  // Teklifin bitmesine kalan saniye. Kaynak sırası: sunucunun hesapladığı
  // expires_in -> expires_at (istemci saatiyle) -> eski sürüm yedeği.
  function secondsUntilExpiry(ch: any): number {
    if (typeof ch?.expires_in === "number" && isFinite(ch.expires_in)) {
      return Math.max(0, ch.expires_in);
    }
    if (ch?.expires_at) {
      const ms = Date.parse(ch.expires_at) - Date.now();
      if (!isNaN(ms)) return Math.max(0, ms / 1000);
    }
    return FALLBACK_SECONDS;
  }

  // Maç ekranındayken teklif popup'ı gösterme.
  function onMatchPage() {
    return typeof window !== "undefined" && window.location.pathname.startsWith("/oyna");
  }

  // "Teklifimi bekliyorum" durumunu başlat/bitir.
  function startWaiting() {
    try { localStorage.setItem(SENT_KEY, String(Date.now())); } catch {}
    waitingRef.current = true;
    setWaitingAccept(true);
  }
  function stopWaiting() {
    try { localStorage.removeItem(SENT_KEY); } catch {}
    waitingRef.current = false;
    setWaitingAccept(false);
  }

  // Teklif gönderildiğini profil sayfası olayla bildirir; sayfa yenilenirse
  // localStorage işareti devralır.
  useEffect(() => {
    function onSent() { startWaiting(); }
    window.addEventListener(CHALLENGE_SENT_EVENT, onSent);
    try {
      const ts = Number(localStorage.getItem(SENT_KEY) || 0);
      if (ts && Date.now() - ts < OUTGOING_MAX_MS) {
        waitingRef.current = true;
        setWaitingAccept(true);
      } else if (ts) {
        localStorage.removeItem(SENT_KEY);
      }
    } catch {}
    return () => window.removeEventListener(CHALLENGE_SENT_EVENT, onSent);
  }, []);

  // Gelen teklifleri ve (yalnızca gönderdiysem) giden teklif durumunu yokla.
  useEffect(() => {
    if (!token()) return;
    let alive = true;

    // Sekme görünür mü? Zamanlayıcı zaten görünmezken duruyor; bu kontrol,
    // yoklama sürerken sekme gizlenirse İKİNCİ isteğin de atılmamasını sağlar.
    function visible() {
      return typeof document === "undefined" || document.visibilityState === "visible";
    }

    async function poll() {
      if (!alive || !visible()) return;
      // Gelen teklif (maç ekranında değilsem).
      if (!onMatchPage() && !incomingRef.current) {
        try {
          const r = await fetch(apiUrl("/api/challenge/incoming"), { headers: headers() });
          const j = await r.json();
          if (alive && j.challenge) {
            const secs = secondsUntilExpiry(j.challenge);
            // Süresi çoktan geçmiş bir teklifi hiç açma.
            if (secs > 0) {
              setDeadline(Date.now() + secs * 1000);
              setSecondsLeft(Math.ceil(secs));
              setIncoming(j.challenge);
            }
          }
        } catch {}
      }
      // Giden teklif durumu: SADECE ben teklif gönderdiysem ve sonuçlanmadıysa.
      if (!alive || !visible()) return;
      if (!onMatchPage() && waitingRef.current) {
        try {
          const r = await fetch(apiUrl("/api/challenge/outgoing"), { headers: headers() });
          const j = await r.json();
          if (!alive) return;
          const ch = j.challenge;
          if (ch && ch.status === "accepted" && ch.room_code) {
            stopWaiting();
            if (!handledOutgoing.current) {
              handledOutgoing.current = true;
              window.location.href = `/oyna?duel=${encodeURIComponent(ch.room_code)}`;
            }
          } else if (!ch || ch.status !== "pending") {
            // declined / cancelled / expired ya da kayıt yok: yoklamayı bitir.
            stopWaiting();
          }
        } catch {}
      }
    }

    // Tek zamanlayıcı sahibi. Sekme görünmezken durur, görünür olunca ANINDA
    // bir kez yoklar ve tekrar kurulur.
    let iv: ReturnType<typeof setInterval> | null = null;
    function start() {
      if (iv || !alive) return;
      poll();
      iv = setInterval(poll, POLL_MS);
    }
    function stop() {
      if (iv) { clearInterval(iv); iv = null; }
    }
    function onVisibility() {
      if (document.visibilityState === "visible") start(); else stop();
    }

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Popup geri sayımı: kalan süre HER SEFERİNDE duvar saatinden hesaplanır.
  // Sayaç azaltmak yerine böyle yapılır; sekme arka plana alındığında tarayıcı
  // zamanlayıcıları kıstığında sayaç sürüklenir, teklif ise sürüklenmez.
  useEffect(() => {
    if (!incoming || !deadline) return;
    function tick() {
      const left = deadline - Date.now();
      if (left <= 0) { setIncoming(null); setSecondsLeft(0); return; }
      setSecondsLeft(Math.ceil(left / 1000));
    }
    tick();
    const iv = setInterval(tick, 500);
    // Kapanış tam bitiş anında olsun (500 ms'lik tick'e bırakılmaz).
    const close = setTimeout(() => setIncoming(null), Math.max(0, deadline - Date.now()));
    return () => { clearInterval(iv); clearTimeout(close); };
  }, [incoming, deadline]);

  async function accept() {
    if (!incoming) return;
    try {
      const r = await fetch(apiUrl(`/api/challenge/${incoming.id}/accept`), { method: "POST", headers: headers() });
      const j = await r.json();
      if (r.ok && j.room_code) {
        setIncoming(null);
        window.location.href = `/oyna?duel=${encodeURIComponent(j.room_code)}`;
      } else if (r.status === 404 || r.status === 409) {
        // Teklif tam bu sırada süresi doldu / geri çekildi: popup'ı açık tutma.
        setIncoming(null);
      }
    } catch {}
  }

  async function decline() {
    if (!incoming) return;
    try {
      await fetch(apiUrl(`/api/challenge/${incoming.id}/decline`), { method: "POST", headers: headers() });
    } catch {}
    setIncoming(null);
  }

  if (!incoming) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 300,
      display: "grid", placeItems: "center", padding: 16,
      animation: "fadeIn .2s ease",
    }}>
      <div style={{
        background: "var(--bg-panel)", borderRadius: 18, padding: 28, textAlign: "center",
        width: "min(380px, 100%)", border: "2px solid var(--accent)", boxShadow: "var(--shadow-soft)",
      }}>
        <div style={{ fontSize: 44, marginBottom: 10 }}>⚔️</div>
        <h2 className="brand-mono" style={{ fontSize: 22, margin: "0 0 8px" }}>Maç Teklifi!</h2>
        <p style={{ color: "var(--text-soft)", fontSize: 15, marginBottom: 6 }}>
          <strong style={{ color: "var(--accent)" }}>{incoming.from_name}</strong> sana maç teklifi gönderdi.
        </p>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 20 }}>
          {secondsLeft} saniye içinde yanıtla
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={decline} style={{
            flex: 1, padding: "13px", borderRadius: 11, border: "1px solid var(--border-soft)",
            background: "var(--bg-elevated)", color: "var(--text-soft)", fontWeight: 600, fontSize: 15, cursor: "pointer",
          }}>Reddet</button>
          <button onClick={accept} style={{
            flex: 1, padding: "13px", borderRadius: 11, border: "none",
            background: "var(--tile-correct)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer",
          }}>Kabul Et</button>
        </div>
      </div>
    </div>
  );
}
