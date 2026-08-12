"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SITE_URL } from "@/lib/site";
import ShareButtons from "@/components/ShareButtons";
import LinkCopyBox from "@/components/LinkCopyBox";

type Friend = { id: number; username: string; display_name: string; avatar_url: string | null };

/** Özel 1v1 oda: davet linki + sosyal medya butonları + arkadaş davet listesi. */
export default function RoomInvite({ code }: { code: string }) {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [invited, setInvited] = useState<Set<number>>(new Set());

  function token() {
    return typeof window !== "undefined" ? localStorage.getItem("kt_token") : null;
  }

  useEffect(() => {
    if (!user) return;
    fetch(apiUrl("/api/friends"), { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((d) => setFriends(d.friends || []))
      .catch(() => {});
  }, [user]);

  const origin = typeof window !== "undefined" ? window.location.origin : SITE_URL;
  const link = `${origin}/oda/${code}`;
  const shareTitle = `${user?.display_name || "Arkadaşın"} ile kelime tahmin oyna`;

  async function invite(fid: number) {
    const r = await fetch(apiUrl("/api/room/invite"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ code, friend_ids: [fid] }),
    });
    if (r.ok) setInvited((s) => new Set(s).add(fid));
  }

  return (
    <div
      style={{
        width: "100%", maxWidth: 420, minWidth: 0, boxSizing: "border-box",
        justifySelf: "stretch", display: "grid", gap: 14, marginTop: 4,
      }}
    >
      {/* Oda linki */}
      <LinkCopyBox link={link} label="🔗 Linki kopyala" />

      {/* Sosyal medya */}
      <ShareButtons url={link} title={shareTitle} label="Davet et" />

      {/* Arkadaşlar */}
      {user && (
        <div>
          <h2 style={{ fontSize: 14, color: "var(--text-soft)", margin: "6px 0 8px" }}>Arkadaşlarını davet et</h2>
          {friends.length === 0 ? (
            <p style={{ color: "var(--text-dim)", fontSize: 13 }}>
              Henüz arkadaşın yok. Linki paylaşarak davet edebilirsin.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 8, maxHeight: 240, overflowY: "auto" }}>
              {friends.map((f) => (
                <div
                  key={f.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "8px 12px",
                    background: "var(--bg-panel)", borderRadius: 10,
                  }}
                >
                  <img
                    src={f.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(f.display_name)}`}
                    alt=""
                    style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--bg-elevated)" }}
                  />
                  <span style={{ flex: 1, color: "var(--text-strong)", fontWeight: 600, fontSize: 14 }}>
                    {f.display_name}
                  </span>
                  <button
                    onClick={() => invite(f.id)}
                    disabled={invited.has(f.id)}
                    style={{
                      padding: "6px 13px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700,
                      cursor: invited.has(f.id) ? "default" : "pointer",
                      background: invited.has(f.id) ? "var(--bg-elevated)" : "var(--accent)",
                      color: invited.has(f.id) ? "var(--text-dim)" : "#1a1330",
                    }}
                  >
                    {invited.has(f.id) ? "✓ Davet edildi" : "Davet et"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
