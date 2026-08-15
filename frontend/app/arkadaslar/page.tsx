"use client";

/**
 * Arkadaşlarım — etiketleme (aile / iş / diğer) ve listeden çıkarma.
 *
 * Etiketler kişiye özeldir (karşı taraf görmez) ve özel arena davetinde
 * "sadece aileyi göster" gibi filtrelerde kullanılır.
 */

import { useState, useEffect } from "react";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/Logo";
import GuestJoin from "@/components/GuestJoin";
import { FRIEND_LABELS, labelInfo, type Friend, type FriendLabelKey } from "@/lib/friendLabels";

const STATUS_DOT: Record<string, string> = {
  online: "#3aa76d",
  in_match: "#4a90d9",
  offline: "var(--text-dim)",
};
const STATUS_TEXT: Record<string, string> = {
  online: "Çevrimiçi",
  in_match: "Maçta",
  offline: "Çevrimdışı",
};

export default function ArkadaslarPage() {
  const { user, loading } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [filter, setFilter] = useState<"" | FriendLabelKey>("");
  const [busy, setBusy] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Friend | null>(null);
  const [loaded, setLoaded] = useState(false);

  function token() { return typeof window !== "undefined" ? localStorage.getItem("kt_token") : null; }
  function headers() { return { Authorization: `Bearer ${token()}` }; }

  function load() {
    fetch(apiUrl("/api/friends"), { headers: headers() })
      .then((r) => r.json())
      .then((d) => { setFriends(d.friends || []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }

  useEffect(() => { if (user) load(); }, [user]);

  async function setLabel(f: Friend, label: string) {
    const next = f.label === label ? "" : label;   // aynısına basınca etiketi kaldır
    setBusy(f.id);
    setFriends((fs) => fs.map((x) => (x.id === f.id ? { ...x, label: next } : x)));
    await fetch(apiUrl(`/api/friends/label/${f.id}`), {
      method: "PUT",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ label: next }),
    }).catch(() => {});
    setBusy(null);
  }

  async function remove(f: Friend) {
    setConfirmRemove(null);
    setFriends((fs) => fs.filter((x) => x.id !== f.id));
    await fetch(apiUrl(`/api/friends/remove/${f.id}`), { method: "POST", headers: headers() }).catch(() => {});
  }

  if (loading) return <Wrap><Center>Yükleniyor…</Center></Wrap>;
  if (!user) {
    return (
      <GuestJoin
        allowed={false}
        icon="🤝"
        title="Arkadaşlarım"
        subtitle="Arkadaş listeni görmek için giriş yapmalısın."
        note="Arkadaşlarını aile / iş / diğer diye etiketleyip özel arena davetinde kolayca seçebilirsin."
      />
    );
  }

  const shown = filter ? friends.filter((f) => f.label === filter) : friends;
  const counts = Object.fromEntries(
    FRIEND_LABELS.map((l) => [l.key, friends.filter((f) => f.label === l.key).length])
  ) as Record<string, number>;

  return (
    <Wrap>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <h1 className="brand-mono" style={{ fontSize: 24, margin: 0, flex: 1 }}>🤝 Arkadaşlarım</h1>
        <span style={{ color: "var(--text-dim)", fontSize: 14, fontWeight: 600 }}>{friends.length}</span>
      </div>
      <p style={{ color: "var(--text-dim)", fontSize: 12.5, lineHeight: 1.5, marginBottom: 14 }}>
        Etiketler sadece sana görünür. Özel arena davetinde "sadece aile" gibi süzebilirsin.
      </p>

      {/* Filtre şeridi */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <FilterChip active={filter === ""} onClick={() => setFilter("")} label={`Tümü (${friends.length})`} />
        {FRIEND_LABELS.map((l) => (
          <FilterChip
            key={l.key}
            active={filter === l.key}
            color={l.color}
            onClick={() => setFilter(filter === l.key ? "" : l.key)}
            label={`${l.icon} ${l.name} (${counts[l.key] || 0})`}
          />
        ))}
      </div>

      {!loaded ? (
        <Center>Yükleniyor…</Center>
      ) : friends.length === 0 ? (
        <p style={{ color: "var(--text-dim)", textAlign: "center", padding: 30, lineHeight: 1.6 }}>
          Henüz arkadaşın yok.<br />Profillerden 🤝 Arkadaş Ekle diyerek başlayabilirsin.
        </p>
      ) : shown.length === 0 ? (
        <p style={{ color: "var(--text-dim)", textAlign: "center", padding: 30 }}>Bu etikette arkadaş yok.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {shown.map((f) => (
            <div key={f.id} style={{
              background: "var(--bg-panel)", border: "1px solid var(--border-soft)",
              borderRadius: 14, padding: "12px 14px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <img
                  src={f.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(f.display_name)}`}
                  alt="" style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--bg-elevated)", flexShrink: 0 }}
                />
                <a href={`/profil/${f.username}`} style={{ flex: 1, minWidth: 0, textDecoration: "none" }}>
                  <div style={{ color: "var(--text-strong)", fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.display_name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_DOT[f.status || "offline"], flexShrink: 0 }} />
                    <span style={{ color: "var(--text-dim)", fontSize: 12 }}>{STATUS_TEXT[f.status || "offline"]}</span>
                  </div>
                </a>
                <button
                  onClick={() => setConfirmRemove(f)}
                  title="Arkadaşlıktan çıkar"
                  style={{
                    padding: "7px 12px", borderRadius: 9, cursor: "pointer", flexShrink: 0,
                    border: "1px solid var(--border-soft)", background: "var(--bg-elevated)",
                    color: "var(--accent-hot)", fontSize: 13, fontWeight: 700,
                  }}
                >Çıkar</button>
              </div>

              {/* Etiket seçimi */}
              <div style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap" }}>
                {FRIEND_LABELS.map((l) => {
                  const on = f.label === l.key;
                  return (
                    <button
                      key={l.key}
                      onClick={() => setLabel(f, l.key)}
                      disabled={busy === f.id}
                      style={{
                        padding: "6px 12px", borderRadius: 20, cursor: "pointer", fontSize: 12.5, fontWeight: 700,
                        border: `1px solid ${on ? l.color : "var(--border-soft)"}`,
                        background: on ? l.color : "transparent",
                        color: on ? "#fff" : "var(--text-soft)",
                      }}
                    >{l.icon} {l.name}</button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Arkadaşlıktan çıkarma onayı */}
      {confirmRemove && (
        <div
          onClick={() => setConfirmRemove(null)}
          style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center", padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "var(--bg-panel)", border: "1px solid var(--border-soft)",
            borderRadius: 16, padding: "22px 20px", maxWidth: 340, width: "100%", textAlign: "center",
          }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>🚪</div>
            <div style={{ fontWeight: 800, color: "var(--text-strong)", fontSize: 17, marginBottom: 6 }}>
              {confirmRemove.display_name} listenden çıkarılsın mı?
            </div>
            <p style={{ color: "var(--text-soft)", fontSize: 14, lineHeight: 1.5, marginBottom: 18 }}>
              Arkadaşlığınız sona erer; istersen sonra tekrar ekleyebilirsin.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmRemove(null)} style={{
                flex: 1, padding: "12px", borderRadius: 11, cursor: "pointer",
                border: "1px solid var(--border-soft)", background: "transparent",
                color: "var(--text-strong)", fontWeight: 700, fontSize: 15,
              }}>Vazgeç</button>
              <button onClick={() => remove(confirmRemove)} style={{
                flex: 1, padding: "12px", borderRadius: 11, border: "none", cursor: "pointer",
                background: "var(--accent-hot)", color: "#fff", fontWeight: 800, fontSize: 15,
              }}>Çıkar</button>
            </div>
          </div>
        </div>
      )}
    </Wrap>
  );
}

function FilterChip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 13px", borderRadius: 20, cursor: "pointer", fontSize: 13, fontWeight: 700,
        border: `1px solid ${active ? (color || "var(--accent)") : "var(--border-soft)"}`,
        background: active ? (color || "var(--accent)") : "var(--bg-panel)",
        color: active ? "#fff" : "var(--text-soft)",
      }}
    >{label}</button>
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
