"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

// Alt navigasyon barı — her ana sayfada görünür.
// Profil / Geçmiş / Ana / Bildirimler / Menü
const ITEMS = [
  { key: "profil", label: "Profil", icon: "👤", href: "/profil/me" },
  { key: "gecmis", label: "Geçmiş", icon: "🕐", href: "/gecmis" },
  { key: "ana", label: "Ana", icon: "🏠", href: "/", center: true },
  { key: "bildirim", label: "Bildirimler", icon: "🔔", href: "/bildirimler" },
  { key: "menu", label: "Menü", icon: "☰", href: "/menu" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  // Oyun/maç ekranlarında alt bar gizlenir (tam ekran deneyim).
  const hideOn = ["/oyna", "/arena", "/solo", "/gunun-kelimesi", "/giris", "/yonetim"];
  if (hideOn.some((p) => pathname?.startsWith(p))) return null;

  function go(href: string) {
    if (href === "/profil/me") {
      // Kendi profiline git (username ile)
      if (user?.username) router.push(`/profil/${user.username}`);
      else router.push("/giris");
      return;
    }
    router.push(href);
  }

  const isActive = (item: typeof ITEMS[0]) => {
    if (item.href === "/") return pathname === "/";
    if (item.key === "profil") return pathname?.startsWith("/profil");
    return pathname?.startsWith(item.href);
  };

  return (
    <>
      {/* Alt bar yüksekliği kadar boşluk (içerik gizlenmesin) */}
      <div className="kt-bottom-nav" style={{ height: 72 }} />
      <nav className="kt-bottom-nav" style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
        display: "flex", justifyContent: "space-around", alignItems: "flex-end",
        background: "var(--bg-panel)", borderTop: "1px solid var(--border-soft)",
        padding: "8px 4px 10px", maxWidth: 560, margin: "0 auto",
      }}>
        {ITEMS.map((item) => {
          const active = isActive(item);
          if (item.center) {
            return (
              <button key={item.key} onClick={() => go(item.href)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  background: "none", border: "none", cursor: "pointer",
                  transform: "translateY(-12px)",
                }}>
                <span style={{
                  width: 56, height: 56, borderRadius: "50%",
                  background: active ? "var(--accent)" : "var(--accent)",
                  display: "grid", placeItems: "center", fontSize: 26,
                  boxShadow: "0 4px 14px rgba(0,0,0,.3)", border: "3px solid var(--bg-panel)",
                }}>{item.icon}</span>
                <span style={{ fontSize: 10, color: active ? "var(--accent)" : "var(--text-dim)", fontWeight: 600 }}>{item.label}</span>
              </button>
            );
          }
          return (
            <button key={item.key} onClick={() => go(item.href)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                background: "none", border: "none", cursor: "pointer", flex: 1, padding: "4px 0",
              }}>
              <span style={{ fontSize: 20, opacity: active ? 1 : 0.55, filter: active ? "none" : "grayscale(0.3)" }}>{item.icon}</span>
              <span style={{ fontSize: 10, color: active ? "var(--accent)" : "var(--text-dim)", fontWeight: active ? 700 : 500 }}>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
