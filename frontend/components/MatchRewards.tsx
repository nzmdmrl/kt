"use client";

import { useState, useEffect, useRef } from "react";
import { playSound } from "@/lib/sound";

type Rewards = {
  elo_before?: number;
  elo_after?: number;
  elo_delta?: number;
  xp_gained?: number;
  new_badges?: { code: string; name: string; icon: string; desc?: string }[];
};

type Row =
  | { kind: "elo"; before: number; after: number; delta: number }
  | { kind: "xp"; amount: number }
  | { kind: "badge"; icon: string; name: string };

// Maç sonu kazanımları: ELO değişimi, XP, yeni rozet(ler) — sırayla, sayaç + seslerle gelir.
export default function MatchRewards({ rewards }: { rewards: Rewards | null }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const startedRef = useRef(false);

  // Gösterilecek satırları oluştur (sadece anlamlı olanlar).
  const rows: Row[] = [];
  if (rewards) {
    if (typeof rewards.elo_delta === "number" && rewards.elo_delta !== 0) {
      rows.push({ kind: "elo", before: rewards.elo_before ?? 0, after: rewards.elo_after ?? 0, delta: rewards.elo_delta });
    }
    if (rewards.xp_gained && rewards.xp_gained > 0) {
      rows.push({ kind: "xp", amount: rewards.xp_gained });
    }
    for (const b of rewards.new_badges || []) {
      rows.push({ kind: "badge", icon: b.icon, name: b.name });
    }
  }

  // Satırları sırayla ortaya çıkar (her biri ~900ms arayla).
  useEffect(() => {
    if (startedRef.current || rows.length === 0) return;
    startedRef.current = true;
    let i = 0;
    const reveal = () => {
      i += 1;
      setVisibleCount(i);
      if (i < rows.length) setTimeout(reveal, 1100);
    };
    setTimeout(reveal, 400);
  }, [rows.length]);

  if (rows.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.slice(0, visibleCount).map((row, idx) => (
        <RewardRow key={idx} row={row} />
      ))}
    </div>
  );
}

function RewardRow({ row }: { row: Row }) {
  if (row.kind === "elo") {
    return (
      <Card>
        <span style={{ fontSize: 26 }}>{row.delta >= 0 ? "📈" : "📉"}</span>
        <span style={{ flex: 1, fontWeight: 600, color: "var(--text-strong)" }}>ELO</span>
        <CountUp
          from={row.before} to={row.after}
          color={row.delta >= 0 ? "var(--tile-correct)" : "var(--accent-hot)"}
          suffix={` (${row.delta >= 0 ? "+" : ""}${row.delta})`}
        />
      </Card>
    );
  }
  if (row.kind === "xp") {
    return (
      <Card>
        <span style={{ fontSize: 26 }}>💎</span>
        <span style={{ flex: 1, fontWeight: 600, color: "var(--text-strong)" }}>Kazanılan XP</span>
        <CountUp from={0} to={row.amount} color="var(--accent)" prefix="+" />
      </Card>
    );
  }
  // badge
  return (
    <Card highlight>
      <span style={{ fontSize: 30 }}>{row.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Yeni rozet!</div>
        <div style={{ fontWeight: 700, color: "var(--text-strong)" }}>{row.name}</div>
      </div>
    </Card>
  );
}

// Sayı sayma animasyonu: sayarken "tick" sesleri (dırdırdır), bitince net "çlink".
function CountUp({ from, to, color, prefix = "", suffix = "" }: { from: number; to: number; color: string; prefix?: string; suffix?: string }) {
  const [val, setVal] = useState(from);
  const done = useRef(false);

  useEffect(() => {
    const range = Math.abs(to - from);
    const dir = to >= from ? 1 : -1;
    const steps = Math.min(range, 30);           // en çok 30 adım
    if (steps === 0) { setVal(to); try { playSound("count_done"); } catch {} return; }
    const stepSize = range / steps;
    let cur = from;
    let n = 0;
    const iv = setInterval(() => {
      n += 1;
      cur += dir * stepSize;
      const shown = n >= steps ? to : Math.round(cur);
      setVal(shown);
      // Her adımda kısa keskin tık -> hızlı "dırdırdır"
      if (n < steps) { try { playSound("count_tick"); } catch {} }
      if (n >= steps) {
        clearInterval(iv);
        if (!done.current) { done.current = true; try { playSound("count_done"); } catch {} } // "çlink"
      }
    }, 45);
    return () => clearInterval(iv);
  }, [from, to]);

  return (
    <span className="brand-mono" style={{ fontSize: 20, fontWeight: 800, color }}>
      {prefix}{val}{suffix}
    </span>
  );
}

function Card({ children, highlight }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
      background: "var(--bg-panel)", borderRadius: 12,
      border: highlight ? "1px solid var(--accent)" : "1px solid var(--border-soft)",
      boxShadow: highlight ? "0 0 16px rgba(224,148,10,.25)" : "none",
      animation: "rewardIn .35s ease",
    }}>
      {children}
      <style>{`@keyframes rewardIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
