"use client";

import { MatchState } from "@/lib/useMatch";
import { toUpperTr } from "@/lib/turkish";

export default function ScoreBar({
  state,
  myId,
  backHref,
}: {
  state: MatchState;
  myId: string;
  backHref?: string;   // verilirse süre satırının soluna "←" (ana sayfa) butonu konur
}) {
  const [p1, p2] = state.players;
  const round = state.round;
  const turnId = round?.turn_player_id ?? null;
  const timeLeft = round?.time_left ?? 0;
  const answerLeft = round?.answer_time_left ?? 0;
  // Tek turluk modda (mod 2) "Tur 1/1" yazmak anlamsız — sadece harf sayısı gösterilir.
  const totalRounds = state.total_rounds ?? 3;

  return (
    <div className="scorebar" style={{ display: "grid", gap: 10, background: "var(--bg-panel)", border: "1px solid var(--border-soft)", borderRadius: "var(--radius)", padding: 14, width: "100%", maxWidth: "100%", boxSizing: "border-box", overflow: "hidden" }}>
      {/* Satır 1: iki oyuncu kartı */}
      <div className="sb-players" style={{ display: "flex", alignItems: "stretch", gap: 10 }}>
        <PlayerChip player={p1} myId={myId} active={turnId === p1?.id} />
        <PlayerChip player={p2} myId={myId} active={turnId === p2?.id} right />
      </div>

      {/* Satır 2: [tur saniyesi] — [Tur X/N · N harf] — [cevap süresi] üç SABİT blok.
          Yan bloklar eşit sabit genişlikte (saniye basamağı değişince kaymaz),
          orta blok kalan alanı doldurur ve hep ortada durur. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
        {/* En sol: geri (ana sayfa) — ayrı satır açmamak için bu satırın içinde durur */}
        {backHref && (
          <a
            href={backHref}
            title="Ana sayfa"
            style={{
              display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: "50%",
              border: "1px solid var(--border-soft)", background: "var(--bg-elevated)",
              color: "var(--text-strong)", fontSize: 16, textDecoration: "none", flexShrink: 0,
            }}
          >
            ←
          </a>
        )}

        {/* Sol: tur saniyesi — sabit genişlik, sola hizalı */}
        <div style={{ width: 60, flexShrink: 0, display: "flex", alignItems: "baseline", gap: 3 }}>
          <span className="brand-mono" style={{ fontSize: 26, lineHeight: 1, fontWeight: 700, color: timeLeft <= 10 ? "var(--accent-hot)" : "var(--accent)" }}>{timeLeft}</span>
          <span style={{ fontSize: 10, color: "var(--text-dim)" }}>sn</span>
        </div>

        {/* Orta: Tur X/N · N harf (tek turluk modda sadece "N harf") — kalan alan, ortalı */}
        <div style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 13, color: "var(--text-soft)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {round ? (totalRounds > 1 ? `Tur ${round.index + 1}/${totalRounds} · ${round.length} harf` : `${round.length} harf`) : ""}
        </div>

        {/* Sağ: cevap süresi — sabit genişlik, sağa hizalı */}
        <div style={{ width: 60, flexShrink: 0, textAlign: "right" }}>
          {turnId && answerLeft > 0 ? (
            <span style={{ fontSize: 13, color: answerLeft <= 5 ? "var(--accent-hot)" : "var(--accent)", fontWeight: 600, whiteSpace: "nowrap" }}>
              {answerLeft}s
            </span>
          ) : null}
        </div>

        {/* Geri butonunun genişlik dengesi — orta yazı ortada kalsın */}
        {backHref && <span style={{ width: 30, flexShrink: 0 }} />}
      </div>

      {/* Satır 3: zaman çizgisi (cevap penceresi) */}
      {turnId && answerLeft > 0 && (
        <div style={{ height: 6, borderRadius: 3, background: "var(--bg-elevated)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(100, (answerLeft / 20) * 100)}%`, background: answerLeft <= 5 ? "var(--accent-hot)" : "var(--accent)", transition: "width 1s linear, background .3s" }} />
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
  player?: { id: string; name: string; score: number; is_bot: boolean; avatar_url?: string | null; trophies?: number; medals?: number; badges?: number };
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
        minWidth: 0,
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
          width: "clamp(34px, 10vw, 44px)",
          height: "clamp(34px, 10vw, 44px)",
          borderRadius: 10,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "clamp(15px, 4vw, 18px)",
          color: active ? "#1a1330" : "var(--text-strong)",
          background: active ? "var(--accent)" : "var(--bg-elevated)",
          border: active ? "none" : "1px solid var(--tile-border)",
          flexShrink: 0,
        }}
      >
        {player.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={player.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          toUpperTr(player.name.charAt(0))
        )}
      </div>
      <div style={{ textAlign: right ? "right" : "left", minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--text-strong)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {player.name}
          {isMe && <span style={{ color: "var(--text-dim)" }}> (sen)</span>}
        </div>
        {/* Başarı özeti: kupa / madalya / rozet (0 olanlar gizli) — mobilde de sığar */}
        {((player.trophies || 0) + (player.medals || 0) + (player.badges || 0)) > 0 && (
          <div style={{ display: "flex", gap: 4, fontSize: 10, color: "var(--text-soft)", justifyContent: right ? "flex-end" : "flex-start", marginTop: 1, flexWrap: "nowrap", whiteSpace: "nowrap", lineHeight: 1.2 }}>
            {(player.trophies || 0) > 0 && <span style={{ whiteSpace: "nowrap" }}>🏆{player.trophies}</span>}
            {(player.medals || 0) > 0 && <span style={{ whiteSpace: "nowrap" }}>🥈{player.medals}</span>}
            {(player.badges || 0) > 0 && <span style={{ whiteSpace: "nowrap" }}>🎖️{player.badges}</span>}
          </div>
        )}
        <div className="brand-mono" style={{ fontSize: 22, color: "var(--accent)" }}>
          {player.score}
        </div>
      </div>
    </div>
  );
}
