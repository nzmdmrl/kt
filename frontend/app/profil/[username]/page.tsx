"use client";

import { useState, useEffect } from "react";
import { getJSON, apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import ProfileEditModal from "@/components/ProfileEditModal";
import PresenceBadge from "@/components/PresenceBadge";
import { CHALLENGE_SENT_EVENT } from "@/components/ChallengeWatcher";
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
  title_info?: { title: string; title_icon?: string; next_title: string | null; xp_to_next: number; title_progress: number };
  friend_count?: number;
  friend_status?: string;
  collected_words?: number;
  ranks: { daily: number | null; monthly: number | null; all: number | null };
  solo?: { level: number; stars: number };
};
// Karşılıklı maçlar (bakan kullanıcı ↔ profil sahibi) — "Sen 4 - 2 kadir".
type H2H = {
  available: boolean;
  me: { username: string; display_name: string };
  opponent: { username: string; display_name: string };
  wins: number;
  losses: number;
  draws: number;
  total: number;
  matches: { my_score: number; opp_score: number; result: string; created_at: string | null }[];
};

export default function ProfilePage({ params }: { params: { username: string } }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [recentMatches, setRecentMatches] = useState<any[]>([]);
  const [h2h, setH2h] = useState<H2H | null>(null);
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
      // Bu olay olmadan outgoing HİÇ yoklanmaz — yoklama yalnızca teklifi
      // gönderen kullanıcıda, teklif sonuçlanana kadar çalışır.
      window.dispatchEvent(new Event(CHALLENGE_SENT_EVENT));
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

  // Karşılıklı maçlar — sadece giriş yapmışken ve BAŞKASININ profilinde.
  // (Kendi profilinde / misafirde uç `available: false` döner.)
  useEffect(() => {
    setH2h(null);
    const token = typeof window !== "undefined" ? localStorage.getItem("kt_token") : null;
    if (!token || !user || user.username === params.username) return;
    fetch(apiUrl(`/api/profile/${encodeURIComponent(params.username)}/head-to-head?limit=10`), {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.available) setH2h(d); })
      .catch(() => {});
  }, [params.username, user?.username]);

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

      {/* Üst kart — ana sayfadaki profil kartının aynısı (avatar kart dışında solda) */}
      <div className="hm-profile-wrap prof-card">
        {/* Masaüstünde ayarlara tek giriş noktası: mobilde alt menü var, burada yok.
            Dış sarmalayıcıya inline "display" VERİLMEZ — .kt-desktop-only'nin
            gizle/göster kuralını ezerdi. */}
        {isMe && (
          <div className="kt-desktop-only" style={{ position: "absolute", top: 12, right: 12, zIndex: 2 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { window.location.href = "/menu"; }} style={profActionBtn}>
                ⚙️ Ayarlar
              </button>
              <button onClick={() => setEditOpen(true)} style={profActionBtn}>
                ⚙️ Düzenle
              </button>
            </div>
          </div>
        )}
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt="" className="hm-avatar" />
        ) : (
          <div className="hm-avatar prof-avatar-fallback">
            <span className="brand-mono">{profile.display_name.charAt(0).toUpperCase()}</span>
          </div>
        )}
        <div className="hm-profile">
          <div className={`hm-name-row${isMe ? " prof-has-edit" : ""}`}>
            <span className="hm-name">{profile.display_name}</span>
            {profile.level_info && <span className="hm-badge">Lv {profile.level_info.level}</span>}
            <span className="prof-username">@{profile.username}</span>
            {typeof profile.friend_count === "number" && (
              <span className="hm-chip prof-friends" title="Arkadaş">🤝 {profile.friend_count} arkadaş</span>
            )}
          </div>
          {/* Unvan gelişimi — XP'nin yanında unvan (ana sayfayla aynı) */}
          {profile.title_info && (
            <div className="xp-progress hm-xp">
              <div className="xp-row">
                <span className="hm-xp-left">
                  <span className="xp-now">💎 {(profile.xp || 0).toLocaleString("tr")} XP</span>
                  {profile.title_info.title && (
                    <span className="hm-title">{profile.title_info.title_icon || "🏅"} {profile.title_info.title}</span>
                  )}
                </span>
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
        </div>
        {/* Sayaç şeridi — avatarın altından başlar, bloğun tamamına yayılır */}
        <div className="kt-stat-strip">
          <span className="hm-chip" title="ELO">📈 {profile.elo.toLocaleString("tr")}</span>
          <span className="hm-chip" title="Puan">⭐ {(profile.stats?.total_score ?? 0).toLocaleString("tr")}</span>
          <span className="hm-chip" title="Kupa">🏆 {profile.trophies ?? 0}</span>
          <span className="hm-chip" title="Madalya">🥈 {profile.medals ?? 0}</span>
          <span className="hm-chip" title="Rozet">🎖️ {(profile.badges || []).filter((b) => b.earned).length}</span>
        </div>
      </div>

      {/* Durum + arkadaşlık / maç teklifi aksiyonları */}
      {!isMe && (
        <div style={{ marginTop: -8, marginBottom: 24 }}>
          <PresenceBadge userId={profile.id} onStatus={(s, allow) => { setOppStatus(s); setOppAllow(allow); }} />
          {/* Arkadaşlık butonu / durumu */}
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
          {oppStatus === "online" && oppAllow && (
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
      )}

      {/* onSaved: modalı KAPATMADAN arkadaki profil kartını tazeler
          (görünen ad / avatar değişince kart hemen güncellensin). */}
      {isMe && editOpen && (
        <ProfileEditModal onClose={() => setEditOpen(false)} onSaved={load} />
      )}

      {/* Karşılıklı geçmiş — "Sen 4 - 2 kadir" + son karşılaşmalar tablosu.
          Sadece giriş yapmış kullanıcı, başkasının profiline bakarken ve
          aralarında en az 1 maç varsa görünür. */}
      {h2h && h2h.total > 0 && <HeadToHead h2h={h2h} />}

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

      {/* Maraton */}
      {profile.solo && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
          <Stat label="🏃 Maraton Bölüm" value={profile.solo.level} accent />
          <Stat label="⭐ Maraton Yıldız" value={profile.solo.stars} />
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

/**
 * Karşılıklı geçmiş bloğu — üstte toplam skor ("Sen 4 - 2 kadir"),
 * altında son karşılaşmaların tablosu (tarih / skor / sonuç).
 * Önde olan tarafın sayısı yeşil, geride olanınki kırmızı; eşitse nötr.
 */
function HeadToHead({ h2h }: { h2h: H2H }) {
  const lead = h2h.wins > h2h.losses ? "me" : h2h.losses > h2h.wins ? "opp" : "tie";
  const meColor = lead === "me" ? "var(--tile-correct)" : lead === "opp" ? "var(--accent-hot)" : "var(--text-strong)";
  const oppColor = lead === "opp" ? "var(--tile-correct)" : lead === "me" ? "var(--accent-hot)" : "var(--text-strong)";
  const oppName = h2h.opponent.display_name;

  return (
    <>
      <SectionTitle>Sen ⚔️ @{h2h.opponent.username}</SectionTitle>
      <div style={{ background: "var(--bg-panel)", borderRadius: 12, padding: "14px 12px", marginBottom: 24 }}>
        {/* Toplam karşılıklı skor */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-strong)" }}>Sen</span>
          <span className="brand-mono" style={{ fontSize: 30, fontWeight: 700, color: meColor }}>{h2h.wins}</span>
          <span style={{ fontSize: 20, color: "var(--text-dim)" }}>–</span>
          <span className="brand-mono" style={{ fontSize: 30, fontWeight: 700, color: oppColor }}>{h2h.losses}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-strong)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {oppName}
          </span>
        </div>
        <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>
          {h2h.total} karşılaşma{h2h.draws > 0 ? ` · ${h2h.draws} beraberlik` : ""}
        </div>

        {/* Son karşılaşmalar */}
        <div style={{ overflowX: "auto", marginTop: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--text-dim)", textAlign: "left" }}>
                <th style={h2hTh}>Tarih</th>
                <th style={{ ...h2hTh, textAlign: "center" }}>Skor</th>
                <th style={{ ...h2hTh, textAlign: "right" }}>Sonuç</th>
              </tr>
            </thead>
            <tbody>
              {h2h.matches.map((m, i) => {
                const color = m.result === "win" ? "var(--tile-correct)" : m.result === "loss" ? "var(--accent-hot)" : "var(--text-dim)";
                const label = m.result === "win" ? "Galibiyet" : m.result === "loss" ? "Mağlubiyet" : "Beraberlik";
                return (
                  <tr key={i} style={{ borderTop: "1px solid var(--border-soft)" }}>
                    <td style={{ ...h2hTd, color: "var(--text-dim)" }}>{fmtDate(m.created_at)}</td>
                    <td className="brand-mono" style={{ ...h2hTd, textAlign: "center", color: "var(--text-strong)", fontSize: 15 }}>
                      {m.my_score} : {m.opp_score}
                    </td>
                    <td style={{ ...h2hTd, textAlign: "right", color, fontWeight: 700 }}>{label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

const h2hTh: React.CSSProperties = { padding: "6px 8px", fontSize: 11, fontWeight: 600 };
const h2hTd: React.CSSProperties = { padding: "9px 8px", whiteSpace: "nowrap" };

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("tr", { day: "2-digit", month: "short", year: "2-digit" });
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

// Kart sağ üstündeki masaüstü butonları (Ayarlar / Düzenle) — ikisi de aynı görünüm.
const profActionBtn: React.CSSProperties = {
  padding: "7px 14px", fontSize: 13, fontWeight: 600,
  background: "var(--bg-elevated)", color: "var(--text-strong)",
  border: "1px solid var(--border-soft)", borderRadius: 9, cursor: "pointer",
};

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
