"use client";

import { useState, useEffect, useRef } from "react";
import { apiUrl } from "@/lib/api";

// Global maç teklifi izleyici (giriş yapmış kullanıcı, maç ekranı hariç her yerde):
// 1) Bana gelen bekleyen teklifi popup olarak gösterir (Kabul / Reddet, 30sn geri sayım).
// 2) Benim gönderdiğim teklif kabul edilince beni maç odasına yönlendirir.
export default function ChallengeWatcher() {
  const [incoming, setIncoming] = useState<any>(null);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [waitingAccept, setWaitingAccept] = useState(false); // ben teklif gönderdim, bekliyorum
  const handledOutgoing = useRef(false);

  function token() { return typeof window !== "undefined" ? localStorage.getItem("kt_token") : null; }
  function headers() { return { "Content-Type": "application/json", Authorization: `Bearer ${token()}` }; }

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
            setIncoming(j.challenge);
            setSecondsLeft(30);
          }
        } catch {}
      }
      // Giden teklif durumu (kabul edildiyse yönlen).
      try {
        const r = await fetch(apiUrl("/api/challenge/outgoing"), { headers: headers() });
        const j = await r.json();
        if (alive && j.challenge && j.challenge.status === "accepted" && j.challenge.room_code && !handledOutgoing.current) {
          handledOutgoing.current = true;
          // Teklifi ben gönderdim, kabul edildi -> maça yönlen.
          window.location.href = `/oyna?duel=${encodeURIComponent(j.challenge.room_code)}`;
        }
      } catch {}
    }

    poll();
    const iv = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(iv); };
  }, [incoming]);

  // Popup geri sayımı.
  useEffect(() => {
    if (!incoming) return;
    if (secondsLeft <= 0) { setIncoming(null); return; }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [incoming, secondsLeft]);

  async function accept() {
    if (!incoming) return;
    try {
      const r = await fetch(apiUrl(`/api/challenge/${incoming.id}/accept`), { method: "POST", headers: headers() });
      const j = await r.json();
      if (r.ok && j.room_code) {
        setIncoming(null);
        window.location.href = `/oyna?duel=${encodeURIComponent(j.room_code)}`;
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
