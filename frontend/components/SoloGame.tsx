"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiUrl } from "@/lib/api";
import { toUpperTr } from "@/lib/turkish";
import { playSound, initSound, startTicking, stopTicking } from "@/lib/sound";
import { useSpeech } from "@/lib/useSpeech";

type Tile = { letter: string; state: "correct" | "present" | "absent" };
type StartInfo = { level: number; length: number; first_letter: string; seconds: number; joker_count: number; replay: boolean };

const TILE_COLOR: Record<string, string> = {
  correct: "var(--tile-correct)",
  present: "var(--tile-present)",
  absent: "var(--tile-absent)",
};

// Solo level oyun ekranı: süre + sınırsız tahmin + joker + yıldız sonucu.
export default function SoloGame({ level, onExit, onComplete }: {
  level: number;
  onExit: () => void;
  onComplete: (stars: number, nextLevel: number) => void;
}) {
  const [info, setInfo] = useState<StartInfo | null>(null);
  const [rows, setRows] = useState<Tile[][]>([]);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(120);
  const [status, setStatus] = useState<"loading" | "playing" | "won" | "timeout">("loading");
  const [result, setResult] = useState<{ stars: number; total: number; next: number } | null>(null);

  function token() { return typeof window !== "undefined" ? localStorage.getItem("kt_token") : null; }
  function headers() { return { "Content-Type": "application/json", Authorization: `Bearer ${token()}` }; }

  // Level başlat.
  useEffect(() => {
    initSound(true, 70);
    fetch(apiUrl(`/api/solo/level/${level}/start`), { method: "POST", headers: headers() })
      .then((r) => r.json())
      .then((d: StartInfo) => {
        setInfo(d);
        setSecondsLeft(d.seconds);
        setStatus("playing");
      })
      .catch(() => setErr("Level başlatılamadı"));
  }, [level]);

  // Geri sayım.
  useEffect(() => {
    if (status !== "playing") return;
    if (secondsLeft <= 0) { setStatus("timeout"); playSound("lose"); return; }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [status, secondsLeft]);

  // Son 10 saniyede tik sesi.
  useEffect(() => {
    if (status === "playing" && secondsLeft <= 10 && secondsLeft > 0) playSound("tick");
  }, [secondsLeft, status]);

  const submit = useCallback(async () => {
    if (!info || status !== "playing") return;
    if (draft.length !== info.length) return;
    setErr("");
    try {
      const r = await fetch(apiUrl(`/api/solo/level/${level}/guess`), {
        method: "POST", headers: headers(), body: JSON.stringify({ guess: draft }),
      });
      const data = await r.json();
      if (!data.valid) { setErr(data.error || "Geçersiz"); playSound("wrong"); return; }
      const newRows = [...rows, data.tiles];
      setRows(newRows);
      setDraft("");
      data.tiles.forEach((t: Tile, idx: number) => {
        setTimeout(() => playSound(t.state === "correct" ? "tile_correct" : t.state === "present" ? "tile_present" : "tile_absent"), idx * 120);
      });
      if (data.correct) {
        setStatus("won");
        const afterTiles = data.tiles.length * 120 + 200;
        setTimeout(() => playSound("win"), afterTiles);
        // Level bitir: kalan süreyi gönder, yıldız al.
        const fin = await fetch(apiUrl(`/api/solo/level/${level}/finish`), {
          method: "POST", headers: headers(), body: JSON.stringify({ seconds_left: secondsLeft }),
        });
        const fd = await fin.json();
        setResult({ stars: fd.stars, total: fd.total_stars, next: fd.next_level });
      }
    } catch {
      setErr("Bağlantı hatası");
    }
  }, [info, status, draft, rows, level, secondsLeft]);

  const micRef = useRef<any>(null);
  const onVoiceResult = useCallback((text: string) => {
    if (!info || status !== "playing") return;
    const clean = toUpperTr(text).replace(/[^A-ZÇĞİÖŞÜI]/g, "").slice(0, info.length);
    if (clean.length > 0) setDraft(clean);
  }, [info, status]);
  const { supported: micSupported, listening, start: micStart, stop: micStop } = useSpeech(onVoiceResult, "tr-TR");
  const stopMicDelayed = useCallback(() => {
    if (micRef.current) clearTimeout(micRef.current);
    micRef.current = setTimeout(() => micStop(), 1000);
  }, [micStop]);

  useEffect(() => { if (status !== "playing") stopTicking(); }, [status]);

  if (status === "loading" || !info) {
    return <Center>{err || "Yükleniyor…"}</Center>;
  }

  const MIN_ROWS = 6;
  const totalRows = Math.max(MIN_ROWS, rows.length + 1);
  const timePct = Math.max(0, (secondsLeft / info.seconds) * 100);
  const timeColor = secondsLeft <= 10 ? "var(--accent-hot)" : secondsLeft <= 30 ? "#e0940a" : "var(--accent)";

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 16px 40px" }}>
      {/* Üst bar: çıkış + level + süre */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <button onClick={() => { stopTicking(); onExit(); }} style={{ background: "var(--bg-panel)", border: "1px solid var(--border-soft)", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", fontSize: 18, color: "var(--text-strong)" }}>←</button>
        <span className="brand-mono" style={{ fontSize: 18 }}>Level {level}</span>
        <span className="brand-mono" style={{ fontSize: 22, color: timeColor, minWidth: 54, textAlign: "right" }}>{secondsLeft}s</span>
      </div>
      {/* Süre çubuğu */}
      <div style={{ height: 6, background: "var(--bg-panel)", borderRadius: 3, overflow: "hidden", marginBottom: 18 }}>
        <div style={{ width: `${timePct}%`, height: "100%", background: timeColor, transition: "width 1s linear" }} />
      </div>

      {info.replay && (
        <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 13, marginBottom: 12 }}>
          🔄 Tekrar oynuyorsun — bu sefer farklı bir kelime!
        </p>
      )}

      {/* Izgara */}
      <div>
        <div style={{ display: "grid", gap: 6, justifyContent: "center", marginBottom: 18 }}>
        {Array.from({ length: totalRows }).map((_, i) => {
          const row = rows[i];
          const isCurrent = i === rows.length && (status === "playing");
          return (
            <div key={i} style={{ display: "flex", gap: 6 }}>
              {Array.from({ length: info.length }).map((_, j) => {
                let letter = "";
                let bg = "var(--tile-empty)";
                let color = "#fff";
                let border = "2px solid var(--tile-border)";
                if (row) {
                  letter = row[j].letter;
                  bg = TILE_COLOR[row[j].state];
                  border = "none";
                } else if (isCurrent && j < draft.length) {
                  // Kullanıcı bu kutuya yazdı — draft öncelikli.
                  letter = draft[j];
                  color = "var(--text-strong)";
                } else if (isCurrent) {
                  if (j === 0 && draft.length === 0) { letter = info.first_letter; color = "var(--text-dim)"; }
                }
                return (
                  <span key={j} style={{
                    width: 50, height: 50, display: "grid", placeItems: "center",
                    borderRadius: 10, fontFamily: "var(--font-display)", fontWeight: 700,
                    fontSize: 22, color, background: bg, border,
                  }}>{letter}</span>
                );
              })}
            </div>
          );
        })}
        </div>
      </div>

      {status === "playing" && (
        <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={draft}
              onChange={(e) => setDraft(toUpperTr(e.target.value).replace(/[^A-ZÇĞİÖŞÜI]/g, "").slice(0, info.length))}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={`${info.first_letter} ile başla`}
              maxLength={info.length}
              autoFocus
              style={{
                padding: "12px 14px", borderRadius: 10, border: "2px solid var(--tile-border)",
                background: "var(--bg-elevated)", color: "var(--text-strong)", fontSize: 19,
                fontFamily: "var(--font-display)", width: 160, textAlign: "center",
                letterSpacing: "0.18em", textTransform: "uppercase",
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
                  padding: "12px 14px", borderRadius: 10, flexShrink: 0,
                  border: listening ? "2px solid var(--accent-hot)" : "2px solid var(--tile-border)",
                  background: listening ? "var(--accent-glow)" : "var(--bg-elevated)",
                  cursor: "pointer", fontSize: 18, lineHeight: 1,
                }}
              >🎤</button>
            )}
            <button onClick={submit} disabled={draft.length !== info.length} style={{
              padding: "12px 18px", borderRadius: 10, border: "none", background: "var(--accent)",
              color: "#1a1330", fontWeight: 700, fontSize: 15, cursor: "pointer", flexShrink: 0,
              opacity: draft.length === info.length ? 1 : 0.5,
            }}>Dene</button>
          </div>
          {err && <p style={{ color: "var(--accent-hot)", fontSize: 14 }}>{err}</p>}
        </div>
      )}

      {/* Kazanma sonucu — yıldızlı */}
      {status === "won" && result && (
        <div style={{ textAlign: "center", background: "var(--bg-panel)", borderRadius: 18, padding: 26 }}>
          <div className="brand-mono" style={{ fontSize: 22, color: "var(--tile-correct)", marginBottom: 12 }}>Level Tamam! 🎉</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 12 }}>
            {[1, 2, 3].map((s) => (
              <span key={s} style={{ fontSize: 44, filter: s <= result.stars ? "none" : "grayscale(1) opacity(0.3)" }}>⭐</span>
            ))}
          </div>
          <p style={{ color: "var(--text-soft)", marginBottom: 18 }}>Toplam yıldız: {result.total}</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => { stopTicking(); onComplete(result.stars, result.next); }} style={btnPrimary}>Sonraki Level →</button>
            <button onClick={() => { stopTicking(); onExit(); }} style={btnGhost}>Haritaya Dön</button>
          </div>
        </div>
      )}

      {/* Süre bitti */}
      {status === "timeout" && (
        <div style={{ textAlign: "center", background: "var(--bg-panel)", borderRadius: 18, padding: 26 }}>
          <div style={{ fontSize: 40 }}>⏰</div>
          <div className="brand-mono" style={{ fontSize: 20, color: "var(--accent-hot)", margin: "8px 0 16px" }}>Süre doldu!</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => window.location.reload()} style={btnPrimary}>Tekrar Dene</button>
            <button onClick={() => { stopTicking(); onExit(); }} style={btnGhost}>Haritaya Dön</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", placeItems: "center", minHeight: 300, color: "var(--text-soft)" }}>{children}</div>;
}

const btnPrimary: React.CSSProperties = {
  padding: "12px 22px", borderRadius: 11, border: "none", background: "var(--accent)",
  color: "#1a1330", fontWeight: 700, fontSize: 15, cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  padding: "12px 18px", borderRadius: 11, border: "1px solid var(--border-soft)",
  background: "transparent", color: "var(--text-soft)", fontWeight: 600, fontSize: 15, cursor: "pointer",
};
