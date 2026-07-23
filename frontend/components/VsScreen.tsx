"use client";

import { useEffect, useState } from "react";

type VsPlayer = {
  name: string;
  elo: number;
  avatar_url?: string | null;
  is_bot?: boolean;
  wins?: number;
  losses?: number;
};

export default function VsScreen({
  me,
  opponent,
  onDone,
}: {
  me: VsPlayer;
  opponent: VsPlayer;
  onDone: () => void;
}) {
  const [count, setCount] = useState(3);

  useEffect(() => {
    if (count <= 0) {
      onDone();
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 900);
    return () => clearTimeout(t);
  }, [count, onDone]);

  return (
    <div
      style={{
        display: "grid",
        gap: 24,
        justifyItems: "center",
        padding: "20px 0",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: 0,
          width: "100%",
          maxWidth: 480,
        }}
      >
        <PlayerCard player={me} side="left" />
        <div
          style={{
            display: "grid",
            placeItems: "center",
            padding: "0 4px",
          }}
        >
          <span
            className="brand-mono"
            style={{
              fontSize: 28,
              color: "var(--accent-hot)",
              fontWeight: 700,
            }}
          >
            VS
          </span>
        </div>
        <PlayerCard player={opponent} side="right" />
      </div>

      <div
        className="brand-mono"
        style={{
          fontSize: 56,
          color: "var(--accent)",
          minHeight: 60,
        }}
      >
        {count > 0 ? count : "!"}
      </div>
      <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Maç başlıyor…</p>
    </div>
  );
}

function PlayerCard({ player, side }: { player: VsPlayer; side: "left" | "right" }) {
  return (
    <div
      style={{
        flex: 1,
        background: "var(--bg-panel)",
        border: "1px solid var(--border-soft)",
        borderRadius: 14,
        padding: 18,
        textAlign: "center",
        animation: `slideIn${side === "left" ? "Left" : "Right"} .5s ease`,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          margin: "0 auto 10px",
          borderRadius: 14,
          background: "var(--bg-elevated)",
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          border: "2px solid var(--tile-border)",
        }}
      >
        {player.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={player.avatar_url} alt="" width={64} height={64} />
        ) : (
          <span className="brand-mono" style={{ fontSize: 28, color: "var(--accent)" }}>
            {player.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div style={{ fontWeight: 600, color: "var(--text-strong)", fontSize: 16 }}>
        {player.name}
      </div>
      <div className="brand-mono" style={{ fontSize: 20, color: "var(--accent)", marginTop: 4 }}>
        {player.elo}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>ELO</div>
      {(player.wins != null || player.losses != null) && (
        <div style={{ fontSize: 12, color: "var(--text-soft)", marginTop: 6 }}>
          {player.wins ?? 0}G / {player.losses ?? 0}M
        </div>
      )}
      {player.is_bot && (
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>bot</div>
      )}
    </div>
  );
}
