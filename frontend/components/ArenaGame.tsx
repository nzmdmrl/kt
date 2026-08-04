"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useArena, ArenaPlayer, RevealPlayer } from "@/lib/useArena";
import { toUpperTr } from "@/lib/turkish";
import { playSound, initSound, stopTicking } from "@/lib/sound";
import { useSpeech } from "@/lib/useSpeech";

// Arena maç ekranı — eşleşme, senkron sorular (anagram), sonuç.
export default function ArenaGame({ onExit }: { onExit: () => void }) {
  const { state, connected, answer } = useArena(true);
  const [picked, setPicked] = useState<number[]>([]);   // seçilen karışık harf indexleri (sırayla)
  const [typed, setTyped] = useState("");                // klavye/ses ile yazılan
  const [useKeyboard, setUseKeyboard] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const submittedRef = useRef<number>(-1);               // hangi soruya cevap gönderildi

  useEffect(() => { initSound(true, 70); }, []);

  // Lobide oyuncu sayısı artınca katılım sesi çal.
  const prevCountRef = useRef(0);
  useEffect(() => {
    if (state.phase === "lobby" || state.phase === "connecting") {
      if (state.players.length > prevCountRef.current) {
        playSound("opponent_found");   // katılım sesi (rakip bulundu)
      }
    }
    prevCountRef.current = state.players.length;
  }, [state.players.length, state.phase]);

  const q = state.question;

  // Yeni soru gelince sıfırla
  useEffect(() => {
    if (q) {
      setPicked([]);
      setTyped("");
      setUseKeyboard(false);
      setSecondsLeft(q.duration);
      submittedRef.current = -1;
      playSound("button");
    }
  }, [q?.index]);

  // Geri sayım (client görsel)
  useEffect(() => {
    if (state.phase !== "question" || !q) return;
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [state.phase, secondsLeft, q]);

  // Cevabı gönder (bir kez)
  const doAnswer = useCallback((guessWord: string) => {
    if (!q || submittedRef.current === q.index) return;
    submittedRef.current = q.index;
    answer(guessWord);
  }, [q, answer]);

  // Anagram: harf seç
  function pickLetter(i: number) {
    if (!q || useKeyboard || submittedRef.current === q.index) return;
    if (picked.includes(i)) return;
    const next = [...picked, i];
    setPicked(next);
    playSound("tile_present");
    // İlk harf sabit değil; oyuncu tüm harfleri dizince otomatik gönder
    if (next.length === q.length) {
      const word = next.map((idx) => q.scrambled[idx]).join("");
      doAnswer(word);
    }
  }
  function undoLetter() {
    if (submittedRef.current >= 0) return;
    setPicked((p) => p.slice(0, -1));
  }
  // Cevap kutusuna tıklayınca o pozisyondan itibaren geri al (o harf ve sonrası çıkar).
  function undoFrom(pos: number) {
    if (!q || useKeyboard || submittedRef.current === q.index) return;
    if (pos >= picked.length) return;   // boş kutuya tıklama etkisiz
    setPicked((p) => p.slice(0, pos));
    playSound("button");
  }

  // Sesli cevap
  const onVoice = useCallback((text: string) => {
    if (!q) return;
    const clean = toUpperTr(text).replace(/[^A-ZÇĞİÖŞÜI]/g, "").slice(0, q.length);
    setTyped(clean); setUseKeyboard(true);
  }, [q]);
  const { supported: micSupported, listening, start: micStart, stop: micStop } = useSpeech(onVoice, "tr-TR");
  const micTimer = useRef<any>(null);
  const stopMicDelayed = useCallback(() => {
    if (micTimer.current) clearTimeout(micTimer.current);
    micTimer.current = setTimeout(() => micStop(), 1000);
  }, [micStop]);

  // Ses efektleri: kendi sonucun
  useEffect(() => {
    if (state.myResult) playSound(state.myResult.correct ? "tile_correct" : "wrong");
  }, [state.myResult]);
  useEffect(() => { if (state.phase === "finished") stopTicking(); }, [state.phase]);

  // ---- RENDER ----

  // Eşleşme / lobi
  if (state.phase === "connecting" || state.phase === "lobby") {
    return (
      <ArenaShell onExit={onExit} players={state.players}>
        <div style={{ textAlign: "center", paddingTop: 40 }}>
          <h2 className="brand-mono" style={{ fontSize: 26, marginBottom: 8 }}>Arena</h2>
          <p style={{ color: "var(--text-soft)", marginBottom: 4 }}>Kelimeler: 6</p>
          <p style={{ color: "var(--text-soft)", marginBottom: 30 }}>👤 {state.players.length}/5</p>
          <div style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 30 }}>
            <p className="brand-mono" style={{ fontSize: 20, marginBottom: 16 }}>Rakip aranıyor…</p>
            <div style={{ width: 40, height: 40, margin: "0 auto 20px", borderRadius: "50%", border: "3px solid var(--border-soft)", borderTopColor: "var(--accent)", animation: "spin 1s linear infinite" }} />
            {/* Katılan oyuncuların isimleri */}
            <div style={{ display: "grid", gap: 8, maxWidth: 320, margin: "0 auto" }}>
              {state.players.map((p) => (
                <div key={p.pid} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 14px",
                  background: "var(--bg-panel)", borderRadius: 10,
                  animation: "slideIn .3s ease",
                }}>
                  <img src={p.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(p.name)}`}
                    alt={p.name}
                    style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--bg-elevated)" }} />
                  <span style={{ color: "var(--text-strong)", fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                  {p.is_bot && <span style={{ fontSize: 12 }}>🤖</span>}
                  <span style={{ marginLeft: "auto", color: "var(--tile-correct)", fontSize: 13 }}>katıldı</span>
                </div>
              ))}
              {state.players.length < 5 && (
                <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 4 }}>
                  Diğer oyuncular bekleniyor… ({state.players.length}/5)
                </p>
              )}
            </div>
          </div>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes slideIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}`}</style>
      </ArenaShell>
    );
  }

  // Başlangıç / geri sayım
  if (state.phase === "starting" || state.phase === "countdown") {
    return (
      <ArenaShell onExit={onExit} players={state.players}>
        <div style={{ textAlign: "center", paddingTop: 30 }}>
          <h2 className="brand-mono" style={{ fontSize: 26, marginBottom: 6 }}>Arena</h2>
          <p style={{ color: "var(--text-soft)", marginBottom: 4 }}>Kelimeler: 6</p>
          <p style={{ color: "var(--text-soft)", marginBottom: 24 }}>👤 5</p>
          <p className="brand-mono" style={{ fontSize: 22, marginBottom: 10 }}>içinde başlayacak</p>
          <div className="brand-mono" style={{ fontSize: 90, color: "var(--text-dim)", lineHeight: 1 }}>
            {state.phase === "countdown" ? state.countdownN : "3"}
          </div>
        </div>
      </ArenaShell>
    );
  }

  // Sonuç
  if (state.phase === "finished") {
    return <ArenaResult ranking={state.ranking} onExit={onExit} />;
  }

  // Soru / reveal
  const isReveal = state.phase === "reveal";

  // Reveal fazında TAM TABLO göster (ekteki resim gibi)
  if (isReveal && state.revealPlayers.length > 0) {
    return <ArenaScoreGrid players={state.revealPlayers} total={state.revealTotal} answer={state.revealAnswer} onExit={onExit} />;
  }

  const timePct = q ? Math.max(0, (secondsLeft / q.duration) * 100) : 0;
  const timeColor = secondsLeft <= 3 ? "var(--accent-hot)" : secondsLeft <= 6 ? "#e0940a" : "var(--accent)";
  const alreadyAnswered = q ? submittedRef.current === q.index : false;

  return (
    <ArenaShell onExit={onExit} players={state.players} answers={state.answers} showResults={isReveal}>
      {q && (
        <div>
          {/* Üst: soru no + süre (1v1 tarzı) */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span className="brand-mono" style={{ fontSize: 15, color: "var(--text-soft)" }}>Kelime {q.index + 1}/{q.total}</span>
            <span className="brand-mono" style={{ fontSize: 15, color: "var(--text-soft)" }}>{q.length} harf</span>
            <span className="brand-mono" style={{ fontSize: 20, color: timeColor }}>{secondsLeft}s</span>
          </div>
          <div style={{ height: 6, background: "var(--bg-panel)", borderRadius: 3, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ width: `${timePct}%`, height: "100%", background: timeColor, transition: "width 1s linear" }} />
          </div>

          {/* Cevap kutuları (1v1 Grid tarzı — büyük kareler). Anagram modunda dolu kutuya
              tıklanınca o pozisyondan itibaren harfler geri alınır. */}
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 16 }}>
            {Array.from({ length: q.length }).map((_, j) => {
              let letter = "";
              if (isReveal) letter = state.revealAnswer[j] || "";
              else if (useKeyboard) letter = typed[j] || "";
              else if (j < picked.length) letter = q.scrambled[picked[j]];
              else if (j === 0) letter = q.first_letter;  // ilk harf ipucu soluk
              const isHint = !isReveal && !useKeyboard && j === 0 && j >= picked.length;
              const clickable = !isReveal && !useKeyboard && j < picked.length && submittedRef.current !== q.index;
              return (
                <button key={j}
                  onClick={() => clickable && undoFrom(j)}
                  disabled={!clickable}
                  title={clickable ? "Geri almak için dokun" : undefined}
                  style={{
                    width: 52, height: 52, display: "grid", placeItems: "center", borderRadius: 10,
                    fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, padding: 0,
                    color: isReveal ? "#fff" : isHint ? "var(--text-dim)" : "var(--text-strong)",
                    background: isReveal ? "var(--tile-correct)" : (letter && !isHint) ? "var(--bg-elevated)" : "var(--tile-empty)",
                    border: (letter && !isHint) || isReveal ? "none" : "2px solid var(--tile-border)",
                    cursor: clickable ? "pointer" : "default",
                  }}>{letter}</button>
              );
            })}
          </div>

          {isReveal ? (
            <div style={{ textAlign: "center", padding: 16 }}>
              <p className="brand-mono" style={{ fontSize: 18, color: "var(--tile-correct)" }}>Doğru cevap: {state.revealAnswer}</p>
              {state.myResult && (
                <p style={{ color: state.myResult.correct ? "var(--tile-correct)" : "var(--accent-hot)", marginTop: 8, fontWeight: 600 }}>
                  {state.myResult.correct ? `+${state.myResult.gained} puan ${state.myResult.flash ? "⚡" : ""}` : "Yanlış cevap"}
                </p>
              )}
            </div>
          ) : alreadyAnswered ? (
            <div style={{ textAlign: "center", padding: 20 }}>
              {state.myResult ? (
                <>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>
                    {state.myResult.correct ? "✅" : "❌"}
                  </div>
                  <p className="brand-mono" style={{
                    fontSize: 20, fontWeight: 700, marginBottom: 6,
                    color: state.myResult.correct ? "var(--tile-correct)" : "var(--accent-hot)",
                  }}>
                    {state.myResult.correct ? "Doğru!" : "Yanlış"}
                  </p>
                  {state.myResult.correct && (
                    <p style={{ color: "var(--accent)", fontWeight: 600 }}>
                      +{state.myResult.gained} puan {state.myResult.flash ? "⚡" : ""}
                    </p>
                  )}
                </>
              ) : (
                <p style={{ color: "var(--text-soft)" }}>Cevabın gönderiliyor…</p>
              )}
              <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 14 }}>
                Diğer oyuncular bekleniyor… ⏳
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12, justifyItems: "center" }}>
              {/* Anagram harfleri (üstte, tıklanabilir) */}
              {!useKeyboard && (
                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                  {q.scrambled.map((ltr, i) => {
                    const used = picked.includes(i);
                    const isFirst = i === q.scrambled.findIndex((x) => x === q.first_letter);
                    return (
                      <button key={i} onClick={() => pickLetter(i)} disabled={used}
                        style={{
                          width: 46, height: 46, borderRadius: 10, position: "relative",
                          border: "2px solid var(--border-soft)",
                          background: used ? "var(--bg-panel)" : "var(--bg-elevated)",
                          color: used ? "var(--text-dim)" : "var(--text-strong)",
                          fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20,
                          cursor: used ? "default" : "pointer", opacity: used ? 0.35 : 1,
                        }}>
                        {ltr}
                        {isFirst && <span style={{ position: "absolute", top: -6, left: -6, width: 18, height: 18, borderRadius: "50%", background: "var(--accent)", color: "#1a1330", fontSize: 10, fontWeight: 800, display: "grid", placeItems: "center" }}>1</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 1v1 TARZI giriş satırı: input + mikrofon + Gönder */}
              <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "stretch", flexWrap: "wrap", width: "100%" }}>
                <input
                  value={useKeyboard ? typed : picked.map((idx) => q.scrambled[idx]).join("")}
                  onChange={(e) => { setUseKeyboard(true); setTyped(toUpperTr(e.target.value).replace(/[^A-ZÇĞİÖŞÜI]/g, "").slice(0, q.length)); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { const w = useKeyboard ? typed : picked.map((idx) => q.scrambled[idx]).join(""); if (w.length === q.length) doAnswer(w); } }}
                  placeholder={`${q.first_letter} ile başla, ${q.length} harf`}
                  maxLength={q.length}
                  style={{
                    padding: "13px 16px", borderRadius: 10,
                    border: "2px solid var(--tile-correct)", background: "var(--bg-elevated)",
                    color: "var(--text-strong)", fontSize: 20, fontFamily: "var(--font-display)",
                    flex: "1 1 150px", minWidth: 0, maxWidth: 240, textAlign: "center",
                    letterSpacing: "0.15em", textTransform: "uppercase",
                  }}
                />
                {micSupported && (
                  <button
                    onPointerDown={(e) => { e.preventDefault(); micStart(); }}
                    onPointerUp={(e) => { e.preventDefault(); stopMicDelayed(); }}
                    onPointerLeave={() => { if (listening) stopMicDelayed(); }}
                    onContextMenu={(e) => e.preventDefault()}
                    title="Basılı tut ve konuş"
                    style={{
                      width: 52, borderRadius: 10,
                      border: listening ? "2px solid var(--accent-hot)" : "2px solid var(--border-soft)",
                      background: listening ? "var(--accent-hot)" : "var(--bg-elevated)",
                      cursor: "pointer", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: listening ? "0 0 20px rgba(217,90,90,.45)" : "none",
                      userSelect: "none", WebkitUserSelect: "none", touchAction: "none",
                    }}
                  >{listening ? "🔴" : "🎤"}</button>
                )}
                <button
                  onClick={() => { const w = useKeyboard ? typed : picked.map((idx) => q.scrambled[idx]).join(""); if (w.length === q.length) doAnswer(w); }}
                  disabled={(useKeyboard ? typed.length : picked.length) !== q.length}
                  style={{ ...sendBtn, opacity: (useKeyboard ? typed.length : picked.length) === q.length ? 1 : 0.5 }}
                >Gönder</button>
              </div>

              {/* Harf modu kontrolleri */}
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                {!useKeyboard && (
                  <button onClick={undoLetter} disabled={picked.length === 0}
                    style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid var(--border-soft)", background: "transparent", color: "var(--text-soft)", cursor: "pointer", fontSize: 13, opacity: picked.length ? 1 : 0.5 }}>
                    ⌫ Geri
                  </button>
                )}
                {useKeyboard && (
                  <button onClick={() => { setUseKeyboard(false); setTyped(""); setPicked([]); }}
                    style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid var(--border-soft)", background: "transparent", color: "var(--text-soft)", cursor: "pointer", fontSize: 13 }}>
                    🔡 Harfleri kullan
                  </button>
                )}
              </div>

              {listening && (
                <p style={{ fontSize: 13, color: "var(--accent-hot)", fontWeight: 600 }}>🔴 Dinliyorum… kelimeyi söyle</p>
              )}
              <p style={{ color: "var(--text-dim)", fontSize: 12 }}>
                İpucu: kelime <strong style={{ color: "var(--accent)" }}>{q.first_letter}</strong> harfiyle başlıyor
                {micSupported && <span> · 🎤 basılı tut & söyle</span>}
              </p>
            </div>
          )}
        </div>
      )}
    </ArenaShell>
  );
}


// Alt barlı kabuk (her fazda oyuncular altta)
function ArenaShell({ children, onExit, players, answers, showResults }: {
  children: React.ReactNode; onExit: () => void;
  players: ArenaPlayer[]; answers?: Record<string, { correct: boolean; flash: boolean }>;
  showResults?: boolean;
}) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", maxWidth: 520, margin: "0 auto" }}>
      <div style={{ padding: "12px 16px" }}>
        <button onClick={onExit} style={{ background: "var(--bg-panel)", border: "1px solid var(--border-soft)", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", fontSize: 18, color: "var(--text-strong)" }}>←</button>
      </div>
      <div style={{ flex: 1, padding: "0 18px" }}>{children}</div>
      {/* Alt oyuncu barı */}
      <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: "12px 16px", borderTop: "1px solid var(--border-soft)", background: "var(--bg-panel)" }}>
        {players.map((p) => {
          const a = answers?.[p.pid];
          const answered = !!a;
          const ring = a ? (a.correct ? "var(--tile-correct)" : "var(--accent-hot)") : "var(--border-soft)";
          return (
            <div key={p.pid} style={{ textAlign: "center", flexShrink: 0, width: 62 }}>
              <div style={{ position: "relative", width: 48, height: 48, margin: "0 auto" }}>
                <img src={p.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(p.name)}`}
                  alt={p.name}
                  style={{ width: 48, height: 48, borderRadius: "50%", border: `3px solid ${ring}`, background: "var(--bg-elevated)", objectFit: "cover" }} />
                {a?.flash && <span style={{ position: "absolute", top: -4, right: -4, fontSize: 14 }}>⚡</span>}
                {/* Reveal'de ✓/✗ rozeti */}
                {showResults && answered && (
                  <span style={{
                    position: "absolute", bottom: -3, right: -3, width: 18, height: 18, borderRadius: "50%",
                    background: a!.correct ? "var(--tile-correct)" : "var(--accent-hot)",
                    color: "#fff", fontSize: 11, fontWeight: 800, display: "grid", placeItems: "center",
                    border: "2px solid var(--bg-panel)",
                  }}>{a!.correct ? "✓" : "✗"}</span>
                )}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
              {/* Puan (reveal'de veya oyun boyunca) */}
              {typeof p.score === "number" && p.score > 0 && (
                <div className="brand-mono" style={{ fontSize: 11, color: "var(--accent)" }}>{p.score}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Sonuç ekranı — kupa/madalya sıralaması
function ArenaResult({ ranking, onExit }: { ranking: ArenaPlayer[]; onExit: () => void }) {
  const me = typeof window !== "undefined" ? localStorage.getItem("kt_uid") : null;
  useEffect(() => { playSound("win"); }, []);
  const medal = (rank: number) => rank === 1 ? "🏆" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}.`;
  return (
    <div style={{ minHeight: "100vh", maxWidth: 520, margin: "0 auto", padding: "30px 18px" }}>
      <h1 className="brand-mono" style={{ textAlign: "center", fontSize: 30, marginBottom: 24 }}>Sonuçlar</h1>
      <div style={{ display: "grid", gap: 8 }}>
        {ranking.map((p) => (
          <div key={p.pid} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
            background: "var(--bg-panel)", borderRadius: 12,
            border: (p as any).rank === 1 ? "2px solid var(--accent)" : "1px solid var(--border-soft)",
          }}>
            <span className="brand-mono" style={{ fontSize: 20, width: 36, textAlign: "center" }}>{medal((p as any).rank)}</span>
            <img src={p.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(p.name)}`}
              alt={p.name} style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--bg-elevated)" }} />
            <span style={{ flex: 1, fontWeight: 600, color: "var(--text-strong)" }}>{p.name}{p.is_bot ? " 🤖" : ""}</span>
            <span className="brand-mono" style={{ fontSize: 16, color: "var(--accent)" }}>{p.score} ⭐</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 28, flexWrap: "wrap" }}>
        <button onClick={() => window.location.reload()} style={{ padding: "12px 22px", borderRadius: 11, border: "none", background: "var(--accent)", color: "#1a1330", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Tekrar Arena'ya Gir</button>
        <button onClick={onExit} style={{ padding: "12px 18px", borderRadius: 11, border: "1px solid var(--border-soft)", background: "transparent", color: "var(--text-soft)", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>Ana Sayfa</button>
      </div>
    </div>
  );
}

const sendBtn: React.CSSProperties = {
  padding: "13px 16px", borderRadius: 10, border: "none",
  background: "var(--accent)", color: "#1a1330", fontWeight: 700, fontSize: 16,
  cursor: "pointer", fontFamily: "var(--font-display)", whiteSpace: "nowrap", flexShrink: 0,
};

// Sonuç tablosu — her sütun bir oyuncu, satırlar sorular (✓/✗), altta X/total skoru.
// Reveal fazında birkaç saniye gösterilir (ekteki resim düzeni).
function ArenaScoreGrid({ players, total, answer, onExit }: {
  players: RevealPlayer[]; total: number; answer: string; onExit: () => void;
}) {
  // Kaç soru cevaplandı (en uzun history)
  const answered = Math.max(...players.map((p) => p.history.length), 0);
  return (
    <div style={{ minHeight: "100vh", maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={onExit} style={{ background: "var(--bg-panel)", border: "1px solid var(--border-soft)", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", fontSize: 18, color: "var(--text-strong)" }}>←</button>
        <span className="brand-mono" style={{ fontSize: 16, color: "var(--tile-correct)" }}>Doğru: {answer}</span>
        <span style={{ width: 36 }} />
      </div>

      <div style={{ flex: 1, padding: "10px 16px", overflowY: "auto" }}>
        {/* Izgara: her sütun oyuncu */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "flex-start" }}>
          {players.map((p) => (
            <div key={p.pid} style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
              {/* Satırlar: gelecek sorular ÜSTTE (boş), cevaplananlar ALTTA (resimdeki gibi).
                  Toplam total satır; üstte (total - answered) boş, altta cevaplananlar (ters). */}
              {Array.from({ length: total }).map((_, row) => {
                const emptyCount = total - answered;
                if (row < emptyCount) {
                  return (
                    <div key={row} style={{
                      width: 52, height: 52, borderRadius: 12,
                      border: "2px solid var(--tile-border)", background: "transparent",
                    }} />
                  );
                }
                // altta: en son soru en üstte olacak şekilde
                const qi = answered - 1 - (row - emptyCount);
                const h = p.history[qi];
                if (!h) return <div key={row} style={{ width: 52, height: 52 }} />;
                const bg = h.correct ? "#6b8e5a" : "#a86b7e";
                return (
                  <div key={row} style={{
                    width: 52, height: 52, borderRadius: 12, position: "relative",
                    background: bg, display: "grid", placeItems: "center",
                    fontSize: 24, color: "#fff", fontWeight: 800,
                  }}>
                    {h.correct ? "✓" : "✕"}
                    {h.flash && (
                      <span style={{
                        position: "absolute", top: -6, left: -6, width: 20, height: 20,
                        borderRadius: "50%", background: "#f5c518", color: "#3a2e00",
                        fontSize: 12, display: "grid", placeItems: "center", fontWeight: 800,
                      }}>⚡</span>
                    )}
                  </div>
                );
              })}
              {/* Skor: doğru/toplam */}
              <div className="brand-mono" style={{ fontSize: 15, color: "var(--text-soft)", marginTop: 2 }}>
                {p.correct_count}/{total}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alt oyuncu barı (avatarlar) */}
      <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: "12px 16px", borderTop: "1px solid var(--border-soft)", background: "var(--bg-panel)" }}>
        {players.map((p) => (
          <div key={p.pid} style={{ textAlign: "center", flexShrink: 0, width: 62 }}>
            <img src={p.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(p.name)}`}
              alt={p.name}
              style={{ width: 44, height: 44, borderRadius: "50%", border: "2px solid var(--border-soft)", background: "var(--bg-elevated)", objectFit: "cover" }} />
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
