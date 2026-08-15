"use client";

import { useState, useEffect } from "react";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/Logo";

type Notif = { id: number; kind?: string; title: string; body: string; read: boolean; created_at: string; link?: string; icon?: string };

// Bildirim türüne göre "→" eylem etiketi.
// Anahtarlar backend'de gerçekten yazılan kind değerleridir (Notification(kind=...)).
// DİKKAT: lig ödülleri tek bir "award" kind'ı ile yazılıyor (league_scheduler.py);
// günlük/aylık/yıllık ayrımı yalnızca bildirim türü kataloğunda var. Kod ileride
// üçe bölünürse diye o kodlar da eşlendi.
const ACTION_LABELS: Record<string, string> = {
  system_announcement: "Duyuruya git →",
  arena_invite: "Arenaya git →",
  room_invite: "Odaya git →",
  friend_request: "İsteklere git →",
  friend_accept: "Profile git →",
  friend_reject: "Profile git →",
  arena_medal: "Profile git →",
  title_up: "Profile git →",
  award: "Lige git →",
  award_daily: "Lige git →",
  award_monthly: "Lige git →",
  award_yearly: "Lige git →",
};

// Eşlenmemiş yeni bir tür yanlış yönlendirme yazmasın diye nötr yedek.
const ACTION_FALLBACK = "Görüntüle →";
type FriendReq = { id: number; username: string; display_name: string; avatar_url: string | null };

export default function BildirimlerPage() {
  const { user, loading } = useAuth();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [requests, setRequests] = useState<FriendReq[]>([]);
  // Silme: seçim modu + seçili id'ler. retention = kaç günden eskiler otomatik silinir.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [retention, setRetention] = useState(30);
  const [confirmAll, setConfirmAll] = useState(false);

  function token() { return typeof window !== "undefined" ? localStorage.getItem("kt_token") : null; }

  async function respondRequest(id: number, accept: boolean) {
    const path = accept ? `/api/friends/accept/${id}` : `/api/friends/reject/${id}`;
    await fetch(apiUrl(path), { method: "POST", headers: { Authorization: `Bearer ${token()}` } }).catch(() => {});
    setRequests((rs) => rs.filter((r) => r.id !== id));
  }

  function authHeaders() { return { Authorization: `Bearer ${token()}` }; }

  async function deleteOne(id: number) {
    setNotifs((ns) => ns.filter((n) => n.id !== id));
    setSelected((s) => s.filter((x) => x !== id));
    await fetch(apiUrl(`/api/notifications/${id}`), { method: "DELETE", headers: authHeaders() }).catch(() => {});
  }

  async function deleteSelected() {
    const ids = selected;
    if (ids.length === 0) return;
    setNotifs((ns) => ns.filter((n) => !ids.includes(n.id)));
    setSelected([]);
    setSelecting(false);
    await fetch(apiUrl("/api/notifications/delete"), {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
  }

  async function deleteAll() {
    setConfirmAll(false);
    setNotifs([]);
    setSelected([]);
    setSelecting(false);
    await fetch(apiUrl("/api/notifications"), { method: "DELETE", headers: authHeaders() }).catch(() => {});
  }

  function toggleSelected(id: number) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  useEffect(() => {
    if (!user) return;
    fetch(apiUrl("/api/notifications"), { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((d) => {
        setNotifs(d.notifications || []);
        if (typeof d.retention_days === "number") setRetention(d.retention_days);
      })
      .catch(() => {});
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

      {/* Son bildirimler + silme aksiyonları */}
      {notifs.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 15, color: "var(--text-soft)", margin: 0, flex: 1 }}>Son bildirimler</h2>
          {selecting ? (
            <>
              <button onClick={() => setSelected(selected.length === notifs.length ? [] : notifs.map((n) => n.id))} style={smallBtn}>
                {selected.length === notifs.length ? "Seçimi bırak" : "Tümünü seç"}
              </button>
              <button onClick={() => { setSelecting(false); setSelected([]); }} style={smallBtn}>Vazgeç</button>
            </>
          ) : (
            <>
              <button onClick={() => setSelecting(true)} style={smallBtn}>☑️ Seç</button>
              <button onClick={() => setConfirmAll(true)} style={{ ...smallBtn, color: "var(--accent-hot)" }}>🗑 Tümünü sil</button>
            </>
          )}
        </div>
      )}
      {!hasContent ? (
        <p style={{ color: "var(--text-dim)", textAlign: "center", padding: 40 }}>Henüz bildirim yok.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {notifs.map((n) => {
            const clickable = !!n.link && !selecting;
            const checked = selected.includes(n.id);
            const inner = (
              <>
                <div style={{ fontWeight: 600, color: "var(--text-strong)", fontSize: 14 }}>{n.icon} {n.title}</div>
                {n.body && <div style={{ color: "var(--text-soft)", fontSize: 13, marginTop: 2 }}>{n.body}</div>}
                {clickable && <div style={{ color: "var(--accent)", fontSize: 12, marginTop: 4, fontWeight: 600 }}>{ACTION_LABELS[n.kind || ""] || ACTION_FALLBACK}</div>}
              </>
            );
            const cardStyle: React.CSSProperties = {
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 14px", background: "var(--bg-panel)", borderRadius: 10,
              borderLeft: n.read ? "3px solid var(--border-soft)" : "3px solid var(--accent)",
              textDecoration: "none", cursor: clickable || selecting ? "pointer" : "default",
              position: "relative", zIndex: 1,
              outline: checked ? "2px solid var(--accent)" : "none",
            };
            const body = (
              <>
                {selecting && (
                  <span style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                    border: `2px solid ${checked ? "var(--accent)" : "var(--border-soft)"}`,
                    background: checked ? "var(--accent)" : "transparent",
                    color: "#1a1330", fontSize: 14, fontWeight: 900,
                    display: "grid", placeItems: "center",
                  }}>{checked ? "✓" : ""}</span>
                )}
                <span style={{ flex: 1, minWidth: 0 }}>{inner}</span>
                {!selecting && (
                  <button
                    title="Bildirimi sil"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteOne(n.id); }}
                    style={{
                      width: 30, height: 30, borderRadius: 8, flexShrink: 0, cursor: "pointer",
                      border: "1px solid var(--border-soft)", background: "var(--bg-elevated)",
                      color: "var(--text-dim)", fontSize: 14, lineHeight: 1,
                    }}
                  >✕</button>
                )}
              </>
            );
            return clickable ? (
              <a key={n.id} href={n.link} style={cardStyle}>{body}</a>
            ) : (
              <div key={n.id} style={cardStyle} onClick={() => { if (selecting) toggleSelected(n.id); }}>{body}</div>
            );
          })}
        </div>
      )}

      {/* Seçim modunda alt işlem çubuğu */}
      {selecting && notifs.length > 0 && (
        <div style={{
          // Alt barın (mobil) üstünde kalsın.
          position: "sticky", bottom: "calc(88px + var(--kt-safe-bottom, 0px))", zIndex: 20,
          marginTop: 14, display: "flex", gap: 10,
        }}>
          <button
            onClick={deleteSelected}
            disabled={selected.length === 0}
            style={{
              flex: 1, padding: "13px", borderRadius: 12, border: "none",
              background: selected.length ? "var(--accent-hot)" : "var(--bg-panel)",
              color: selected.length ? "#fff" : "var(--text-dim)",
              fontWeight: 800, fontSize: 15, cursor: selected.length ? "pointer" : "default",
            }}
          >
            🗑 Seçilenleri Sil{selected.length ? ` (${selected.length})` : ""}
          </button>
        </div>
      )}

      {/* Otomatik temizlik bilgisi */}
      {retention > 0 && (
        <p style={{ color: "var(--text-dim)", fontSize: 12, textAlign: "center", marginTop: 18, lineHeight: 1.5 }}>
          ℹ️ {retention} günden eski bildirimler otomatik olarak silinir.
        </p>
      )}

      {/* "Tümünü sil" onayı */}
      {confirmAll && (
        <div
          onClick={() => setConfirmAll(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 900, background: "rgba(0,0,0,.55)",
            display: "grid", placeItems: "center", padding: 20,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "var(--bg-panel)", border: "1px solid var(--border-soft)",
            borderRadius: 16, padding: "22px 20px", maxWidth: 340, width: "100%", textAlign: "center",
          }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>🗑</div>
            <div style={{ fontWeight: 800, color: "var(--text-strong)", fontSize: 17, marginBottom: 6 }}>
              Tüm bildirimler silinsin mi?
            </div>
            <p style={{ color: "var(--text-soft)", fontSize: 14, lineHeight: 1.5, marginBottom: 18 }}>
              Bu işlem geri alınamaz.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmAll(false)} style={{
                flex: 1, padding: "12px", borderRadius: 11, cursor: "pointer",
                border: "1px solid var(--border-soft)", background: "transparent",
                color: "var(--text-strong)", fontWeight: 700, fontSize: 15,
              }}>Vazgeç</button>
              <button onClick={deleteAll} style={{
                flex: 1, padding: "12px", borderRadius: 11, border: "none", cursor: "pointer",
                background: "var(--accent-hot)", color: "#fff", fontWeight: 800, fontSize: 15,
              }}>Sil</button>
            </div>
          </div>
        </div>
      )}
    </Wrap>
  );
}

// Başlık satırındaki küçük aksiyon butonları (Seç / Tümünü sil / Vazgeç)
const smallBtn: React.CSSProperties = {
  padding: "6px 11px", borderRadius: 9, background: "var(--bg-panel)",
  border: "1px solid var(--border-soft)", color: "var(--text-soft)",
  fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
};

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
