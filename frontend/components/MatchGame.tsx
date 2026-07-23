"use client";

import { useEffect, useState, useCallback } from "react";
import { useMatch } from "@/lib/useMatch";
import Grid from "./Grid";
import ScoreBar from "./ScoreBar";

export default function MatchGame({
  code,
  playerId,
  name,
}: {
  code: string;
  playerId: string;
  name: string;
}) {
  const { connected, state, lastEvent, error, flash, buzzer, guess } = useMatch(
    code,
    playerId,
    name
  );
  const [draft, setDraft] = useState("");

  const round = state?.round ?? null;
  const myTurn = round?.turn_player_id === playerId;
  const turnFree = round?.turn_player_id == null;
  const phase = state?.phase;

  // Tur değişince taslağı temizle
  useEffect(() => {
    setDraft("");
  }, [state?.round_index, round?.turn_player_id]);

  // Klavyeye yazmaya başlayınca otomatik buzzer al (sıra boşsa)
  const onType = useCallback(
    (value: string) => {
      if (phase !== "round_active" || !round) return;
      // Sıra bende değilse ve boşsa -> ilk yazışta buzzer al
      if (turnFree) {
        buzzer();
      }
      if (!myTurn && !turnFree) return; // rakibin sırası, yazma
      setDraft(value.toUpperCase());
    },
    [phase, round, turnFree, myTurn, buzzer]
  );

  const submit = useCallback(() => {
    if (!round || !myTurn) return;
    // İlk harf sabit; kullanıcı geri kalanı yazar. Tam kelimeyi oluştur.
    const full = (round.first_letter + draft.replace(/^./, "").slice(0, round.length - 1))
      .toUpperCase()
      .slice(0, round.length);
    if (full.length !== round.length) return;
    guess(full);
    setDraft("");
  }, [round, myTurn, draft, guess]);

  if (!connected && !state) {
    return <Centered>Bağlanılıyor…</Centered>;
  }

  // Bekleme: ikinci oyuncu bekleniyor
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
          <p style={{ color: "var(--text-dim)", fontSize: 13 }}>
            İkinci oyuncu aynı kodla girince maç başlar.
          </p>
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
          <a
            href="/oyna"
            style={{
              display: "inline-block",
              marginTop: 18,
              padding: "12px 24px",
              background: "var(--accent)",
              color: "#1a1330",
              borderRadius: 10,
              fontWeight: 700,
              fontFamily: "var(--font-display)",
            }}
          >
            Yeni Maç
          </a>
        </div>
      </div>
    );
  }

  // Aktif oyun
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <ScoreBar state={state} myId={playerId} />

      {/* Bildirimler */}
      <div style={{ minHeight: 22, textAlign: "center" }}>
        {error && <span style={{ color: "var(--accent-hot)", fontSize: 14 }}>{error}</span>}
        {!error && flash && (
          <span style={{ color: "var(--accent)", fontSize: 14 }}>{flash}</span>
        )}
        {!error && !flash && round && (
          <span style={{ color: "var(--text-dim)", fontSize: 13 }}>
            {myTurn
              ? "Sıra sende — kelimeyi yaz ve gönder"
              : turnFree
              ? "İlk yazan başlar!"
              : "Rakibin sırası…"}
          </span>
        )}
      </div>

      {round && (
        <Grid round={round} players={state.players} myId={playerId} draft={draft} />
      )}

      {/* Kontrol alanı */}
      {round && (
        <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
          {turnFree && (
            <button onClick={buzzer} style={buzzerStyle}>
              Sırayı Kap
            </button>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <input
              value={draft.replace(/^./, "")}
              onChange={(e) => onType(round.first_letter + e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              disabled={!myTurn && !turnFree}
              placeholder={`${round.length - 1} harf daha`}
              maxLength={round.length - 1}
              autoFocus
              style={{
                padding: "12px 16px",
                borderRadius: 10,
                border: myTurn ? "2px solid var(--accent)" : "2px solid var(--tile-border)",
                background: "var(--bg-elevated)",
                color: "var(--text-strong)",
                fontSize: 18,
                fontFamily: "var(--font-display)",
                width: 180,
                textAlign: "center",
                letterSpacing: "0.15em",
                opacity: !myTurn && !turnFree ? 0.5 : 1,
              }}
            />
            <button onClick={submit} disabled={!myTurn} style={{ ...buzzerStyle, opacity: myTurn ? 1 : 0.5 }}>
              Gönder
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const buzzerStyle: React.CSSProperties = {
  padding: "12px 26px",
  borderRadius: 10,
  border: "none",
  background: "var(--accent)",
  color: "#1a1330",
  fontWeight: 700,
  fontSize: 16,
  cursor: "pointer",
  fontFamily: "var(--font-display)",
};

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: 240,
        color: "var(--text-soft)",
      }}
    >
      <div>{children}</div>
    </div>
  );
}
