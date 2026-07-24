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
    </Wrap>
  );
}

function Dashboard({ onDenied }: { onDenied: () => void }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    fetch(apiUrl("/api/admin/dashboard"), { headers: authHeaders() })
      .then((r) => { if (r.status === 403) { onDenied(); return null; } return r.json(); })
      .then(setData).catch(() => {});
  }, []);
  if (!data) return <Centered>Yükleniyor…</Centered>;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
        <Stat label="Kullanıcı" value={data.total_users} />
        <Stat label="Toplam Maç" value={data.total_matches} />
        <Stat label="Bot" value={`${data.active_bots}/${data.total_bots}`} />
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
          <input
            defaultValue={s.value}
            onBlur={(e) => e.target.value !== s.value && save(s.key, e.target.value)}
            style={{ width: 70, padding: "8px", borderRadius: 8, border: "1px solid var(--tile-border)", background: "var(--bg-elevated)", color: "var(--text-strong)", textAlign: "center" }}
          />
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
  const [words, setWords] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [newWord, setNewWord] = useState("");
  const [msg, setMsg] = useState("");

  function search() {
    fetch(apiUrl(`/api/admin/words?length=${length}&q=${encodeURIComponent(q)}`), { headers: authHeaders() })
      .then((r) => r.json()).then((d) => { setWords(d.words || []); setTotal(d.total || 0); });
  }
  useEffect(() => { search(); }, [length]);

  function add() {
    fetch(apiUrl("/api/admin/words"), { method: "POST", headers: authHeaders(), body: JSON.stringify({ word: newWord, length }) })
      .then((r) => r.json()).then((d) => { setMsg(d.ok ? "Eklendi ✓" : d.error); if (d.ok) { setNewWord(""); search(); } setTimeout(() => setMsg(""), 2000); });
  }
  function remove(w: string) {
    fetch(apiUrl("/api/admin/words/remove"), { method: "POST", headers: authHeaders(), body: JSON.stringify({ word: w, length }) })
      .then((r) => r.json()).then(() => search());
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {[4, 5, 6].map((n) => (
          <button key={n} onClick={() => setLength(n)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: length === n ? "var(--accent)" : "var(--bg-panel)", color: length === n ? "#1a1330" : "var(--text-soft)", fontWeight: 600 }}>{n} harf</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Ara (baş harfler)" style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid var(--tile-border)", background: "var(--bg-elevated)", color: "var(--text-strong)" }} />
        <button onClick={search} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--bg-elevated)", color: "var(--text-strong)", cursor: "pointer" }}>Ara</button>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={newWord} onChange={(e) => setNewWord(e.target.value.toUpperCase())} placeholder="Yeni kelime ekle" style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid var(--tile-border)", background: "var(--bg-elevated)", color: "var(--text-strong)" }} />
        <button onClick={add} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#1a1330", fontWeight: 600, cursor: "pointer" }}>Ekle</button>
      </div>
      {msg && <p style={{ fontSize: 13, color: "var(--accent)" }}>{msg}</p>}
      <p style={{ fontSize: 13, color: "var(--text-dim)" }}>{total} kelime bulundu</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 300, overflowY: "auto" }}>
        {words.map((w) => (
          <span key={w} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "var(--bg-panel)", borderRadius: 6, fontSize: 14 }}>
            {w}
            <button onClick={() => remove(w)} style={{ border: "none", background: "transparent", color: "var(--accent-hot)", cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>
          </span>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ background: "var(--bg-panel)", borderRadius: 12, padding: 16, textAlign: "center" }}>
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
