"use client";

import { useState, useEffect } from "react";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/Logo";

type Notif = { id: number; title: string; body: string; read: boolean; created_at: string; link?: string; icon?: string };
type FriendReq = { id: number; username: string; display_name: string; avatar_url: string | null };

export default function BildirimlerPage() {
  const { user, loading } = useAuth();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [requests, setRequests] = useState<FriendReq[]>([]);

  function token() { return typeof window !== "undefined" ? localStorage.getItem("kt_token") : null; }

  async function respondRequest(id: number, accept: boolean) {
    const path = accept ? `/api/friends/accept/${id}` : `/api/friends/reject/${id}`;
    await fetch(apiUrl(path), { method: "POST", headers: { Authorization: `Bearer ${token()}` } }).catch(() => {});
    setRequests((rs) => rs.filter((r) => r.id !== id));
  }

  useEffect(() => {
    if (!user) return;
    fetch(apiUrl("/api/notifications"), { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then((d) => setNotifs(d.notifications || [])).catch(() => {});
    fetch(apiUrl("/api/notifications/read"), { method: "POST", headers: { Authorization: `Bearer ${token()}` } }).catch(() => {});
    fetch(apiUrl("/api/friends/requests"), { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then((d) => setRequests(d.requests || [])).catch(() => {});
  }, [user]);

  if (loading) return <Wrap><Center>Yükleniyor…</Center></Wrap>;
  if (!user) return <Wrap><Center><a href="/giris" style={{ color: "var(--accent)" }}>Giriş yap →</a></Center></Wrap>;

  const hasContent = requests.length > 0 || notifs.length > 0;

  return (
    <Wrap>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h1 className="brand-mono" style={{ fontSize: 26, margin: 0, flex: 1 }}>🔔 Bildirimler</h1>
        <a href="/ayarlar/bildirimler" title="Bildirim ayarları" style={{
          padding: "7px 12px", borderRadius: 9, background: "var(--bg-panel)",
          border: "1px solid var(--border-soft)", color: "var(--text-soft)",
          fontSize: 13, fontWeight: 600, textDecoration: "none", flexShrink: 0,
        }}>⚙️ Ayarlar</a>
      </div>

      {/* Gelen arkadaşlık istekleri (aksiyon gerektiren) */}
      {requests.length > 0 && (
        <>
          <h2 style={{ fontSize: 15, color: "var(--text-soft)", marginBottom: 10 }}>🤝 Arkadaşlık istekleri</h2>
          <div style={{ display: "grid", gap: 8, marginBottom: 24 }}>
            {requests.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--bg-panel)", borderRadius: 10 }}>
                <img src={r.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(r.display_name)}`}
                  alt={r.display_name} style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--bg-elevated)" }} />
                <a href={`/profil/${r.username}`} style={{ flex: 1, minWidth: 0, color: "var(--text-strong)", fontWeight: 600, textDecoration: "none", fontSize: 14 }}>{r.display_name}</a>
                <button onClick={() => respondRequest(r.id, true)}
                  style={{ padding: "7px 12px", fontSize: 13, fontWeight: 700, background: "var(--tile-correct)", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>✅</button>
                <button onClick={() => respondRequest(r.id, false)}
                  style={{ padding: "7px 12px", fontSize: 13, fontWeight: 600, background: "var(--bg-elevated)", color: "var(--accent-hot)", border: "1px solid var(--border-soft)", borderRadius: 8, cursor: "pointer" }}>❌</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Son bildirimler */}
      {notifs.length > 0 && (
        <h2 style={{ fontSize: 15, color: "var(--text-soft)", marginBottom: 10 }}>Son bildirimler</h2>
      )}
      {!hasContent ? (
        <p style={{ color: "var(--text-dim)", textAlign: "center", padding: 40 }}>Henüz bildirim yok.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {notifs.map((n) => {
            const clickable = !!n.link;
            const inner = (
              <>
                <div style={{ fontWeight: 600, color: "var(--text-strong)", fontSize: 14 }}>{n.icon} {n.title}</div>
                {n.body && <div style={{ color: "var(--text-soft)", fontSize: 13, marginTop: 2 }}>{n.body}</div>}
                {clickable && <div style={{ color: "var(--accent)", fontSize: 12, marginTop: 4, fontWeight: 600 }}>{n.link!.startsWith("/profil") ? "Profile git →" : "Arenaya git →"}</div>}
              </>
            );
            const cardStyle: React.CSSProperties = {
              display: "block", padding: "12px 14px", background: "var(--bg-panel)", borderRadius: 10,
              borderLeft: n.read ? "3px solid var(--border-soft)" : "3px solid var(--accent)",
              textDecoration: "none", cursor: clickable ? "pointer" : "default",
              position: "relative", zIndex: 1,
            };
            return clickable ? (
              <a key={n.id} href={n.link} style={cardStyle}>{inner}</a>
            ) : (
              <div key={n.id} style={cardStyle}>{inner}</div>
            );
          })}
        </div>
      )}
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "24px 18px 40px", minHeight: "60vh" }}>
      <div className="kt-mobile-only" style={{ marginBottom: 16 }}><a href="/"><Logo size={32} /></a></div>
      {children}
    </main>
  );
}
function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", placeItems: "center", minHeight: "40vh", color: "var(--text-soft)" }}>{children}</div>;
}
