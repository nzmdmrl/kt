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
      {/* Alt bar yüksekliği kadar boşluk (içerik gizlenmesin) — bar güvenli alan
          kadar büyüdüğü için boşluk da aynı miktarda büyür */}
      <div className="kt-bottom-nav" style={{ height: "calc(76px + var(--kt-safe-bottom))" }} />
      <nav className="kt-bottom-nav" style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
        display: "flex", justifyContent: "space-around", alignItems: "flex-end",
        background: "var(--bg-panel)",
        borderTop: "1px solid var(--border-soft)",
        borderTopLeftRadius: 22, borderTopRightRadius: 22,
        // Alt boşluk home indicator / gesture bar kadar artar (masaüstünde 0px)
        padding: "10px 6px calc(12px + var(--kt-safe-bottom))", maxWidth: 560, margin: "0 auto",
        boxShadow: "0 -6px 24px rgba(0,0,0,.22)",
      }}>
        {ITEMS.map((item) => {
          const active = isActive(item);
          if (item.center) {
            return (
              <button key={item.key} onClick={() => go(item.href)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                  background: "none", border: "none", cursor: "pointer",
                  transform: "translateY(-14px)",
                }}>
                <span style={{
                  width: 58, height: 58, borderRadius: "50%",
                  background: "linear-gradient(145deg,var(--accent),var(--accent-hot))",
                  display: "grid", placeItems: "center", fontSize: 28,
                  boxShadow: "0 6px 18px rgba(224,148,10,.45)", border: "4px solid var(--bg-panel)",
                }}>{item.icon}</span>
                <span style={{ fontSize: 11, color: active ? "var(--accent)" : "var(--text-soft)", fontWeight: 700 }}>{item.label}</span>
              </button>
            );
          }
          return (
            <button key={item.key} onClick={() => go(item.href)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                background: "none", border: "none", cursor: "pointer", flex: 1, padding: "4px 0",
              }}>
              <span style={{
                position: "relative", fontSize: 24, opacity: active ? 1 : 0.85,
                color: active ? "var(--accent)" : "var(--text-soft)",
                lineHeight: 1,
              }}>
                {item.icon}
                {item.key === "bildirim" && unread > 0 && (
                  <span style={{
                    position: "absolute", top: -5, right: -9, minWidth: 17, height: 17, padding: "0 4px",
                    borderRadius: 9, background: "var(--accent-hot)", color: "#fff",
                    fontSize: 10, fontWeight: 800, display: "grid", placeItems: "center",
                    border: "1.5px solid var(--bg-panel)",
                  }}>{unread > 9 ? "9+" : unread}</span>
                )}
              </span>
              <span style={{ fontSize: 11, color: active ? "var(--accent)" : "var(--text-soft)", fontWeight: active ? 700 : 600 }}>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
