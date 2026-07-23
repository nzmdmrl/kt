"use client";

import { useEffect, useState, useCallback } from "react";
import { useMatch } from "@/lib/useMatch";
import Grid from "./Grid";
import ScoreBar from "./ScoreBar";

export default function MatchGame({
  code,
  playerId,
  name,
  bot,
  botElo,
}: {
  code: string;
  playerId: string;
  name: string;
  bot?: boolean;
  botElo?: number;
}) {
  const { connected, state, lastEvent, error, flash, buzzer, guess } = useMatch(
    code,
    playerId,
    name,
    bot,
    botElo
  );
  const [draft, setDraft] = useState("");

  const round = state?.round ?? null;
  const myTurn = round?.turn_player_id === playerId;
  const turnFree = round?.turn_player_id == null;
  const phase = state?.phase;

  useEffect(() => {
    setDraft("");
  }, [state?.round_index, round?.turn_player_id]);

  // Kullanıcı TAM kelimeyi yazar (ilk harf dahil). İlk harf ipucu olarak
  // gösterilir ama kullanıcı onu da yazabilir — çakışma yok.
  const onType = useCallback(
    (value: string) => {
      if (phase !== "round_active" || !round) return;
      // Sıra boşsa ilk tuşta buzzer al.
      if (turnFree) buzzer();
      if (!myTurn && !turnFree) return;
      // Sadece harf, büyük harfe çevir, uzunlukla sınırla.
      const clean = value.toUpperCase().replace(/[^A-ZÇĞİÖŞÜI]/g, "").slice(0, round.length);
      setDraft(clean);
    },
    [phase, round, turnFree, myTurn, buzzer]
  );

  const submit = useCallback(() => {
    if (!round || !myTurn) return;
    if (draft.length !== round.length) return;
    // İlk harf kontrolü kullanıcıya bırakılmaz; backend zaten doğruluyor.
    guess(draft);
    setDraft("");
  }, [round, myTurn, draft, guess]);

  if (!connected && !state) {
    return <Centered>Bağlanılıyor…</Centered>;
  }

  // Bekleme
  if (!state || phase === "waiting" || state.players.length < 2) {
    return (
      <div style={{ display: "grid", gap: 18, justifyItems: "center" }}>
        <Centered>
          <div className="brand-mono" style={{ fontSize: 22, marginBottom: 8 }}>
            Rakip bekleniyor…
          </div>
          <p style={{ color: "var(--text-soft)", textAlign: "center" }}>
            Bu oda kodunu rakibinle paylaş:
          </p>
          <div
            className="brand-mono"
            style={{
              fontSize: 40,
              letterSpacing: "0.2em",
              color: "var(--accent)",
              margin: "12px 0",
              padding: "10px 24px",
              background: "var(--bg-panel)",
              border: "1px solid var(--border-soft)",
              borderRadius: 12,
            }}
          >
            {code}
          </div>
        </Centered>
      </div>
    );
  }

  // Maç bitti
  if (phase === "finished" || lastEvent?.type === "match_over") {
    const result = lastEvent?.type === "match_over" ? lastEvent.result : null;
    const players = state.players;
    const me = players.find((p) => p.id === playerId);
    const opp = players.find((p) => p.id !== playerId);
    const won = result ? result.winner === playerId : (me?.score ?? 0) > (opp?.score ?? 0);
    const draw = result ? result.winner === null : (me?.score ?? 0) === (opp?.score ?? 0);
    return (
      <div style={{ display: "grid", gap: 20 }}>
        <ScoreBar state={state} myId={playerId} />
        <div
          style={{
            textAlign: "center",
            background: "var(--bg-panel)",
            border: "1px solid var(--border-soft)",
            borderRadius: "var(--radius)",
            padding: 28,
          }}
        >
          <div
            className="brand-mono"
            style={{
              fontSize: 30,
              color: draw ? "var(--text-strong)" : won ? "var(--tile-correct)" : "var(--accent-hot)",
            }}
          >
            {draw ? "Berabere!" : won ? "Kazandın! 🏆" : "Kaybettin"}
          </div>
          <p style={{ color: "var(--text-soft)", marginTop: 8 }}>
            {me?.name}: {me?.score} — {opp?.name}: {opp?.score}
          </p>
          <a href="/oyna" style={newMatchBtn}>Yeni Maç</a>
        </div>
      </div>
    );
  }

  // Aktif oyun — GÜÇLÜ sıra göstergesi
  const turnBanner = myTurn
    ? { text: "SIRA SENDE", bg: "var(--tile-correct)", color: "#fff" }
    : turnFree
    ? { text: "İLK YAZAN KAPAR!", bg: "var(--accent)", color: "#1a1330" }
    : { text: "RAKİBİN SIRASI", bg: "var(--bg-elevated)", color: "var(--text-soft)" };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <ScoreBar state={state} myId={playerId} />

      {/* Büyük, net sıra göstergesi */}
      <div
        style={{
          textAlign: "center",
          padding: "10px",
          borderRadius: 10,
          background: turnBanner.bg,
          color: turnBanner.color,
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 17,
          letterSpacing: "0.05em",
          transition: "all .2s",
          boxShadow: myTurn ? "0 0 24px rgba(58,167,109,.35)" : "none",
        }}
      >
        {turnBanner.text}
      </div>

      {/* İnce bildirim satırı */}
      <div style={{ minHeight: 18, textAlign: "center" }}>
        {error && <span style={{ color: "var(--accent-hot)", fontSize: 14 }}>{error}</span>}
        {!error && flash && <span style={{ color: "var(--accent)", fontSize: 14 }}>{flash}</span>}
      </div>

      {round && (
        <Grid round={round} players={state.players} myId={playerId} draft={draft} />
      )}

      {round && (
        <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <input
              value={draft}
              onChange={(e) => onType(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              disabled={!myTurn && !turnFree}
              placeholder={
                round.first_letter
                  ? `${round.first_letter} ile başla, ${round.length} harf`
                  : `${round.length} harf`
              }
              maxLength={round.length}
              autoFocus
              style={{
                padding: "13px 16px",
                borderRadius: 10,
                border: myTurn ? "2px solid var(--tile-correct)" : "2px solid var(--tile-border)",
                background: "var(--bg-elevated)",
                color: "var(--text-strong)",
                fontSize: 20,
                fontFamily: "var(--font-display)",
                width: 220,
                textAlign: "center",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                opacity: !myTurn && !turnFree ? 0.5 : 1,
              }}
            />
            <button onClick={submit} disabled={!myTurn || draft.length !== round.length} style={{ ...sendBtn, opacity: myTurn && draft.length === round.length ? 1 : 0.5 }}>
              Gönder
            </button>
          </div>
          <p style={{ color: "var(--text-dim)", fontSize: 12 }}>
            İpucu: kelime <strong style={{ color: "var(--accent)" }}>{round.first_letter}</strong> harfiyle başlıyor
          </p>
        </div>
      )}
    </div>
  );
}

const sendBtn: React.CSSProperties = {
  padding: "13px 24px",
  borderRadius: 10,
  border: "none",
  background: "var(--accent)",
  color: "#1a1330",
  fontWeight: 700,
  fontSize: 16,
  cursor: "pointer",
  fontFamily: "var(--font-display)",
};

const newMatchBtn: React.CSSProperties = {
  display: "inline-block",
  marginTop: 18,
  padding: "12px 24px",
  background: "var(--accent)",
  color: "#1a1330",
  borderRadius: 10,
  fontWeight: 700,
  fontFamily: "var(--font-display)",
};

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: 240, color: "var(--text-soft)" }}>
      <div>{children}</div>
    </div>
  );
}
