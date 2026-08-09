"use client";

import { useState, useEffect } from "react";
import { getJSON, apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import ProfileEditModal from "@/components/ProfileEditModal";
import PresenceBadge from "@/components/PresenceBadge";
import Logo from "@/components/Logo";

type Badge = { code: string; name: string; desc: string; icon: string; tier: string; earned: boolean };
type Profile = {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  elo: number;
  stats: {
    matches_played: number;
    wins: number;
    losses: number;
    draws: number;
    win_rate: number;
    words_solved: number;
    total_score: number;
  };
  badges: Badge[];
  achievements: { title: string; icon: string; count: number; period_type: string; rank: number }[];
  trophies: number;
  medals: number;
  xp?: number;
  level_info?: { level: number; level_xp: number; level_need: number };
  title_info?: { title: string; next_title: string | null; xp_to_next: number; title_progress: number };
  friend_count?: number;
  friend_status?: string;
  collected_words?: number;
  ranks: { daily: number | null; monthly: number | null; all: number | null };
  solo?: { level: number; stars: number };
};

export default function ProfilePage({ params }: { params: { username: string } }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [recentMatches, setRecentMatches] = useState<any[]>([]);
  const [oppStatus, setOppStatus] = useState("");
  const [oppAllow, setOppAllow] = useState(true);
  const [challengeSent, setChallengeSent] = useState(false);
  const [challengeErr, setChallengeErr] = useState("");
  const [friendStatus, setFriendStatus] = useState<string>("none");
  const [friendBusy, setFriendBusy] = useState(false);
  const [friendErr, setFriendErr] = useState("");

  // profile yüklenince arkadaşlık durumunu al
  useEffect(() => {
    if (profile?.friend_status) setFriendStatus(profile.friend_status);
  }, [profile?.friend_status]);

  async function friendAction(path: string, newStatus: string) {
    if (!profile) return;
    setFriendBusy(true);
    setFriendErr("");
    try {
      const token = localStorage.getItem("kt_token");
      const r = await fetch(apiUrl(path), { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        setFriendStatus(newStatus);
      } else {
        const j = await r.json().catch(() => ({}));
        setFriendErr(j.detail || "İşlem başarısız.");
      }
    } catch {
      setFriendErr("Bağlantı hatası.");
    }
    setFriendBusy(false);
  }

  async function sendChallenge() {
    if (!profile) return;
    setChallengeErr("");
    try {
      const token = localStorage.getItem("kt_token");
      const r = await fetch(apiUrl(`/api/challenge/send/${profile.id}`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json();
      if (!r.ok) { setChallengeErr(j.detail || "Teklif gönderilemedi"); return; }
      setChallengeSent(true);
      // Kabul edilince ChallengeWatcher (outgoing) beni maça yönlendirecek.
    } catch {
      setChallengeErr("Bağlantı hatası");
    }
  }

  function load() {
    const token = typeof window !== "undefined" ? localStorage.getItem("kt_token") : null;
    fetch(apiUrl(`/api/profile/${encodeURIComponent(params.username)}`), {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => { if (!r.ok) throw new Error("404"); return r.json(); })
      .then(setProfile)
      .catch(() => setErr("Profil bulunamadı"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setLoading(true);
    load();
    // Kullanıcının son maçlarını çek.
    getJSON<{ matches: any[] }>(`/api/profile/${encodeURIComponent(params.username)}/matches?limit=10`)
      .then((d) => setRecentMatches(d.matches || []))
      .catch(() => setRecentMatches([]));
  }, [params.username]);

  if (loading) return <Wrap><Centered>Yükleniyor…</Centered></Wrap>;
  if (err || !profile) return <Wrap><Centered>{err || "Profil yok"}</Centered></Wrap>;

  const isMe = user?.username === profile.username;
  const earnedBadges = profile.badges.filter((b) => b.earned);
  const lockedBadges = profile.badges.filter((b) => !b.earned);

  return (
    <Wrap>
      {/* Mobil: logo + düzenle (KT logosu hizasında, sağ üstte). Desktopta TopBar logosu var. */}
      <div className="kt-mobile-only" style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/"><Logo size={36} /></a>
        {isMe && (
          <button
            onClick={() => setEditOpen(true)}
            style={{
              padding: "8px 16px", fontSize: 13, fontWeight: 600,
              background: "var(--bg-elevated)", color: "var(--text-strong)",
              border: "1px solid var(--border-soft)", borderRadius: 9, cursor: "pointer",
            }}
          >
            ⚙️ Düzenle
          </button>
        )}
      </div>

      {/* Üst kart */}
      <div style={{
        position: "relative", display: "flex", alignItems: "center", gap: 16, marginBottom: 24,
        padding: "18px 20px", background: "var(--bg-panel)",
        border: "1px solid var(--border-soft)", borderRadius: 18,
      }}>
        {isMe && (
          <button
            onClick={() => setEditOpen(true)}
            className="kt-desktop-only"
            style={{
              position: "absolute", top: 12, right: 12, zIndex: 2,
              padding: "7px 14px", fontSize: 13, fontWeight: 600,
              background: "var(--bg-elevated)", color: "var(--text-strong)",
              border: "1px solid var(--border-soft)", borderRadius: 9, cursor: "pointer",
            }}
          >
            ⚙️ Düzenle
          </button>
        )}
        <div
          style={{
            width: 76, height: 76, borderRadius: 18, overflow: "hidden",
            background: "var(--bg-elevated)", display: "grid", placeItems: "center",
            border: "2px solid var(--accent)", flexShrink: 0,
          }}
        >
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt="" width={76} height={76} />
          ) : (
            <span className="brand-mono" style={{ fontSize: 34, color: "var(--accent)" }}>
              {profile.display_name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 className="brand-mono" style={{ fontSize: 24, margin: 0 }}>{profile.display_name}</h1>
            {profile.title_info && (
              <span style={{
                padding: "3px 12px", borderRadius: 12, fontSize: 13, fontWeight: 700,
                background: "rgba(63,185,80,.15)", color: "var(--tile-correct)",
                border: "1px solid rgba(63,185,80,.3)",
              }}>{profile.title_info.title}</span>
            )}
          </div>
          <p style={{ color: "var(--text-dim)", margin: "2px 0" }}>
            @{profile.username}
            {typeof profile.friend_count === "number" && (
              <span> · 🤝 {profile.friend_count} arkadaş</span>
            )}
          </p>
          {/* XP çizgisi + unvan ilerlemesi */}
          {profile.title_info && profile.level_info && (
            <div className="xp-progress" style={{ margin: "8px 0" }}>
              <div className="xp-row">
                <span className="xp-now">💎 {(profile.xp || 0).toLocaleString("tr")} XP</span>
                {profile.title_info.next_title && (
                  <span className="xp-next">
                    {profile.title_info.next_title} için {profile.title_info.xp_to_next.toLocaleString("tr")} XP
                  </span>
                )}
              </div>
              <div className="xp-track">
                <div className="xp-fill" style={{ width: `${profile.title_info.title_progress}%` }} />
              </div>
            </div>
          )}
          {/* Sayaç şeridi — ELO ile başlar, bloğun tamamına yayılır (ana sayfayla aynı stil) */}
          <div className="kt-stat-strip" style={{ margin: "8px 0" }}>
            <span className="hm-chip" title="ELO">📈 {profile.elo.toLocaleString("tr")}</span>
            <span className="hm-chip" title="Puan">⭐ {(profile.stats?.total_score ?? 0).toLocaleString("tr")}</span>
            <span className="hm-chip" title="Kupa">🏆 {profile.trophies ?? 0}</span>
            <span className="hm-chip" title="Madalya">🥈 {profile.medals ?? 0}</span>
            <span className="hm-chip" title="Rozet">🎖️ {(profile.badges || []).filter((b) => b.earned).length}</span>
          </div>
          {!isMe && <PresenceBadge userId={profile.id} onStatus={(s, allow) => { setOppStatus(s); setOppAllow(allow); }} />}
          {/* Arkadaşlık butonu / durumu */}
          {!isMe && (
            <div style={{ marginTop: 10 }}>
              {friendStatus === "friends" && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, background: "rgba(63,185,80,.15)", color: "var(--tile-correct)", fontWeight: 700, fontSize: 14, border: "1px solid rgba(63,185,80,.3)" }}>
                  🤝 Arkadaşın
                </span>
              )}
              {friendStatus === "none" && (
                <button onClick={() => friendAction(`/api/friends/request/${profile.id}`, "request_sent")} disabled={friendBusy}
                  style={{ padding: "9px 18px", fontSize: 14, fontWeight: 700, background: "var(--accent)", color: "#1a1330", border: "none", borderRadius: 10, cursor: "pointer" }}>
                  🤝 Arkadaş Ekle
                </button>
              )}
              {friendStatus === "request_sent" && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, background: "var(--bg-elevated)", color: "var(--text-dim)", fontSize: 14 }}>
                  ⏳ İstek gönderildi
                </span>
              )}
              {friendStatus === "request_received" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => friendAction(`/api/friends/accept/${profile.id}`, "friends")} disabled={friendBusy}
                    style={{ padding: "9px 16px", fontSize: 14, fontWeight: 700, background: "var(--tile-correct)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer" }}>
                    ✅ Kabul et
                  </button>
                  <button onClick={() => friendAction(`/api/friends/reject/${profile.id}`, "none")} disabled={friendBusy}
                    style={{ padding: "9px 16px", fontSize: 14, fontWeight: 600, background: "var(--bg-elevated)", color: "var(--accent-hot)", border: "1px solid var(--border-soft)", borderRadius: 10, cursor: "pointer" }}>
                    ❌ Reddet
                  </button>
                </div>
              )}
              {friendErr && (
                <div style={{ marginTop: 8, fontSize: 13, color: "var(--accent-hot)" }}>{friendErr}</div>
              )}
            </div>
          )}
          {!isMe && oppStatus === "online" && oppAllow && (
            <button
              onClick={sendChallenge}
              disabled={challengeSent}
              style={{
                marginTop: 10, padding: "10px 20px", fontSize: 14, fontWeight: 700,
                background: challengeSent ? "var(--bg-elevated)" : "var(--accent)",
                color: challengeSent ? "var(--text-dim)" : "#1a1330",
                border: "none", borderRadius: 10, cursor: challengeSent ? "default" : "pointer",
              }}
            >
              {challengeSent ? "⏳ Teklif gönderildi, bekleniyor…" : "⚔️ Maç Teklifi Gönder"}
            </button>
          )}
          {challengeErr && <div style={{ marginTop: 8, fontSize: 13, color: "var(--accent-hot)" }}>{challengeErr}</div>}
        </div>
      </div>

      {isMe && editOpen && (
        <ProfileEditModal onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); load(); }} />
      )}

      {/* Başarılar — lig ödülleri (Günün/Ayın/Yılın Şampiyonu vb.), ×N ile */}
      {profile.achievements && profile.achievements.length > 0 && (
        <>
          <SectionTitle>Kupalar & Madalyalar</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 24 }}>
            {profile.achievements.map((a) => (
              <div key={`${a.period_type}-${a.rank}`} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                background: "var(--bg-panel)", borderRadius: 12,
                border: a.rank === 1 ? "1px solid #D4AF37" : "1px solid var(--border-soft)",
              }}>
                <span style={{ fontSize: 28, lineHeight: 1 }}>{a.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)" }}>{a.title}</div>
                  {a.count > 1 && (
                    <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>×{a.count}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* İstatistik ızgarası */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 24 }}>
        <Stat label="Maç" value={profile.stats.matches_played} />
        <Stat label="Galibiyet" value={profile.stats.wins} accent />
        <Stat label="Kazanma %" value={`${profile.stats.win_rate}%`} />
        <Stat label="Mağlubiyet" value={profile.stats.losses} />
        <Stat label="Kelime" value={profile.stats.words_solved} />
        <Stat label="Toplanan Kelime" value={profile.collected_words ?? 0} accent />
        <Stat label="Puan" value={profile.stats.total_score} />
      </div>

      {/* Solo mod */}
      {profile.solo && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
          <Stat label="🗺️ Solo Level" value={profile.solo.level} accent />
          <Stat label="⭐ Solo Yıldız" value={profile.solo.stars} />
        </div>
      )}

      {/* Lig sıraları */}
      <SectionTitle>Lig Sıraları</SectionTitle>
      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <RankChip label="Günlük" rank={profile.ranks.daily} />
        <RankChip label="Aylık" rank={profile.ranks.monthly} />
        <RankChip label="Tüm Zamanlar" rank={profile.ranks.all} />
      </div>

      {/* Başarılar (eski rozetler) */}
      <SectionTitle>Başarılar ({earnedBadges.length}/{profile.badges.length})</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 10 }}>
        {[...earnedBadges, ...lockedBadges].map((b) => (
          <BadgeCard key={b.code} badge={b} />
        ))}
      </div>

      {/* Son maçlar */}
      {recentMatches.length > 0 && (
        <>
          <SectionTitle>Son Maçlar</SectionTitle>
          <div style={{ display: "grid", gap: 8 }}>
            {recentMatches.map((m, i) => {
              const color = m.result === "win" ? "var(--tile-correct)" : m.result === "loss" ? "var(--accent-hot)" : "var(--text-dim)";
              const label = m.result === "win" ? "Galibiyet" : m.result === "loss" ? "Mağlubiyet" : "Beraberlik";
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                  background: "var(--bg-panel)", borderRadius: 10,
                  borderLeft: `3px solid ${color}`,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color, width: 78, flexShrink: 0 }}>{label}</span>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                    <span style={{ color: "var(--text-dim)" }}>vs </span>
                    {m.opp_username ? (
                      <a href={`/profil/${m.opp_username}`} style={{ color: "var(--text-strong)", fontWeight: 600, textDecoration: "none" }}>{m.opp_name}</a>
                    ) : (
                      <span style={{ color: "var(--text-strong)", fontWeight: 600 }}>{m.opp_name}</span>
                    )}
                    {m.has_bot && <span style={{ color: "var(--text-dim)", fontSize: 12 }}> 🤖</span>}
                  </div>
                  <span className="brand-mono" style={{ fontSize: 15, color: "var(--text-strong)", flexShrink: 0 }}>
                    {m.my_score} : {m.opp_score}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ marginTop: 30, textAlign: "center" }}>
        <a href="/oyna" style={{ color: "var(--accent)", fontWeight: 600 }}>Oyna →</a>
        {" · "}
        <a href="/lig" style={{ color: "var(--accent)", fontWeight: 600 }}>Lig →</a>
      </div>
    </Wrap>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div style={{ background: "var(--bg-panel)", borderRadius: 12, padding: "14px 10px", textAlign: "center" }}>
      <div className="brand-mono" style={{ fontSize: 24, color: accent ? "var(--accent)" : "var(--text-strong)" }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{label}</div>
    </div>
  );
}

function RankChip({ label, rank }: { label: string; rank: number | null }) {
  return (
    <div style={{ flex: 1, background: "var(--bg-panel)", borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
      <div className="brand-mono" style={{ fontSize: 20, color: rank ? "var(--accent)" : "var(--text-dim)" }}>
        {rank ? `#${rank}` : "—"}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{label}</div>
    </div>
  );
}

const TIER_COLOR: Record<string, string> = {
  bronze: "#cd7f32",
  silver: "#c0c0c0",
  gold: "var(--accent)",
};

function BadgeCard({ badge }: { badge: Badge }) {
  return (
    <div
      title={badge.desc}
      style={{
        background: "var(--bg-panel)",
        borderRadius: 12,
        padding: "14px 8px",
        textAlign: "center",
        opacity: badge.earned ? 1 : 0.35,
        border: badge.earned ? `1px solid ${TIER_COLOR[badge.tier]}` : "1px solid transparent",
        filter: badge.earned ? "none" : "grayscale(1)",
      }}
    >
      <div style={{ fontSize: 30, marginBottom: 4 }}>{badge.icon}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)" }}>{badge.name}</div>
      <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>{badge.desc}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="brand-mono" style={{ fontSize: 16, color: "var(--text-soft)", marginBottom: 12 }}>{children}</h2>;
}

const awardBox: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  background: "var(--bg-panel)", borderRadius: 12, padding: "10px 16px", fontSize: 14,
};

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ flex: 1, maxWidth: 640, width: "100%", margin: "0 auto", padding: "24px 18px 60px" }}>
      {children}
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", placeItems: "center", minHeight: 200, color: "var(--text-soft)" }}>{children}</div>;
}
