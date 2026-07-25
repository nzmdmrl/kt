"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useMatch } from "@/lib/useMatch";
import { toUpperTr } from "@/lib/turkish";
import { useSpeech } from "@/lib/useSpeech";
import { playSound, initSound, startTicking, stopTicking } from "@/lib/sound";
import Grid from "./Grid";
import ScoreBar from "./ScoreBar";
import SoundToggle from "./SoundToggle";

export default function MatchGame({
  code,
  playerId,
  name,
  bot,
  botElo,
  onRematch,
}: {
  code: string;
  playerId: string;
  name: string;
  bot?: boolean;
  botElo?: number;
  onRematch?: () => void;
}) {
  const { connected, state, lastEvent, error, flash, buzzer, guess, emote, useJoker, jokers, rematchRequest, rematchAccept, rematchDecline } = useMatch(
    code,
    playerId,
    name,
    bot,
    botElo
  );
  // Maç bitti durumu — lastEvent'e bağlı DEĞİL (rematch_request gelince kaybolmasın).
  const [matchOverData, setMatchOverData] = useState<any>(null);
  useEffect(() => {
    if (lastEvent?.type === "match_over") {
      const res = lastEvent.result;
      setMatchOverData(res ?? { winner: null });
      // Kazanma/kaybetme sesi.
      if (res?.winner === playerId) playSound("win");
      else if (res?.winner && res.winner !== playerId) playSound("lose");
    } else if (lastEvent?.type === "match_start" || lastEvent?.type === "rematch_accepted") {
      setMatchOverData(null);
    }
  }, [lastEvent, playerId]);

  // Rövanş durumu (insan-insan): isteğim beklemede mi, rakipten istek geldi mi, ret edildi mi.
  const [rematchState, setRematchState] = useState<"idle" | "requested" | "incoming" | "declined">("idle");
  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === "rematch_request") setRematchState("incoming");
    else if (lastEvent.type === "rematch_declined") setRematchState("declined");
    else if (lastEvent.type === "rematch_accepted") setRematchState("idle");
    else if (lastEvent.type === "match_start") setRematchState("idle");
  }, [lastEvent]);
  // Ses sistemini başlat.
  useEffect(() => {
    initSound(true, 70);
  }, []);

  // Joker kullanıldığında: ses çal + (rakip kullandıysa) popup bildirim göster.
  useEffect(() => {
    if (lastEvent?.type !== "joker_used") return;
    const ev: any = lastEvent;
    const soundMap: any = { yellow: "joker_yellow", green: "joker_green", time: "joker_time" };
    playSound(soundMap[ev.kind] || "button");
    if (ev.player_id !== playerId) {
      const labelMap: any = { yellow: "sarı harf", green: "yeşil harf", time: "ekstra zaman" };
      setJokerPopup(`Rakip joker kullandı (${labelMap[ev.kind] || "joker"})`);
      setTimeout(() => setJokerPopup(""), 2500);
    }
  }, [lastEvent, playerId]);

  // Oyun olaylarına göre ses çal.
  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === "match_start") {
      playSound("match_start");
    } else if (lastEvent.type === "round_start") {
      playSound("round_start");
      setEmoteCount(0); // yeni tur — emoji hakkı yenilenir
    } else if (lastEvent.type === "guess_result") {
      // Harfler tek tek yerleşirken renk sesine göre çal.
      // Grid senkronu: her harf `i * 220ms` gecikmeyle flip başlar (flipIn .4s).
      // Harf/renk flip'in ortasında (~200ms) görünür olur; sesi o ana denk getir.
      const tiles = lastEvent.tiles || [];
      const STAGGER = 209;   // %5 hızlandırıldı
      const REVEAL_OFFSET = 190; // %5 hızlandırıldı
      tiles.forEach((t: any, i: number) => {
        setTimeout(() => {
          if (t.state === "correct") playSound("tile_correct");
          else if (t.state === "present") playSound("tile_present");
          else playSound("tile_absent");
        }, i * STAGGER + REVEAL_OFFSET);
      });
      // Kelime bulunduysa son harften sonra doğru sesi.
      setTimeout(() => {
        if (lastEvent.correct) playSound("correct");
      }, tiles.length * STAGGER + REVEAL_OFFSET + 150);
    }
  }, [lastEvent]);

  // Sıra birindeyken (cevap penceresi) tık-tık geri sayımı; son 5 sn yükselir.
  // (round/phase tanımından sonra, aşağıda tanımlı.)

  // Gelen emote animasyonu (kim, hangi emoji).
  const [flyingEmote, setFlyingEmote] = useState<{ id: number; emoji: string; mine: boolean } | null>(null);
  useEffect(() => {
    if (lastEvent?.type === "emote") {
      const mine = lastEvent.player_id === playerId;
      setFlyingEmote({ id: Date.now(), emoji: lastEvent.emoji, mine });
      const t = setTimeout(() => setFlyingEmote(null), 2000);
      return () => clearTimeout(t);
    }
  }, [lastEvent, playerId]);
  const [draft, setDraft] = useState("");
  const [locked, setLocked] = useState(false); // tahmin gönderildi, yanıt bekleniyor
  const [nextRoundIn, setNextRoundIn] = useState(0); // tur arası geri sayım (sn)
  const [emoteCount, setEmoteCount] = useState(0);      // bu turda kaç emoji gönderildi (max 2)
  const [jokerPopup, setJokerPopup] = useState<string>("");  // joker bildirim popup metni
  const [hasFocus, setHasFocus] = useState(false); // input'ta focus var mı

  const round = state?.round ?? null;
  const myTurn = round?.turn_player_id === playerId;
  const turnFree = round?.turn_player_id == null;
  const phase = state?.phase;
  // Joker şimdi kullanılabilir mi: sıra boş (turun başı) ya da zaten bende, tur aktif.
  const canUseJokerNow = phase === "round_active" && !round?.finished && (turnFree || myTurn);

  // Sıra BENDEYKEN (cevap penceresi) tık-tık geri sayımı; kademeli yükselir.
  // Rakibin sırasında SESSİZ (sadece myTurn).
  const answerLeft = round?.answer_time_left ?? 0;
  const myTurnActive = myTurn && !round?.finished && phase === "round_active";
  const answerLeftRef = useRef(answerLeft);
  answerLeftRef.current = answerLeft;
  useEffect(() => {
    if (myTurnActive && answerLeftRef.current > 0) {
      startTicking(() => answerLeftRef.current);
    } else {
      stopTicking();
    }
    return () => stopTicking();
  }, [myTurnActive]);

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
    } else if (lastEvent?.type === "error") {
      // Geçersiz tahmin (yanlış ilk harf, kelime listede yok vb.): kilidi çöz ki
      // kullanıcı düzeltip tekrar yazabilsin. Süre devam ediyor.
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

  // Sesli tanıma: tanınan metni temizle, ilk uygun kelimeyi input'a yaz.
  const onVoiceResult = useCallback(
    (text: string) => {
      if (!round) return;
      // Boşlukları at, Türkçe büyük harfe çevir, sadece harfleri al.
      const clean = toUpperTr(text).replace(/[^A-ZÇĞİÖŞÜI]/g, "");
      // Doğru uzunluktaysa direkt yaz; değilse ilk `length` harfi al.
      const word = clean.slice(0, round.length);
      if (word.length > 0) {
        // Sıra boşsa buzzer al (sesle söz hakkı).
        if (turnFree) buzzer();
        setDraft(word);
        setVoiceHint(clean !== word ? `"${text}" algılandı` : "");
      } else {
        setVoiceHint("Kelime algılanamadı, tekrar dene");
      }
    },
    [round, turnFree, buzzer]
  );

  const [voiceHint, setVoiceHint] = useState("");
  const { supported: micSupported, listening, error: micError, start: micStart, stop: micStop } =
    useSpeech(onVoiceResult, "tr-TR");

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
  if (phase === "finished" || matchOverData) {
    const result = matchOverData;
    const players = state.players;
    const me = players.find((p) => p.id === playerId);
    const opp = players.find((p) => p.id !== playerId);
    const won = result ? result.winner === playerId : (me?.score ?? 0) > (opp?.score ?? 0);
    const draw = result ? result.winner === null : (me?.score ?? 0) === (opp?.score ?? 0);
    const myScore = me?.score ?? 0;
    const oppScore = opp?.score ?? 0;

    const title = draw ? "Berabere!" : won ? "Kazandın! 🏆" : "Kaybettin";
    const titleColor = draw ? "var(--text-strong)" : won ? "var(--tile-correct)" : "var(--accent-hot)";
    const opponentLeft = matchOverData?.opponent_left || lastEvent?.opponent_left;

    return (
      <div style={{ display: "grid", gap: 16 }}>
        {/* Sonuç kartı — paylaşılabilir görsel özet */}
        <div
          style={{
            textAlign: "center",
            background: "linear-gradient(160deg, var(--bg-panel), var(--bg-elevated))",
            border: `2px solid ${titleColor}`,
            borderRadius: "var(--radius)",
            padding: "28px 24px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ fontSize: 44, marginBottom: 4 }}>
            {draw ? "🤝" : won ? "🎉" : "😔"}
          </div>
          <div className="brand-mono" style={{ fontSize: 32, color: titleColor, fontWeight: 700 }}>
            {title}
          </div>
          {opponentLeft && (
            <div style={{ fontSize: 14, color: "var(--text-soft)", marginTop: 6 }}>
              🚪 Rakibin maçtan ayrıldı
            </div>
          )}

          {/* Skor karşılaştırması */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, margin: "20px 0" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 4 }}>{me?.name}</div>
              <div className="brand-mono" style={{ fontSize: 36, color: won ? "var(--tile-correct)" : "var(--text-strong)" }}>{myScore}</div>
            </div>
            <div style={{ fontSize: 20, color: "var(--text-dim)" }}>—</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 4 }}>{opp?.name}</div>
              <div className="brand-mono" style={{ fontSize: 36, color: !won && !draw ? "var(--accent-hot)" : "var(--text-strong)" }}>{oppScore}</div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>kelimetahmin.com</div>
        </div>

        {/* Butonlar: Rövanş + Yeni Rakip */}
        <div style={{ display: "grid", gap: 10 }}>
          {bot ? (
            // Bota karşı: anında yeni maç.
            <button onClick={() => onRematch?.()} style={{ ...newMatchBtn, width: "100%", border: "none", cursor: "pointer" }}>
              🔄 Rövanş
            </button>
          ) : rematchState === "incoming" ? (
            // Rakip rövanş istedi — kabul/ret.
            <div style={{ background: "var(--bg-elevated)", borderRadius: 12, padding: 14, textAlign: "center" }}>
              <div style={{ marginBottom: 10, color: "var(--text-strong)", fontWeight: 600 }}>
                🔄 Rakibin rövanş istiyor!
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { rematchAccept(); setRematchState("idle"); }} style={{ ...newMatchBtn, flex: 1, border: "none", cursor: "pointer" }}>
                  Kabul Et
                </button>
                <button onClick={() => { rematchDecline(); setRematchState("idle"); }} style={{ ...secondaryLink, flex: 1, border: "1px solid var(--border-soft)", background: "transparent", cursor: "pointer", fontFamily: "var(--font-body)" }}>
                  Reddet
                </button>
              </div>
            </div>
          ) : rematchState === "requested" ? (
            <div style={{ ...newMatchBtn, width: "100%", opacity: 0.7, textAlign: "center" }}>
              ⏳ Rakip bekleniyor…
            </div>
          ) : rematchState === "declined" ? (
            <div style={{ background: "var(--bg-elevated)", borderRadius: 12, padding: 14, textAlign: "center", color: "var(--text-soft)" }}>
              Rakip rövanşı reddetti
            </div>
          ) : (
            <button onClick={() => { rematchRequest(); setRematchState("requested"); }} style={{ ...newMatchBtn, width: "100%", border: "none", cursor: "pointer" }}>
              🔄 Rövanş İste
            </button>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <a href="/oyna" style={{ ...secondaryLink, flex: 1 }}>Yeni Rakip</a>
            <button onClick={() => shareResult(won, draw, myScore, oppScore)} style={{ ...secondaryLink, flex: 1, border: "1px solid var(--border-soft)", background: "transparent", cursor: "pointer", fontFamily: "var(--font-body)" }}>
              📤 Paylaş
            </button>
          </div>
          <a href="/lig" style={{ textAlign: "center", color: "var(--text-soft)", fontSize: 14, marginTop: 4 }}>Lig sıralamasını gör →</a>
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
    <div style={{ display: "grid", gap: 14, position: "relative", width: "100%", maxWidth: "100%", overflowX: "hidden", minWidth: 0 }}>
      {/* Üst aksiyon satırı: ana sayfa ikonu + sabit emojiler + ses düğmesi (tek satır) */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
        <a href="/" title="Ana sayfa" style={{ fontSize: 20, lineHeight: 1, textDecoration: "none", flexShrink: 0, display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: "50%", border: "1px solid var(--border-soft)", background: "var(--bg-panel)" }}>
          🏠
        </a>
        {/* Sabit açık emojiler — ortada, sığması için esner */}
        <div style={{ flex: 1, display: "flex", gap: 4, justifyContent: "center", flexWrap: "nowrap", minWidth: 0, overflow: "hidden" }}>
          {["👍", "😂", "😮", "🔥", "😢", "👏"].map((em) => (
            <button
              key={em}
              onClick={() => {
                if (emoteCount >= 2) return;
                emote(em);
                setEmoteCount((c) => c + 1);
              }}
              disabled={emoteCount >= 2}
              title={emoteCount >= 2 ? "Bu turda emoji hakkın bitti" : "Emoji gönder"}
              style={{
                fontSize: "clamp(15px, 4.5vw, 20px)",
                width: "clamp(28px, 8vw, 38px)", height: 34,
                padding: 0, borderRadius: 8,
                border: "1px solid var(--border-soft)", background: "var(--bg-panel)",
                cursor: emoteCount >= 2 ? "not-allowed" : "pointer", lineHeight: 1,
                display: "grid", placeItems: "center", flexShrink: 1,
                opacity: emoteCount >= 2 ? 0.4 : 1,
              }}
            >
              {em}
            </button>
          ))}
        </div>
        <SoundToggle />
      </div>

      {/* Uçan emote animasyonu */}
      {flyingEmote && (
        <div
          key={flyingEmote.id}
          style={{
            position: "absolute",
            top: 60,
            [flyingEmote.mine ? "left" : "right"]: "18%",
            fontSize: 56,
            zIndex: 20,
            pointerEvents: "none",
            animation: "emoteFloat 2s ease-out forwards",
          } as React.CSSProperties}
        >
          {flyingEmote.emoji}
        </div>
      )}

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
      <div style={{ minHeight: 18, textAlign: "center", position: "relative" }}>
        {error && <span style={{ color: "var(--accent-hot)", fontSize: 14 }}>{error}</span>}
        {!error && flash && <span style={{ color: "var(--accent)", fontSize: 14 }}>{flash}</span>}
        {/* Joker popup — rakip joker kullanınca 2.5sn görünüp kaybolur */}
        {jokerPopup && (
          <div style={{
            position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
            background: "var(--bg-elevated)", border: "1px solid var(--accent)",
            borderRadius: 20, padding: "8px 18px", fontSize: 14, fontWeight: 600,
            color: "var(--accent)", whiteSpace: "nowrap", boxShadow: "var(--shadow-soft)",
            animation: "fadeIn .2s ease", zIndex: 30,
          }}>
            🃏 {jokerPopup}
          </div>
        )}
      </div>

      {round && (
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start", justifyContent: "center" }}>
          {/* Joker sütunu — grid'in solunda */}
          <JokerColumn
            jokers={jokers?.[playerId]}
            canUseLetter={canUseLetterJoker(round)}
            canUse={canUseJokerNow}
            onUse={(kind) => useJoker(kind)}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Grid round={round} players={state.players} myId={playerId} draft={draft} />
          </div>
        </div>
      )}

      {round && (
        <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "stretch", flexWrap: "wrap", width: "100%" }}>
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
                flex: "1 1 150px",
                minWidth: 0,
                maxWidth: 240,
                textAlign: "center",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                opacity: !writeBlocked ? 1 : 0.5,
              }}
            />

            {/* Mikrofon — BASILI TUT & konuş (küçük simge buton) */}
            {micSupported && (
              <button
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (writeBlocked && !turnFree) return;
                  setVoiceHint("");
                  micStart();
                }}
                onPointerUp={(e) => { e.preventDefault(); micStop(); }}
                onPointerLeave={() => { if (listening) micStop(); }}
                onContextMenu={(e) => e.preventDefault()}
                disabled={writeBlocked && !turnFree}
                title="Basılı tut ve konuş"
                style={{
                  width: 52,
                  borderRadius: 10,
                  border: listening ? "2px solid var(--accent-hot)" : "2px solid var(--border-soft)",
                  background: listening ? "var(--accent-hot)" : "var(--bg-elevated)",
                  cursor: "pointer",
                  fontSize: 22,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all .15s",
                  boxShadow: listening ? "0 0 20px rgba(217,90,90,.45)" : "none",
                  opacity: writeBlocked && !turnFree ? 0.5 : 1,
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  WebkitTouchCallout: "none",
                  WebkitTapHighlightColor: "transparent",
                  touchAction: "none",
                }}
              >
                {listening ? "🔴" : "🎤"}
              </button>
            )}

            {/* Gönder — daraltılmış */}
            <button
              onClick={submit}
              disabled={writeBlocked || draft.length !== round.length}
              style={{ ...sendBtn, opacity: !writeBlocked && draft.length === round.length ? 1 : 0.5 }}
            >
              Gönder
            </button>
          </div>

          {/* Dinleme durumu / sesli ipucu / hata */}
          {listening && (
            <p style={{ fontSize: 13, color: "var(--accent-hot)", fontWeight: 600, textAlign: "center" }}>
              🔴 Dinliyorum… kelimeyi söyle
            </p>
          )}
          {!listening && (voiceHint || micError) && (
            <p style={{ fontSize: 12, color: micError ? "var(--accent-hot)" : "var(--text-soft)", textAlign: "center" }}>
              {micError || voiceHint}
            </p>
          )}

          <p style={{ color: "var(--text-dim)", fontSize: 12 }}>
            İpucu: kelime <strong style={{ color: "var(--accent)" }}>{round.first_letter}</strong> harfiyle başlıyor
            {micSupported && <span> · 🎤 basılı tut & söyle</span>}
          </p>
        </div>
      )}
    </div>
  );
}

const sendBtn: React.CSSProperties = {
  padding: "13px 16px",
  borderRadius: 10,
  border: "none",
  background: "var(--accent)",
  color: "#1a1330",
  fontWeight: 700,
  fontSize: 16,
  cursor: "pointer",
  fontFamily: "var(--font-display)",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const newMatchBtn: React.CSSProperties = {
  display: "inline-block",
  textAlign: "center",
  padding: "14px 24px",
  background: "var(--accent)",
  color: "#1a1330",
  borderRadius: 12,
  fontWeight: 700,
  fontSize: 17,
  fontFamily: "var(--font-display)",
};

const secondaryLink: React.CSSProperties = {
  display: "inline-block",
  textAlign: "center",
  padding: "12px 18px",
  background: "var(--bg-panel)",
  color: "var(--text-strong)",
  borderRadius: 10,
  fontWeight: 600,
  fontSize: 15,
  fontFamily: "var(--font-display)",
};

// Sonuç paylaşımı — Web Share API (mobilde native paylaşım), yoksa panoya kopyala.
function shareResult(won: boolean, draw: boolean, myScore: number, oppScore: number) {
  const outcome = draw ? "berabere kaldım" : won ? "kazandım" : "kaybettim";
  const text = `Kelime Tahmin'de ${myScore}-${oppScore} ${outcome}! 🎯 Sen de dene: kelimetahmin.com`;
  if (navigator.share) {
    navigator.share({ title: "Kelime Tahmin", text, url: "https://kelimetahmin.com" }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => alert("Sonuç panoya kopyalandı!")).catch(() => {});
  }
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: 240, color: "var(--text-soft)" }}>
      <div>{children}</div>
    </div>
  );
}

// Harf jokeri bu turda kullanılabilir mi? (backend can_use_letter_joker ile aynı kural)
// İlk harf hariç bilinen ek harf < (length - 3): 4->0, 5->0-1, 6->0-2
function canUseLetterJoker(round: any): boolean {
  if (!round) return false;
  const known = new Set<number>();
  for (const row of round.rows || []) {
    (row.tiles || []).forEach((t: any, i: number) => {
      if (i !== 0 && t.state === "correct") known.add(i);
    });
  }
  for (const k of Object.keys(round.joker_greens || {})) {
    if (Number(k) !== 0) known.add(Number(k));
  }
  return known.size < (round.length - 3);
}

// Joker sütunu — grid solunda dikey butonlar.
function JokerColumn({ jokers, canUseLetter, canUse, onUse }: {
  jokers: any; canUseLetter: boolean; canUse: boolean;
  onUse: (kind: string) => void;
}) {
  if (!jokers) return <div style={{ width: 0 }} />;
  // Joker sistemi kapalıysa (enabled=false) sütunu hiç gösterme.
  if (jokers.enabled === false) return <div style={{ width: 0 }} />;
  const items = [
    { kind: "yellow", icon: "🟡", left: jokers.yellow, enabled: canUse && canUseLetter && jokers.yellow > 0, title: "Sarı harf jokeri" },
    { kind: "green", icon: "🟢", left: jokers.green, enabled: canUse && canUseLetter && jokers.green > 0, title: "Yeşil harf jokeri" },
    { kind: "time", icon: "⏱️", left: jokers.time, enabled: canUse && jokers.time > 0, title: "Süre uzatma (+10sn)" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, paddingTop: 2 }}>
      {items.map((it) => (
        <button
          key={it.kind}
          onClick={() => it.enabled && onUse(it.kind)}
          disabled={!it.enabled}
          title={it.title + (it.left ? ` (${it.left} hak)` : " (hak yok)")}
          style={{
            position: "relative", width: 34, height: 34, borderRadius: 9,
            border: "1px solid var(--border-soft)",
            background: it.enabled ? "var(--bg-panel)" : "var(--bg-elevated)",
            cursor: it.enabled ? "pointer" : "not-allowed",
            opacity: it.left > 0 ? (it.enabled ? 1 : 0.45) : 0.25,
            fontSize: 16, lineHeight: 1, display: "grid", placeItems: "center",
          }}
        >
          {it.icon}
          {/* Kalan hak rozeti */}
          <span style={{
            position: "absolute", right: -4, top: -4, minWidth: 15, height: 15,
            borderRadius: "50%", background: it.left > 0 ? "var(--accent)" : "var(--text-dim)",
            color: "#1a1330", fontSize: 9, fontWeight: 700, display: "grid", placeItems: "center",
            padding: "0 3px",
          }}>{it.left}</span>
        </button>
      ))}
    </div>
  );
}
