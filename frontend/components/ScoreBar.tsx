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
        gap: 10,
        background: "var(--bg-panel)",
        border: "1px solid var(--border-soft)",
        borderRadius: "var(--radius)",
        padding: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "stretch", gap: 10 }}>
        <PlayerChip player={p1} myId={myId} active={turnId === p1?.id} />

        {/* Ortadaki BÜYÜK geri sayım */}
        <div style={{ textAlign: "center", minWidth: 84, display: "grid", placeItems: "center" }}>
          <div
            className="brand-mono"
            style={{
              fontSize: 40,
              lineHeight: 1,
              fontWeight: 700,
              color: timeLeft <= 10 ? "var(--accent-hot)" : "var(--accent)",
              transition: "color .3s",
            }}
          >
            {timeLeft}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.1em" }}>SANİYE</div>
        </div>

        <PlayerChip player={p2} myId={myId} active={turnId === p2?.id} right />
      </div>

      {/* Cevap penceresi çubuğu — sıra dolu olduğunda görünür */}
      {turnId && answerLeft > 0 && (
        <div style={{ display: "grid", gap: 4 }}>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: "var(--bg-elevated)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(answerLeft / 10) * 100}%`,
                background: answerLeft <= 3 ? "var(--accent-hot)" : "var(--accent)",
                transition: "width 1s linear, background .3s",
              }}
            />
          </div>
          <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-soft)" }}>
            cevap süresi: <strong style={{ color: answerLeft <= 3 ? "var(--accent-hot)" : "var(--accent)" }}>{answerLeft}s</strong>
          </div>
        </div>
      )}

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
  player?: { id: string; name: string; score: number; is_bot: boolean; avatar_url?: string | null };
  myId: string;
  active: boolean;
  right?: boolean;
}) {
  if (!player) {
    return <div style={{ flex: 1, color: "var(--text-dim)" }}>bekleniyor…</div>;
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
        padding: 8,
        borderRadius: 12,
        // AKTİF oyuncunun kartı parlar — sıra kimde net belli olur.
        background: active ? "var(--accent-glow)" : "transparent",
        border: active ? "2px solid var(--accent)" : "2px solid transparent",
        boxShadow: active ? "0 0 20px var(--accent-glow)" : "none",
        transition: "all .25s",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 18,
          color: active ? "#1a1330" : "var(--text-strong)",
          background: active ? "var(--accent)" : "var(--bg-elevated)",
          border: active ? "none" : "1px solid var(--tile-border)",
          flexShrink: 0,
        }}
      >
        {player.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={player.avatar_url} alt="" width={44} height={44} />
        ) : (
          player.name.charAt(0).toUpperCase()
        )}
      </div>
      <div style={{ textAlign: right ? "right" : "left", minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--text-strong)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {player.name}
          {isMe && <span style={{ color: "var(--text-dim)" }}> (sen)</span>}
        </div>
        <div className="brand-mono" style={{ fontSize: 22, color: "var(--accent)" }}>
          {player.score}
        </div>
      </div>
    </div>
  );
}
