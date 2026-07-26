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
  ranks: { daily: number | null; monthly: number | null; all: number | null };
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
    getJSON<Profile>(`/api/profile/${encodeURIComponent(params.username)}`)
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
      {/* Üst kart */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
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
          <h1 className="brand-mono" style={{ fontSize: 24, margin: 0 }}>{profile.display_name}</h1>
          <p style={{ color: "var(--text-dim)", margin: "2px 0" }}>@{profile.username}</p>
          {!isMe && <PresenceBadge userId={profile.id} onStatus={(s, allow) => { setOppStatus(s); setOppAllow(allow); }} />}
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
          <div className="brand-mono" style={{ fontSize: 20, color: "var(--accent)" }}>
            {profile.elo} <span style={{ fontSize: 13, color: "var(--text-dim)" }}>ELO</span>
          </div>
          {isMe && (
            <button
              onClick={() => setEditOpen(true)}
              style={{
                marginTop: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600,
                background: "var(--bg-elevated)", color: "var(--text-strong)",
                border: "1px solid var(--border-soft)", borderRadius: 9, cursor: "pointer",
              }}
            >
              ⚙️ Profili Düzenle
            </button>
          )}
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
        <Stat label="Puan" value={profile.stats.total_score} />
      </div>

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
      <div style={{ marginBottom: 20 }}>
        <a href="/"><Logo size={36} /></a>
      </div>
      {children}
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", placeItems: "center", minHeight: 200, color: "var(--text-soft)" }}>{children}</div>;
}
