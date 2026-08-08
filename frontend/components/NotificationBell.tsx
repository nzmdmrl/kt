"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";

// Bildirim zili — okunmamış sayısı rozette. Tıklayınca /bildirimler sayfasına gider
// (mobildeki ile aynı, çalışan sistem). Dropdown yok; tek tutarlı bildirim ekranı.
export default function NotificationBell() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("kt_token") : null;
    if (!token) return;
    let alive = true;
    function load() {
      fetch(apiUrl("/api/notifications"), { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => { if (alive) setUnread(d.unread || 0); })
        .catch(() => {});
    }
    load();
    const iv = setInterval(load, 30000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  return (
    <button
      onClick={() => router.push("/bildirimler")}
      aria-label="Bildirimler"
      style={{
        position: "relative", width: 34, height: 34, borderRadius: "50%",
        border: "1px solid var(--border-soft)", background: "var(--bg-panel)",
        cursor: "pointer", fontSize: 16, display: "grid", placeItems: "center",
      }}
    >
      🔔
      {unread > 0 && (
        <span style={{
          position: "absolute", right: -3, top: -3, minWidth: 17, height: 17,
          borderRadius: "50%", background: "var(--accent-hot)", color: "#fff",
          fontSize: 10, fontWeight: 700, display: "grid", placeItems: "center", padding: "0 3px",
        }}>{unread > 9 ? "9+" : unread}</span>
      )}
    </button>
  );
}
