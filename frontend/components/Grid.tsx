"use client";

import { useEffect, useRef } from "react";
import { RoundPublic, PublicPlayer } from "@/lib/useMatch";
import { toUpperTr } from "@/lib/turkish";

const TILE: Record<string, string> = {
  correct: "var(--tile-correct)",
  present: "var(--tile-present)",
  absent: "var(--tile-absent)",
};

export default function Grid({
  round,
  players,
  myId,
  draft,
}: {
  round: RoundPublic;
  players: PublicPlayer[];
  myId: string;
  draft: string;
}) {
  const { length, max_rows, first_letter, rows, turn_player_id, finished, reveal_word } = round;
  const myTurn = turn_player_id === myId;
  const scrollRef = useRef<HTMLDivElement>(null);

  const nameOf = (pid: string) => players.find((p) => p.id === pid)?.name ?? "?";

  // Yeni satır eklendikçe en alta kaydır.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [rows.length, draft]);

  // Kaç boş satır gösterilecek: en az max_rows'a tamamla (aktif satır dahil).
  const activeRowVisible = !finished;
  const usedRows = rows.length + (activeRowVisible ? 1 : 0);
  const emptyRows = Math.max(0, max_rows - usedRows);

  return (
    <div
      ref={scrollRef}
      style={{
        display: "grid",
        gap: 8,
        justifyItems: "center",
        // Kaydırılabilir çerçeve: yaklaşık 5 satır yüksekliği; fazlası kaydırılır.
        maxHeight: 5 * 58 + 20,
        overflowY: "auto",
        padding: "4px 0",
      }}
    >
      {/* Doldurulmuş tahmin satırları */}
      {rows.map((row, i) => {
        const isLast = i === rows.length - 1;
        return (
          <div key={i} style={{ position: "relative", flexShrink: 0 }}>
            <Line
              tiles={row.tiles.map((t) => ({ letter: t.letter, bg: TILE[t.state] }))}
              animate={isLast}
            />
            <Tag>{nameOf(row.player_id)}</Tag>
          </div>
        );
      })}

      {/* Tur bitti ve kimse bilemediyse: doğru cevabı göster */}
      {finished && reveal_word && (
        <RevealLine word={reveal_word} />
      )}

      {/* Aktif taslak satır (tur sürüyorsa) */}
      {activeRowVisible && (
        <DraftLine length={length} firstLetter={first_letter} draft={draft} active={myTurn} />
      )}

      {/* Kalan boş satırlar (başlangıçta 5'e tamamla) */}
      {Array.from({ length: emptyRows }).map((_, i) => (
        <Line
          key={`e${i}`}
          tiles={Array.from({ length }).map((_, j) => ({
            letter: j === 0 ? first_letter : "",
            bg: "var(--tile-empty)",
            dim: true,
          }))}
        />
      ))}
    </div>
  );
}

function Line({ tiles, animate }: { tiles: { letter: string; bg: string; dim?: boolean }[]; animate?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
      {tiles.map((t, i) => (
        <span
          key={i}
          style={{
            ...tileStyle(t.bg, t.dim ? "var(--text-dim)" : "#fff", t.dim),
            animation: animate ? `flipIn .4s ease ${i * 0.22}s both` : undefined,
          }}
        >
          {t.letter}
        </span>
      ))}
    </div>
  );
}

function RevealLine({ word }: { word: string }) {
  return (
    <div style={{ display: "grid", gap: 4, justifyItems: "center", flexShrink: 0 }}>
      <div style={{ fontSize: 12, color: "var(--accent-hot)", fontWeight: 600 }}>
        Doğru cevap:
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {word.split("").map((ch, i) => (
          <span
            key={i}
            style={{
              ...tileStyle("var(--accent)", "#1a1330"),
              animation: `flipIn .3s ease ${i * 0.08}s both`,
            }}
          >
            {ch}
          </span>
        ))}
      </div>
    </div>
  );
}

function DraftLine({
  length,
  firstLetter,
  draft,
  active,
}: {
  length: number;
  firstLetter: string;
  draft: string;
  active: boolean;
}) {
  const letters: string[] = [];
  for (let i = 0; i < length; i++) {
    if (i < draft.length) letters.push(draft[i]);
    else if (i === 0 && draft.length === 0) letters.push(firstLetter);
    else letters.push("");
  }
  return (
    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
      {letters.map((ch, i) => {
        const isHint = i === 0 && draft.length === 0;
        const filled = i < draft.length;
        return (
          <span
            key={i}
            style={{
              ...tileStyle("var(--tile-empty)", isHint ? "var(--text-dim)" : "#fff"),
              border: active
                ? filled
                  ? "2px solid var(--tile-correct)"
                  : "2px solid var(--accent)"
                : "1px solid var(--tile-border)",
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
}

function tileStyle(bg: string, color: string, dim?: boolean): React.CSSProperties {
  return {
    width: 50,
    height: 50,
    display: "grid",
    placeItems: "center",
    borderRadius: 10,
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 22,
    color,
    background: bg,
    border: dim ? "1px solid var(--tile-border)" : "none",
  };
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        position: "absolute",
        right: -6,
        top: "50%",
        transform: "translate(100%, -50%)",
        fontSize: 11,
        color: "var(--text-dim)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
