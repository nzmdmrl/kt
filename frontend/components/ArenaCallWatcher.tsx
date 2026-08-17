"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { playSound } from "@/lib/sound";
import { useArenaCallEnabled } from "@/lib/uiSettings";

/**
 * "Arenaya davet" ANLIK popup'ı (bildirim değil — hiçbir yere kaydedilmez).
 *
 * Biri arenaya girince sunucu o an boşta olan (online + maçta değil) en fazla
 * 4 üyeye kısa ömürlü bir çağrı açar. Bu bileşen çağrıyı yoklar ve popup
 * gösterir; "Katıl" doğrudan arenaya götürür.
 *
 * NEREDE ÇIKMAZ: oyun/akış ekranlarında (1v1, arena, maraton, günün kelimesi,
 * oda kurma, giriş, yönetim). Sadece ana sayfa · menü · profil · lig gibi
 * "boşta gezinme" sayfalarında görünür. Sekme görünmezken hiç yoklama yapılmaz.
 */

// Bu ön eklerle başlayan sayfalarda popup ÇIKMAZ ve yoklama yapılmaz.
const BLOCKED = [
  "/oyna",            // 1v1 düello + özel oda kurma/katılma
  "/arena",           // normal + özel arena
  "/solo",            // maraton
  "/gunun-kelimesi",
  "/oda",             // davet linkiyle oda önizleme
  "/giris",
  "/kayit",
  "/yonetim",
];

const POLL_MS = 5000;

export default function ArenaCallWatcher() {
  const pathname = usePathname();
  const router = useRouter();
  const [call, setCall] = useState<{ id: string; from_name: string; expires_in: number } | null>(null);
  const [left, setLeft] = useState(0);
  const callRef = useRef<typeof call>(null);
  useEffect(() => { callRef.current = call; }, [call]);
  // Admin → ⚙️ Ayarlar → Arena → "Arenaya çağrı" kapalıysa hiç yoklanmaz.
  const featureOn = useArenaCallEnabled();

  const blocked = !featureOn || !pathname || BLOCKED.some((p) => pathname.startsWith(p));

  function token() { return typeof window !== "undefined" ? localStorage.getItem("kt_token") : null; }

  // Oyun ekranına geçilirse açık popup da kapansın.
  useEffect(() => { if (blocked) setCall(null); }, [blocked]);

  useEffect(() => {
    if (blocked || !token()) return;
    let alive = true;

    async function poll() {
      if (!alive || callRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const r = await fetch(apiUrl("/api/arena/call"), {
          headers: { Authorization: `Bearer ${token()}` },
        });
        if (!r.ok) return;
        const j = await r.json();
        if (!alive || !j.call || callRef.current) return;
        setCall(j.call);
        setLeft(Math.max(0, Math.round(j.call.expires_in)));
        try { playSound("opponent_found"); } catch {}
      } catch {}
    }

    poll();
    const iv = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(iv); };
  }, [blocked, pathname]);

  // Geri sayım — süre dolunca popup kendiliğinden kapanır.
  useEffect(() => {
    if (!call) return;
    if (left <= 0) { setCall(null); return; }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [call, left]);

  function dismiss(id: string) {
    try {
      fetch(apiUrl("/api/arena/call/dismiss"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ id }),
      });
    } catch {}
  }

  function join() {
    if (!call) return;
    dismiss(call.id);
    setCall(null);
    router.push("/arena");
  }
  function close() {
    if (!call) return;
    dismiss(call.id);
    setCall(null);
  }

  if (!call || blocked) return null;

  return (
    <div style={{
      position: "fixed", left: 0, right: 0, zIndex: 320,
      top: "calc(12px + var(--kt-safe-top))",
      display: "grid", justifyItems: "center", padding: "0 12px",
      pointerEvents: "none",
    }}>
      <div style={{
        pointerEvents: "auto",
        width: "min(420px, 100%)", boxSizing: "border-box",
        background: "var(--bg-panel)", border: "2px solid var(--accent)",
        borderRadius: 16, padding: "14px 16px",
        boxShadow: "0 10px 34px rgba(0,0,0,.45)",
        animation: "arenaCallIn .28s ease-out",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{ fontSize: 30, lineHeight: 1, flexShrink: 0 }}>⚔️</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="brand-mono" style={{ fontSize: 16, color: "var(--text-strong)" }}>
            Arenaya davet var!
          </div>
          <div style={{ fontSize: 13, color: "var(--text-soft)", marginTop: 2 }}>
            <strong style={{ color: "var(--accent)" }}>{call.from_name}</strong> arenada oyuncu bekliyor · {left} sn
          </div>
        </div>
        <button onClick={join} style={{
          flexShrink: 0, padding: "10px 16px", borderRadius: 11, border: "none",
          background: "var(--tile-correct)", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer",
        }}>Katıl</button>
        <button onClick={close} aria-label="Kapat" style={{
          flexShrink: 0, width: 30, height: 30, borderRadius: "50%", display: "grid", placeItems: "center",
          background: "var(--bg-elevated)", border: "1px solid var(--border-soft)",
          color: "var(--text-dim)", fontSize: 16, lineHeight: 1, cursor: "pointer",
        }}>×</button>
      </div>
      <style>{`@keyframes arenaCallIn{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
