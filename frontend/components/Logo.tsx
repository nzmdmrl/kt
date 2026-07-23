export default function Logo({ size = 44 }: { size?: number }) {
  // "KT" monogramı — iki grid kutusu içinde K ve T, oyunun grid diline gönderme.
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          gap: 4,
        }}
      >
        <Tile letter="K" size={size} />
        <Tile letter="T" size={size} accent />
      </span>
    </span>
  );
}

function Tile({ letter, size, accent }: { letter: string; size: number; accent?: boolean }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        display: "grid",
        placeItems: "center",
        borderRadius: 10,
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: size * 0.52,
        color: accent ? "#1a1330" : "var(--text-strong)",
        background: accent ? "var(--accent)" : "var(--bg-elevated)",
        border: accent ? "none" : "2px solid var(--tile-border)",
        boxShadow: accent ? "0 6px 20px var(--accent-glow)" : "none",
      }}
    >
      {letter}
    </span>
  );
}
