"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useArena, ArenaPlayer, RevealPlayer } from "@/lib/useArena";
import { guestPid } from "@/lib/guestAccess";
import ResultShare from "./ResultShare";
import { arenaShareText, arenaVariant } from "@/lib/shareText";
import { useSectionMusic } from "@/lib/useSectionMusic";
import { toUpperTr } from "@/lib/turkish";
import { playSound, initSound, stopTicking, suppressUiClick } from "@/lib/sound";
import TitleCelebration from "./TitleCelebration";
import { useSpeech } from "@/lib/useSpeech";
import { exitWithAd, noteMatchFinished, type AdMode } from "@/lib/interstitial";

// Arena maç ekranı — eşleşme, senkron sorular (anagram), sonuç.
// guestName verilirse üye olmayan ziyaretçi olarak bağlanılır (ödül/XP yok).
export default function ArenaGame({ onExit, customCode, guestName }: { onExit: () => void; customCode?: string; guestName?: string }) {
  const { state, connected, answer } = useArena(true, customCode, guestName);
  const isGuest = !!guestName;
  const [picked, setPicked] = useState<number[]>([]);   // seçilen karışık harf indexleri (sırayla)
  const [typed, setTyped] = useState("");                // klavye/ses ile yazılan
  const [useKeyboard, setUseKeyboard] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const submittedRef = useRef<number>(-1);               // hangi soruya cevap gönderildi

  // Ses sistemi + arena boyunca global arayüz tıklama sesini sustur.
  useEffect(() => { initSound(true, 70); return suppressUiClick(); }, []);

  // Özel arena ayrı anahtar (varsayılan reklamsız): ödül vermiyor, arkadaş modu.
  const adMode: AdMode = customCode ? "ozel_arena" : "arena";

  // Arena TAMAMEN bitti (sıralama geldi) -> 1 maç. Sorular arası "reveal"
  // ekranında ve yarıda çıkışta ÇALIŞMAZ. Ref ile bir kez.
  const countedRef = useRef(false);
  useEffect(() => {
    if (countedRef.current) return;
    if (state.phase !== "finished") return;
    countedRef.current = true;
    noteMatchFinished(adMode);
  }, [state.phase, adMode]);

  // Arena rakip aranırken (bekleme fazı) müzik çal; maç başlayınca dur.
  const isWaiting = state.phase === "connecting" || state.phase === "lobby";
  useSectionMusic("arena_wait", isWaiting);

  // "xxx arenadan çıktı" popup — leftNotice değişince göster, 3.5sn sonra gizle.
  const [leftToast, setLeftToast] = useState<string | null>(null);
  const lastNoticeRef = useRef<number>(0);
  useEffect(() => {
    const n = state.leftNotice;
    if (n && n.at !== lastNoticeRef.current) {
      lastNoticeRef.current = n.at;
      setLeftToast(`${n.name} arenadan çıktı`);
      try { playSound("wrong"); } catch {}
      const t = setTimeout(() => setLeftToast(null), 3500);
      return () => clearTimeout(t);
    }
  }, [state.leftNotice]);

  // Lobide oyuncu sayısı artınca katılım sesi çal.
  const prevCountRef = useRef(0);
  useEffect(() => {
    if (state.phase === "lobby" || state.phase === "connecting") {
      if (state.players.length > prevCountRef.current) {
        // Katılım sesi — geri sayım/radar bipleriyle karışmasın diye AYRI slot.
        playSound("player_join");
      }
    }
    prevCountRef.current = state.players.length;
  }, [state.players.length, state.phase]);

  // Rakip aranırken (lobi/connecting) aralıklı radar sesi.
  useEffect(() => {
    if (state.phase === "lobby" || state.phase === "connecting") {
      let alive = true;
      const beep = () => { if (alive) { try { playSound("radar"); } catch {} } };
      beep(); // hemen bir kez
      const iv = setInterval(beep, 1600);
      return () => { alive = false; clearInterval(iv); };
    }
  }, [state.phase]);

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
  const { supported: micSupported, listening, error: micError, start: micStart, stop: micStop } = useSpeech(onVoice, "tr-TR");
  const micTimer = useRef<any>(null);
  const stopMicDelayed = useCallback(() => {
    if (micTimer.current) clearTimeout(micTimer.current);
    micTimer.current = setTimeout(() => micStop(), 1000);
  }, [micStop]);

  // Ses efektleri: kendi sonucun — flip animasyonu her harfte ses çaldığı için burada tek ses YOK.
  useEffect(() => { if (state.phase === "finished") stopTicking(); }, [state.phase]);

  // Ara durum (reveal) sahnesi açılınca bir ses çal.
  useEffect(() => {
    if (state.phase === "reveal") {
      try { playSound("round_start"); } catch {}
    }
  }, [state.phase]);

  // Geri sayım (3-2-1) — her sayıda belirgin bir bip.
  useEffect(() => {
    if (state.phase === "countdown" && state.countdownN > 0) {
      try { playSound("count_tick", { intensity: 1 }); } catch {}
    }
  }, [state.phase, state.countdownN]);

  // Yeni unvan kazanıldıysa (finished) kutlama modalını aç.
  const [celebrateTitle, setCelebrateTitle] = useState<{ name: string; icon: string } | null>(null);
  useEffect(() => {
    if (state.phase === "finished" && state.rewards?.new_title) {
      const t = setTimeout(() => setCelebrateTitle(state.rewards!.new_title!), 1200);
      return () => clearTimeout(t);
    }
  }, [state.phase, state.rewards]);

  // ---- RENDER ----

  const leftToastEl = leftToast ? (
    <div style={{
      position: "fixed", top: "calc(16px + var(--kt-safe-top))", left: "50%", transform: "translateX(-50%)",
      zIndex: 500, background: "var(--bg-panel)", border: "1px solid var(--accent-hot)",
      color: "var(--text-strong)", padding: "12px 20px", borderRadius: 12,
      boxShadow: "0 6px 24px rgba(0,0,0,.35)", fontWeight: 600, fontSize: 14,
      display: "flex", alignItems: "center", gap: 8, animation: "toastIn .3s ease",
      maxWidth: "calc(100vw - 32px)",
    }}>
      🚪 {leftToast}
      <style>{`@keyframes toastIn{from{opacity:0;transform:translate(-50%,-12px)}to{opacity:1;transform:translate(-50%,0)}}`}</style>
    </div>
  ) : null;

  // Sunucu hatası (ör. arena dolu / misafir girişi kapalı)
  if (state.error) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "70vh", padding: 20 }}>
        <div style={{ textAlign: "center", maxWidth: 340 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>😕</div>
          <p style={{ color: "var(--text-soft)", marginBottom: 18 }}>{state.error}</p>
          <button onClick={onExit} style={{ padding: "12px 22px", borderRadius: 11, border: "none", background: "var(--accent)", color: "#1a1330", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
            Ana Sayfa
          </button>
        </div>
      </div>
    );
  }

  // Eşleşme / lobi
  if (state.phase === "connecting" || state.phase === "lobby") {
    const cap = state.size || 5;
    return (
      <ArenaShell onExit={onExit} players={state.players} fillTo={cap}>
        {leftToastEl}
        {/* Üst blok sıkı tutulur (paddingTop küçük): alttaki katılımcı listesi
            ve dipteki oyuncu şeridi rahat sığsın. */}
        <div style={{ textAlign: "center", paddingTop: 4 }}>
          {/* Başlık — lobi ve 3-2-1 ekranında AYNI bileşen */}
          <ArenaTitle custom={!!customCode} />

          {/* Bilgi çipleri — üç satır yerine tek satır */}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <LobbyChip>🔤 {state.totalQuestions} kelime</LobbyChip>
            <LobbyChip accent>➡️ {state.firstLength} harf</LobbyChip>
            <LobbyChip>👤 {state.players.length}/{cap}</LobbyChip>
          </div>

          <div style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 14 }}>
            {/* Spinner + metin yan yana (dikey yer kazandırır) */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ width: 20, height: 20, borderRadius: "50%", border: "2.5px solid var(--border-soft)", borderTopColor: "var(--accent)", animation: "spin 1s linear infinite", display: "inline-block" }} />
              <span className="brand-mono" style={{ fontSize: 17 }}>
                {customCode ? "Katılımcılar bekleniyor…" : "Rakip aranıyor…"}
              </span>
            </div>
            {/* Katılan oyuncuların isimleri */}
            <div style={{ display: "grid", gap: 6, maxWidth: 320, margin: "0 auto" }}>
              {state.players.map((p) => (
                <div key={p.pid} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "6px 12px",
                  background: "var(--bg-panel)", borderRadius: 10,
                  border: "1px solid var(--border-soft)",
                  animation: "slideIn .3s ease",
                }}>
                  <img src={p.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(p.name)}`}
                    alt={p.name}
                    style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--bg-elevated)" }} />
                  <span style={{ color: "var(--text-strong)", fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  {p.is_bot && <span style={{ fontSize: 12 }}>🤖</span>}
                  <span style={{ marginLeft: "auto", color: "var(--tile-correct)", fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>katıldı</span>
                </div>
              ))}
              {/* Boş kontenjan — kaç kişi daha bekleniyor (kutucuk olarak) */}
              {Array.from({ length: Math.max(0, cap - state.players.length) }).map((_, i) => (
                <div key={`slot${i}`} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "6px 12px",
                  borderRadius: 10, border: "1px dashed var(--border-soft)", opacity: 0.6,
                }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: "50%", background: "var(--bg-elevated)",
                    display: "grid", placeItems: "center", fontSize: 13,
                  }}>⏳</span>
                  <span style={{ color: "var(--text-dim)", fontSize: 13 }}>Bekleniyor…</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes slideIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}@keyframes arenaPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}`}</style>
      </ArenaShell>
    );
  }

  // Başlangıç / geri sayım
  if (state.phase === "starting" || state.phase === "countdown") {
    return (
      <ArenaShell onExit={onExit} players={state.players}>
        <div style={{ textAlign: "center", paddingTop: 4 }}>
          {/* Başlık lobideki ile BİREBİR aynı (ikon + ad + çipler). */}
          <ArenaTitle custom={!!customCode} />
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 18 }}>
            <LobbyChip accent>➡️ {state.countdownLen} harf</LobbyChip>
            <LobbyChip>👤 {state.players.length}</LobbyChip>
          </div>
          <p className="brand-mono" style={{ fontSize: 20, marginBottom: 6 }}>içinde başlayacak</p>
          <div className="brand-mono" style={{ fontSize: 88, color: "var(--text-dim)", lineHeight: 1 }}>
            {state.phase === "countdown" ? state.countdownN : "3"}
          </div>
        </div>
        <style>{`@keyframes arenaPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}`}</style>
      </ArenaShell>
    );
  }

  // Sonuç
  if (state.phase === "finished") {
    return (
      <>
        <ArenaResult ranking={state.ranking} rewards={state.rewards} onExit={onExit} adMode={adMode} isGuest={isGuest} totalWords={state.revealTotal || state.totalQuestions} />
        <TitleCelebration title={celebrateTitle} onClose={() => setCelebrateTitle(null)} />
      </>
    );
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
      {leftToastEl}
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

          {/* Cevap kutuları — cevap gönderilip sonuç geldiyse GİZLE (aşağıda FlipReveal gösterilir) */}
          {!(alreadyAnswered && state.myResult && !isReveal) && (
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 28 }}>
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
          )}

          {/* Cevap sonucu: harf kutuları TAHMİN KUTULARIYLA AYNI KONUMDA (yer değişmesin) */}
          {alreadyAnswered && state.myResult && !isReveal && (
            <div style={{ marginBottom: 28 }}>
              <FlipReveal word={state.myResult.answer || ""} correct={state.myResult.correct} />
            </div>
          )}

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
            <div style={{ textAlign: "center", padding: "4px 8px" }}>
              {state.myResult ? (
                <>
                  {/* Doğru/Yanlış yazısı kutuların ALTINDA (kutular yukarıda, tahminle aynı yerde) */}
                  <p className="brand-mono" style={{
                    fontSize: 20, fontWeight: 700, marginBottom: 6,
                    color: state.myResult.correct ? "var(--tile-correct)" : "var(--accent-hot)",
                  }}>
                    {state.myResult.correct ? "Doğru! 🎉" : "Yanlış — Doğrusu yukarıda"}
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
              <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 12 }}>
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
              {!listening && micError && (
                <p style={{ fontSize: 12, color: "var(--accent-hot)" }}>{micError}</p>
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
/** Arena başlığı — bekleme lobisi ve 3-2-1 geri sayım ekranında ortak. */
function ArenaTitle({ custom }: { custom: boolean }) {
  return (
    <>
      <div style={{ fontSize: 46, lineHeight: 1, marginBottom: 2, animation: "arenaPulse 2.4s ease-in-out infinite" }}>
        {custom ? "🎪" : "⚔️"}
      </div>
      <h2 className="brand-mono" style={{
        fontSize: 38, margin: "0 0 12px", lineHeight: 1.05, letterSpacing: "0.06em",
        color: "var(--accent)", textShadow: "0 0 24px var(--accent-glow)",
      }}>
        {custom ? "ÖZEL ARENA" : "ARENA"}
      </h2>
    </>
  );
}

/** Lobi bilgi çipi (kelime sayısı · harf · kişi). */
function LobbyChip({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span style={{
      padding: "6px 12px", borderRadius: 999, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
      background: accent ? "var(--accent-glow)" : "var(--bg-panel)",
      border: `1px solid ${accent ? "var(--accent)" : "var(--border-soft)"}`,
      color: accent ? "var(--accent)" : "var(--text-soft)",
    }}>{children}</span>
  );
}

function ArenaShell({ children, onExit, players, answers, showResults, fillTo }: {
  children: React.ReactNode; onExit: () => void;
  players: ArenaPlayer[]; answers?: Record<string, { correct: boolean; flash: boolean }>;
  showResults?: boolean; fillTo?: number;
}) {
  // Bekleme ekranında bar sabit genişlikte kalsın diye boş slotları placeholder ile doldur.
  const emptyCount = fillTo ? Math.max(0, fillTo - players.length) : 0;
  return (
    // kt-game-fill: kabuk ekran yüksekliğine kilitli olduğu için dipteki oyuncu
    // şeridi uygulamada alt reklam bandının ALTINDA kalıyordu. Yükseklikten
    // --kt-game-space (bant + güvenli alan + admin ek payı) düşülür → şerit tam
    // bandın üstüne oturur. --kt-status-space da düşülür: gövdeye üst rezerv
    // yazıldığı durumda (Android 15+) kabuk o kadar aşağı iter, düşülmezse alt
    // taraf yine banda taşar. NativeBootstrap aynı değeri ayrıca satır içi
    // !important olarak da yazar (alt barla birebir aynı yöntem).
    // TARAYICIDA değişken 0px -> calc(100vh - 0px), yani hiçbir şey değişmez.
    <div className="kt-game-fill" style={{
      minHeight: "calc(100vh - var(--kt-status-space, 0px) - var(--kt-game-space, 0px))",
      display: "flex", flexDirection: "column", maxWidth: 520, margin: "0 auto",
    }}>
      <div style={{ padding: "12px 16px" }}>
        <button onClick={onExit} style={{ background: "var(--bg-panel)", border: "1px solid var(--border-soft)", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", fontSize: 18, color: "var(--text-strong)" }}>←</button>
      </div>
      <div style={{ flex: 1, padding: "0 18px" }}>{children}</div>
      {/* Alt oyuncu barı */}
      <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: "12px 16px", borderTop: "1px solid var(--border-soft)", background: "var(--bg-panel)", justifyContent: fillTo ? "center" : "flex-start" }}>
        {players.map((p) => {
          const a = answers?.[p.pid];
          const answered = !!a;
          const ring = a ? (a.correct ? "var(--tile-correct)" : "var(--accent-hot)") : "var(--border-soft)";
          return (
            <div key={p.pid} style={{ textAlign: "center", flexShrink: 0, width: 62 }}>
              <div style={{ position: "relative", width: 48, height: 48, margin: "0 auto" }}>
                {/* Cevap gelince dışa doğru açılan renkli halka — doğru/yanlış
                    çok daha belirgin görünsün diye (yeşil/kırmızı dalga). */}
                {answered && (
                  <span
                    key={`ring-${a!.correct ? "ok" : "no"}`}
                    style={{
                      position: "absolute", inset: -5, borderRadius: "50%",
                      border: `3px solid ${ring}`, pointerEvents: "none",
                      animation: "arenaRipple .75s ease-out forwards",
                    }}
                  />
                )}
                <img src={p.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(p.name)}`}
                  alt={p.name}
                  style={{
                    width: 48, height: 48, borderRadius: "50%", objectFit: "cover",
                    border: `${answered ? 4 : 3}px solid ${ring}`,
                    background: "var(--bg-elevated)",
                    boxShadow: answered ? `0 0 14px 1px ${ring}` : "none",
                    animation: answered ? "arenaAnswerPop .5s ease-out" : undefined,
                    transition: "border-color .2s, box-shadow .2s",
                  }} />
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
        {/* Boş slotlar (bekleme ekranı için sabit genişlik) */}
        {Array.from({ length: emptyCount }).map((_, i) => (
          <div key={`empty-${i}`} style={{ textAlign: "center", flexShrink: 0, width: 62 }}>
            <div style={{
              width: 48, height: 48, margin: "0 auto", borderRadius: "50%",
              border: "3px dashed var(--border-soft)", background: "var(--tile-empty)",
              display: "grid", placeItems: "center", color: "var(--text-dim)", fontSize: 18,
            }}>?</div>
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 3 }}>bekleniyor</div>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes arenaRipple{0%{transform:scale(.82);opacity:.95}100%{transform:scale(1.75);opacity:0}}
        @keyframes arenaAnswerPop{0%{transform:scale(1)}38%{transform:scale(1.18)}100%{transform:scale(1)}}
      `}</style>
    </div>
  );
}

// Sonuç ekranı — podyum (ilk 3 kürsü) + detaylı sıralama tablosu (✓ doğru / ⚡ hız / puan).
function ArenaResult({ ranking, rewards, onExit, adMode, isGuest, totalWords }: { ranking: ArenaPlayer[]; rewards: { xp_gained: number; rank: number; won: boolean } | null; onExit: () => void; adMode: AdMode; isGuest?: boolean; totalWords?: number }) {
  useEffect(() => { playSound("win"); }, []);
  const showXp = !isGuest && !!rewards && rewards.xp_gained > 0;

  const myUid = typeof window !== "undefined" ? localStorage.getItem("kt_uid") : null;
  const myPid = isGuest ? guestPid() : myUid ? `u${myUid}` : null;
  const iWon = rewards?.won || (ranking[0]?.rank === 1 && ranking[0]?.pid === myPid);

  // Paylaşım için kendi satırım (misafirde g..., üyede u{id}).
  const mine = ranking.find((p) => p.pid === myPid);
  const first = ranking.find((p) => p.rank === 1);
  const second = ranking.find((p) => p.rank === 2);
  const third = ranking.find((p) => p.rank === 3);

  const avatar = (p?: ArenaPlayer) => p?.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(p?.name || "?")}`;

  // Podyum sütunu (kürsü)
  const Podium = ({ p, place, h }: { p?: ArenaPlayer; place: 1 | 2 | 3; h: number }) => {
    if (!p) return <div style={{ flex: 1 }} />;
    const medal = place === 1 ? "🥇" : place === 2 ? "🥈" : "🥉";
    const size = place === 1 ? 64 : 50;
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <img src={avatar(p)} alt={p.name} style={{
          width: size, height: size, borderRadius: "50%", background: "var(--bg-elevated)",
          border: place === 1 ? "3px solid var(--accent)" : "2px solid var(--border-soft)",
          boxShadow: place === 1 ? "0 0 20px rgba(224,148,10,.5)" : "none",
        }} />
        <div style={{ fontWeight: 700, color: "var(--text-strong)", fontSize: 13, textAlign: "center", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.name}{p.is_bot ? " 🤖" : ""}
        </div>
        <div className="brand-mono" style={{ color: "var(--accent)", fontWeight: 800, fontSize: 15 }}>{p.score}</div>
        <div style={{
          width: "100%", height: h, borderRadius: "10px 10px 0 0", marginTop: 2,
          background: place === 1 ? "rgba(224,148,10,.18)" : "var(--bg-panel)",
          border: place === 1 ? "1px solid var(--accent)" : "1px solid var(--border-soft)",
          borderBottom: "none", display: "grid", placeItems: "center", fontSize: 26,
        }}>{medal}</div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 14px 28px" }}>
      {/* Başlık */}
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: iWon ? "var(--accent)" : "var(--text-strong)" }}>
          {iWon ? "🏆 Kazandın!" : "Sonuçlar"}
        </div>
        <div style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 1 }}>Doğru + hız + ⚡ bonusu</div>
      </div>

      {/* Podyum: 2 - 1 - 3 */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 14 }}>
        <Podium p={second} place={2} h={48} />
        <Podium p={first} place={1} h={72} />
        <Podium p={third} place={3} h={36} />
      </div>

      {/* Kazanılan XP — podyumun hemen altında (görünür kalsın) */}
      {showXp && (
        <div style={{ marginBottom: 14 }}>
          <ArenaXpReward xp={rewards!.xp_gained} won={rewards!.won} />
        </div>
      )}

      {/* Tablo */}
      <div style={{ background: "var(--bg-panel)", borderRadius: 14, overflow: "hidden", border: "1px solid var(--border-soft)" }}>
        {/* başlık satırı */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", color: "var(--text-dim)", fontSize: 13, fontWeight: 600, borderBottom: "1px solid var(--border-soft)" }}>
          <span style={{ width: 22 }}>#</span>
          <span style={{ flex: 1 }}>Oyuncu</span>
          <span style={{ width: 32, textAlign: "center", color: "var(--tile-correct)" }}>✓</span>
          <span style={{ width: 32, textAlign: "center", color: "var(--accent)" }}>⚡</span>
          <span style={{ width: 58, textAlign: "right" }}>Puan</span>
        </div>
        {ranking.map((p) => {
          const isMe = p.pid === myPid;
          const medalIcon = p.rank === 1 ? "🥇" : p.rank === 2 ? "🥈" : p.rank === 3 ? "🥉" : null;
          return (
            <div key={p.pid} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "7px 14px",
              borderBottom: "1px solid var(--border-soft)",
              background: isMe ? "rgba(224,148,10,.10)" : "transparent",
            }}>
              <span style={{ width: 22, textAlign: "center", fontSize: medalIcon ? 15 : 13, color: "var(--text-dim)", fontWeight: 700 }}>
                {medalIcon || p.rank}
              </span>
              <img src={avatar(p)} alt={p.name} style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--bg-elevated)" }} />
              <span style={{ flex: 1, fontWeight: isMe ? 800 : 600, fontSize: 14, color: isMe ? "var(--accent)" : "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.name}{p.is_bot ? " 🤖" : ""}
              </span>
              <span className="brand-mono" style={{ width: 32, textAlign: "center", color: "var(--tile-correct)", fontWeight: 700, fontSize: 14 }}>{p.correct_count ?? 0}</span>
              <span className="brand-mono" style={{ width: 32, textAlign: "center", color: "var(--accent)", fontWeight: 700, fontSize: 14 }}>{p.flash_count ?? 0}</span>
              <span className="brand-mono" style={{ width: 58, textAlign: "right", color: "var(--accent)", fontWeight: 800, fontSize: 16 }}>{p.score}</span>
            </div>
          );
        })}
      </div>

      {/* Misafir teşviki: üye olursa XP/kupa/madalya profiline işlensin */}
      {isGuest && (
        <div style={{
          marginTop: 16, padding: "18px 18px", borderRadius: 14,
          background: "linear-gradient(135deg, rgba(224,148,10,.15), rgba(196,74,126,.12))",
          border: "1px solid var(--accent)", textAlign: "center",
        }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🎁</div>
          <div style={{ fontWeight: 800, color: "var(--text-strong)", fontSize: 16, marginBottom: 4 }}>
            Puanların kaydedilsin!
          </div>
          <div style={{ color: "var(--text-soft)", fontSize: 14, lineHeight: 1.5, marginBottom: 14 }}>
            Üye olursan arenada kazandığın XP, kupa ve madalyalar profiline işlenir; lig sıralamasında yer alırsın.
          </div>
          <a href="/giris" style={{
            display: "inline-block", padding: "12px 28px", borderRadius: 11, border: "none",
            background: "var(--accent)", color: "#1a1330", fontWeight: 800, fontSize: 15,
            textDecoration: "none",
          }}>Ücretsiz Üye Ol →</a>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
        {/* "Tekrar Arena'ya Gir" = oynamaya devam -> reklam ASLA çıkmaz. */}
        <button onClick={() => window.location.reload()} style={{ padding: "12px 22px", borderRadius: 11, border: "none", background: "var(--accent)", color: "#1a1330", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Tekrar Arena'ya Gir</button>
        {/* Ana sayfa = oyun akışından çıkış -> koşullar tutarsa geçiş reklamı. */}
        <button onClick={() => void exitWithAd(adMode, onExit)} style={{ padding: "12px 20px", borderRadius: 11, border: "1px solid var(--border-soft)", background: "transparent", color: "var(--text-soft)", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>Ana Sayfa</button>
      </div>

      {/* Sonuç paylaşımı — her zaman EN ALTTA */}
      {mine && (
        <div style={{ marginTop: 16 }}>
          <ResultShare
            text={arenaShareText({
              me: mine.name,
              rank: mine.rank ?? 0,
              score: mine.score ?? 0,
              correct: mine.correct_count,
              total: totalWords,
              players: ranking.length,
            })}
            module="arena"
            variant={arenaVariant(mine.rank ?? 0)}
            title="Kelime Tahmin — Arena"
          />
        </div>
      )}
    </div>
  );
}

// Arena XP kazanım kartı — 0'dan kazanılan XP'ye sayar; sayarken "tick", bitince "çlink".
function ArenaXpReward({ xp, won }: { xp: number; won: boolean }) {
  const [val, setVal] = useState(0);
  const done = useRef(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Kısa gecikmeyle başlat (sonuç ekranı otursun).
    const startT = setTimeout(() => setShow(true), 500);
    return () => clearTimeout(startT);
  }, []);

  useEffect(() => {
    if (!show) return;
    const steps = Math.min(xp, 30);
    if (steps === 0) { setVal(xp); return; }
    const stepSize = xp / steps;
    let cur = 0, n = 0;
    const iv = setInterval(() => {
      n += 1;
      cur += stepSize;
      setVal(n >= steps ? xp : Math.round(cur));
      if (n < steps) { try { playSound("count_tick"); } catch {} }
      if (n >= steps) {
        clearInterval(iv);
        if (!done.current) { done.current = true; try { playSound("count_done"); } catch {} }
      }
    }, 45);
    return () => clearInterval(iv);
  }, [show, xp]);

  if (!show) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
      background: "var(--bg-panel)", borderRadius: 12, border: "1px solid var(--accent)",
      boxShadow: "0 0 16px rgba(224,148,10,.25)", animation: "rewardIn .35s ease",
    }}>
      <span style={{ fontSize: 26 }}>💎</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{won ? "Birincilik + katılım" : "Katılım"}</div>
        <div style={{ fontWeight: 600, color: "var(--text-strong)" }}>Kazanılan XP</div>
      </div>
      <span className="brand-mono" style={{ fontSize: 22, fontWeight: 800, color: "var(--accent)" }}>+{val}</span>
      <style>{`@keyframes rewardIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}`}</style>
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
    <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={onExit} style={{ background: "var(--bg-panel)", border: "1px solid var(--border-soft)", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", fontSize: 18, color: "var(--text-strong)" }}>←</button>
        <span className="brand-mono" style={{ fontSize: 16, color: "var(--tile-correct)" }}>Doğru: {answer}</span>
        <span style={{ width: 36 }} />
      </div>

      <div style={{ padding: "10px 16px" }}>
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
              {/* Oyuncu — tablonun hemen altında, sütunla hizalı */}
              <img src={p.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(p.name)}`}
                alt={p.name}
                style={{ width: 44, height: 44, borderRadius: "50%", border: "2px solid var(--border-soft)", background: "var(--bg-elevated)", objectFit: "cover" }} />
              <div style={{ width: 52, fontSize: 10, color: "var(--text-dim)", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Cevap sonucu harf kutuları: önce gri, sonra tek tek dönerek (flip) renk alır.
// correct=true -> yeşil, false -> kırmızı (doğru cevabı gösterir). Her harfte bir ses.
function FlipReveal({ word, correct }: { word: string; correct: boolean }) {
  const letters = (word || "").toUpperCase().split("");
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    setRevealed(0);
    let i = 0;
    const step = () => {
      i += 1;
      setRevealed(i);
      try { playSound(correct ? "tile_correct" : "tile_absent"); } catch {}
      if (i < letters.length) setTimeout(step, 150);
    };
    const t = setTimeout(step, 100);
    return () => clearTimeout(t);
  }, [word, correct]);

  const okColor = "var(--tile-correct)";
  const badColor = "#d13a3a"; // net kırmızı (yanlış cevabın doğrusu)
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
      {letters.map((ch, j) => {
        const on = j < revealed;
        return (
          <div key={j} style={{
            width: 52, height: 52, display: "grid", placeItems: "center", borderRadius: 10,
            fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24,
            color: on ? "#fff" : "var(--text-dim)",
            background: on ? (correct ? okColor : badColor) : "var(--tile-empty)",
            border: on ? "none" : "2px solid var(--tile-border)",
            transition: "background .15s ease, color .15s ease",
            animation: on ? "flipIn .22s ease both" : undefined,
          }}>{ch}</div>
        );
      })}
    </div>
  );
}
