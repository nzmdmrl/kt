"use client";

import { useState, useEffect } from "react";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/Logo";

function authHeaders(): HeadersInit {
  const t = typeof window !== "undefined" ? localStorage.getItem("kt_token") : null;
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

const TABS = [
  { key: "dashboard", label: "📊 Özet" },
  { key: "settings", label: "⚙️ Ayarlar" },
  { key: "bots", label: "🤖 Botlar" },
  { key: "words", label: "📚 Kelimeler" },
  { key: "sounds", label: "🔊 Sesler" },
  { key: "titles", label: "🏅 Unvanlar" },
  { key: "badges", label: "🎖️ Rozetler" },
];

export default function AdminPage() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState("dashboard");
  const [denied, setDenied] = useState(false);

  if (loading) return <Wrap><Centered>Yükleniyor…</Centered></Wrap>;
  if (!user) return <Wrap><Centered>Bu sayfa için giriş yapmalısın. <a href="/giris" style={{ color: "var(--accent)" }}>Giriş →</a></Centered></Wrap>;
  if (denied) return <Wrap><Centered>Bu sayfaya erişim yetkin yok.</Centered></Wrap>;

  return (
    <Wrap>
      <h1 className="brand-mono" style={{ fontSize: 26, marginBottom: 16 }}>Yönetim Paneli</h1>
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "10px 14px", borderRadius: 10, border: "none", cursor: "pointer",
            fontWeight: 600, fontSize: 14, fontFamily: "var(--font-display)",
            background: tab === t.key ? "var(--accent)" : "var(--bg-panel)",
            color: tab === t.key ? "#1a1330" : "var(--text-soft)",
          }}>{t.label}</button>
        ))}
      </div>

      {tab === "dashboard" && <Dashboard onDenied={() => setDenied(true)} />}
      {tab === "settings" && <Settings />}
      {tab === "bots" && <Bots />}
      {tab === "words" && <Words />}
      {tab === "sounds" && <Sounds />}
      {tab === "titles" && <Titles />}
      {tab === "badges" && <Badges />}
    </Wrap>
  );
}

function Dashboard({ onDenied }: { onDenied: () => void }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    function load() {
      fetch(apiUrl("/api/admin/dashboard"), { headers: authHeaders() })
        .then((r) => { if (r.status === 403) { onDenied(); return null; } return r.json(); })
        .then((d) => { if (d) setData(d); }).catch(() => {});
    }
    load();
    const iv = setInterval(load, 10000); // canlı veriler için 10sn'de bir yenile
    return () => clearInterval(iv);
  }, []);
  if (!data) return <Centered>Yükleniyor…</Centered>;
  const live = data.live || {};
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Canlı istatistikler */}
      <div>
        <h3 style={{ fontSize: 15, color: "var(--text-soft)", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3aa76d", display: "inline-block" }} />
          Canlı Durum
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
          <Stat label="Online kişi" value={live.online ?? 0} accent />
          <Stat label="Anlık maç" value={live.live_matches ?? 0} accent />
          <Stat label="Bugünkü maç" value={live.matches_today ?? 0} />
          <Stat label="Bu ay maç" value={live.matches_month ?? 0} />
        </div>
      </div>

      {/* Genel toplamlar */}
      <div>
        <h3 style={{ fontSize: 15, color: "var(--text-soft)", marginBottom: 10 }}>Genel</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
          <Stat label="Kullanıcı" value={data.total_users} />
          <Stat label="Toplam Maç" value={data.total_matches} />
          <Stat label="Bot" value={`${data.active_bots}/${data.total_bots}`} />
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: 15, color: "var(--text-soft)", marginBottom: 10 }}>En İyi Oyuncular</h3>
        {data.top_players.map((p: any, i: number) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "var(--bg-panel)", borderRadius: 8, marginBottom: 6 }}>
            <span>{i + 1}. {p.username}</span>
            <span className="brand-mono" style={{ color: "var(--accent)" }}>{p.elo} ELO · {p.wins}G</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Settings() {
  const [settings, setSettings] = useState<any[]>([]);
  const [saved, setSaved] = useState("");
  useEffect(() => { load(); }, []);
  function load() {
    fetch(apiUrl("/api/admin/settings"), { headers: authHeaders() })
      .then((r) => r.json()).then((d) => setSettings(d.settings || [])).catch(() => {});
  }
  function save(key: string, value: string) {
    // UI'ı anında güncelle (switch hemen değişsin).
    setSettings((prev) => prev.map((s) => s.key === key ? { ...s, value } : s));
    fetch(apiUrl("/api/admin/settings"), { method: "POST", headers: authHeaders(), body: JSON.stringify({ key, value }) })
      .then((r) => r.json()).then(() => { setSaved(key); setTimeout(() => setSaved(""), 1500); });
  }
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Değişiklikler yeni başlayan maçlarda geçerli olur.</p>
      {settings.map((s) => (
        <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg-panel)", borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, color: "var(--text-strong)" }}>{s.label}</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{s.key} · varsayılan: {s.default}</div>
          </div>
          {s.type === "bool" ? (
            <button
              onClick={() => save(s.key, s.value === "true" ? "false" : "true")}
              style={{
                width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer",
                position: "relative", background: s.value === "true" ? "var(--accent)" : "var(--bg-elevated)",
                transition: "background .2s",
              }}
            >
              <span style={{
                position: "absolute", top: 3, left: s.value === "true" ? 27 : 3,
                width: 22, height: 22, borderRadius: "50%", background: "#fff",
                transition: "left .2s",
              }} />
            </button>
          ) : (
            <input
              defaultValue={s.value}
              onBlur={(e) => e.target.value !== s.value && save(s.key, e.target.value)}
              style={{ width: 70, padding: "8px", borderRadius: 8, border: "1px solid var(--tile-border)", background: "var(--bg-elevated)", color: "var(--text-strong)", textAlign: "center" }}
            />
          )}
          {saved === s.key && <span style={{ color: "var(--tile-correct)", fontSize: 12 }}>✓</span>}
        </div>
      ))}
    </div>
  );
}

function Bots() {
  const [bots, setBots] = useState<any[]>([]);
  const [count, setCount] = useState("10");
  useEffect(() => { load(); }, []);
  function load() {
    fetch(apiUrl("/api/admin/bots"), { headers: authHeaders() }).then((r) => r.json()).then((d) => setBots(d.bots || []));
  }
  function generate() {
    fetch(apiUrl("/api/admin/bots/generate"), { method: "POST", headers: authHeaders(), body: JSON.stringify({ count: parseInt(count), lang: "tr" }) })
      .then((r) => r.json()).then(() => load());
  }
  function toggle(id: number) {
    fetch(apiUrl(`/api/admin/bots/${id}/toggle`), { method: "POST", headers: authHeaders() }).then(() => load());
  }
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input value={count} onChange={(e) => setCount(e.target.value)} style={{ width: 60, padding: 8, borderRadius: 8, border: "1px solid var(--tile-border)", background: "var(--bg-elevated)", color: "var(--text-strong)", textAlign: "center" }} />
        <button onClick={generate} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#1a1330", fontWeight: 600, cursor: "pointer" }}>Bot Üret</button>
      </div>
      <div style={{ display: "grid", gap: 6, maxHeight: 400, overflowY: "auto" }}>
        {bots.map((b) => (
          <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--bg-panel)", borderRadius: 8, opacity: b.active ? 1 : 0.5 }}>
            <span>{b.name} <span style={{ color: "var(--text-dim)", fontSize: 12 }}>· {b.elo} ELO</span></span>
            <button onClick={() => toggle(b.id)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border-soft)", background: "transparent", color: b.active ? "var(--tile-correct)" : "var(--text-dim)", cursor: "pointer", fontSize: 12 }}>
              {b.active ? "Aktif" : "Pasif"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Words() {
  const [length, setLength] = useState(5);
  const [q, setQ] = useState("");
  const [words, setWords] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [counts, setCounts] = useState<any>({});
  const [filter, setFilter] = useState("all");
  const [newWord, setNewWord] = useState("");
  const [newMember, setNewMember] = useState(true);
  const [newBot, setNewBot] = useState(true);
  const [msg, setMsg] = useState("");
  const PER_PAGE = 60;

  function search(toPage = page) {
    fetch(apiUrl(`/api/admin/words?length=${length}&q=${encodeURIComponent(q)}&page=${toPage}&per_page=${PER_PAGE}&filter=${filter}`), { headers: authHeaders() })
      .then((r) => r.json()).then((d) => {
        setWords(d.words || []); setTotal(d.total || 0);
        setPages(d.pages || 1); setPage(d.page || 1); setCounts(d.counts || {});
      });
  }
  useEffect(() => { search(1); }, [length, filter]);

  function add() {
    fetch(apiUrl("/api/admin/words"), { method: "POST", headers: authHeaders(), body: JSON.stringify({ word: newWord, length, member: newMember, bot: newBot }) })
      .then((r) => r.json()).then((d) => { setMsg(d.ok ? "Eklendi ✓" : d.error); if (d.ok) { setNewWord(""); search(); } setTimeout(() => setMsg(""), 2000); });
  }
  function remove(w: string) {
    fetch(apiUrl("/api/admin/words/remove"), { method: "POST", headers: authHeaders(), body: JSON.stringify({ word: w, length }) })
      .then((r) => r.json()).then(() => search());
  }
  function toggleFlag(w: string, field: "member" | "bot", value: boolean) {
    // Anlık UI güncelle
    setWords((ws) => ws.map((it) => it.word === w ? { ...it, [field]: value } : it));
    fetch(apiUrl("/api/admin/words/flags"), { method: "POST", headers: authHeaders(), body: JSON.stringify({ word: w, length, [field]: value }) })
      .then((r) => r.json()).then((d) => { if (!d.ok) search(); });
  }

  const filters = [
    { key: "all", label: "Tümü" },
    { key: "member", label: "👤 Üye" },
    { key: "bot", label: "🤖 Bot" },
    { key: "member_only", label: "Yalnız üye" },
    { key: "bot_only", label: "Yalnız bot" },
  ];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Uzunluk seçimi */}
      <div style={{ display: "flex", gap: 6 }}>
        {[4, 5, 6].map((n) => (
          <button key={n} onClick={() => setLength(n)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: length === n ? "var(--accent)" : "var(--bg-panel)", color: length === n ? "#1a1330" : "var(--text-soft)", fontWeight: 600 }}>{n} harf</button>
        ))}
      </div>

      {/* Sayaç özeti */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13, color: "var(--text-soft)" }}>
        <span>Toplam: <strong style={{ color: "var(--text-strong)" }}>{counts.total ?? 0}</strong></span>
        <span>👤 Üye: <strong style={{ color: "var(--accent)" }}>{counts.member ?? 0}</strong></span>
        <span>🤖 Bot: <strong style={{ color: "var(--accent)" }}>{counts.bot ?? 0}</strong></span>
        <span>Yalnız üye: <strong>{counts.member_only ?? 0}</strong></span>
        <span>Yalnız bot: <strong>{counts.bot_only ?? 0}</strong></span>
      </div>

      {/* Filtre */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {filters.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, background: filter === f.key ? "var(--accent)" : "var(--bg-panel)", color: filter === f.key ? "#1a1330" : "var(--text-soft)", fontWeight: 600 }}>{f.label}</button>
        ))}
      </div>

      {/* Arama */}
      <div style={{ display: "flex", gap: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && search(1)} placeholder="Ara (baş harfler)" style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid var(--tile-border)", background: "var(--bg-elevated)", color: "var(--text-strong)" }} />
        <button onClick={() => search(1)} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--bg-elevated)", color: "var(--text-strong)", cursor: "pointer" }}>Ara</button>
      </div>

      {/* Yeni kelime ekle */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input value={newWord} onChange={(e) => setNewWord(e.target.value.toUpperCase())} placeholder="Yeni kelime" style={{ flex: "1 1 140px", padding: 10, borderRadius: 8, border: "1px solid var(--tile-border)", background: "var(--bg-elevated)", color: "var(--text-strong)" }} />
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4, color: "var(--text-soft)" }}>
          <input type="checkbox" checked={newMember} onChange={(e) => setNewMember(e.target.checked)} /> 👤 Üye
        </label>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4, color: "var(--text-soft)" }}>
          <input type="checkbox" checked={newBot} onChange={(e) => setNewBot(e.target.checked)} /> 🤖 Bot
        </label>
        <button onClick={add} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#1a1330", fontWeight: 600, cursor: "pointer" }}>Ekle</button>
      </div>
      {msg && <p style={{ fontSize: 13, color: "var(--accent)" }}>{msg}</p>}

      <p style={{ fontSize: 13, color: "var(--text-dim)" }}>{total} kelime · sayfa {page}/{pages}</p>

      {/* Kelime listesi — her satırda member/bot toggle */}
      <div style={{ display: "grid", gap: 4, maxHeight: 360, overflowY: "auto" }}>
        {words.map((it) => (
          <div key={it.word} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", background: "var(--bg-panel)", borderRadius: 6, fontSize: 14 }}>
            <span style={{ flex: 1, fontFamily: "var(--font-display)", fontWeight: 600 }}>{it.word}</span>
            <button onClick={() => toggleFlag(it.word, "member", !it.member)} title="Üye havuzu" style={{ padding: "2px 8px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, background: it.member ? "var(--accent)" : "var(--bg-elevated)", color: it.member ? "#1a1330" : "var(--text-dim)", fontWeight: 600 }}>👤</button>
            <button onClick={() => toggleFlag(it.word, "bot", !it.bot)} title="Bot havuzu" style={{ padding: "2px 8px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, background: it.bot ? "var(--accent)" : "var(--bg-elevated)", color: it.bot ? "#1a1330" : "var(--text-dim)", fontWeight: 600 }}>🤖</button>
            <button onClick={() => remove(it.word)} style={{ border: "none", background: "transparent", color: "var(--accent-hot)", cursor: "pointer", fontSize: 16, padding: "0 4px" }}>×</button>
          </div>
        ))}
      </div>

      {/* Sayfalama */}
      {pages > 1 && (
        <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => search(1)} disabled={page <= 1} style={pgBtn(page <= 1)}>«</button>
          <button onClick={() => search(page - 1)} disabled={page <= 1} style={pgBtn(page <= 1)}>‹</button>
          <span style={{ fontSize: 13, color: "var(--text-soft)", padding: "0 8px" }}>{page} / {pages}</span>
          <button onClick={() => search(page + 1)} disabled={page >= pages} style={pgBtn(page >= pages)}>›</button>
          <button onClick={() => search(pages)} disabled={page >= pages} style={pgBtn(page >= pages)}>»</button>
        </div>
      )}
    </div>
  );
}

function pgBtn(disabled: boolean): React.CSSProperties {
  return { padding: "6px 12px", borderRadius: 8, border: "none", cursor: disabled ? "default" : "pointer", background: "var(--bg-panel)", color: disabled ? "var(--text-dim)" : "var(--text-strong)", opacity: disabled ? 0.5 : 1, fontWeight: 600 };
}

function Sounds() {
  const [slots, setSlots] = useState<any[]>([]);
  const [msg, setMsg] = useState("");

  function load() {
    fetch(apiUrl("/api/sounds")).then((r) => r.json()).then((d) => setSlots(d.slots || []));
  }
  useEffect(() => { load(); }, []);

  function upload(slot: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const t = localStorage.getItem("kt_token");
    fetch(apiUrl(`/api/sounds/${slot}`), {
      method: "POST",
      headers: t ? { Authorization: `Bearer ${t}` } : {},
      body: fd,
    }).then((r) => r.json()).then((d) => {
      setMsg(d.ok ? "Yüklendi ✓" : (d.detail || "Hata"));
      setTimeout(() => setMsg(""), 2000);
      load();
    });
  }
  function remove(slot: string) {
    fetch(apiUrl(`/api/sounds/${slot}`), { method: "DELETE", headers: authHeaders() })
      .then(() => load());
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ color: "var(--text-dim)", fontSize: 13 }}>
        Yüklemezsen oyun otomatik (sentetik) ses çalar. Kendi mp3&apos;ünü yükleyerek değiştirebilirsin. (En fazla 3 MB)
      </p>
      {slots.map((s) => (
        <div key={s.slot} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg-panel)", borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, color: "var(--text-strong)" }}>{s.label}</div>
            <div style={{ fontSize: 11, color: s.uploaded ? "var(--tile-correct)" : "var(--text-dim)" }}>
              {s.uploaded ? "Kendi sesin yüklü" : "Sentetik (otomatik)"}
            </div>
          </div>
          <label style={{ padding: "6px 12px", borderRadius: 8, background: "var(--bg-elevated)", color: "var(--text-strong)", cursor: "pointer", fontSize: 13, border: "1px solid var(--border-soft)" }}>
            Yükle
            <input type="file" accept="audio/*" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && upload(s.slot, e.target.files[0])} />
          </label>
          {s.uploaded && (
            <button onClick={() => remove(s.slot)} style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: "transparent", color: "var(--accent-hot)", cursor: "pointer", fontSize: 13 }}>Sil</button>
          )}
        </div>
      ))}
      {msg && <p style={{ fontSize: 13, color: "var(--accent)" }}>{msg}</p>}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <div style={{ background: "var(--bg-panel)", borderRadius: 12, padding: 16, textAlign: "center", border: accent ? "1px solid var(--accent)" : "none" }}>
      <div className="brand-mono" style={{ fontSize: 26, color: "var(--accent)" }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{label}</div>
    </div>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ flex: 1, maxWidth: 720, width: "100%", margin: "0 auto", padding: "24px 18px 60px" }}>
      <div style={{ marginBottom: 20 }}><a href="/"><Logo size={36} /></a></div>
      {children}
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", placeItems: "center", minHeight: 200, color: "var(--text-soft)" }}>{children}</div>;
}

// Unvanlar sekmesi — 10 unvan (isim, ikon, XP eşiği) + XP kazanç ayarları.
function Titles() {
  type T = { id: number; name: string; icon: string; xp_required: number };
  const [titles, setTitles] = useState<T[]>([]);
  const [events, setEvents] = useState<{ event: string; key: string; xp: number }[]>([]);
  const [saved, setSaved] = useState<number | null>(null);

  function load() {
    fetch(apiUrl("/api/admin/titles"), { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => { setTitles(d.titles || []); setEvents(d.xp_events || []); })
      .catch(() => {});
  }
  useEffect(() => { load(); }, []);

  const eventLabel: Record<string, string> = {
    match_win: "1v1 Galibiyet", match_loss: "1v1 Mağlubiyet", match_draw: "1v1 Beraberlik",
    arena_played: "Arena Katılım", arena_win: "Arena Birincilik",
    solo_level: "Solo Level Geçme", daily_solved: "Günün Kelimesi",
  };

  async function saveEvent(key: string, value: string) {
    await fetch(apiUrl("/api/admin/settings"), { method: "POST", headers: authHeaders(), body: JSON.stringify({ key, value }) }).catch(() => {});
  }

  function updateLocal(id: number, patch: Partial<T>) {
    setTitles((ts) => ts.map((t) => t.id === id ? { ...t, ...patch } : t));
  }

  async function saveTitle(t: T) {
    await fetch(apiUrl(`/api/admin/titles/${t.id}`), {
      method: "PUT", headers: authHeaders(),
      body: JSON.stringify({ name: t.name, icon: t.icon, xp_required: Number(t.xp_required) || 0 }),
    }).catch(() => {});
    setSaved(t.id); setTimeout(() => setSaved(null), 1500);
    load();
  }

  async function deleteTitle(id: number) {
    await fetch(apiUrl(`/api/admin/titles/${id}`), { method: "DELETE", headers: authHeaders() }).catch(() => {});
    load();
  }

  async function addTitle() {
    await fetch(apiUrl("/api/admin/titles"), {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ name: "Yeni Unvan", icon: "🌟", xp_required: 0 }),
    }).catch(() => {});
    load();
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>🏅 Unvanlar</h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 12 }}>
          İsim, ikon ve XP eşiğini düzenleyip kaydet. Kullanıcılar XP kazandıkça sıradaki unvana geçer.
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          {titles.map((t, i) => (
            <div key={t.id} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
              background: "var(--bg-panel)", borderRadius: 10, flexWrap: "wrap",
            }}>
              <span style={{ color: "var(--text-dim)", fontSize: 12, width: 20, textAlign: "center" }}>{i + 1}</span>
              <input value={t.icon} onChange={(e) => updateLocal(t.id, { icon: e.target.value })}
                style={{ width: 44, padding: "6px", borderRadius: 8, textAlign: "center", fontSize: 18, border: "1px solid var(--border-soft)", background: "var(--bg-elevated)" }} />
              <input value={t.name} onChange={(e) => updateLocal(t.id, { name: e.target.value })}
                style={{ flex: "1 1 120px", minWidth: 100, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-elevated)", color: "var(--text-strong)", fontWeight: 600 }} />
              <input type="number" value={t.xp_required} onChange={(e) => updateLocal(t.id, { xp_required: Number(e.target.value) })}
                style={{ width: 90, padding: "6px 8px", borderRadius: 8, textAlign: "center", border: "1px solid var(--border-soft)", background: "var(--bg-elevated)", color: "var(--accent)", fontFamily: "var(--font-display)" }} />
              <span style={{ color: "var(--text-dim)", fontSize: 12 }}>XP</span>
              <button onClick={() => saveTitle(t)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: saved === t.id ? "var(--tile-correct)" : "var(--accent)", color: saved === t.id ? "#fff" : "#1a1330", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                {saved === t.id ? "✓" : "Kaydet"}
              </button>
              <button onClick={() => deleteTitle(t.id)} title="Sil" style={{ padding: "6px 8px", borderRadius: 8, border: "none", background: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 15 }}>🗑️</button>
            </div>
          ))}
        </div>
        <button onClick={addTitle} style={{ marginTop: 10, padding: "9px 16px", borderRadius: 9, border: "1px dashed var(--border-soft)", background: "transparent", color: "var(--accent)", fontWeight: 600, cursor: "pointer" }}>
          + Yeni Unvan Ekle
        </button>
      </div>

      <div>
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>💎 XP kazanç ayarları</h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 12 }}>
          Her oyun türünün kazandırdığı XP. Değiştirip kaydedebilirsin.
        </p>
        <div style={{ display: "grid", gap: 6 }}>
          {events.map((e) => (
            <div key={e.key} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
              background: "var(--bg-panel)", borderRadius: 10,
            }}>
              <span style={{ flex: 1, color: "var(--text-strong)" }}>{eventLabel[e.event] || e.event}</span>
              <input
                type="number" defaultValue={e.xp}
                onBlur={(ev) => saveEvent(e.key, ev.target.value)}
                style={{
                  width: 80, padding: "6px 10px", borderRadius: 8, textAlign: "center",
                  border: "1px solid var(--border-soft)", background: "var(--bg-elevated)",
                  color: "var(--text-strong)", fontFamily: "var(--font-display)",
                }}
              />
              <span style={{ color: "var(--text-dim)", fontSize: 13 }}>XP</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const STAT_LABELS: Record<string, string> = {
  matches_played: "1v1 maç sayısı", wins: "1v1 galibiyet", losses: "1v1 mağlubiyet",
  draws: "1v1 beraberlik", words_solved: "Çözülen kelime", total_score: "Toplam puan",
  elo: "ELO", custom_arena_played: "Özel arena tamamlama",
  arena_played: "Arena katılımı", arena_first: "Arena şampiyonluğu (1.)",
  arena_second: "Arena 2.lik", arena_third: "Arena 3.lük",
  trophies: "Toplam kupa", medals: "Toplam madalya",
};

function Badges() {
  type B = { id: number; code: string; name: string; description: string; icon: string; tier: string; stat_key: string; threshold: number };
  const [badges, setBadges] = useState<B[]>([]);
  const [statKeys, setStatKeys] = useState<string[]>([]);
  const [saved, setSaved] = useState<number | null>(null);

  function load() {
    fetch(apiUrl("/api/admin/badges"), { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => { setBadges(d.badges || []); setStatKeys(d.stat_keys || []); })
      .catch(() => {});
  }
  useEffect(() => { load(); }, []);

  function upd(id: number, patch: Partial<B>) {
    setBadges((bs) => bs.map((b) => b.id === id ? { ...b, ...patch } : b));
  }

  async function save(b: B) {
    await fetch(apiUrl(`/api/admin/badges/${b.id}`), {
      method: "PUT", headers: authHeaders(),
      body: JSON.stringify({ name: b.name, description: b.description, icon: b.icon, tier: b.tier, stat_key: b.stat_key, threshold: Number(b.threshold) || 1 }),
    }).catch(() => {});
    setSaved(b.id); setTimeout(() => setSaved(null), 1500);
    load();
  }

  async function del(id: number) {
    await fetch(apiUrl(`/api/admin/badges/${id}`), { method: "DELETE", headers: authHeaders() }).catch(() => {});
    load();
  }

  async function add() {
    await fetch(apiUrl("/api/admin/badges"), {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ name: "Yeni Rozet", icon: "🎖️", tier: "bronze", stat_key: "arena_played", threshold: 1 }),
    }).catch(() => {});
    load();
  }

  return (
    <div>
      <h3 style={{ fontSize: 16, marginBottom: 4 }}>🎖️ Rozetler</h3>
      <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 12 }}>
        Her rozet bir istatistik eşiğinde kazanılır. İkon, isim, tür, koşul ve eşiği düzenle.
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        {badges.map((b) => (
          <div key={b.id} style={{ padding: "10px 12px", background: "var(--bg-panel)", borderRadius: 10, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <input value={b.icon} onChange={(e) => upd(b.id, { icon: e.target.value })}
                style={{ width: 44, padding: "6px", borderRadius: 8, textAlign: "center", fontSize: 18, border: "1px solid var(--border-soft)", background: "var(--bg-elevated)" }} />
              <input value={b.name} onChange={(e) => upd(b.id, { name: e.target.value })}
                style={{ flex: "1 1 120px", minWidth: 100, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-elevated)", color: "var(--text-strong)", fontWeight: 600 }} />
              <select value={b.tier} onChange={(e) => upd(b.id, { tier: e.target.value })}
                style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-elevated)", color: "var(--text-soft)" }}>
                <option value="bronze">Bronz</option>
                <option value="silver">Gümüş</option>
                <option value="gold">Altın</option>
              </select>
            </div>
            <input value={b.description} onChange={(e) => upd(b.id, { description: e.target.value })}
              placeholder="Açıklama (nasıl kazanılır)"
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-elevated)", color: "var(--text-soft)", fontSize: 13 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <select value={b.stat_key} onChange={(e) => upd(b.id, { stat_key: e.target.value })}
                style={{ flex: "1 1 160px", padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-elevated)", color: "var(--text-strong)" }}>
                {statKeys.map((k) => <option key={k} value={k}>{STAT_LABELS[k] || k}</option>)}
              </select>
              <span style={{ color: "var(--text-dim)", fontSize: 13 }}>≥</span>
              <input type="number" value={b.threshold} onChange={(e) => upd(b.id, { threshold: Number(e.target.value) })}
                style={{ width: 80, padding: "6px 8px", borderRadius: 8, textAlign: "center", border: "1px solid var(--border-soft)", background: "var(--bg-elevated)", color: "var(--accent)", fontFamily: "var(--font-display)" }} />
              <button onClick={() => save(b)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: saved === b.id ? "var(--tile-correct)" : "var(--accent)", color: saved === b.id ? "#fff" : "#1a1330", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                {saved === b.id ? "✓" : "Kaydet"}
              </button>
              <button onClick={() => del(b.id)} title="Sil" style={{ padding: "6px 8px", borderRadius: 8, border: "none", background: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 15 }}>🗑️</button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={add} style={{ marginTop: 10, padding: "9px 16px", borderRadius: 9, border: "1px dashed var(--border-soft)", background: "transparent", color: "var(--accent)", fontWeight: 600, cursor: "pointer" }}>
        + Yeni Rozet Ekle
      </button>
    </div>
  );
}
