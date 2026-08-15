"use client";

import { useState, useEffect } from "react";
import { getJSON, apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/Logo";
import MiniAvatar from "@/components/MiniAvatar";

type Entry = {
  rank: number;
  user_id: number;
  username: string;
  display_name?: string;
  avatar_url?: string | null;
  name?: string;          // listede gösterilecek ad (sunucuda seçilir/kısaltılır)
  elo: number;
  score: number;
};

const TR_AYLAR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const TR_AYLAR_UZUN = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function scopeLabels() {
  const now = new Date();
  return [
    { key: "daily", label: `${now.getDate()} ${TR_AYLAR[now.getMonth()]}` },   // 26 Tem
    { key: "monthly", label: TR_AYLAR_UZUN[now.getMonth()] },                    // Temmuz
    { key: "yearly", label: `${now.getFullYear()}` },                           // 2026
    { key: "all", label: "Tüm Zamanlar" },
  ];
}

const SCOPES = scopeLabels();

export default function LigPage() {
  const { user } = useAuth();
  const [scope, setScope] = useState("daily");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [myRank, setMyRank] = useState<{ rank?: number; score?: number; elo?: number } | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr("");
    getJSON<{ entries: Entry[] }>(`/api/league/leaderboard?scope=${scope}&limit=100`)
      .then((d) => setEntries(d.entries))
      .catch(() => setErr("Sıralama yüklenemedi"))
      .finally(() => setLoading(false));
  }, [scope]);

  const myEntry = user ? entries.find((e) => e.user_id === user.id) : null;

  // İlk 100'ün dışındaysam gerçek sıramı ayrıca çek ("Sen 137. sıradasın").
  useEffect(() => {
    if (!user) { setMyRank(null); return; }
    const token = typeof window !== "undefined" ? localStorage.getItem("kt_token") : null;
    if (!token) return;
    fetch(apiUrl(`/api/league/me?scope=${scope}`), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setMyRank(d?.entry || null))
      .catch(() => setMyRank(null));
  }, [user, scope]);

  return (
    <main style={{ flex: 1, maxWidth: 640, width: "100%", margin: "0 auto", padding: "28px 18px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <a href="/" className="kt-mobile-only"><Logo size={38} /></a>
        <a href="/oyna" style={{ color: "var(--accent)", fontWeight: 600, marginLeft: "auto" }}>Oyna →</a>
      </div>

      <h1 className="brand-mono" style={{ fontSize: 28, marginBottom: 4 }}>Lig</h1>
      <p style={{ color: "var(--text-soft)", marginBottom: 20, fontSize: 14 }}>
        Her maçta topladığın puan seni sıralamada yükseltir. Günlük en iyi maçın
        aylık toplamına eklenir.
      </p>

      {/* Sekmeler */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {SCOPES.map((s) => (
          <button
            key={s.key}
            onClick={() => setScope(s.key)}
            style={{
              flex: 1,
              minWidth: 70,
              padding: "10px 8px",
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: 14,
              background: scope === s.key ? "var(--accent)" : "var(--bg-panel)",
              color: scope === s.key ? "#1a1330" : "var(--text-soft)",
              transition: "all .15s",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading && <Centered>Yükleniyor…</Centered>}
      {err && <Centered>{err}</Centered>}

      {!loading && !err && entries.length === 0 && (
        <Centered>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🏆</div>
            Bu dönemde henüz kimse oynamadı.
            <br />
            <a href="/oyna" style={{ color: "var(--accent)", fontWeight: 600 }}>İlk sen ol!</a>
          </div>
        </Centered>
      )}

      {!loading && !err && entries.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {entries.map((e) => (
            <Row key={e.user_id} entry={e} isMe={user?.id === e.user_id} />
          ))}
        </div>
      )}

      {/* Giriş yapmış kullanıcı ilk 100'de değilse: gerçek sırası ayrı satırda.
          Puanı hiç yoksa "bir maç oyna" daveti. */}
      {user && !myEntry && !loading && (
        myRank?.rank ? (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", marginBottom: 6 }}>
              Senin sıran
            </div>
            <Row
              entry={{
                rank: myRank.rank,
                user_id: user.id,
                username: user.username,
                display_name: user.display_name,
                avatar_url: user.avatar_url,
                name: user.display_name || user.username,
                elo: myRank.elo ?? user.elo ?? 0,
                score: myRank.score ?? 0,
              }}
              isMe
            />
          </div>
        ) : (
          <div style={{ marginTop: 16, padding: 14, background: "var(--bg-panel)", borderRadius: 12, textAlign: "center", color: "var(--text-soft)", fontSize: 14 }}>
            Bu dönemde henüz puanın yok. <a href="/oyna" style={{ color: "var(--accent)" }}>Bir maç oyna!</a>
          </div>
        )
      )}

      {/* Önceki dönem kazananları + arşiv */}
      <PreviousWinners />
    </main>
  );
}

function PreviousWinners() {
  const [prev, setPrev] = useState<any>(null);

  useEffect(() => {
    getJSON<any>("/api/league/previous").then(setPrev).catch(() => {});
  }, []);

  if (!prev) return null;
  const hasAny = prev.daily.top3.length || prev.monthly.top3.length || prev.yearly.top3.length;
  if (!hasAny) return null;

  const blocks = [
    { title: "Dün", data: prev.daily, fmt: fmtDaily },
    { title: "Geçen Ay", data: prev.monthly, fmt: fmtMonthly },
    { title: "Geçen Yıl", data: prev.yearly, fmt: (k: string) => k },
  ].filter((b) => b.data.top3.length > 0);

  return (
    <div style={{ marginTop: 36 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h2 className="brand-mono" style={{ fontSize: 18, margin: 0 }}>Önceki Dönem Kazananları</h2>
        <a href="/lig/arsiv" style={{ color: "var(--accent)", fontWeight: 600, fontSize: 14 }}>Lig Arşivi →</a>
      </div>
      <div style={{ display: "grid", gap: 14 }}>
        {blocks.map((b) => (
          <div key={b.title} style={{ background: "var(--bg-panel)", borderRadius: 14, padding: 16, border: "1px solid var(--border-soft)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontWeight: 700, color: "var(--text-strong)", fontSize: 14 }}>{b.title}</span>
              <span style={{ color: "var(--text-dim)", fontSize: 13 }}>{b.fmt(b.data.period_key)}</span>
            </div>
            {b.data.top3.map((e: any) => (
              <div key={e.rank} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                <span style={{ fontSize: 16 }}>{e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : "🥉"}</span>
                <MiniAvatar url={e.avatar_url} name={e.name || e.display_name || e.username} size={24} />
                <a href={`/profil/${e.username}`} style={{ flex: 1, minWidth: 0, color: "var(--text-strong)", fontWeight: 600, fontSize: 14, textDecoration: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {e.name || e.display_name || e.username}
                </a>
                <span className="brand-mono" style={{ color: "var(--accent)", fontSize: 14 }}>{e.score}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Tarih formatları (arşiv/önceki için de kullanılır)
const _TR_AY = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
function fmtDaily(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return `${d} ${_TR_AY[m - 1]} ${y}`;
}
function fmtMonthly(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${_TR_AY[m - 1]} ${y}`;
}

function Row({ entry, isMe }: { entry: Entry; isMe: boolean }) {
  const medal = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 12,
        background: isMe ? "var(--accent-glow)" : "var(--bg-panel)",
        border: isMe ? "1px solid var(--accent)" : "1px solid transparent",
      }}
    >
      {/* Sıra: ilk 3 madalya, sonrası "23." — kendi satırında vurgulu */}
      <div
        className={medal ? undefined : "brand-mono"}
        style={{
          width: 42, flexShrink: 0, textAlign: "center", fontWeight: medal ? 700 : 800,
          fontSize: medal ? 20 : 16,
          color: medal ? "var(--text-soft)" : isMe ? "var(--accent)" : "var(--text-soft)",
        }}
      >
        {medal ?? `${entry.rank}.`}
      </div>
      <MiniAvatar url={entry.avatar_url} name={entry.name || entry.display_name || entry.username} size={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <a href={`/profil/${entry.username}`} style={{ fontWeight: 600, color: "var(--text-strong)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: "none", display: "block" }}>
          {entry.name || entry.display_name || entry.username}
          {isMe && <span style={{ color: "var(--accent)", fontSize: 13 }}> (sen)</span>}
        </a>
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>ELO {entry.elo}</div>
      </div>
      <div className="brand-mono" style={{ fontSize: 20, color: "var(--accent)", fontWeight: 700 }}>
        {entry.score}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: 200, color: "var(--text-soft)" }}>
      <div>{children}</div>
    </div>
  );
}
