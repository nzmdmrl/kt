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
  { key: "music", label: "🎵 Müzik" },
  { key: "seo", label: "🔍 SEO" },
  { key: "mobile", label: "📱 Mobil & Reklam" },
  { key: "notiftypes", label: "🔔 Bildirim Türleri" },
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
      {tab === "music" && <MusicPools />}
      {tab === "seo" && <Seo />}
      {tab === "mobile" && <Mobile />}
      {tab === "notiftypes" && <NotificationTypes />}
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
          <Stat label="Bugünkü arena" value={live.arena_today ?? 0} />
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
          {s.key === "game_mode" ? (
            <select
              value={s.value}
              onChange={(e) => save(s.key, e.target.value)}
              style={{ padding: "8px", borderRadius: 8, border: "1px solid var(--tile-border)", background: "var(--bg-elevated)", color: "var(--text-strong)" }}
            >
              <option value="1">1 · Klasik (1v1: 3 tur · Arena: 6 kelime)</option>
              <option value="2">2 · Hızlı (1v1: tek tur 5/6 harf · Arena: 5 kelime)</option>
            </select>
          ) : s.key === "night_bg_theme" ? (
            <select
              defaultValue={s.value}
              onChange={(e) => save(s.key, e.target.value)}
              style={{ padding: "8px", borderRadius: 8, border: "1px solid var(--tile-border)", background: "var(--bg-elevated)", color: "var(--text-strong)" }}
            >
              <option value="night">🌙 Gece</option>
              <option value="aurora">🌌 Kutup Işıkları</option>
              <option value="nebula">🪐 Nebula</option>
              <option value="snow">❄️ Kar</option>
            </select>
          ) : s.type === "bool" ? (
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

// SEO sekmesi — her sayfanın Google başlığı/açıklaması ve paylaşım (og) görseli.
// Boş bırakılan alanlarda koddaki varsayılan metin kullanılır.
type SeoRow = {
  key: string; label: string; path: string; image_only: boolean; indexable: boolean;
  default_title: string; default_description: string; default_keywords: string;
  title: string; description: string; keywords: string;
  has_image: boolean; image_name: string; image_path: string | null;
};

function Seo() {
  const [rows, setRows] = useState<SeoRow[]>([]);
  const [msg, setMsg] = useState("");

  function load() {
    fetch(apiUrl("/api/seo/admin"), { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setRows(d.pages || []))
      .catch(() => {});
  }
  useEffect(() => { load(); }, []);

  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(""), 2500); }

  function patch(key: string, field: keyof SeoRow, value: string) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  function save(row: SeoRow) {
    fetch(apiUrl(`/api/seo/admin/${row.key}`), {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ title: row.title, description: row.description, keywords: row.keywords }),
    })
      .then((r) => r.json())
      .then((d) => flash(d.ok ? "Kaydedildi ✓ (yayına yansıması 5 dk sürebilir)" : d.detail || "Hata"));
  }

  function upload(key: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const t = localStorage.getItem("kt_token");
    fetch(apiUrl(`/api/seo/admin/${key}/image`), {
      method: "POST",
      headers: t ? { Authorization: `Bearer ${t}` } : {},
      body: fd,
    })
      .then((r) => r.json())
      .then((d) => { flash(d.ok ? "Görsel yüklendi ✓" : d.detail || "Hata"); load(); });
  }

  function removeImage(key: string) {
    fetch(apiUrl(`/api/seo/admin/${key}/image`), { method: "DELETE", headers: authHeaders() })
      .then(() => { flash("Görsel silindi"); load(); });
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ background: "var(--bg-panel)", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "var(--text-soft)", lineHeight: 1.6 }}>
        Burada her sayfanın <b>Google başlığı</b>, <b>açıklaması</b> ve <b>paylaşım görseli</b> (WhatsApp/X/Facebook
        önizlemesi) ayarlanır. Alanı boş bırakırsan hazır varsayılan metin kullanılır (gri yazı).<br />
        • Başlık: 50–60 karakter önerilir; site adı (&quot;| Kelime Tahmin&quot;) sonuna otomatik eklenir.<br />
        • Açıklama: 120–160 karakter.<br />
        • Görsel: <b>1200×630 px</b> JPG/PNG (en fazla 5 MB). Görsel yüklemediğin sayfalar
        &quot;★ Genel&quot; görselini kullanır.
      </div>
      {msg && <p style={{ fontSize: 13, color: "var(--accent)", margin: 0 }}>{msg}</p>}

      {rows.map((r) => (
        <div key={r.key} style={{ background: "var(--bg-panel)", borderRadius: 12, padding: 14, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-strong)" }}>{r.label}</div>
            {r.path && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{r.path}</span>}
            {!r.indexable && !r.image_only && (
              <span style={{ fontSize: 11, color: "var(--text-dim)", border: "1px solid var(--border-soft)", borderRadius: 6, padding: "1px 6px" }}>
                aramaya kapalı
              </span>
            )}
          </div>

          {!r.image_only && (
            <>
              <input
                value={r.title}
                onChange={(e) => patch(r.key, "title", e.target.value)}
                placeholder={r.default_title}
                style={seoInput}
              />
              <textarea
                value={r.description}
                onChange={(e) => patch(r.key, "description", e.target.value)}
                placeholder={r.default_description}
                rows={3}
                style={{ ...seoInput, resize: "vertical" }}
              />
              <input
                value={r.keywords}
                onChange={(e) => patch(r.key, "keywords", e.target.value)}
                placeholder={r.default_keywords || "anahtar kelimeler (virgülle)"}
                style={{ ...seoInput, fontSize: 12 }}
              />
            </>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {r.has_image && r.image_path && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={apiUrl(r.image_path)}
                alt=""
                style={{ width: 96, height: 50, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border-soft)" }}
              />
            )}
            <div style={{ flex: 1, fontSize: 12, color: r.has_image ? "var(--tile-correct)" : "var(--text-dim)" }}>
              {r.has_image ? (r.image_name || "Görsel yüklü") : (r.image_only ? "Yüklenmedi" : "Görsel yok — ★ Genel görseli kullanılır")}
            </div>
            <label style={{ padding: "6px 12px", borderRadius: 8, background: "var(--bg-elevated)", color: "var(--text-strong)", cursor: "pointer", fontSize: 13, border: "1px solid var(--border-soft)" }}>
              {r.image_only ? "Favicon yükle" : "Görsel yükle"}
              <input
                type="file"
                accept={r.image_only ? ".ico,.png,.svg,image/*" : "image/*"}
                style={{ display: "none" }}
                onChange={(e) => e.target.files?.[0] && upload(r.key, e.target.files[0])}
              />
            </label>
            {r.has_image && (
              <button onClick={() => removeImage(r.key)} style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: "transparent", color: "var(--accent-hot)", cursor: "pointer", fontSize: 13 }}>Sil</button>
            )}
            {!r.image_only && (
              <button onClick={() => save(r)} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#1a1330", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Kaydet</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const seoInput: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-soft)",
  background: "var(--bg-elevated)", color: "var(--text-strong)", fontSize: 13, fontFamily: "inherit",
};

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

const MUSIC_SECTIONS = [
  { key: "home", label: "🏠 Ana sayfa müziği" },
  { key: "arena_wait", label: "⚔️ Arena rakip aranırken" },
  { key: "match_wait", label: "🎯 1v1 rakip aranırken" },
  { key: "solo", label: "🧩 Solo mod müziği" },
  { key: "daily", label: "📅 Günün kelimesi müziği" },
];

function MusicPools() {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
        Her bölüm için birden fazla mp3 ekleyebilirsin; oyun sırasında rastgele çalar ve
        geçişlerde sesi kısarak diğerine geçer. Dosyaları sürükle-bırak ile ekle.
      </p>
      {MUSIC_SECTIONS.map((s) => <MusicSection key={s.key} sectionKey={s.key} label={s.label} />)}
    </div>
  );
}

function MusicSection({ sectionKey, label }: { sectionKey: string; label: string }) {
  const [tracks, setTracks] = useState<{ id: number; name: string }[]>([]);
  const [volume, setVolume] = useState(50);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);

  function rawToken() { return typeof window !== "undefined" ? localStorage.getItem("kt_token") : null; }

  function load() {
    fetch(apiUrl(`/api/music/${sectionKey}`))
      .then((r) => r.json())
      .then((d) => { setTracks(d.tracks || []); setVolume(d.volume ?? 50); })
      .catch(() => {});
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function uploadFiles(files: FileList | File[]) {
    setBusy(true);
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("audio")) continue;
      const fd = new FormData();
      fd.append("file", f);
      try {
        await fetch(apiUrl(`/api/music/${sectionKey}`), {
          method: "POST",
          headers: { Authorization: `Bearer ${rawToken()}` },
          body: fd,
        });
      } catch {}
    }
    setBusy(false);
    load();
  }

  async function del(id: number) {
    await fetch(apiUrl(`/api/music/${id}`), { method: "DELETE", headers: { Authorization: `Bearer ${rawToken()}` } }).catch(() => {});
    load();
  }

  async function saveVolume(v: number) {
    setVolume(v);
    await fetch(apiUrl(`/api/music/volume/${sectionKey}?value=${v}`), {
      method: "POST", headers: { Authorization: `Bearer ${rawToken()}` },
    }).catch(() => {});
  }

  return (
    <div style={{ background: "var(--bg-panel)", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontWeight: 700, color: "var(--text-strong)", marginBottom: 10 }}>{label}</div>

      {/* Parça listesi */}
      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        {tracks.length === 0 && <div style={{ color: "var(--text-dim)", fontSize: 13 }}>Henüz parça yok.</div>}
        {tracks.map((t) => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--bg-elevated)", borderRadius: 8 }}>
            <span style={{ fontSize: 16 }}>🎵</span>
            <span style={{ flex: 1, fontSize: 13, color: "var(--text-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
            <audio src={apiUrl(`/api/music/file/${t.id}`)} controls style={{ height: 30, maxWidth: 160 }} />
            <button onClick={() => del(t.id)} title="Sil" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-dim)" }}>🗑️</button>
          </div>
        ))}
      </div>

      {/* Sürükle-bırak yükleme */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files); }}
        style={{
          border: `2px dashed ${drag ? "var(--accent)" : "var(--border-soft)"}`,
          borderRadius: 10, padding: "16px", textAlign: "center", cursor: "pointer",
          background: drag ? "rgba(224,148,10,.08)" : "transparent", marginBottom: 12,
        }}
        onClick={() => document.getElementById(`file-${sectionKey}`)?.click()}
      >
        <input id={`file-${sectionKey}`} type="file" accept="audio/*" multiple style={{ display: "none" }}
          onChange={(e) => e.target.files && uploadFiles(e.target.files)} />
        <div style={{ color: "var(--text-soft)", fontSize: 13 }}>
          {busy ? "Yükleniyor…" : "🎵 mp3 sürükle-bırak veya tıkla (birden fazla seçebilirsin)"}
        </div>
      </div>

      {/* Ses seviyesi */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13, color: "var(--text-dim)" }}>🔉 Ses</span>
        <input type="range" min={0} max={100} value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          onMouseUp={(e) => saveVolume(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => saveVolume(Number((e.target as HTMLInputElement).value))}
          style={{ flex: 1, accentColor: "var(--accent)" }} />
        <span className="brand-mono" style={{ width: 36, textAlign: "right", color: "var(--accent)" }}>{volume}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Mobil & Reklam

type AppSettingRow = { key: string; label: string; value: any; is_public: boolean; updated_at: string | null };

type MobileField = { path: string; label: string; type?: "text" | "bool" | "list"; hint?: string };

const MOBILE_FIELDS: Record<string, MobileField[]> = {
  "ads.adsense": [
    { path: "enabled", label: "AdSense reklamları açık", type: "bool" },
    { path: "client", label: "Yayıncı kimliği", hint: "ca-pub-0000000000000000" },
    { path: "slots.header", label: "Slot — üst (header)" },
    { path: "slots.in_content", label: "Slot — içerik arası" },
    { path: "slots.footer", label: "Slot — alt (footer)" },
  ],
  "ads.admob": [
    { path: "enabled", label: "AdMob reklamları açık", type: "bool" },
    { path: "test_mode", label: "Test modu (gerçek reklam gösterilmez)", type: "bool" },
    { path: "android.app_id", label: "Android — uygulama kimliği" },
    { path: "android.banner", label: "Android — banner birimi" },
    { path: "android.interstitial", label: "Android — geçiş (interstitial) birimi" },
    { path: "ios.app_id", label: "iOS — uygulama kimliği" },
    { path: "ios.banner", label: "iOS — banner birimi" },
    { path: "ios.interstitial", label: "iOS — geçiş (interstitial) birimi" },
  ],
  "push.firebase": [
    { path: "web.apiKey", label: "Web — apiKey" },
    { path: "web.projectId", label: "Web — projectId" },
    { path: "web.appId", label: "Web — appId" },
    { path: "web.messagingSenderId", label: "Web — messagingSenderId" },
    { path: "vapid_key", label: "VAPID anahtarı" },
  ],
  "app.stores": [
    { path: "badges_enabled", label: "Mağaza rozetleri gösterilsin", type: "bool" },
    { path: "play_url", label: "Google Play adresi", hint: "https://play.google.com/store/apps/details?id=…" },
    { path: "ios_url", label: "App Store adresi", hint: "https://apps.apple.com/tr/app/…" },
    { path: "show_on_paths", label: "Hangi sayfalarda görünsün", type: "list", hint: "virgülle ayır: /, /lig" },
  ],
};

function mobileGet(obj: any, path: string): any {
  return path.split(".").reduce((o: any, k) => (o === null || o === undefined ? undefined : o[k]), obj);
}

function mobileSet(obj: any, path: string, value: any): any {
  const parts = path.split(".");
  const head = parts[0];
  const base = obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  return { ...base, [head]: parts.length > 1 ? mobileSet(base[head], parts.slice(1).join("."), value) : value };
}

function Mobile() {
  const [rows, setRows] = useState<AppSettingRow[]>([]);
  const [listText, setListText] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  function load() {
    fetch(apiUrl("/api/admin/app-settings"), { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => {
        const list: AppSettingRow[] = d.settings || [];
        setRows(list);
        const texts: Record<string, string> = {};
        for (const r of list) {
          for (const f of MOBILE_FIELDS[r.key] || []) {
            if (f.type !== "list") continue;
            const v = mobileGet(r.value, f.path);
            texts[`${r.key}:${f.path}`] = Array.isArray(v) ? v.join(", ") : "";
          }
        }
        setListText(texts);
      })
      .catch(() => setMsg("Ayarlar yüklenemedi."));
  }
  useEffect(() => { load(); }, []);

  function patch(key: string, path: string, value: any) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, value: mobileSet(r.value, path, value) } : r)));
  }

  async function save(row: AppSettingRow) {
    let value = row.value && typeof row.value === "object" ? { ...row.value } : {};
    for (const f of MOBILE_FIELDS[row.key] || []) {
      if (f.type !== "list") continue;
      const raw = listText[`${row.key}:${f.path}`] ?? "";
      value = mobileSet(value, f.path, raw.split(",").map((s) => s.trim()).filter(Boolean));
    }
    const res = await fetch(apiUrl(`/api/admin/app-settings/${row.key}`), {
      method: "PUT", headers: authHeaders(), body: JSON.stringify({ value }),
    }).catch(() => null);
    if (!res || !res.ok) { setMsg("Kaydedilemedi."); return; }
    setMsg("");
    setSaved(row.key); setTimeout(() => setSaved(null), 1500);
    load();
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ background: "var(--bg-panel)", borderRadius: 12, padding: 14, fontSize: 13, color: "var(--text-dim)", lineHeight: 1.7 }}>
        Mobil uygulama ve reklam yapılandırması burada tutulur. Kaydettiğin değerler
        <b> /api/app-config</b> ucundan (web / android / ios) okunur; değişiklik en geç
        60 saniye içinde yayılır.<br />
        • Alanları boş bırakırsan o özellik kapalı kalır — yanlışlıkla reklam çıkmaz.<br />
        • AdMob&apos;da <b>Test modu</b> açıkken gerçek reklam gösterilmez.
      </div>
      {msg && <p style={{ fontSize: 13, color: "var(--accent-hot)", margin: 0 }}>{msg}</p>}

      {rows.map((row) => (
        <div key={row.key} style={{ background: "var(--bg-panel)", borderRadius: 12, padding: 14, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-strong)" }}>{row.label}</div>
            <span className="brand-mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>{row.key}</span>
            {!row.is_public && (
              <span style={{ fontSize: 11, color: "var(--text-dim)", border: "1px solid var(--border-soft)", borderRadius: 6, padding: "1px 6px" }}>
                gizli
              </span>
            )}
          </div>

          {(MOBILE_FIELDS[row.key] || []).map((f) => {
            const val = mobileGet(row.value, f.path);
            if (f.type === "bool") {
              return (
                <label key={f.path} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-strong)", cursor: "pointer" }}>
                  <input type="checkbox" checked={val === true}
                    onChange={(e) => patch(row.key, f.path, e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: "var(--accent)" }} />
                  {f.label}
                </label>
              );
            }
            const isList = f.type === "list";
            const text = isList ? (listText[`${row.key}:${f.path}`] ?? "") : (typeof val === "string" ? val : "");
            return (
              <div key={f.path} style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{f.label}</span>
                <input
                  value={text}
                  placeholder={f.hint || ""}
                  onChange={(e) => {
                    if (isList) setListText((t) => ({ ...t, [`${row.key}:${f.path}`]: e.target.value }));
                    else patch(row.key, f.path, e.target.value);
                  }}
                  style={seoInput}
                />
              </div>
            );
          })}

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ flex: 1, fontSize: 12, color: "var(--text-dim)" }}>
              {row.updated_at ? `Son güncelleme: ${new Date(row.updated_at).toLocaleString("tr-TR")}` : ""}
            </span>
            <button onClick={() => save(row)} style={{
              padding: "6px 14px", borderRadius: 8, border: "none",
              background: saved === row.key ? "var(--tile-correct)" : "var(--accent)",
              color: saved === row.key ? "#fff" : "#1a1330", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>
              {saved === row.key ? "✓" : "Kaydet"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function NotificationTypes() {
  type NT = {
    code: string; group_code: string; label: string; description: string;
    default_enabled: boolean; user_editable: boolean;
    allow_push: boolean; allow_web: boolean; allow_native: boolean;
    is_active: boolean; sort_order: number; route_template: string; channel_id: string;
  };
  type G = { code: string; label: string; sort_order: number };
  const [types, setTypes] = useState<NT[]>([]);
  const [groups, setGroups] = useState<G[]>([]);
  const [saved, setSaved] = useState<string | null>(null);

  function load() {
    fetch(apiUrl("/api/admin/notification-types"), { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => { setTypes(d.types || []); setGroups(d.groups || []); })
      .catch(() => {});
  }
  useEffect(() => { load(); }, []);

  function updateLocal(code: string, patch: Partial<NT>) {
    setTypes((ts) => ts.map((t) => t.code === code ? { ...t, ...patch } : t));
  }

  async function saveType(t: NT) {
    await fetch(apiUrl(`/api/admin/notification-types/${t.code}`), {
      method: "PUT", headers: authHeaders(),
      body: JSON.stringify({
        label: t.label, description: t.description,
        default_enabled: t.default_enabled, user_editable: t.user_editable,
        allow_push: t.allow_push, allow_web: t.allow_web, allow_native: t.allow_native,
        is_active: t.is_active, sort_order: Number(t.sort_order) || 100,
      }),
    }).catch(() => {});
    setSaved(t.code); setTimeout(() => setSaved(null), 1500);
    load();
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>🔔 Bildirim Türleri</h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 4, lineHeight: 1.5 }}>
          Bu katalog yalnızca <strong>push</strong> bildirimlerini yönetir — uygulama içi bildirim
          satırları ayarlardan bağımsız olarak her zaman oluşur.
        </p>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 14, lineHeight: 1.5 }}>
          <strong>Varsayılan</strong>: kullanıcı dokunmadıysa geçerli olan değer.
          <strong> Kullanıcı değiştirebilir</strong>: kapalıysa ayar sayfasında kilitli görünür.
          <strong> Aktif</strong>: kapalıysa tür kullanıcı ayar sayfasında hiç görünmez
          (henüz üretilmeyen, planlanan türler için).
        </p>
      </div>

      {groups.map((g) => {
        const rows = types.filter((t) => t.group_code === g.code);
        if (!rows.length) return null;
        return (
          <div key={g.code}>
            <div style={{
              fontSize: 13, fontWeight: 700, color: "var(--text-soft)", marginBottom: 8,
              textTransform: "uppercase", letterSpacing: "0.05em",
            }}>{g.label}</div>
            <div style={{ display: "grid", gap: 8 }}>
              {rows.map((t) => (
                <div key={t.code} style={{
                  padding: "10px 12px", background: "var(--bg-panel)", borderRadius: 10,
                  display: "grid", gap: 8, opacity: t.is_active ? 1 : 0.65,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <code style={{ fontSize: 11, color: "var(--text-dim)", minWidth: 130 }}>{t.code}</code>
                    <input value={t.label} onChange={(e) => updateLocal(t.code, { label: e.target.value })}
                      style={{ flex: "1 1 160px", minWidth: 120, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-elevated)", color: "var(--text-strong)", fontWeight: 600 }} />
                    <input type="number" value={t.sort_order} onChange={(e) => updateLocal(t.code, { sort_order: Number(e.target.value) })}
                      title="Sıra"
                      style={{ width: 64, padding: "6px 8px", borderRadius: 8, textAlign: "center", border: "1px solid var(--border-soft)", background: "var(--bg-elevated)", color: "var(--accent)", fontFamily: "var(--font-display)" }} />
                    <button onClick={() => saveType(t)} style={{
                      padding: "6px 12px", borderRadius: 8, border: "none",
                      background: saved === t.code ? "var(--tile-correct)" : "var(--accent)",
                      color: saved === t.code ? "#fff" : "#1a1330", fontWeight: 700, fontSize: 13, cursor: "pointer",
                    }}>{saved === t.code ? "✓" : "Kaydet"}</button>
                  </div>

                  <input value={t.description} placeholder="Açıklama (kullanıcıya gösterilir)"
                    onChange={(e) => updateLocal(t.code, { description: e.target.value })}
                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-elevated)", color: "var(--text-soft)", fontSize: 13 }} />

                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
                    <Check label="Varsayılan açık" on={t.default_enabled} onChange={(v) => updateLocal(t.code, { default_enabled: v })} />
                    <Check label="Kullanıcı değiştirebilir" on={t.user_editable} onChange={(v) => updateLocal(t.code, { user_editable: v })} />
                    <Check label="Aktif" on={t.is_active} onChange={(v) => updateLocal(t.code, { is_active: v })} />
                    <Check label="Push" on={t.allow_push} onChange={(v) => updateLocal(t.code, { allow_push: v })} />
                    <Check label="Web" on={t.allow_web} onChange={(v) => updateLocal(t.code, { allow_web: v })} />
                    <Check label="Native" on={t.allow_native} onChange={(v) => updateLocal(t.code, { allow_native: v })} />
                  </div>

                  {t.route_template && (
                    <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Bağlantı: <code>{t.route_template}</code></div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Check({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", color: "var(--text-soft)" }}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} style={{ cursor: "pointer" }} />
      {label}
    </label>
  );
}
