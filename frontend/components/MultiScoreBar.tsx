"use client";

/**
 * 3-4 kişilik özel oda skor barı.
 *
 * Üstte profil fotoğrafları, hemen altında kısa ad ve puan. Sırası gelen
 * oyuncunun kartı parlar; bu döngüde hakkını kullananlar (blocked) soluklaşır.
 * Altta tur bilgisi + tur süresi + cevap süresi (1v1'deki gibi belirgin).
 */

import { MatchState } from "@/lib/useMatch";
import { toUpperTr } from "@/lib/turkish";
import { useMatchNameMax, shortMatchName } from "@/lib/uiSettings";

export default function MultiScoreBar({ state, myId }: { state: MatchState; myId: string }) {
  const round = state.round;
  const turnId = round?.turn_player_id ?? null;
  const blocked: string[] = (round as any)?.blocked_ids || [];
  const timeLeft = round?.time_left ?? 0;
  const answerLeft = round?.answer_time_left ?? 0;
  const totalRounds = state.total_rounds ?? 1;
  const myTurn = !!turnId && turnId === myId;
  const nameMax = useMatchNameMax();

  return (
    <div
      className="scorebar"
      style={{
        display: "grid", gap: 10, background: "var(--bg-panel)",
        border: "1px solid var(--border-soft)", borderRadius: "var(--radius)",
        padding: 12, width: "100%", boxSizing: "border-box", overflow: "hidden",
      }}
    >
      {/* Oyuncular: foto üstte, altında ad + puan */}
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        {state.players.map((p) => {
          const active = turnId === p.id;
          const spent = blocked.includes(p.id);
          const isMe = p.id === myId;
          return (
            <div
              key={p.id}
              title={p.name}
              style={{
                flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
                alignItems: "center", gap: 3, padding: "6px 4px", borderRadius: 12,
                background: active ? "var(--accent-glow)" : "transparent",
                border: active ? "2px solid var(--accent)" : "2px solid transparent",
                boxShadow: active ? "0 0 16px var(--accent-glow)" : "none",
                opacity: spent && !active ? 0.45 : 1,
                transition: "all .25s",
              }}
            >
              <div style={{
                width: "clamp(34px, 11vw, 46px)", height: "clamp(34px, 11vw, 46px)",
                borderRadius: "50%", overflow: "hidden", display: "grid", placeItems: "center",
                background: active ? "var(--accent)" : "var(--bg-elevated)",
                border: active ? "none" : "1px solid var(--tile-border)",
                color: active ? "#1a1330" : "var(--text-strong)",
                fontFamily: "var(--font-display)", fontWeight: 700,
                fontSize: "clamp(14px, 4vw, 18px)", flexShrink: 0,
                position: "relative",
              }}>
                {p.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  toUpperTr(p.name.charAt(0))
                )}
                {!p.connected && (
                  <span style={{
                    position: "absolute", inset: 0, background: "rgba(0,0,0,.45)",
                    display: "grid", placeItems: "center", fontSize: 14,
                  }}>🚪</span>
                )}
              </div>
              <span style={{
                fontSize: 11.5, fontWeight: 700, maxWidth: "100%",
                color: isMe ? "var(--accent)" : "var(--text-strong)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {shortMatchName(p.name, nameMax)}
              </span>
              <span className="brand-mono" style={{ fontSize: 17, fontWeight: 800, color: "var(--accent)", lineHeight: 1 }}>
                {p.score}
              </span>
            </div>
          );
        })}
      </div>

      {/* Alt satır: tur süresi · tur bilgisi · cevap süresi */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
        <div style={{ width: 78, flexShrink: 0, display: "flex", alignItems: "baseline", gap: 3 }}>
          <span className="brand-mono" style={{ fontSize: 24, lineHeight: 1, fontWeight: 700, color: timeLeft <= 10 ? "var(--accent-hot)" : "var(--accent)" }}>{timeLeft}</span>
          <span style={{ fontSize: 10, color: "var(--text-dim)" }}>sn</span>
        </div>

        <div style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 13, color: "var(--text-soft)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {round ? (totalRounds > 1 ? `Tur ${round.index + 1}/${totalRounds} · ${round.length} harf` : `${round.length} harf`) : ""}
        </div>

        <div style={{ width: 78, flexShrink: 0, display: "flex", justifyContent: "flex-end" }}>
          {turnId && answerLeft > 0 ? (
            <span
              title={myTurn ? "Cevap süren" : "Sıradaki oyuncunun süresi"}
              className="brand-mono"
              style={{
                display: "inline-flex", alignItems: "baseline", gap: 3,
                padding: "4px 11px", borderRadius: 999, whiteSpace: "nowrap", lineHeight: 1, fontWeight: 800,
                background: myTurn ? (answerLeft <= 5 ? "var(--accent-hot)" : "var(--accent)") : "var(--bg-elevated)",
                color: myTurn ? "#1a1330" : (answerLeft <= 5 ? "var(--accent-hot)" : "var(--text-soft)"),
                border: myTurn ? "none" : "1px solid var(--border-soft)",
                boxShadow: myTurn ? "0 0 16px var(--accent-glow)" : "none",
                transition: "background .3s, color .3s",
              }}
            >
              <span style={{ fontSize: 20 }}>{answerLeft}</span>
              <span style={{ fontSize: 10, opacity: .85 }}>sn</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* Buzzer yarışı durumu */}
      {round && !round.finished && (
        <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-dim)" }}>
          {turnId
            ? (myTurn ? "Sıra sende — cevabı yaz!" : `Cevap sırası: ${shortMatchName(state.players.find((p) => p.id === turnId)?.name || "", nameMax)}`)
            : blocked.length > 0
              ? `⚡ Kalan ${state.players.length - blocked.length} kişi arasında buzzer yarışı`
              : "⚡ Buzzer serbest — ilk yazan sırayı kapar"}
        </div>
      )}
    </div>
  );
}
