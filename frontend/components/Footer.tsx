"use client";

// Site altbilgisi — tüm sayfalarda görünür, yasal ve tanıtım linkleri.
export default function Footer() {
  const links = [
    { href: "/nasil-oynanir", label: "Nasıl Oynanır" },
    { href: "/gizlilik", label: "Gizlilik & KVKK" },
    { href: "/kosullar", label: "Kullanım Koşulları" },
  ];
  return (
    <footer
      style={{
        borderTop: "1px solid var(--border-soft)",
        marginTop: 40,
        padding: "24px 20px 32px",
        textAlign: "center",
      }}
    >
      <div style={{ display: "flex", gap: 18, justifyContent: "center", flexWrap: "wrap", marginBottom: 12 }}>
        {links.map((l) => (
          <a key={l.href} href={l.href} style={{ color: "var(--text-soft)", fontSize: 14 }}>
            {l.label}
          </a>
        ))}
      </div>
      <div style={{ color: "var(--text-dim)", fontSize: 13 }}>
        © {new Date().getFullYear()} Kelime Tahmin · kelimetahmin.com
      </div>
    </footer>
  );
}
