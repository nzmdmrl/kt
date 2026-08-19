"use client";

import { COMPANY } from "@/lib/legal";

// Site altbilgisi — tüm sayfalarda görünür, yasal ve tanıtım linkleri.
export default function Footer() {
  // Sıra: tanıtım → yasal → üye ara → iletişim (en sonda).
  const links = [
    { href: "/hakkimizda", label: "Hakkımızda" },
    { href: "/nasil-oynanir", label: "Nasıl Oynanır" },
    { href: "/duyurular", label: "Haberler" },
    { href: "/gizlilik", label: "Gizlilik & KVKK" },
    { href: "/kosullar", label: "Kullanım Koşulları" },
    { href: "/cerez", label: "Çerez Politikası" },
    // Google Play / App Store: hesap silme adresi uygulama dışından da
    // erişilebilir olmalı — bu yüzden altbilgide duruyor.
    { href: "/hesap-silme", label: "Hesap Silme" },
    { href: "/uye-ara", label: "Üye Ara" },
    { href: "/iletisim", label: "İletişim" },
    { href: "/destek", label: "Destek" },
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
        © {new Date().getFullYear()} {COMPANY.product} · {COMPANY.domain}
        <br />
        <span style={{ fontSize: 12 }}>Bir {COMPANY.name} projesidir.</span>
      </div>
    </footer>
  );
}
