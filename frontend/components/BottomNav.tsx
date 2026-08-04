"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { apiUrl } from "@/lib/api";
import { playSound } from "@/lib/sound";

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
  const [unread, setUnread] = useState(0);
  const prevUnread = useRef<number | null>(null);

  // Bildirim yoklayıcı — okunmamış artınca ses çal (yeni bildirim geldi).
  useEffect(() => {
    if (!user) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("kt_token") : null;
    if (!token) return;
    let alive = true;
    async function poll() {
      try {
        const r = await fetch(apiUrl("/api/notifications"), { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        if (!alive) return;
        const u = d.unread || 0;
        // İlk yüklemede ses çalma; sonra artış olursa çal.
        if (prevUnread.current !== null && u > prevUnread.current) {
          try { playSound("opponent_found"); } catch {}
        }
        prevUnread.current = u;
        setUnread(u);
      } catch {}
    }
    poll();
    const iv = setInterval(poll, 20000);  // 20 sn'de bir
    return () => { alive = false; clearInterval(iv); };
  }, [user, pathname]);

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
              <span style={{ position: "relative", fontSize: 20, opacity: active ? 1 : 0.55, filter: active ? "none" : "grayscale(0.3)" }}>
                {item.icon}
                {item.key === "bildirim" && unread > 0 && (
                  <span style={{
                    position: "absolute", top: -4, right: -8, minWidth: 16, height: 16, padding: "0 4px",
                    borderRadius: 8, background: "var(--accent-hot)", color: "#fff",
                    fontSize: 10, fontWeight: 800, display: "grid", placeItems: "center", filter: "none",
                  }}>{unread > 9 ? "9+" : unread}</span>
                )}
              </span>
              <span style={{ fontSize: 10, color: active ? "var(--accent)" : "var(--text-dim)", fontWeight: active ? 700 : 500 }}>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
