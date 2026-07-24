"use client";

import { useEffect, useState, useCallback } from "react";
import { useMatch } from "@/lib/useMatch";
import { toUpperTr } from "@/lib/turkish";
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
  const [locked, setLocked] = useState(false); // tahmin gönderildi, yanıt bekleniyor
  const [nextRoundIn, setNextRoundIn] = useState(0); // tur arası geri sayım (sn)
  const [hasFocus, setHasFocus] = useState(false); // input'ta focus var mı

  const round = state?.round ?? null;
  const myTurn = round?.turn_player_id === playerId;
  const turnFree = round?.turn_player_id == null;
  const phase = state?.phase;

  // Yazma engelli mi? (input disabled) — kilitli, tur pasif, veya kesin rakip sırası.
  // Focus varken (kullanıcı yazıyor) ve tur bitmemişse input açık tutulur ki
  // buzzer alınırken oluşan kısa state gecikmesinde harf düşmesin.
  const writeBlocked =
    locked ||
    phase !== "round_active" ||
    (!myTurn && !turnFree && !hasFocus);

  // Tur bitince (round_over) geri sayımı başlat (backend REVEAL_SECONDS ile uyumlu).
  const REVEAL_SECONDS = 5;
  useEffect(() => {
    if (lastEvent?.type === "round_over") {
      setNextRoundIn(REVEAL_SECONDS);
    }
  }, [lastEvent]);

  // Geri sayımı saniyede bir azalt.
  useEffect(() => {
    if (nextRoundIn <= 0) return;
    const t = setTimeout(() => setNextRoundIn((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(t);
  }, [nextRoundIn]);

  // Yeni tur başlayınca geri sayımı sıfırla.
  useEffect(() => {
    setNextRoundIn(0);
  }, [state?.round_index]);

  // Tur/sıra değişince taslağı, kilidi ve focus'u temizle.
  useEffect(() => {
    setDraft("");
    setLocked(false);
    setHasFocus(false);
  }, [state?.round_index, round?.turn_player_id]);

  // Tahmin sonucu gelince kilidi çöz (yeni sıra durumuna göre input yeniden değerlenir).
  useEffect(() => {
    if (lastEvent?.type === "guess_result") {
      setLocked(false);
    }
  }, [lastEvent]);

  // Input'a odaklanınca (tıklayınca) sıra boşsa hemen buzzer al — böylece
  // yazmaya başlamadan sıra alınır ve harfler buzzer tetiklemesiyle çakışıp düşmez.
  const onFocus = useCallback(() => {
    setHasFocus(true);
    if (round && phase === "round_active" && turnFree && !locked) {
      buzzer();
    }
  }, [round, phase, turnFree, locked, buzzer]);

  // Harf yazma: buzzer focus'ta alındığı için burada SADECE harf kaydedilir.
  // Yazma sırasında sıra bende/boşsa kabul; harf asla düşmez.
  const onType = useCallback(
    (value: string) => {
      if (!round) return;
      if (locked || phase !== "round_active") return;
      // Sıra kesin rakipteyse yazma. (Boş veya bende ise kabul.)
      if (!myTurn && !turnFree) return;
      const clean = toUpperTr(value).replace(/[^A-ZÇĞİÖŞÜI]/g, "").slice(0, round.length);
      setDraft(clean);
      // Emniyet: sıra hâlâ boşsa buzzer al (focus kaçtıysa).
      if (turnFree && clean.length > 0) buzzer();
    },
    [round, locked, phase, myTurn, turnFree, buzzer]
  );

  const submit = useCallback(() => {
    if (!round || locked || phase !== "round_active") return;
    if (!myTurn && !turnFree) return;
    if (draft.length !== round.length) return;
    guess(draft);
    setDraft("");
    setLocked(true); // yanıt gelene kadar kilitle (arka arkaya tahmini önler)
  }, [round, locked, phase, myTurn, turnFree, draft, guess]);

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

  // Banner: tur bittiyse sonuç, sürerken sıra durumu.
  const roundFinished = round?.finished;
  const solvedBy = round?.solved_by;
  let turnBanner: { text: string; bg: string; color: string };

  if (roundFinished) {
    if (solvedBy === playerId) {
      turnBanner = { text: "🎉 DOĞRU! Bildin!", bg: "var(--tile-correct)", color: "#fff" };
    } else if (solvedBy) {
      turnBanner = { text: "Rakip bildi", bg: "var(--accent-hot)", color: "#fff" };
    } else {
      turnBanner = { text: "Kimse bilemedi", bg: "var(--bg-elevated)", color: "var(--text-soft)" };
    }
  } else if (myTurn) {
    turnBanner = { text: "▶ SIRA SENDE — kelimeyi yaz!", bg: "var(--tile-correct)", color: "#fff" };
  } else if (turnFree) {
    turnBanner = { text: "İLK YAZAN BAŞLAR!", bg: "var(--accent)", color: "#1a1330" };
  } else {
    turnBanner = { text: "⏳ RAKİBİN SIRASI — bekle", bg: "var(--bg-elevated)", color: "var(--text-soft)" };
  }

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
          boxShadow: (myTurn && !roundFinished) || (roundFinished && solvedBy === playerId) ? "0 0 24px rgba(58,167,109,.35)" : "none",
        }}
      >
        {turnBanner.text}
      </div>

      {/* Tur bitti — sonraki tura kadar geri sayım çizgisi */}
      {roundFinished && nextRoundIn > 0 && (
        <div style={{ display: "grid", gap: 5 }}>
          <div style={{ height: 8, borderRadius: 4, background: "var(--bg-elevated)", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${(nextRoundIn / REVEAL_SECONDS) * 100}%`,
                background: "var(--accent)",
                transition: "width 1s linear",
              }}
            />
          </div>
          <div style={{ textAlign: "center", fontSize: 13, color: "var(--text-soft)" }}>
            sonraki tur: <strong style={{ color: "var(--accent)" }}>{nextRoundIn}s</strong>
          </div>
        </div>
      )}

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
              onFocus={onFocus}
              onBlur={() => setHasFocus(false)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              disabled={writeBlocked}
              placeholder={
                round.first_letter
                  ? `${round.first_letter} ile başla, ${round.length} harf`
                  : `${round.length} harf`
              }
              maxLength={round.length}
              style={{
                padding: "13px 16px",
                borderRadius: 10,
                border: !writeBlocked ? "2px solid var(--tile-correct)" : "2px solid var(--tile-border)",
                background: "var(--bg-elevated)",
                color: "var(--text-strong)",
                fontSize: 20,
                fontFamily: "var(--font-display)",
                width: 220,
                textAlign: "center",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                opacity: !writeBlocked ? 1 : 0.5,
              }}
            />
            <button onClick={submit} disabled={writeBlocked || draft.length !== round.length} style={{ ...sendBtn, opacity: !writeBlocked && draft.length === round.length ? 1 : 0.5 }}>
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
