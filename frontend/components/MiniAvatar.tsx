"use client";

/**
 * Listelerde (son maçlar, lig tabloları) kullanılan küçük profil fotoğrafı.
 *
 * Avatarı olmayan üyede adın baş harfi, misafirde 👤, botta 🤖 gösterilir —
 * satırın hizası bozulmasın diye her durumda AYNI boyutta bir daire çizilir.
 */
export default function MiniAvatar({
  url,
  name = "",
  size = 24,
  bot = false,
  guest = false,
}: {
  url?: string | null;
  name?: string;
  size?: number;
  bot?: boolean;
  guest?: boolean;
}) {
  const base: React.CSSProperties = {
    width: size, height: size, borderRadius: "50%", flexShrink: 0,
    display: "grid", placeItems: "center", overflow: "hidden",
    background: "var(--bg-elevated)", border: "1px solid var(--border-soft)",
    fontSize: Math.round(size * 0.5), lineHeight: 1,
  };

  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={{ ...base, objectFit: "cover" }} />;
  }

  const fallback = bot ? "🤖" : guest ? "👤" : (name.trim().charAt(0).toUpperCase() || "👤");
  return (
    <span style={base} aria-hidden>
      <span style={{ color: "var(--text-dim)", fontWeight: 700, fontSize: Math.round(size * (fallback.length > 1 ? 0.5 : 0.45)) }}>
        {fallback}
      </span>
    </span>
  );
}
