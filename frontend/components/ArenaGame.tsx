"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useArena, ArenaPlayer } from "@/lib/useArena";
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
          <p style={{ color: "var(--text-soft)", marginBottom: 4 }}>Sorular: 6</p>
          <p style={{ color: "var(--text-soft)", marginBottom: 30 }}>👤 {state.players.length}/5</p>
          <div style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 30 }}>
            <p className="brand-mono" style={{ fontSize: 20, marginBottom: 16 }}>Rakip ara</p>
            <div style={{ width: 40, height: 40, margin: "0 auto", borderRadius: "50%", border: "3px solid var(--border-soft)", borderTopColor: "var(--accent)", animation: "spin 1s linear infinite" }} />
            <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 20, maxWidth: 300, marginInline: "auto" }}>
              Diğer oyunculardan gelen davetleri Ayarlar'dan devre dışı bırakabilirsin.
            </p>
          </div>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </ArenaShell>
    );
  }

  // Başlangıç / geri sayım
  if (state.phase === "starting" || state.phase === "countdown") {
    return (
      <ArenaShell onExit={onExit} players={state.players}>
        <div style={{ textAlign: "center", paddingTop: 30 }}>
          <h2 className="brand-mono" style={{ fontSize: 26, marginBottom: 6 }}>Arena</h2>
          <p style={{ color: "var(--text-soft)", marginBottom: 4 }}>Sorular: 6</p>
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
  const timePct = q ? Math.max(0, (secondsLeft / q.duration) * 100) : 0;
  const timeColor = secondsLeft <= 3 ? "var(--accent-hot)" : secondsLeft <= 6 ? "#e0940a" : "var(--accent)";
  const alreadyAnswered = q ? submittedRef.current === q.index : false;

  return (
    <ArenaShell onExit={onExit} players={state.players} answers={state.answers}>
      {q && (
        <div>
          {/* Üst: soru no + süre */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span className="brand-mono" style={{ fontSize: 15, color: "var(--text-soft)" }}>Soru {q.index + 1}/{q.total}</span>
            <span className="brand-mono" style={{ fontSize: 15, color: "var(--text-soft)" }}>{q.length} harf</span>
            <span className="brand-mono" style={{ fontSize: 20, color: timeColor }}>{secondsLeft}s</span>
          </div>
          <div style={{ height: 6, background: "var(--bg-panel)", borderRadius: 3, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ width: `${timePct}%`, height: "100%", background: timeColor, transition: "width 1s linear" }} />
          </div>

          {/* Cevap kutuları (dizilen) */}
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 8 }}>
            {Array.from({ length: q.length }).map((_, j) => {
              let letter = "";
              if (useKeyboard) letter = typed[j] || "";
              else if (j < picked.length) letter = q.scrambled[picked[j]];
              const showReveal = isReveal;
              return (
                <span key={j} style={{
                  width: 48, height: 48, display: "grid", placeItems: "center", borderRadius: 10,
                  fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22,
                  color: showReveal ? "#fff" : "var(--text-strong)",
                  background: showReveal ? "var(--tile-correct)" : letter ? "var(--bg-elevated)" : "var(--tile-empty)",
                  border: letter || showReveal ? "none" : "2px solid var(--tile-border)",
                }}>{showReveal ? state.revealAnswer[j] : letter}</span>
              );
            })}
          </div>
          {/* İlk harf ipucu */}
          {!isReveal && (
            <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 12, marginBottom: 16 }}>
              İlk harf: <b style={{ color: "var(--accent)" }}>{q.first_letter}</b>
            </p>
          )}

          {isReveal ? (
            <div style={{ textAlign: "center", padding: 20 }}>
              <p className="brand-mono" style={{ fontSize: 18, color: "var(--tile-correct)" }}>Doğru cevap: {state.revealAnswer}</p>
              {state.myResult && (
                <p style={{ color: state.myResult.correct ? "var(--tile-correct)" : "var(--accent-hot)", marginTop: 8 }}>
                  {state.myResult.correct ? `+${state.myResult.gained} puan ${state.myResult.flash ? "⚡" : ""}` : "Yanlış"}
                </p>
              )}
            </div>
          ) : alreadyAnswered ? (
            <p style={{ textAlign: "center", color: "var(--text-soft)", padding: 20 }}>
              Cevabın alındı, diğer oyuncular bekleniyor… ⏳
            </p>
          ) : useKeyboard ? (
            // Klavye/ses modu
            <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}>
              <input
                value={typed}
                onChange={(e) => setTyped(toUpperTr(e.target.value).replace(/[^A-ZÇĞİÖŞÜI]/g, "").slice(0, q.length))}
                onKeyDown={(e) => e.key === "Enter" && typed.length === q.length && doAnswer(typed)}
                placeholder={`${q.first_letter}...`}
                autoFocus
                style={{
                  padding: "12px 14px", borderRadius: 10, border: "2px solid var(--tile-border)",
                  background: "var(--bg-elevated)", color: "var(--text-strong)", fontSize: 19,
                  fontFamily: "var(--font-display)", width: 150, textAlign: "center",
                  letterSpacing: "0.15em", textTransform: "uppercase",
                }}
              />
              <button onClick={() => typed.length === q.length && doAnswer(typed)}
                disabled={typed.length !== q.length}
                style={{ padding: "12px 18px", borderRadius: 10, border: "none", background: "var(--accent)", color: "#1a1330", fontWeight: 700, cursor: "pointer", opacity: typed.length === q.length ? 1 : 0.5 }}>
                Gönder
              </button>
              <button onClick={() => { setUseKeyboard(false); setTyped(""); }}
                style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border-soft)", background: "transparent", color: "var(--text-soft)", cursor: "pointer" }}>
                🔤
              </button>
            </div>
          ) : (
            // Anagram harf modu
            <div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 14 }}>
                {q.scrambled.map((ltr, i) => {
                  const used = picked.includes(i);
                  const isFirst = ltr === q.first_letter && i === q.scrambled.findIndex((x) => x === q.first_letter);
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
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button onClick={undoLetter} disabled={picked.length === 0}
                  style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid var(--border-soft)", background: "transparent", color: "var(--text-soft)", cursor: "pointer", opacity: picked.length ? 1 : 0.5 }}>
                  ⌫ Geri
                </button>
                <button onClick={() => setUseKeyboard(true)}
                  style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid var(--border-soft)", background: "transparent", color: "var(--text-soft)", cursor: "pointer" }}>
                  🔤 Klavye
                </button>
                {micSupported && (
                  <button
                    onPointerDown={(e) => { e.preventDefault(); setUseKeyboard(true); micStart(); }}
                    onPointerUp={(e) => { e.preventDefault(); stopMicDelayed(); }}
                    onPointerLeave={() => { if (listening) stopMicDelayed(); }}
                    style={{ padding: "10px 16px", borderRadius: 10, border: listening ? "2px solid var(--accent-hot)" : "1px solid var(--border-soft)", background: listening ? "var(--accent-glow)" : "transparent", color: "var(--text-soft)", cursor: "pointer" }}>
                    🎤
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </ArenaShell>
  );
}

// Alt barlı kabuk (her fazda oyuncular altta)
function ArenaShell({ children, onExit, players, answers }: {
  children: React.ReactNode; onExit: () => void;
  players: ArenaPlayer[]; answers?: Record<string, { correct: boolean; flash: boolean }>;
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
          const ring = a ? (a.correct ? "var(--tile-correct)" : "var(--accent-hot)") : "var(--border-soft)";
          return (
            <div key={p.pid} style={{ textAlign: "center", flexShrink: 0, width: 60 }}>
              <div style={{ position: "relative", width: 48, height: 48, margin: "0 auto" }}>
                <img src={p.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(p.name)}`}
                  alt={p.name}
                  style={{ width: 48, height: 48, borderRadius: "50%", border: `3px solid ${ring}`, background: "var(--bg-elevated)", objectFit: "cover" }} />
                {a?.flash && <span style={{ position: "absolute", top: -4, right: -4, fontSize: 14 }}>⚡</span>}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
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
