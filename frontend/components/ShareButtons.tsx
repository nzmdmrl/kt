"use client";

/**
 * Mini sosyal medya paylaşım butonları (WhatsApp / Facebook / X / Telegram / LinkedIn).
 *
 * url   : paylaşılacak tam adres
 * title : kısa başlık (native paylaşımda ve yedek metin olarak)
 * text  : gönderilecek tam metin (çok satırlı olabilir — sonuç paylaşımları).
 *         Verilmezse title kullanılır. Facebook metni taşımaz (kısıtı).
 * networks: hangi ağlar, hangi sırayla (varsayılan: davet kutularındaki dörtlü)
 */

type Props = {
  url: string;
  title: string;
  text?: string;
  label?: string;
  networks?: string[];
};

const NETWORKS = [
  {
    key: "whatsapp",
    name: "WhatsApp",
    color: "#25D366",
    href: (u: string, t: string) => `https://wa.me/?text=${encodeURIComponent(`${t}\n${u}`)}`,
    icon: (
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.28-1.38a9.9 9.9 0 0 0 4.76 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.13.82.84-3.05-.2-.31a8.2 8.2 0 0 1-1.26-4.37c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.14.16-.29.18-.53.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.71-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42l-.47-.01c-.16 0-.43.06-.65.31-.22.24-.85.83-.85 2.03s.87 2.35.99 2.51c.12.16 1.71 2.61 4.14 3.66.58.25 1.03.4 1.38.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z" />
    ),
  },
  {
    key: "facebook",
    name: "Facebook",
    color: "#1877F2",
    href: (u: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}`,
    icon: (
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.91h-2.33V22C18.34 21.24 22 17.08 22 12.06Z" />
    ),
  },
  {
    key: "twitter",
    name: "X",
    color: "#000000",
    href: (u: string, t: string) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}`,
    icon: (
      <path d="M17.53 3h3.02l-6.6 7.54L21.75 21h-5.9l-4.62-6.04L5.94 21H2.92l7.06-8.07L2.25 3h6.05l4.18 5.52L17.53 3Zm-1.06 16.2h1.67L7.6 4.71H5.81l10.66 14.49Z" />
    ),
  },
  {
    key: "telegram",
    name: "Telegram",
    color: "#229ED9",
    href: (u: string, t: string) =>
      `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}`,
    icon: (
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.64 6.8-1.55 7.32c-.12.52-.42.65-.85.4l-2.35-1.73-1.13 1.09c-.13.13-.24.24-.48.24l.17-2.4 4.38-3.96c.19-.17-.04-.26-.3-.09l-5.41 3.4-2.33-.73c-.51-.16-.52-.51.1-.75l9.11-3.51c.42-.15.79.1.65.72Z" />
    ),
  },
  {
    key: "linkedin",
    name: "LinkedIn",
    color: "#0A66C2",
    href: (u: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}`,
    icon: (
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14ZM7.12 20.45H3.55V9h3.57v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0Z" />
    ),
  },
];

const DEFAULT_NETWORKS = ["whatsapp", "facebook", "twitter", "linkedin"];

export default function ShareButtons({ url, title, text, label = "Davet et", networks }: Props) {
  const msg = text || title;
  const keys = networks && networks.length ? networks : DEFAULT_NETWORKS;
  const shown = keys.map((k) => NETWORKS.find((n) => n.key === k)).filter(Boolean) as typeof NETWORKS;

  function open(href: string) {
    window.open(href, "_blank", "noopener,noreferrer,width=640,height=620");
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      {label && (
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-soft)" }}>{label}</span>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        {shown.map((n) => (
          <button
            key={n.key}
            onClick={() => open(n.href(url, msg))}
            title={`${n.name} ile paylaş`}
            aria-label={`${n.name} ile paylaş`}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "1px solid var(--border-soft)",
              background: n.color,
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <svg viewBox="0 0 24 24" width={18} height={18} fill="#fff" aria-hidden="true">
              {n.icon}
            </svg>
          </button>
        ))}
        {typeof navigator !== "undefined" && (navigator as any).share && (
          <button
            onClick={() => (navigator as any).share({ title, text: msg, url }).catch(() => {})}
            title="Diğer uygulamalarla paylaş"
            aria-label="Diğer uygulamalarla paylaş"
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "1px solid var(--border-soft)",
              background: "var(--bg-elevated)",
              color: "var(--text-strong)",
              cursor: "pointer",
              fontSize: 15,
              padding: 0,
            }}
          >
            ⋯
          </button>
        )}
      </div>
    </div>
  );
}
