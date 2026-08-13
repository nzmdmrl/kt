"use client";

import { useState, useEffect, useRef } from "react";
import { apiUrl } from "@/lib/api";

// Global maç teklifi izleyici (giriş yapmış kullanıcı, maç ekranı hariç her yerde):
// 1) Bana gelen bekleyen teklifi popup olarak gösterir (Kabul / Reddet).
//    Geri sayım SABİT DEĞİL: teklifin gerçek son kullanma anından türetilir
//    (/api/challenge/incoming -> expires_in). TTL admin panelinden değişebilir
//    (app.flags.challenge_ttl_seconds), popup da onunla birlikte değişir.
// 2) Benim gönderdiğim teklif kabul edilince beni maç odasına yönlendirir.

// Backend expires_in/expires_at vermezse (eski sürüm) kullanılacak süre.
const FALLBACK_SECONDS = 30;

export default function ChallengeWatcher() {
  const [incoming, setIncoming] = useState<any>(null);
  // Teklifin bitiş anı — İSTEMCİ saatinde ms. expires_in ile kurulur, böylece
  // istemci/sunucu saat farkı geri sayımı bozmaz.
  const [deadline, setDeadline] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [waitingAccept, setWaitingAccept] = useState(false); // ben teklif gönderdim, bekliyorum
  const handledOutgoing = useRef(false);

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

  // Gelen teklifleri ve giden teklif durumunu düzenli yokla.
  useEffect(() => {
    if (!token()) return;
    let alive = true;

    async function poll() {
      if (!alive) return;
      // Gelen teklif (maç ekranında değilsem).
      if (!onMatchPage() && !incoming) {
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
      // Giden teklif durumu (kabul edildiyse yönlen) — maç sayfasında değilsem.
      if (!onMatchPage()) {
        try {
          const r = await fetch(apiUrl("/api/challenge/outgoing"), { headers: headers() });
          const j = await r.json();
          if (alive && j.challenge && j.challenge.status === "accepted" && j.challenge.room_code && !handledOutgoing.current) {
            handledOutgoing.current = true;
            window.location.href = `/oyna?duel=${encodeURIComponent(j.challenge.room_code)}`;
          }
        } catch {}
      }
    }

    poll();
    const iv = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(iv); };
  }, [incoming]);

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
