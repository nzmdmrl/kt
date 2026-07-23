"use client";

import { RoundPublic, PublicPlayer } from "@/lib/useMatch";

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
  draft: string; // o an yazılan (henüz gönderilmemiş) kelime
}) {
  const { length, max_rows, first_letter, rows, turn_player_id } = round;
  const myTurn = turn_player_id === myId;

  // Oyuncu adını renkli göstermek için id->kısa ad
  const nameOf = (pid: string) => players.find((p) => p.id === pid)?.name ?? "?";

  // Kaç satır dolu, kalan boş satırlar
  const emptyRows = Math.max(0, max_rows - rows.length - 1); // -1 aktif taslak satır

  return (
    <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
      {/* Doldurulmuş tahmin satırları */}
      {rows.map((row, i) => (
        <div key={i} style={{ position: "relative" }}>
          <Line tiles={row.tiles.map((t) => ({ letter: t.letter, bg: TILE[t.state] }))} />
          <Tag>{nameOf(row.player_id)}</Tag>
        </div>
      ))}

      {/* Aktif taslak satır (sıra bende ise yazdığım görünür) */}
      {rows.length < max_rows && (
        <DraftLine
          length={length}
          firstLetter={first_letter}
          draft={draft}
          active={myTurn}
        />
      )}

      {/* Kalan boş satırlar */}
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

function Line({
  tiles,
}: {
  tiles: { letter: string; bg: string; dim?: boolean }[];
}) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {tiles.map((t, i) => (
        <span
          key={i}
          style={{
            width: 50,
            height: 50,
            display: "grid",
            placeItems: "center",
            borderRadius: 10,
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 22,
            color: t.dim ? "var(--text-dim)" : "#fff",
            background: t.bg,
            border: t.dim ? "1px solid var(--tile-border)" : "none",
          }}
        >
          {t.letter}
        </span>
      ))}
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
  // draft ilk harfi içermeyebilir; ilk kutu her zaman firstLetter.
  const letters: string[] = [firstLetter];
  const rest = draft.toUpperCase().replace(/^./, ""); // ilk harften sonrası
  for (let i = 1; i < length; i++) {
    letters.push(rest[i - 1] ?? "");
  }
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {letters.map((ch, i) => (
        <span
          key={i}
          style={{
            width: 50,
            height: 50,
            display: "grid",
            placeItems: "center",
            borderRadius: 10,
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 22,
            color: i === 0 ? "var(--accent)" : "#fff",
            background: "var(--tile-empty)",
            border: active
              ? "2px solid var(--accent)"
              : "1px solid var(--tile-border)",
            boxShadow: active && i === 0 ? "0 0 0 1px var(--accent-glow)" : "none",
            transition: "border-color .15s",
          }}
        >
          {ch}
        </span>
      ))}
    </div>
  );
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
