"use client";

import { MatchState } from "@/lib/useMatch";

export default function ScoreBar({
  state,
  myId,
}: {
  state: MatchState;
  myId: string;
}) {
  const [p1, p2] = state.players;
  const round = state.round;
  const turnId = round?.turn_player_id ?? null;
  const timeLeft = round?.time_left ?? 0;
  const answerLeft = round?.answer_time_left ?? 0;

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        background: "var(--bg-panel)",
        border: "1px solid var(--border-soft)",
        borderRadius: "var(--radius)",
        padding: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <PlayerChip player={p1} myId={myId} active={turnId === p1?.id} />

        {/* Ortadaki geri sayım */}
        <div style={{ textAlign: "center", minWidth: 76 }}>
          <div
            className="brand-mono"
            style={{
              fontSize: 30,
              lineHeight: 1,
              color: timeLeft <= 10 ? "var(--accent-hot)" : "var(--accent)",
              transition: "color .3s",
            }}
          >
            {timeLeft}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>saniye</div>
          {turnId && answerLeft > 0 && (
            <div
              style={{
                fontSize: 11,
                color: "var(--accent-hot)",
                marginTop: 2,
                fontWeight: 600,
              }}
            >
              cevap: {answerLeft}s
            </div>
          )}
        </div>

        <PlayerChip player={p2} myId={myId} active={turnId === p2?.id} right />
      </div>

      {round && (
        <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-dim)" }}>
          Tur {round.index + 1}/3 · {round.length} harf
        </div>
      )}
    </div>
  );
}

function PlayerChip({
  player,
  myId,
  active,
  right,
}: {
  player?: { id: string; name: string; score: number; is_bot: boolean };
  myId: string;
  active: boolean;
  right?: boolean;
}) {
  if (!player) {
    return (
      <div style={{ flex: 1, color: "var(--text-dim)", textAlign: right ? "right" : "left" }}>
        bekleniyor…
      </div>
    );
  }
  const isMe = player.id === myId;
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: right ? "row-reverse" : "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 10,
          display: "grid",
          placeItems: "center",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 18,
          color: active ? "#1a1330" : "var(--text-strong)",
          background: active ? "var(--accent)" : "var(--bg-elevated)",
          border: active ? "none" : "1px solid var(--tile-border)",
          boxShadow: active ? "0 4px 16px var(--accent-glow)" : "none",
          transition: "all .2s",
        }}
      >
        {player.name.charAt(0).toUpperCase()}
      </div>
      <div style={{ textAlign: right ? "right" : "left" }}>
        <div style={{ fontSize: 14, color: "var(--text-strong)", fontWeight: 600 }}>
          {player.name}
          {isMe && <span style={{ color: "var(--text-dim)" }}> (sen)</span>}
        </div>
        <div className="brand-mono" style={{ fontSize: 20, color: "var(--accent)" }}>
          {player.score}
        </div>
      </div>
    </div>
  );
}
