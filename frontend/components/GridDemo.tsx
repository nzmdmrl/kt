"use client";

import { useState } from "react";
import { apiUrl } from "@/lib/api";

type Letter = { letter: string; state: "correct" | "present" | "absent" };
type EvalResult = {
  correct: boolean;
  present_count: number;
  letters: Letter[];
};

const TILE_COLORS: Record<Letter["state"], string> = {
  correct: "var(--tile-correct)",
  present: "var(--tile-present)",
  absent: "var(--tile-absent)",
};

export default function GridDemo() {
  // Faz 1 demo: hedef sabit örnek, kullanıcı tahmin girer, renkler backend'den gelir.
  // (Gerçek maç Faz 2'de WebSocket ile; bu yalnızca motorun çalıştığını gösterir.)
  const [target, setTarget] = useState("KALEM");
  const [guess, setGuess] = useState("");
  const [rows, setRows] = useState<Letter[][]>([]);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    const g = guess.trim();
    if (g.length !== target.length) {
      setError(`${target.length} harfli bir kelime yaz`);
      return;
    }
    try {
      const res = await fetch(
        apiUrl(`/api/words/evaluate?guess=${encodeURIComponent(g)}&target=${encodeURIComponent(target)}`)
      );
      const data: EvalResult = await res.json();
      setRows((r) => [...r, data.letters]);
      setGuess("");
    } catch {
      setError("Backend'e bağlanılamadı");
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((row, i) => (
          <div key={i} style={{ display: "flex", gap: 6, justifyContent: "center" }}>
            {row.map((l, j) => (
              <span
                key={j}
                style={{
                  width: 52,
                  height: 52,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 10,
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 24,
                  color: "#fff",
                  background: TILE_COLORS[l.state],
                }}
              >
                {l.letter}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <input
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={`${target.length} harf`}
          maxLength={target.length}
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            border: "2px solid var(--tile-border)",
            background: "var(--bg-elevated)",
            color: "var(--text-strong)",
            fontSize: 18,
            fontFamily: "var(--font-display)",
            width: 160,
            textAlign: "center",
            letterSpacing: "0.15em",
          }}
        />
        <button
          onClick={submit}
          style={{
            padding: "12px 22px",
            borderRadius: 10,
            border: "none",
            background: "var(--accent)",
            color: "#1a1330",
            fontWeight: 700,
            fontSize: 16,
            cursor: "pointer",
            fontFamily: "var(--font-display)",
          }}
        >
          Dene
        </button>
      </div>
      {error && (
        <p style={{ color: "var(--accent-hot)", textAlign: "center", fontSize: 14 }}>{error}</p>
      )}
      <p style={{ color: "var(--text-dim)", textAlign: "center", fontSize: 13 }}>
        Demo hedef: <strong style={{ color: "var(--text-soft)" }}>{target}</strong> — renkler
        sunucudaki kelime motorundan geliyor.
      </p>
    </div>
  );
}
