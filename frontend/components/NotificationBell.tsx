"use client";

import { useState, useEffect, useRef } from "react";
import { apiUrl } from "@/lib/api";

// Kullanıcı adının yanındaki bildirim zili — okunmamış sayısı rozette,
// tıklayınca açılır liste. Lig ödülleri buraya düşer.
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  function load() {
    const token = typeof window !== "undefined" ? localStorage.getItem("kt_token") : null;
    if (!token) return;
    fetch(apiUrl("/api/notifications"), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { setItems(d.notifications || []); setUnread(d.unread || 0); })
      .catch(() => {});
  }

  useEffect(() => {
    load();
    // Her 60 sn'de bir yenile (yeni ödül bildirimleri için).
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, []);

  // Dışa tıklayınca kapan.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      // Açınca okundu işaretle.
      const token = localStorage.getItem("kt_token");
      fetch(apiUrl("/api/notifications/read"), { method: "POST", headers: { Authorization: `Bearer ${token}` } })
        .then(() => setUnread(0)).catch(() => {});
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={toggle}
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
          }}>{unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", right: 12, top: 60,
          width: "min(320px, calc(100vw - 24px))", maxHeight: "70vh", overflowY: "auto",
          background: "var(--bg-panel)", border: "1px solid var(--border-soft)",
          borderRadius: 14, boxShadow: "var(--shadow-soft)", zIndex: 100, padding: 8,
          animation: "fadeIn .15s ease",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)", padding: "6px 8px" }}>
            Bildirimler
          </div>
          {items.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-dim)", padding: "12px 8px", textAlign: "center" }}>
              Henüz bildirim yok
            </div>
          ) : (
            items.map((n) => (
              <div key={n.id} style={{
                display: "flex", gap: 10, padding: "10px 8px", borderRadius: 8,
                background: n.read ? "transparent" : "var(--bg-elevated)",
                marginBottom: 2,
              }}>
                <span style={{ fontSize: 22, lineHeight: 1 }}>{n.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)" }}>{n.title}</div>
                  <div style={{ fontSize: 12, color: "var(--text-soft)" }}>{n.body}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
