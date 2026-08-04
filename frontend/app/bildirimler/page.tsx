"use client";

import { useState, useEffect } from "react";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/Logo";

type Notif = { id: number; title: string; body: string; read: boolean; created_at: string; type?: string; link?: string; icon?: string };
type Award = { award: string; period_type: string; period_key: string };
type FriendReq = { id: number; username: string; display_name: string; avatar_url: string | null };

export default function BildirimlerPage() {
  const { user, loading } = useAuth();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [trophies, setTrophies] = useState(0);
  const [medals, setMedals] = useState(0);
  const [awards, setAwards] = useState<Award[]>([]);
  const [requests, setRequests] = useState<FriendReq[]>([]);

  function token() { return typeof window !== "undefined" ? localStorage.getItem("kt_token") : null; }

  function loadRequests() {
    fetch(apiUrl("/api/friends/requests"), { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then((d) => setRequests(d.requests || [])).catch(() => {});
  }

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
    loadRequests();
    if (user.username) {
      fetch(apiUrl(`/api/profile/${user.username}`))
        .then((r) => r.json())
        .then((d) => {
          setTrophies(d.trophies || 0);
          setMedals(d.medals || 0);
          setAwards(d.awards || []);
        }).catch(() => {});
    }
  }, [user]);

  if (loading) return <Wrap><Center>Yükleniyor…</Center></Wrap>;
  if (!user) return <Wrap><Center><a href="/giris" style={{ color: "var(--accent)" }}>Giriş yap →</a></Center></Wrap>;

  return (
    <Wrap>
      <h1 className="brand-mono" style={{ fontSize: 26, marginBottom: 20 }}>🔔 Bildirimler</h1>

      {/* Kazanılan kupalar özeti */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <div style={{ flex: 1, background: "var(--bg-panel)", borderRadius: 12, padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: 30 }}>🏆</div>
          <div className="brand-mono" style={{ fontSize: 22, color: "var(--accent)" }}>{trophies}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Kupa</div>
        </div>
        <div style={{ flex: 1, background: "var(--bg-panel)", borderRadius: 12, padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: 30 }}>🥈</div>
          <div className="brand-mono" style={{ fontSize: 22, color: "var(--text-soft)" }}>{medals}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Madalya</div>
        </div>
      </div>

      {/* Kupa/madalya listesi */}
      {awards.length > 0 && (
        <>
          <h2 style={{ fontSize: 15, color: "var(--text-soft)", marginBottom: 10 }}>Kazandıkların</h2>
          <div style={{ display: "grid", gap: 8, marginBottom: 24 }}>
            {awards.map((a, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                background: "var(--bg-panel)", borderRadius: 10,
              }}>
                <span style={{ fontSize: 22 }}>{a.award === "trophy" ? "🏆" : "🥈"}</span>
                <span style={{ color: "var(--text-strong)", fontWeight: 600 }}>
                  {a.period_type === "monthly" ? "Ayın Şampiyonu" : a.period_type === "yearly" ? "Yılın Şampiyonu" : "Günün Şampiyonu"}
                </span>
                <span style={{ marginLeft: "auto", color: "var(--text-dim)", fontSize: 13 }}>{a.period_key}</span>
              </div>
            ))}
          </div>
        </>
      )}

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

      {/* Bildirimler */}
      <h2 style={{ fontSize: 15, color: "var(--text-soft)", marginBottom: 10 }}>Son bildirimler</h2>
      {notifs.length === 0 ? (
        <p style={{ color: "var(--text-dim)", textAlign: "center", padding: 30 }}>Henüz bildirim yok.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {notifs.map((n) => {
            const clickable = !!n.link;
            return (
              <div key={n.id}
                onClick={() => { if (clickable) window.location.href = n.link!; }}
                style={{
                  padding: "12px 14px", background: "var(--bg-panel)", borderRadius: 10,
                  borderLeft: n.read ? "3px solid var(--border-soft)" : "3px solid var(--accent)",
                  cursor: clickable ? "pointer" : "default",
                }}>
                <div style={{ fontWeight: 600, color: "var(--text-strong)", fontSize: 14 }}>{n.icon} {n.title}</div>
                {n.body && <div style={{ color: "var(--text-soft)", fontSize: 13, marginTop: 2 }}>{n.body}</div>}
                {clickable && <div style={{ color: "var(--accent)", fontSize: 12, marginTop: 4, fontWeight: 600 }}>Arenaya git →</div>}
              </div>
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
      <div style={{ marginBottom: 16 }}><a href="/"><Logo size={32} /></a></div>
      {children}
    </main>
  );
}
function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", placeItems: "center", minHeight: "40vh", color: "var(--text-soft)" }}>{children}</div>;
}
