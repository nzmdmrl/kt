"use client";

import { useState, useEffect, useRef } from "react";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/Logo";
import AlertPopup from "@/components/AlertPopup";

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
  { key: "users", label: "👥 Üyeler" },
  { key: "photomod", label: "🖼️ Foto Mod" },
  { key: "namemod", label: "🏷️ Ad Mod" },
  { key: "homebtn", label: "🏠 Ana Sayfa" },
  { key: "sharepm", label: "💬 Sonuç PM" },
  { key: "seo", label: "🔍 SEO" },
  { key: "mobile", label: "📱 Mobil & Reklam" },
  { key: "notiftypes", label: "🔔 Bildirim Türleri" },
  { key: "announcements", label: "📢 Duyurular" },
  { key: "pages", label: "📄 Sayfalar" },
  { key: "support", label: "🎫 Destek" },
];

export default function AdminPage() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState("dashboard");
  const [denied, setDenied] = useState(false);
  // Sekme rozetleri: bekleyen fotoğraf / ad sayısı.
  const [modCounts, setModCounts] = useState<{ avatars: number; names: number }>({ avatars: 0, names: 0 });
  // Yanıt bekleyen destek talebi sayısı (sekme rozeti).
  const [supportWaiting, setSupportWaiting] = useState(0);

  function loadCounts() {
    fetch(apiUrl("/api/admin/moderation/counts"), { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setModCounts({ avatars: d.avatars || 0, names: d.names || 0 }); })
      .catch(() => {});
    fetch(apiUrl("/api/admin/support?limit=1"), { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setSupportWaiting(d.waiting || 0); })
      .catch(() => {});
  }
  useEffect(() => {
    if (!user) return;
    loadCounts();
    const iv = setInterval(loadCounts, 60000);
    return () => clearInterval(iv);
  }, [user]);

  if (loading) return <Wrap><Centered>Yükleniyor…</Centered></Wrap>;
  if (!user) return <Wrap><Centered>Bu sayfa için giriş yapmalısın. <a href="/giris" style={{ color: "var(--accent)" }}>Giriş →</a></Centered></Wrap>;
  if (denied) return <Wrap><Centered>Bu sayfaya erişim yetkin yok.</Centered></Wrap>;

  return (
    <Wrap>
      <h1 className="brand-mono" style={{ fontSize: 26, marginBottom: 16 }}>Yönetim Paneli</h1>
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {TABS.map((t) => {
          const badge = t.key === "photomod" ? modCounts.avatars : t.key === "namemod" ? modCounts.names : t.key === "support" ? supportWaiting : 0;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: "10px 14px", borderRadius: 10, border: "none", cursor: "pointer",
              fontWeight: 600, fontSize: 14, fontFamily: "var(--font-display)", position: "relative",
              background: tab === t.key ? "var(--accent)" : "var(--bg-panel)",
              color: tab === t.key ? "#1a1330" : "var(--text-soft)",
            }}>
              {t.label}
              {badge > 0 && (
                <span style={{
                  position: "absolute", top: -6, right: -6, minWidth: 20, height: 20, padding: "0 5px",
                  borderRadius: 10, background: "var(--accent-hot)", color: "#fff",
                  fontSize: 11, fontWeight: 800, display: "grid", placeItems: "center",
                  border: "2px solid var(--bg-deep)",
                }}>{badge > 99 ? "99+" : badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "dashboard" && <Dashboard onDenied={() => setDenied(true)} />}
      {tab === "settings" && <Settings />}
      {tab === "bots" && <Bots />}
      {tab === "words" && <Words />}
      {tab === "sounds" && <Sounds />}
      {tab === "titles" && <Titles />}
      {tab === "badges" && <Badges />}
      {tab === "music" && <MusicPools />}
      {tab === "users" && <Users />}
      {tab === "photomod" && <PhotoMod onChanged={loadCounts} />}
      {tab === "namemod" && <NameMod onChanged={loadCounts} />}
      {tab === "homebtn" && <HomeButtons />}
      {tab === "sharepm" && <SharePM />}
      {tab === "seo" && <Seo />}
      {tab === "mobile" && <Mobile />}
      {tab === "notiftypes" && <NotificationTypes />}
      {tab === "announcements" && <Announcements />}
      {tab === "pages" && <Pages />}
      {tab === "support" && <SupportBox onChanged={loadCounts} />}
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

/**
 * 📄 Sayfalar — Hakkımızda / Nasıl Oynanır gibi sayfaların METNİNİ düzenler.
 *
 * Burada sadece başlık + içerik vardır; sayfanın tepesindeki animasyonlu kare
 * logo yalnızca yayındaki sayfada görünür, bu ekranda GÖSTERİLMEZ.
 * Sayfa başlığı/açıklaması (arama motoru) ayrı yerde: 🔍 SEO sekmesi.
 */
/**
 * 🎫 Destek — /iletisim formundan açılan destek biletleri.
 *
 * Yanıtladığında üyeye uygulama içi bildirim + push gider; üye /destek/{id}
 * sayfasından yanıtı okur ve tekrar yazabilir. E-posta gönderimi YOKTUR.
 */
function SupportBox({ onChanged }: { onChanged: () => void }) {
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState<any>(null);          // {ticket, messages}
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    fetch(apiUrl("/api/admin/support"), { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }
  useEffect(load, []);

  async function openTicket(id: string) {
    const r = await fetch(apiUrl(`/api/admin/support/${encodeURIComponent(String(id))}`), { headers: authHeaders() });
    if (!r.ok) return;
    setOpen(await r.json());
    setReply("");
    load(); onChanged();
  }
  async function sendReply() {
    if (!open || reply.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      const r = await fetch(apiUrl(`/api/admin/support/${open.ticket.code}/reply`), {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ message: reply }),
      });
      if (r.ok) { setReply(""); await openTicket(open.ticket.code); }
    } finally { setBusy(false); }
  }
  async function setStatus(id: string, status: string) {
    await fetch(apiUrl(`/api/admin/support/${encodeURIComponent(id)}/status`), {
      method: "POST", headers: authHeaders(), body: JSON.stringify({ status }),
    });
    if (open?.ticket?.code === id) await openTicket(id); else { load(); onChanged(); }
  }
  async function remove(id: string) {
    if (!confirm("Bu destek talebi ve tüm yazışması silinsin mi?")) return;
    await fetch(apiUrl(`/api/admin/support/${encodeURIComponent(id)}`), { method: "DELETE", headers: authHeaders() });
    setOpen(null); load(); onChanged();
  }

  if (!data) return <p style={{ color: "var(--text-soft)" }}>Yükleniyor…</p>;
  const list: any[] = data.tickets || [];

  // --- Tek talep görünümü (yazışma + yanıt kutusu) ---
  if (open) {
    const t = open.ticket;
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <button onClick={() => { setOpen(null); load(); }} style={smallBtn}>← Tüm talepler</button>
        <div style={{ background: "var(--bg-panel)", borderRadius: 12, padding: 14 }}>
          <strong style={{ color: "var(--text-strong)", fontSize: 16 }}>{t.subject}</strong>
          <div style={{ fontSize: 13, color: "var(--text-soft)", marginTop: 4 }}>
            #{t.code} · {t.name} · <a href={`mailto:${t.email}`} style={{ color: "var(--accent)" }}>{t.email}</a>
            {t.user_id ? ` · üye #${t.user_id}` : " · misafir (bildirim gitmez)"}
            {" · "}<span style={{ fontWeight: 700 }}>{STATUS_LABEL[t.status] || t.status}</span>
          </div>
          {t.user_deleted && (
            <div style={{
              marginTop: 8, padding: "8px 10px", borderRadius: 8, fontSize: 12.5, lineHeight: 1.6,
              background: "rgba(217,90,90,.12)", color: "var(--accent-hot)", fontWeight: 600,
            }}>
              🗑️ Üye bu destek talebini kendi listesinden sildi. Kayıt sende duruyor;
              yanıt yazsan da üyeye bildirim GİTMEZ. Kalıcı silmek için “Sil” butonunu kullan.
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {(open.messages || []).map((m: any) => (
            <div key={m.id} style={{
              justifySelf: m.sender === "admin" ? "end" : "start", maxWidth: "85%",
              background: "var(--bg-panel)", borderRadius: 12, padding: "10px 12px",
              border: `1px solid ${m.sender === "admin" ? "var(--accent)" : "var(--border-soft)"}`,
            }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: m.sender === "admin" ? "var(--accent)" : "var(--text-dim)", marginBottom: 3 }}>
                {m.sender === "admin" ? "Destek ekibi" : t.name}
                {m.created_at ? ` · ${new Date(m.created_at).toLocaleString("tr-TR")}` : ""}
              </div>
              <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--text-strong)", fontSize: 14, lineHeight: 1.65 }}>{m.body}</p>
            </div>
          ))}
        </div>

        <textarea
          value={reply} onChange={(e) => setReply(e.target.value)} rows={5} maxLength={4000}
          placeholder="Yanıtını yaz — gönderince üyeye bildirim gider."
          style={{
            width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10,
            border: "1px solid var(--border-soft)", background: "var(--bg-elevated)",
            color: "var(--text-strong)", fontSize: 15, fontFamily: "var(--font-body)", lineHeight: 1.6,
          }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={sendReply} disabled={busy || reply.trim().length < 2} style={{
            padding: "11px 20px", borderRadius: 10, border: "none", fontWeight: 800, fontSize: 14,
            background: "var(--accent)", color: "#1a1330",
            cursor: busy || reply.trim().length < 2 ? "default" : "pointer",
            opacity: busy || reply.trim().length < 2 ? 0.5 : 1,
          }}>{busy ? "Gönderiliyor…" : "Yanıtla ve bildir"}</button>
          {t.status !== "closed"
            ? <button onClick={() => setStatus(t.code, "closed")} style={smallBtn}>Kapat</button>
            : <button onClick={() => setStatus(t.code, "open")} style={smallBtn}>Yeniden aç</button>}
          <button onClick={() => remove(t.code)} style={{ ...smallBtn, color: "var(--accent-hot)" }}>Sil</button>
        </div>
      </div>
    );
  }

  // --- Liste görünümü ---
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{
        background: "var(--bg-panel)", border: "1px solid var(--border-soft)",
        borderRadius: 12, padding: 14, fontSize: 13.5, color: "var(--text-soft)", lineHeight: 1.7,
      }}>
        Yanıt bekleyen: <strong style={{ color: "var(--text-strong)" }}>{data.waiting}</strong> ·
        Talepler <strong style={{ color: "var(--text-strong)" }}>/iletisim</strong> formundan açılır.
        Yanıtladığında üyeye bildirim gider; üye <strong style={{ color: "var(--text-strong)" }}>/destek</strong>
        {" "}sayfasından okuyup tekrar yazabilir. Sayfa metni: <strong style={{ color: "var(--text-strong)" }}>📄 Sayfalar → İletişim</strong>
      </div>

      {list.length === 0 && <p style={{ color: "var(--text-dim)" }}>Henüz destek talebi yok.</p>}

      {list.map((t) => (
        <button key={t.id} onClick={() => openTicket(t.code)} style={{
          textAlign: "left", cursor: "pointer", width: "100%",
          background: "var(--bg-panel)", borderRadius: 12, padding: 14,
          border: `1px solid ${t.admin_unread ? "var(--accent)" : "var(--border-soft)"}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <strong style={{ color: "var(--text-strong)" }}>{t.subject || "(konusuz)"}</strong>
            {t.admin_unread && <span style={{ fontSize: 11, fontWeight: 800, color: "#1a1330", background: "var(--accent)", padding: "2px 8px", borderRadius: 20 }}>YENİ</span>}
            {t.user_deleted && <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: "var(--accent-hot)", padding: "2px 8px", borderRadius: 20 }}>🗑️ ÜYE SİLDİ</span>}
            <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-dim)" }}>
              {t.updated_at ? new Date(t.updated_at).toLocaleString("tr-TR") : ""}
            </span>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-soft)", marginTop: 4 }}>
            #{t.code} · {t.name} · {t.email}{t.user_id ? ` · üye #${t.user_id}` : " · misafir"} · {t.messages} mesaj · {STATUS_LABEL[t.status] || t.status}
          </div>
          <p style={{ color: "var(--text-dim)", fontSize: 13.5, margin: "6px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.last}</p>
        </button>
      ))}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  open: "yanıt bekliyor", answered: "yanıtlandı", closed: "kapatıldı",
};

const smallBtn: React.CSSProperties = {
  padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
  border: "1px solid var(--border-soft)", background: "var(--bg-elevated)", color: "var(--text-soft)",
};

function Pages() {
  const [pages, setPages] = useState<any[]>([]);
  const [sel, setSel] = useState<string>("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saved, setSaved] = useState(false);
  const [popup, setPopup] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { load(); }, []);
  function load() {
    fetch(apiUrl("/api/admin/pages"), { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => {
        const list = d.pages || [];
        setPages(list);
        if (list.length && !sel) pick(list[0]);
      })
      .catch(() => setPopup("Sayfalar yüklenemedi."));
  }
  function pick(p: any) { setSel(p.key); setTitle(p.title || ""); setBody(p.body || ""); setSaved(false); }

  const current = pages.find((p) => p.key === sel);

  async function save() {
    if (!current) return;
    setBusy(true);
    try {
      const r = await fetch(apiUrl(`/api/admin/pages/${current.key}`), {
        method: "PUT", headers: authHeaders(), body: JSON.stringify({ title, body }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPopup(j.detail || "Kaydedilemedi."); return; }
      setSaved(true); setTimeout(() => setSaved(false), 2000);
      setPages((prev) => prev.map((p) => p.key === current.key ? { ...p, title, body } : p));
    } catch { setPopup("Bağlantı hatası."); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {popup && <AlertPopup message={popup} onClose={() => setPopup("")} />}
      <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.6 }}>
        Sayfa metinleri. Biçimlendirme: <code>## Başlık</code>, <code>- madde</code>,{" "}
        <code>**kalın**</code>, <code>[metin](adres)</code>, boş satır = yeni paragraf.
        Yayına yansıması 1 dakika sürebilir (sayfa önbelleği).
        <br />
        <strong style={{ color: "var(--text-soft)" }}>Not:</strong> Sayfalardaki görsel bölümler
        (Hakkımızda&apos;daki kare animasyonlu logo, Nasıl Oynanır&apos;daki renk demosu ve mod
        kartları) koddadır — burada yazdığın metin onları etkilemez, bozmaz.
        Nasıl Oynanır metni sayfanın &quot;Sık sorulanlar&quot; bölümünde görünür.
      </p>

      {/* Sayfa seçimi */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {pages.map((p) => (
          <button
            key={p.key}
            onClick={() => pick(p)}
            style={{
              padding: "8px 14px", borderRadius: 9, cursor: "pointer", fontSize: 14, fontWeight: 600,
              background: p.key === sel ? "var(--accent)" : "var(--bg-panel)",
              color: p.key === sel ? "#1a1330" : "var(--text-soft)",
              border: "1px solid var(--border-soft)",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {current && (
        <div style={{ background: "var(--bg-panel)", borderRadius: 12, padding: 14, display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Adres: <a href={current.path} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{current.path}</a>
            {current.updated_at && ` · son düzenleme: ${new Date(current.updated_at).toLocaleString("tr")}`}
          </div>
          <label style={{ fontSize: 13, color: "var(--text-soft)" }}>Sayfa başlığı</label>
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setSaved(false); }}
            style={{
              padding: "10px 12px", borderRadius: 9, border: "1px solid var(--tile-border)",
              background: "var(--bg-elevated)", color: "var(--text-strong)", fontSize: 15,
            }}
          />
          <label style={{ fontSize: 13, color: "var(--text-soft)" }}>İçerik</label>
          <textarea
            value={body}
            onChange={(e) => { setBody(e.target.value); setSaved(false); }}
            rows={22}
            style={{
              padding: "12px", borderRadius: 9, border: "1px solid var(--tile-border)",
              background: "var(--bg-elevated)", color: "var(--text-strong)",
              fontSize: 14, lineHeight: 1.6, fontFamily: "inherit", resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={save}
              disabled={busy}
              style={{
                padding: "10px 20px", borderRadius: 9, border: "none", background: "var(--accent)",
                color: "#1a1330", fontWeight: 700, fontSize: 14, cursor: busy ? "default" : "pointer",
                opacity: busy ? .6 : 1,
              }}
            >
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </button>
            <button
              onClick={() => { setTitle(current.default_title); setBody(current.default_body); setSaved(false); }}
              style={{
                padding: "10px 16px", borderRadius: 9, background: "var(--bg-elevated)",
                color: "var(--text-soft)", border: "1px solid var(--border-soft)", fontSize: 14, cursor: "pointer",
              }}
            >
              Varsayılana dön
            </button>
            {saved && <span style={{ color: "var(--tile-correct)", fontSize: 13 }}>✓ Kaydedildi</span>}
            <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-dim)" }}>{body.length} karakter</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Ayar grupları — panelde bu sırayla, katlanabilir başlıklar hâlinde çıkar.
const SETTING_GROUPS: [string, string][] = [
  ["Genel", "🎯"],
  ["1v1 Düello", "⚔️"],
  ["Arena", "🏟️"],
  ["Maraton", "🏃"],
  ["Jokerler", "🃏"],
  ["XP", "💎"],
  ["Adlar & Listeler", "🔤"],
  ["Görünüm", "🎨"],
  ["Ses", "🔊"],
  ["Sosyal", "🤝"],
  ["Misafir", "👤"],
  ["Diğer", "📦"],
];

function Settings() {
  const [settings, setSettings] = useState<any[]>([]);
  const [saved, setSaved] = useState("");
  const [popup, setPopup] = useState("");
  const [q, setQ] = useState("");
  // Gruplar varsayılan olarak KAPALI — uzun listede aranan ayarı bulmak kolay olsun.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => { load(); }, []);
  function load() {
    fetch(apiUrl("/api/admin/settings"), { headers: authHeaders() })
      .then((r) => r.json()).then((d) => setSettings(d.settings || [])).catch(() => {});
  }
  function save(key: string, value: string) {
    // UI'ı anında güncelle (switch hemen değişsin).
    setSettings((prev) => prev.map((s) => s.key === key ? { ...s, value } : s));
    fetch(apiUrl("/api/admin/settings"), { method: "POST", headers: authHeaders(), body: JSON.stringify({ key, value }) })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        // Geçersiz değer (ör. ad limiti sınır dışı) → popup + eski değeri geri yükle.
        if (!r.ok) { setPopup(j.detail || "Ayar kaydedilemedi."); load(); return; }
        setSaved(key); setTimeout(() => setSaved(""), 1500);
      })
      .catch(() => setPopup("Bağlantı hatası."));
  }

  const query = q.trim().toLowerCase();
  const shown = query
    ? settings.filter((s) => `${s.label} ${s.key} ${s.group || ""}`.toLowerCase().includes(query))
    : settings;
  // Bilinen grup sırası + listede olmayan grupları sona ekle.
  const names = [
    ...SETTING_GROUPS.map(([n]) => n),
    ...Array.from(new Set(shown.map((s) => s.group || "Diğer"))).filter((n) => !SETTING_GROUPS.some(([g]) => g === n)),
  ];
  const icons = Object.fromEntries(SETTING_GROUPS);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Değişiklikler yeni başlayan maçlarda geçerli olur.</p>
      {popup && <AlertPopup message={popup} onClose={() => setPopup("")} />}

      {/* Ayar ara — yazarken eşleşen gruplar kendiliğinden açılır */}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔍 Ayar ara (ör. arena, xp, karakter)"
        style={{
          padding: "10px 12px", borderRadius: 10, border: "1px solid var(--tile-border)",
          background: "var(--bg-elevated)", color: "var(--text-strong)", fontSize: 14,
        }}
      />

      {names.map((name) => {
        const items = shown.filter((s) => (s.group || "Diğer") === name);
        if (items.length === 0) return null;
        const open = !!query || !!openGroups[name];
        return (
          <div key={name} style={{ background: "var(--bg-panel)", borderRadius: 12, overflow: "hidden" }}>
            <button
              onClick={() => setOpenGroups((p) => ({ ...p, [name]: !p[name] }))}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                background: "none", border: "none", cursor: "pointer", color: "var(--text-strong)",
                fontSize: 15, fontWeight: 700, textAlign: "left",
              }}
            >
              <span style={{ fontSize: 18 }}>{icons[name] || "📦"}</span>
              <span style={{ flex: 1 }}>{name}</span>
              <span style={{ color: "var(--text-dim)", fontSize: 12, fontWeight: 500 }}>{items.length} ayar</span>
              <span style={{ color: "var(--text-dim)" }}>{open ? "▾" : "▸"}</span>
            </button>
            {open && (
              <div style={{ display: "grid", gap: 8, padding: "0 10px 12px" }}>
                {items.map((s) => (
                  <SettingRow key={s.key} s={s} saved={saved === s.key} onSave={save} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SettingRow({ s, saved, onSave }: { s: any; saved: boolean; onSave: (k: string, v: string) => void }) {
  const selStyle: React.CSSProperties = {
    padding: "8px", borderRadius: 8, border: "1px solid var(--tile-border)",
    background: "var(--bg-elevated)", color: "var(--text-strong)",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg-elevated)", borderRadius: 10, padding: "10px 14px" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: "var(--text-strong)" }}>{s.label}</div>
        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{s.key} · varsayılan: {s.default}</div>
      </div>
      {s.key === "game_mode" ? (
        <select value={s.value} onChange={(e) => onSave(s.key, e.target.value)} style={selStyle}>
          <option value="1">1 · Klasik (1v1: 3 tur · Arena: 6 kelime)</option>
          <option value="2">2 · Hızlı (1v1: tek tur 5/6 harf · Arena: 5 kelime)</option>
        </select>
      ) : s.key === "ui_style" ? (
        /* Arayüz stili — sadece görünümü değiştirir, oyun mantığı aynıdır.
           Değişiklik ana sayfa/kök layout ISR'ı (60 sn) sonrası yayına yansır. */
        <select value={s.value} onChange={(e) => onSave(s.key, e.target.value)} style={selStyle}>
          <option value="stil1">🎨 Stil 1 · Klasik (eski görünüm)</option>
          <option value="stil2">✨ Stil 2 · Yeni görünüm</option>
        </select>
      ) : s.key === "list_name_source" ? (
        /* Listelerde (son maçlar, lig) hangi ad gösterilsin */
        <select value={s.value} onChange={(e) => onSave(s.key, e.target.value)} style={selStyle}>
          <option value="display_name">Görünen ad</option>
          <option value="username">Kullanıcı adı</option>
        </select>
      ) : s.key === "night_bg_theme" ? (
        <select defaultValue={s.value} onChange={(e) => onSave(s.key, e.target.value)} style={selStyle}>
          <option value="night">🌙 Gece</option>
          <option value="aurora">🌌 Kutup Işıkları</option>
          <option value="nebula">🪐 Nebula</option>
          <option value="snow">❄️ Kar</option>
        </select>
      ) : s.type === "bool" ? (
        <button
          onClick={() => onSave(s.key, s.value === "true" ? "false" : "true")}
          style={{
            width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer",
            position: "relative", background: s.value === "true" ? "var(--accent)" : "var(--bg-panel)",
            transition: "background .2s", flexShrink: 0,
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
          key={s.value}
          defaultValue={s.value}
          onBlur={(e) => e.target.value !== s.value && onSave(s.key, e.target.value)}
          style={{ width: 70, padding: "8px", borderRadius: 8, border: "1px solid var(--tile-border)", background: "var(--bg-panel)", color: "var(--text-strong)", textAlign: "center", flexShrink: 0 }}
        />
      )}
      <span style={{ width: 12, color: "var(--tile-correct)", fontSize: 12 }}>{saved ? "✓" : ""}</span>
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

// Moderasyon aç/kapa anahtarları (iki sekmenin başında görünür).
type ModFlags = { photo_upload_enabled: boolean; photo_moderation_enabled: boolean; name_moderation_enabled: boolean };

function useModFlags() {
  const [flags, setFlags] = useState<ModFlags>({
    photo_upload_enabled: true, photo_moderation_enabled: true, name_moderation_enabled: true,
  });
  useEffect(() => {
    fetch(apiUrl("/api/admin/moderation/settings"), { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setFlags(d); })
      .catch(() => {});
  }, []);
  async function setFlag(key: keyof ModFlags, value: boolean) {
    setFlags((f) => ({ ...f, [key]: value }));
    await fetch(apiUrl("/api/admin/moderation/settings"), {
      method: "PUT", headers: authHeaders(), body: JSON.stringify({ key, value }),
    }).catch(() => {});
  }
  return { flags, setFlag };
}

function ModToggle({ label, hint, value, onChange }: {
  label: string; hint: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer",
          position: "relative", background: value ? "var(--accent)" : "var(--bg-elevated)",
          transition: "background .2s", flexShrink: 0, marginTop: 2,
        }}
      >
        <span style={{
          position: "absolute", top: 3, left: value ? 27 : 3, width: 22, height: 22,
          borderRadius: "50%", background: "#fff", transition: "left .2s",
        }} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: "var(--text-strong)", fontSize: 14 }}>{label}</div>
        <div style={{ color: "var(--text-dim)", fontSize: 12, lineHeight: 1.5, marginTop: 2 }}>{hint}</div>
      </div>
    </div>
  );
}

// ---- 👥 Üyeler: üye arama + reklamsız anahtarı --------------------------
//
// SALT OKUMA + tek yazma işlemi (ad_free). Silme / yasaklama / şifre sıfırlama
// ve başka alanların düzenlenmesi BİLEREK yok.
//
// Tüm üyeler listelenmez: en az 2 harf yazılınca arama yapılır, en fazla 25 satır.

type AdminUser = {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  created_at: string | null;
  presence: "online" | "in_match" | "offline";
  is_admin: boolean;
  ad_free: boolean;
  ad_free_since: string | null;
  ad_free_source: string | null;
};

const USER_MIN_CHARS = 2;

const PRESENCE_TEXT: Record<string, string> = {
  online: "🟢 Çevrimiçi",
  in_match: "🔵 Maçta",
  offline: "⚪ Çevrimdışı",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("tr-TR", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

function Users() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const [rows, setRows] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [matched, setMatched] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  /** Yavaş dönen eski isteğin yeni sonucu ezmesini engeller. */
  const reqRef = useRef(0);

  // Arama ya da sayfa boyu değişince başa dön.
  useEffect(() => { setPage(0); }, [q, pageSize]);

  // Tek yükleme noktası: arama, sayfa ve sayfa boyu aynı effect'i tetikler.
  // Debounce sayesinde "q değişti -> page 0'a döndü" ikilisinde tek istek gider.
  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, page, pageSize]);

  async function load() {
    const mine = ++reqRef.current;
    setLoading(true); setMsg("");
    try {
      const params = new URLSearchParams({
        q: q.trim(),
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      const r = await fetch(apiUrl(`/api/admin/users?${params}`), { headers: authHeaders() });
      if (!r.ok) throw new Error();
      const d = await r.json();
      if (mine !== reqRef.current) return;   // daha yeni bir istek var
      setRows(Array.isArray(d.users) ? d.users : []);
      setTotal(typeof d.total_users === "number" ? d.total_users : null);
      setMatched(typeof d.matched === "number" ? d.matched : 0);
    } catch {
      if (mine !== reqRef.current) return;
      setMsg("Üyeler getirilemedi.");
      setRows([]);
    } finally {
      if (mine === reqRef.current) setLoading(false);
    }
  }

  async function toggleAdFree(u: AdminUser) {
    if (busy) return;
    setBusy(u.id); setMsg("");
    try {
      const r = await fetch(apiUrl(`/api/admin/users/${u.id}/ad-free`), {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({ enabled: !u.ad_free }),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      // Sunucunun döndürdüğü satırla değiştir (tarih/kaynak da tazelensin).
      setRows((rs) => rs.map((x) => (x.id === u.id ? { ...x, ...(d.user || {}) } : x)));
      setSaved(u.id);
      setTimeout(() => setSaved(null), 1500);
    } catch {
      setMsg("Kaydedilemedi.");
    } finally {
      setBusy(null);
    }
  }

  const pageCount = Math.max(1, Math.ceil(matched / pageSize));
  const from = matched === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(matched, (page + 1) * pageSize);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ background: "var(--bg-panel)", borderRadius: 12, padding: 14, fontSize: 13, color: "var(--text-dim)", lineHeight: 1.7 }}>
        Kayıtlı üye sayısı: <b style={{ color: "var(--text-strong)" }}>{total === null ? "…" : total.toLocaleString("tr")}</b><br />
        Arama kutusu boşken <b>tüm üyeler</b> sayfa sayfa listelenir; kullanıcı adı ya da
        e-posta yazınca sonuçlar süzülür (o da sayfalanır).<br />
        • <b>Reklamsız</b> anahtarı kullanıcının reklam görmemesini sağlar: AdSense, uygulama bandı
        ve geçiş reklamı kapanır, geçiş reklamının maç sayacı bile artmaz.<br />
        • Buradan verilen hak <span className="brand-mono">manual</span> kaynağıyla işaretlenir.
        Kapatınca ne zaman/nereden verildiği bilgisi silinmez.<br />
        • Bu sekmede silme, yasaklama, şifre sıfırlama YOKTUR.
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 240px", minWidth: 0 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Kullanıcı adı veya e-posta… (boş bırak = tümü)"
            autoComplete="off"
            spellCheck={false}
            style={{
              width: "100%", padding: "12px 40px 12px 14px", borderRadius: 10,
              border: "1px solid var(--tile-border)", background: "var(--bg-elevated)",
              color: "var(--text-strong)", fontSize: 15,
            }}
          />
          <span style={{ position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }}>
            {loading ? "⏳" : "🔎"}
          </span>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-dim)" }}>
          Sayfada
          <select
            value={pageSize}
            onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
            style={{
              padding: "9px 10px", borderRadius: 8, border: "1px solid var(--tile-border)",
              background: "var(--bg-elevated)", color: "var(--text-strong)", fontSize: 14,
            }}
          >
            {[20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      {msg && <p style={{ fontSize: 13, color: "var(--accent-hot)", margin: 0 }}>{msg}</p>}

      <Pager
        from={from} to={to} matched={matched} page={page} pageCount={pageCount}
        disabled={loading} onPage={setPage}
      />

      {!loading && rows.length === 0 && (
        <p style={{ color: "var(--text-dim)", textAlign: "center", padding: 24 }}>
          {q.trim() ? "Bu aramaya uyan üye yok." : "Kayıtlı üye yok."}
        </p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((u) => (
          <div key={u.id} style={{
            background: "var(--bg-panel)", borderRadius: 12, padding: "12px 14px",
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          }}>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <a href={`/profil/${u.username}`} target="_blank" rel="noreferrer"
                  style={{ color: "var(--text-strong)", fontWeight: 700, fontSize: 15, textDecoration: "none" }}>
                  {u.display_name}
                </a>
                <span className="brand-mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>@{u.username}</span>
                {u.is_admin && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 6, padding: "1px 6px" }}>
                    ADMIN
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 3 }}>
                #{u.id} · {u.email || "e-posta yok"} · Kayıt: {fmtDate(u.created_at)} · {PRESENCE_TEXT[u.presence] || "—"}
              </div>
              {u.ad_free_since && (
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
                  Reklamsız: {fmtDate(u.ad_free_since)}
                  {u.ad_free_source ? ` · kaynak: ${u.ad_free_source}` : ""}
                  {!u.ad_free ? " (şu an kapalı)" : ""}
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 13, color: u.ad_free ? "var(--text-strong)" : "var(--text-dim)" }}>Reklamsız</span>
              <button
                onClick={() => toggleAdFree(u)}
                disabled={busy === u.id}
                title={u.ad_free ? "Reklamsız hakkını kapat" : "Reklamsız hakkı ver"}
                style={{
                  width: 52, height: 28, borderRadius: 14, border: "none",
                  cursor: busy === u.id ? "default" : "pointer",
                  position: "relative", background: u.ad_free ? "var(--accent)" : "var(--bg-elevated)",
                  transition: "background .2s", flexShrink: 0, opacity: busy === u.id ? 0.6 : 1,
                }}
              >
                <span style={{
                  position: "absolute", top: 3, left: u.ad_free ? 27 : 3,
                  width: 22, height: 22, borderRadius: "50%", background: "#fff",
                  transition: "left .2s",
                }} />
              </button>
              <span style={{ width: 12, color: "var(--tile-correct)", fontSize: 12 }}>
                {saved === u.id ? "✓" : ""}
              </span>
            </div>
          </div>
        ))}
      </div>

      {rows.length > 0 && (
        <Pager
          from={from} to={to} matched={matched} page={page} pageCount={pageCount}
          disabled={loading} onPage={setPage}
        />
      )}
    </div>
  );
}

/** Sayfa gezinme şeridi — listenin altında ve üstünde aynısı kullanılır. */
function Pager({
  from, to, matched, page, pageCount, disabled, onPage,
}: {
  from: number; to: number; matched: number; page: number; pageCount: number;
  disabled: boolean; onPage: (p: number) => void;
}) {
  const btn: React.CSSProperties = {
    padding: "7px 12px", borderRadius: 8, border: "1px solid var(--tile-border)",
    background: "var(--bg-elevated)", color: "var(--text-strong)",
    fontSize: 13, fontWeight: 600, cursor: "pointer",
  };
  const off = { ...btn, opacity: 0.4, cursor: "default" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-dim)" }}>
        {matched === 0 ? "Sonuç yok" : `${from}–${to} / ${matched.toLocaleString("tr")} kayıt · sayfa ${page + 1}/${pageCount}`}
      </span>
      <button onClick={() => onPage(Math.max(0, page - 1))}
        disabled={disabled || page <= 0} style={disabled || page <= 0 ? off : btn}>‹ Önceki</button>
      <button onClick={() => onPage(Math.min(pageCount - 1, page + 1))}
        disabled={disabled || page >= pageCount - 1} style={disabled || page >= pageCount - 1 ? off : btn}>Sonraki ›</button>
    </div>
  );
}

// ---- 🖼️ Foto Mod: yüklenen profil fotoğraflarının onayı ----------------
// Onaylanana kadar fotoğrafı yalnızca sahibi görür; onaylanınca herkes görür.
function PhotoMod({ onChanged }: { onChanged: () => void }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const { flags, setFlag } = useModFlags();

  function load() {
    fetch(apiUrl("/api/admin/moderation/avatars"), { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => { setUsers(d.users || []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }
  useEffect(load, []);

  async function act(id: number, action: "approve" | "reject") {
    setBusy(id);
    await fetch(apiUrl(`/api/admin/moderation/avatars/${id}/${action}`), { method: "POST", headers: authHeaders() }).catch(() => {});
    setUsers((xs) => xs.filter((u) => u.id !== id));
    setBusy(null);
    onChanged();
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Sekme başındaki aç/kapa anahtarları */}
      <div style={{ background: "var(--bg-panel)", borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
        <ModToggle
          label="Profil fotoğrafı yükleme açık"
          hint="Kapalıyken kullanıcılar fotoğraf yükleyemez; eski sistem (hazır avatar) devam eder."
          value={flags.photo_upload_enabled}
          onChange={(v) => setFlag("photo_upload_enabled", v)}
        />
        <ModToggle
          label="Yüklenen fotoğraflar onaydan geçsin"
          hint="Kapalıyken yüklenen fotoğraf ONAYSIZ yayınlanır (herkes hemen görür)."
          value={flags.photo_moderation_enabled}
          onChange={(v) => setFlag("photo_moderation_enabled", v)}
        />
      </div>

      <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.6 }}>
        Onaylanana kadar fotoğrafı <strong>sadece sahibi</strong> görür. Reddedersen yükleme silinir,
        kullanıcıya bildirim gider ve eski avatarı kalır.
      </p>
      {!loaded ? <p style={{ color: "var(--text-soft)" }}>Yükleniyor…</p>
        : users.length === 0 ? <p style={{ color: "var(--text-dim)" }}>Onay bekleyen fotoğraf yok. ✅</p> : null}
      {users.map((u) => (
        <div key={u.id} style={{
          display: "flex", alignItems: "center", gap: 14, background: "var(--bg-panel)",
          borderRadius: 12, padding: 12, flexWrap: "wrap",
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u.pending_photo} alt="" style={{ width: 84, height: 84, borderRadius: 12, objectFit: "cover", background: "var(--bg-elevated)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ fontWeight: 700, color: "var(--text-strong)", fontSize: 15 }}>{u.display_name}</div>
            <a href={`/profil/${u.username}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontSize: 13, textDecoration: "none" }}>@{u.username} ↗</a>
            <div style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 2 }}>
              {u.pending_at ? new Date(u.pending_at).toLocaleString("tr") : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={busy === u.id} onClick={() => act(u.id, "approve")} style={{
              padding: "10px 16px", borderRadius: 10, border: "none", cursor: "pointer",
              background: "var(--tile-correct)", color: "#fff", fontWeight: 800, fontSize: 14,
            }}>✅ Onayla</button>
            <button disabled={busy === u.id} onClick={() => act(u.id, "reject")} style={{
              padding: "10px 16px", borderRadius: 10, cursor: "pointer",
              border: "1px solid var(--border-soft)", background: "var(--bg-elevated)",
              color: "var(--accent-hot)", fontWeight: 700, fontSize: 14,
            }}>🚫 Reddet</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- 🏷️ Ad Mod: görünen ad + kullanıcı adı onayı -----------------------
// Reddedilirse ad "user123456" biçimine döner ve kullanıcıya bildirim gider.
function NameMod({ onChanged }: { onChanged: () => void }) {
  const { flags, setFlag } = useModFlags();
  const [users, setUsers] = useState<any[]>([]);
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  function load(st = status) {
    setLoaded(false);
    fetch(apiUrl(`/api/admin/moderation/names?status=${st}`), { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => { setUsers(d.users || []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }
  useEffect(() => { load(status); /* eslint-disable-next-line */ }, [status]);

  async function act(id: number, action: "approve" | "reject") {
    setBusy(id);
    await fetch(apiUrl(`/api/admin/moderation/names/${id}/${action}`), { method: "POST", headers: authHeaders() }).catch(() => {});
    setUsers((xs) => xs.filter((u) => u.id !== id));
    setBusy(null);
    onChanged();
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ background: "var(--bg-panel)", borderRadius: 12, padding: 12 }}>
        <ModToggle
          label="Görünen ad / kullanıcı adı onaydan geçsin"
          hint="Kapalıyken yeni kayıtlar ve ad değişiklikleri doğrudan onaylı sayılır, rozet çıkmaz."
          value={flags.name_moderation_enabled}
          onChange={(v) => setFlag("name_moderation_enabled", v)}
        />
      </div>

      <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.6 }}>
        Yeni kayıtlar ve ad değişiklikleri burada listelenir. <strong>Reddedersen</strong> görünen ad ve
        kullanıcı adı <code>user123456</code> biçimine döner ve kullanıcıya bildirim gider.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["pending", "approved", "rejected"] as const).map((st) => (
          <button key={st} onClick={() => setStatus(st)} style={{
            padding: "8px 14px", borderRadius: 20, cursor: "pointer", fontSize: 13, fontWeight: 700,
            border: `1px solid ${status === st ? "var(--accent)" : "var(--border-soft)"}`,
            background: status === st ? "var(--accent)" : "var(--bg-panel)",
            color: status === st ? "#1a1330" : "var(--text-soft)",
          }}>
            {st === "pending" ? "Bekleyen" : st === "approved" ? "Onaylı" : "Reddedilen"}
          </button>
        ))}
      </div>

      {!loaded ? (
        <p style={{ color: "var(--text-soft)" }}>Yükleniyor…</p>
      ) : users.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>Bu listede kullanıcı yok.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {users.map((u) => (
            <div key={u.id} style={{
              display: "flex", alignItems: "center", gap: 12, background: "var(--bg-panel)",
              borderRadius: 12, padding: "10px 12px", flexWrap: "wrap",
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(u.display_name || "?")}`}
                alt="" style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--bg-elevated)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontWeight: 700, color: "var(--text-strong)", fontSize: 14 }}>{u.display_name}</div>
                <a href={`/profil/${u.username}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontSize: 12.5, textDecoration: "none" }}>@{u.username} ↗</a>
              </div>
              {status === "pending" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button disabled={busy === u.id} onClick={() => act(u.id, "approve")} style={{
                    padding: "8px 14px", borderRadius: 10, border: "none", cursor: "pointer",
                    background: "var(--tile-correct)", color: "#fff", fontWeight: 800, fontSize: 13,
                  }}>✅ Onayla</button>
                  <button disabled={busy === u.id} onClick={() => act(u.id, "reject")} style={{
                    padding: "8px 14px", borderRadius: 10, cursor: "pointer",
                    border: "1px solid var(--border-soft)", background: "var(--bg-elevated)",
                    color: "var(--accent-hot)", fontWeight: 700, fontSize: 13,
                  }}>🚫 Reddet</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- 🏠 Ana Sayfa: mod butonlarının ikon + renkleri --------------------
// Renk alanı boşsa buton globals.css'teki varsayılan görünümünü korur
// (1v1 hero butonu ve ikili kartlar varsayılan olarak böyle).
type HomeBtn = {
  key: string; label: string; icon: string; deco_icon: string; bg: string;
  default: { icon: string; deco_icon: string; bg: string };
};

// "linear-gradient(145deg,#aabbcc,#112233)" -> ["#aabbcc", "#112233"]
function gradColors(bg: string): [string, string] {
  const m = (bg || "").match(/#[0-9a-fA-F]{6}/g);
  if (m && m.length >= 2) return [m[0], m[1]];
  if (m && m.length === 1) return [m[0], m[0]];
  return ["#e0940a", "#c47a00"];
}
function makeGradient(a: string, b: string) {
  return `linear-gradient(145deg,${a},${b})`;
}

function HomeButtons() {
  const [items, setItems] = useState<HomeBtn[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState("");
  const [popup, setPopup] = useState("");

  function load() {
    fetch(apiUrl("/api/admin/home-buttons"), { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => { setItems(d.buttons || []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }
  useEffect(load, []);

  function patchLocal(key: string, patch: Partial<HomeBtn>) {
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }

  async function save(key: string, patch: Partial<HomeBtn>) {
    patchLocal(key, patch);
    const r = await fetch(apiUrl(`/api/admin/home-buttons/${key}`), {
      method: "PUT", headers: authHeaders(),
      body: JSON.stringify({ icon: patch.icon, deco_icon: patch.deco_icon, bg: patch.bg }),
    });
    if (!r.ok) { setPopup("Kaydedilemedi."); load(); return; }
    setSaved(key); setTimeout(() => setSaved(""), 1200);
  }

  async function reset(key: string) {
    const r = await fetch(apiUrl(`/api/admin/home-buttons/${key}/reset`), { method: "POST", headers: authHeaders() });
    if (!r.ok) { setPopup("Sıfırlanamadı."); return; }
    const d = await r.json();
    patchLocal(key, { icon: d.button.icon, deco_icon: d.button.deco_icon, bg: d.button.bg });
    setSaved(key); setTimeout(() => setSaved(""), 1200);
  }

  if (!loaded) return <p style={{ color: "var(--text-soft)" }}>Yükleniyor…</p>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {popup && <AlertPopup message={popup} onClose={() => setPopup("")} />}
      <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.6 }}>
        Ana sayfadaki mod butonlarının <strong>sol ikonu</strong>, <strong>arka plan ikonu</strong> ve
        <strong> rengi</strong>. Arka plan ikonu boş bırakılırsa sol ikonun aynısı kullanılır.
        Renk alanı boşsa buton varsayılan tema rengini korur. Değişiklik ana sayfaya en geç 1 dakikada yansır.
      </p>

      {items.map((b) => {
        const [c1, c2] = gradColors(b.bg || b.default.bg);
        const previewBg = b.bg || "var(--bg-elevated)";
        return (
          <div key={b.key} style={{ background: "var(--bg-panel)", borderRadius: 12, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)", flex: 1 }}>{b.label}</span>
              {saved === b.key && <span style={{ color: "var(--tile-correct)", fontSize: 13 }}>✓ kaydedildi</span>}
              <button onClick={() => reset(b.key)} style={miniBtn}>Varsayılana dön</button>
            </div>

            {/* Önizleme — ana sayfadaki kartın küçük hâli */}
            <div style={{
              position: "relative", overflow: "hidden", borderRadius: 14, padding: "12px 14px",
              background: previewBg, border: "1px solid var(--border-soft)", marginBottom: 10,
              display: "flex", alignItems: "center", gap: 10, minHeight: 56,
            }}>
              <span style={{ fontSize: 26, position: "relative", zIndex: 1 }}>{b.icon}</span>
              <span style={{ fontWeight: 800, color: b.bg ? "#fff" : "var(--text-strong)", fontSize: 15, position: "relative", zIndex: 1 }}>
                {b.label}
              </span>
              <span aria-hidden style={{
                position: "absolute", right: -6, top: "50%", fontSize: 64, lineHeight: 1, opacity: .2,
                transform: "translateY(-50%) perspective(420px) rotateY(16deg) rotate(-15deg)",
              }}>{b.deco_icon || b.icon}</span>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <FieldBox label="Sol ikon">
                <input
                  value={b.icon}
                  onChange={(e) => patchLocal(b.key, { icon: e.target.value })}
                  onBlur={(e) => save(b.key, { icon: e.target.value })}
                  maxLength={8}
                  style={{ width: 64, textAlign: "center", padding: "9px 6px", borderRadius: 9, border: "1px solid var(--tile-border)", background: "var(--bg-elevated)", color: "var(--text-strong)", fontSize: 20 }}
                />
              </FieldBox>
              <FieldBox label="Arka plan ikonu">
                <input
                  value={b.deco_icon}
                  onChange={(e) => patchLocal(b.key, { deco_icon: e.target.value })}
                  onBlur={(e) => save(b.key, { deco_icon: e.target.value })}
                  placeholder="="
                  maxLength={8}
                  style={{ width: 64, textAlign: "center", padding: "9px 6px", borderRadius: 9, border: "1px solid var(--tile-border)", background: "var(--bg-elevated)", color: "var(--text-strong)", fontSize: 20 }}
                />
              </FieldBox>
              <FieldBox label="Renk (üst · alt)">
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="color" value={c1}
                    onChange={(e) => save(b.key, { bg: makeGradient(e.target.value, c2) })}
                    style={colorInput} />
                  <input type="color" value={c2}
                    onChange={(e) => save(b.key, { bg: makeGradient(c1, e.target.value) })}
                    style={colorInput} />
                  {b.bg && (
                    <button onClick={() => save(b.key, { bg: "" })} style={miniBtn} title="Rengi kaldır (tema varsayılanı)">
                      temizle
                    </button>
                  )}
                </div>
              </FieldBox>
            </div>

            <input
              value={b.bg}
              onChange={(e) => patchLocal(b.key, { bg: e.target.value })}
              onBlur={(e) => save(b.key, { bg: e.target.value })}
              placeholder="Boş = tema varsayılanı · ör. linear-gradient(145deg,#e0940a,#c47a00)"
              style={{ width: "100%", marginTop: 10, padding: "9px 11px", borderRadius: 9, border: "1px solid var(--tile-border)", background: "var(--bg-elevated)", color: "var(--text-soft)", fontSize: 12.5 }}
            />
          </div>
        );
      })}
    </div>
  );
}

function FieldBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  );
}

const colorInput: React.CSSProperties = {
  width: 44, height: 38, padding: 2, borderRadius: 9,
  border: "1px solid var(--tile-border)", background: "var(--bg-elevated)", cursor: "pointer",
};

// ---- 💬 Sonuç PM: sonuç paylaşım metinleri ------------------------------
// Paylaşım metni = sabit skor satırı + BURADAN rastgele yorum satırı + footer.
type ShareLine = { id: number; text: string; active: boolean };
type ShareGroup = { module: string; variant: string; label: string; lines: ShareLine[] };

function SharePM() {
  const [groups, setGroups] = useState<ShareGroup[]>([]);
  const [footer, setFooter] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});   // yeni satır kutuları
  const [popup, setPopup] = useState("");
  const [saved, setSaved] = useState("");
  const [loaded, setLoaded] = useState(false);

  function load() {
    fetch(apiUrl("/api/admin/share-texts"), { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => { setGroups(d.groups || []); setFooter(d.footer || ""); setLoaded(true); })
      .catch(() => setLoaded(true));
  }
  useEffect(load, []);

  function flash(key: string) { setSaved(key); setTimeout(() => setSaved(""), 1400); }

  async function saveFooter() {
    const r = await fetch(apiUrl("/api/admin/share-texts/footer"), {
      method: "PUT", headers: authHeaders(), body: JSON.stringify({ text: footer }),
    });
    if (!r.ok) { setPopup("Alt bilgi kaydedilemedi."); return; }
    flash("footer");
  }

  async function saveLine(id: number, text: string) {
    const r = await fetch(apiUrl(`/api/admin/share-texts/${id}`), {
      method: "PUT", headers: authHeaders(), body: JSON.stringify({ text }),
    });
    if (!r.ok) { setPopup("Metin kaydedilemedi (boş olamaz)."); load(); return; }
    flash(`l${id}`);
  }

  async function toggleLine(id: number, active: boolean) {
    await fetch(apiUrl(`/api/admin/share-texts/${id}`), {
      method: "PUT", headers: authHeaders(), body: JSON.stringify({ active }),
    }).catch(() => {});
    setGroups((gs) => gs.map((g) => ({ ...g, lines: g.lines.map((l) => (l.id === id ? { ...l, active } : l)) })));
  }

  async function removeLine(id: number) {
    setGroups((gs) => gs.map((g) => ({ ...g, lines: g.lines.filter((l) => l.id !== id) })));
    await fetch(apiUrl(`/api/admin/share-texts/${id}`), { method: "DELETE", headers: authHeaders() }).catch(() => {});
  }

  async function addLine(g: ShareGroup) {
    const key = `${g.module}:${g.variant}`;
    const text = (drafts[key] || "").trim();
    if (!text) return;
    const r = await fetch(apiUrl("/api/admin/share-texts"), {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ module: g.module, variant: g.variant, text }),
    });
    if (!r.ok) { setPopup("Satır eklenemedi."); return; }
    const d = await r.json();
    setDrafts((x) => ({ ...x, [key]: "" }));
    setGroups((gs) => gs.map((x) => (x.module === g.module && x.variant === g.variant
      ? { ...x, lines: [...x.lines, d.line] } : x)));
  }

  if (!loaded) return <p style={{ color: "var(--text-soft)" }}>Yükleniyor…</p>;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {popup && <AlertPopup message={popup} onClose={() => setPopup("")} />}
      <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.6 }}>
        Paylaşım metni üç parçadır: <strong>sabit skor satırı</strong> (kod üretir, ör. "🏆 Nazım, Ahmet'i 200-0 yendi!")
        + <strong>buradan rastgele seçilen yorum satırı</strong> + <strong>alt bilgi</strong>.
        Her gruba istediğin kadar satır ekleyebilirsin; pasif yaptığın satır seçilmez.
      </p>

      {/* Alt bilgi — tüm paylaşımların son satırı */}
      <div style={{ background: "var(--bg-panel)", borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)", marginBottom: 8 }}>
          Alt bilgi (tüm paylaşımların son satırı)
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            placeholder="🎯 Kelime Tahmin — Türkçe kelime oyunu"
            style={{ flex: "1 1 240px", minWidth: 0, padding: "10px 12px", borderRadius: 9, border: "1px solid var(--tile-border)", background: "var(--bg-elevated)", color: "var(--text-strong)", fontSize: 14 }}
          />
          <button onClick={saveFooter} style={smallSaveBtn}>
            {saved === "footer" ? "✓" : "Kaydet"}
          </button>
        </div>
      </div>

      {groups.map((g) => {
        const key = `${g.module}:${g.variant}`;
        return (
          <div key={key} style={{ background: "var(--bg-panel)", borderRadius: 12, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)", flex: 1 }}>{g.label}</span>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{g.lines.length} satır</span>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {g.lines.map((l) => (
                <div key={l.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    defaultValue={l.text}
                    onBlur={(e) => { if (e.target.value.trim() !== l.text) saveLine(l.id, e.target.value); }}
                    style={{
                      flex: "1 1 220px", minWidth: 0, padding: "9px 11px", borderRadius: 9,
                      border: "1px solid var(--tile-border)", background: "var(--bg-elevated)",
                      color: l.active ? "var(--text-strong)" : "var(--text-dim)", fontSize: 14,
                      opacity: l.active ? 1 : 0.6,
                    }}
                  />
                  {saved === `l${l.id}` && <span style={{ color: "var(--tile-correct)", fontSize: 13 }}>✓</span>}
                  <button onClick={() => toggleLine(l.id, !l.active)} title={l.active ? "Pasifleştir" : "Aktifleştir"}
                    style={{ ...miniBtn, color: l.active ? "var(--tile-correct)" : "var(--text-dim)" }}>
                    {l.active ? "Aktif" : "Pasif"}
                  </button>
                  <button onClick={() => removeLine(l.id)} title="Sil"
                    style={{ ...miniBtn, color: "var(--accent-hot)" }}>Sil</button>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <input
                value={drafts[key] || ""}
                onChange={(e) => setDrafts((x) => ({ ...x, [key]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") addLine(g); }}
                placeholder="Yeni cümle ekle…"
                style={{ flex: "1 1 220px", minWidth: 0, padding: "9px 11px", borderRadius: 9, border: "1px dashed var(--tile-border)", background: "transparent", color: "var(--text-strong)", fontSize: 14 }}
              />
              <button onClick={() => addLine(g)} style={smallSaveBtn}>+ Ekle</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const smallSaveBtn: React.CSSProperties = {
  padding: "9px 16px", borderRadius: 9, border: "none", background: "var(--accent)",
  color: "#1a1330", fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0,
};
const miniBtn: React.CSSProperties = {
  padding: "7px 11px", borderRadius: 8, border: "1px solid var(--border-soft)",
  background: "var(--bg-elevated)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0,
};

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
    solo_level: "Maraton Bölüm Geçme", daily_solved: "Günün Kelimesi",
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
  { key: "solo", label: "🏃 Maraton müziği" },
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

// "list"  -> tek satır, virgülle ayrılmış dizi
// "lines" -> çok satırlı kutu, HER SATIR bir dizi elemanı (yol listeleri için)
// "textbox" -> çok satırlı kutu ama değer DÜZ METİN ("lines" gibi diziye çevrilmez)
type MobileField = {
  path: string;
  label: string;
  type?: "text" | "bool" | "list" | "lines" | "number" | "textbox";
  hint?: string;
  /** Bu yoldaki değer true DEĞİLSE alan gizlenir (ör. uyarı kutucuğuna bağlı alanlar). */
  showIf?: string;
};

const MOBILE_FIELDS: Record<string, MobileField[]> = {
  "ads.adsense": [
    { path: "enabled", label: "AdSense reklamları açık", type: "bool" },
    { path: "client", label: "Yayıncı kimliği", hint: "ca-pub-0000000000000000" },
    { path: "slots.header", label: "Slot — üst (header)" },
    { path: "slots.in_content", label: "Slot — içerik arası" },
    { path: "slots.footer", label: "Slot — alt (footer)" },
  ],
  "ads.admob": [
    { path: "enabled", label: "AdMob reklamları açık (ana anahtar)", type: "bool" },
    { path: "banner_enabled", label: "Banner (alt bant) gösterilsin", type: "bool" },
    { path: "interstitial_enabled", label: "Geçiş (interstitial) reklamı açık", type: "bool" },
    { path: "test_mode", label: "Test modu (gerçek reklam gösterilmez)", type: "bool" },
    { path: "android.app_id", label: "Android — uygulama kimliği" },
    { path: "android.banner", label: "Android — banner birimi" },
    { path: "android.interstitial", label: "Android — geçiş (interstitial) birimi" },
    { path: "ios.app_id", label: "iOS — uygulama kimliği" },
    { path: "ios.banner", label: "iOS — banner birimi" },
    { path: "ios.interstitial", label: "iOS — geçiş (interstitial) birimi" },
    {
      path: "banner_hidden_paths",
      label: "Banner'ın GİZLENECEĞİ sayfalar (her satıra bir yol)",
      type: "lines",
      hint: "VARSAYILAN BOŞ: oyun ekranlarında bant artık gizlenmiyor, dipteki "
        + "elemanlar (ör. arena oyuncu şeridi) bandın üstüne çekiliyor. Yine de "
        + "gizlemek istediğin sayfa olursa yolunu buraya yaz (örn. /arena)",
    },
    {
      path: "banner_margin_extra",
      label: "Alt bar kaldırma — ek boşluk (px)",
      type: "number",
      hint: "Bant ekranın dibinde SABİT durur; oynayan şey alt bardır. 0 = dokunma. Bar, bant + güvenli alan + bu değer kadar yukarı kalkar (eksi değer aşağı indirir)",
    },
    {
      path: "banner_margin_override",
      label: "Alt bar kaldırma — sabit değer (px)",
      type: "number",
      hint: "0 = kapalı. 0'dan büyükse hesaplama YOK SAYILIR, alt bar tam bu yüksekliğe konur",
    },
    {
      path: "banner_game_offset_extra",
      label: "Oyun ekranı — ek pay (px)",
      type: "number",
      hint: "Oyun ekranlarında (arena, 1v1, özel oda, maraton, günün kelimesi) alt bar "
        + "yoktur; banda değen şey sayfanın kendi dip elemanlarıdır (ör. arena oyuncu "
        + "şeridi). Bunlar bant + güvenli alan kadar yukarı çekilir; bu değer O PAYA "
        + "eklenir. 0 = dokunma, eksi değer aşağı indirir. Alt barı ETKİLEMEZ",
    },
    {
      path: "interstitial_every_n_matches",
      label: "Geçiş reklamı — her kaç maçta bir",
      type: "number",
      hint: "Maç = bir OTURUM (3 turluk oda 1 sayılır, turlar ayrı sayılmaz). 0 = geçiş reklamı kapalı",
    },
    {
      path: "interstitial_min_seconds",
      label: "Geçiş reklamı — iki reklam arası en az saniye",
      type: "number",
      hint: "Koşul tutsa bile son reklamdan bu kadar saniye geçmeden yenisi gösterilmez (0 = sınır yok)",
    },
    {
      path: "interstitial_skip_first_n",
      label: "Geçiş reklamı — ilk kaç maç reklamsız",
      type: "number",
      hint: "Yeni kullanıcının ilk N maçında hiç reklam çıkmaz. Sayaç CİHAZ bazlıdır (misafir dahil)",
    },
    {
      path: "interstitial_modes.gunun_kelimesi",
      label: "Geçiş reklamı — Günün Kelimesi",
      type: "bool",
      hint: "Sonuç ekranından ana sayfaya çıkarken",
    },
    {
      path: "interstitial_modes.maraton",
      label: "Geçiş reklamı — Maraton",
      type: "bool",
      hint: "Bölüm bitip 'Haritaya Dön' ile çıkarken (Sonraki Bölüm'de ASLA)",
    },
    {
      path: "interstitial_modes.pratik",
      label: "Geçiş reklamı — 1vB Pratik",
      type: "bool",
      hint: "Bota karşı maç sonunda ana sayfaya/lige çıkarken (Rövanş'ta ASLA)",
    },
    {
      path: "interstitial_modes.duello",
      label: "Geçiş reklamı — 1v1 Düello",
      type: "bool",
      hint: "Maç sonunda ana sayfaya/lige çıkarken (Rövanş ve Yeni Rakip'te ASLA — rakip bekliyor olabilir)",
    },
    {
      path: "interstitial_modes.arena",
      label: "Geçiş reklamı — Arena",
      type: "bool",
      hint: "Sonuç ekranından ana sayfaya çıkarken (sorular arası tabloda ve 'Tekrar Arena'ya Gir'de ASLA)",
    },
    {
      path: "interstitial_modes.oda",
      label: "Geçiş reklamı — Özel Oda",
      type: "bool",
      hint: "2 ve 3-4 kişilik özel oda; TÜM turlar bitince ana sayfaya çıkarken (tur aralarında ASLA)",
    },
    {
      path: "interstitial_modes.ozel_arena",
      label: "Geçiş reklamı — Özel Arena",
      type: "bool",
      hint: "VARSAYILAN KAPALI: ödül vermeyen, arkadaşlarla oynanan mod. İstersen aç",
    },
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
  "app.flags": [
    {
      path: "challenge_ttl_seconds",
      label: "Maç teklifi geçerlilik süresi (saniye)",
      type: "number",
      hint: "varsayılan 120 — 10 ile 900 arası",
    },
  ],
  "app.mic": [
    {
      path: "web_enabled",
      label: "Web'de sesli tahmin (tarayıcı)",
      type: "bool",
      hint: "Kapatırsan uygulamadaki mikrofon da kapanır (uygulama web'e bağımlıdır).",
    },
    {
      path: "app_enabled",
      label: "Uygulamada sesli tahmin (Android / iOS)",
      type: "bool",
      hint: "Açmak için web'deki de açık olmalı — işaretlersen web otomatik açılır.",
    },
    {
      path: "notice_enabled",
      label: "Uyarı balonu göster (mikrofon ilk kullanıldığında)",
      type: "bool",
      hint: "Kullanıcı mikrofona ilk bastığında kısa bir bilgi notu çıkar.",
    },
    {
      path: "notice_text",
      label: "Uyarı metni",
      type: "textbox",
      showIf: "notice_enabled",
      hint: "Boş bırakırsan balon gösterilmez.",
    },
    {
      path: "notice_times",
      label: "Uyarı kaç kez gösterilsin",
      type: "number",
      showIf: "notice_enabled",
      hint: "varsayılan 2 — cihaz başına sayılır (0 = hiç gösterme)",
    },
    {
      path: "notice_seconds",
      label: "Uyarı kaç saniye dursun",
      type: "number",
      showIf: "notice_enabled",
      hint: "varsayılan 5 — 1 ile 30 arası",
    },
  ],
};

/**
 * Mikrofon bağımlılık kuralı (sunucuda da uygulanır — app_settings.py):
 *   uygulama açık  -> web de açık OLMALI
 *   web kapatılır  -> uygulama da kapanır
 * Geçerli durumlar: ikisi kapalı / yalnız web / ikisi açık. "Yalnız uygulama" YOK.
 * Bu fonksiyon bir kutu değişince uygulanacak (yol, değer) çiftlerini döner.
 */
function micRulePatches(path: string, checked: boolean): Array<[string, boolean]> {
  if (path === "app_enabled" && checked) {
    return [["app_enabled", true], ["web_enabled", true]];
  }
  if (path === "web_enabled" && !checked) {
    return [["web_enabled", false], ["app_enabled", false]];
  }
  return [[path, checked]];
}

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
            if (f.type !== "list" && f.type !== "lines") continue;
            const v = mobileGet(r.value, f.path);
            const sep = f.type === "lines" ? "\n" : ", ";
            texts[`${r.key}:${f.path}`] = Array.isArray(v) ? v.join(sep) : "";
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
      if (f.type !== "list" && f.type !== "lines") continue;
      const raw = listText[`${row.key}:${f.path}`] ?? "";
      const parts = f.type === "lines" ? raw.split("\n") : raw.split(",");
      value = mobileSet(value, f.path, parts.map((s) => s.trim()).filter(Boolean));
    }
    const res = await fetch(apiUrl(`/api/admin/app-settings/${row.key}`), {
      method: "PUT", headers: authHeaders(), body: JSON.stringify({ value }),
    }).catch(() => null);
    if (!res || !res.ok) {
      // Sunucunun kuralı reddettiği durumlar için gerçek mesajı göster
      // (ör. mikrofon bağımlılık kuralı → 400).
      const detail = res ? await res.json().then((d: any) => d?.detail).catch(() => null) : null;
      setMsg(typeof detail === "string" && detail ? detail : "Kaydedilemedi.");
      return;
    }
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
        • AdMob&apos;da <b>Test modu</b> açıkken gerçek reklam gösterilmez.<br />
        • Banner ile geçiş reklamı ayrı anahtarlarda: banner&apos;ı kapatmak geçiş reklamını etkilemez.<br />
        • <b>Gizlenecek sayfalar</b>: her satıra bir yol. Alt yollar da kapsanır
        (<span className="brand-mono">/arena</span> yazmak <span className="brand-mono">/arena/ozel/ABC</span>&apos;yi de kapsar).
        Liste artık <b>varsayılan olarak boştur</b>: oyun ekranlarında bant gizlenmiyor,
        onun yerine dipteki elemanlar (ör. arena oyuncu şeridi) bandın üstüne çekiliyor.
        İnce ayarı <b>Oyun ekranı — ek pay</b> alanından yaparsın.<br />
        • <b>🎤 Mikrofon (sesli tahmin)</b> kartı: iki kutu birbirine bağlıdır —
        uygulamayı açmak web&apos;i de açar, web&apos;i kapatmak uygulamayı da kapatır.
        Geçerli durumlar: <b>ikisi kapalı</b>, <b>yalnız web</b>, <b>ikisi açık</b>;
        &quot;yalnız uygulama&quot; yoktur (uygulama sitenin aynı kodunu çalıştırır).
        Kapalıyken mikrofon düğmesi ve ipucu hiç görünmez. Cihazda tanıma servisi
        yoksa kutu açık olsa bile düğme çıkmaz.<br />
        • <b>Uyarı balonu</b>: mikrofon ilk kullanıldığında çıkan bilgi notu. Kaç kez
        görüneceği <b>cihaz başına</b> sayılır (tarayıcı hafızası); süre dolunca
        kendiliğinden kapanır. Balon tıklamayı engellemez — kullanıcı mikrofona basılı
        tutmayı sürdürebilir.<br />
        • <b>Bant konumu</b>: uygulama bandı alt menünün üstüne kendi hesabıyla yerleştirir.
        <b> Sabit değer</b> 0&apos;dan büyükse hesaplama devre dışı kalır ve bant tam o yüksekliğe konur;
        0 ise <b>ek boşluk</b> hesaplanan değere eklenir. Değişiklik uygulamada bandın
        yeniden kurulmasıyla (uygulamayı kapat–aç) geçerli olur.
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
            // Bağlı alan: kutucuk işaretli değilse hiç çizme.
            if (f.showIf && mobileGet(row.value, f.showIf) !== true) return null;
            if (f.type === "textbox") {
              return (
                <div key={f.path} style={{ display: "grid", gap: 4, marginLeft: 24 }}>
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{f.label}</span>
                  <textarea
                    value={typeof val === "string" ? val : ""}
                    rows={3}
                    onChange={(e) => patch(row.key, f.path, e.target.value)}
                    style={{ ...seoInput, minHeight: 70, resize: "vertical" }}
                  />
                  {f.hint && (
                    <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{f.hint}</span>
                  )}
                </div>
              );
            }
            if (f.type === "bool") {
              const isMic = row.key === "app.mic";
              return (
                <div key={f.path} style={{ display: "grid", gap: 2 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-strong)", cursor: "pointer" }}>
                    <input type="checkbox" checked={val === true}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        // Mikrofon kutuları birbirine bağlı — kural micRulePatches'te.
                        if (isMic) {
                          for (const [p, v] of micRulePatches(f.path, checked)) patch(row.key, p, v);
                        } else {
                          patch(row.key, f.path, checked);
                        }
                      }}
                      style={{ width: 16, height: 16, accentColor: "var(--accent)" }} />
                    {f.label}
                  </label>
                  {f.hint && (
                    <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 24 }}>{f.hint}</span>
                  )}
                </div>
              );
            }
            if (f.type === "number") {
              return (
                <div key={f.path} style={{ display: "grid", gap: 4, marginLeft: f.showIf ? 24 : 0 }}>
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{f.label}</span>
                  <input
                    type="number"
                    value={typeof val === "number" ? String(val) : ""}
                    placeholder={f.hint || ""}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      patch(row.key, f.path, Number.isFinite(n) ? n : "");
                    }}
                    style={{ ...seoInput, maxWidth: 200 }}
                  />
                  {/* Sayı alanlarında ipucu AYRI SATIR: placeholder yalnız kutu
                      boşken görünür, bu alanların değeri ise (0 dahil) hep dolu. */}
                  {f.hint && (
                    <span style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.6 }}>{f.hint}</span>
                  )}
                </div>
              );
            }
            if (f.type === "lines") {
              return (
                <div key={f.path} style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{f.label}</span>
                  <textarea
                    value={listText[`${row.key}:${f.path}`] ?? ""}
                    placeholder={f.hint || ""}
                    rows={6}
                    spellCheck={false}
                    onChange={(e) => setListText((t) => ({ ...t, [`${row.key}:${f.path}`]: e.target.value }))}
                    style={{ ...seoInput, minHeight: 120, resize: "vertical", fontFamily: "ui-monospace, monospace" }}
                  />
                </div>
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
        <PushTestButton />
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

function Announcements() {
  type A = {
    id: number; slug: string; title: string; summary: string; body: string;
    is_published: boolean; published_at: string | null;
    notify_sent_at: string | null; notify_recipient_count: number | null;
    created_at: string | null; updated_at: string | null;
  };
  const [items, setItems] = useState<A[]>([]);
  const [recipients, setRecipients] = useState(0);
  const [editing, setEditing] = useState<A | null>(null);
  const [form, setForm] = useState({ title: "", summary: "", body: "", is_published: false });
  const [saved, setSaved] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    fetch(apiUrl("/api/admin/announcements"), { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => { setItems(d.announcements || []); setRecipients(d.recipient_estimate || 0); })
      .catch(() => {});
  }
  useEffect(() => { load(); }, []);

  function startNew() {
    setEditing(null);
    setForm({ title: "", summary: "", body: "", is_published: false });
  }
  function startEdit(a: A) {
    setEditing(a);
    setForm({ title: a.title, summary: a.summary || "", body: a.body || "", is_published: a.is_published });
  }

  async function save() {
    if (!form.title.trim()) return;
    setBusy(true);
    const url = editing ? `/api/admin/announcements/${editing.id}` : "/api/admin/announcements";
    await fetch(apiUrl(url), {
      method: editing ? "PUT" : "POST", headers: authHeaders(), body: JSON.stringify(form),
    }).catch(() => {});
    setBusy(false);
    startNew();
    load();
  }

  async function remove(a: A) {
    if (!confirm(`"${a.title}" duyurusu silinsin mi? Bu işlem geri alınamaz.`)) return;
    await fetch(apiUrl(`/api/admin/announcements/${a.id}`), { method: "DELETE", headers: authHeaders() }).catch(() => {});
    if (editing?.id === a.id) startNew();
    load();
  }

  async function notify(a: A) {
    const ok = confirm(
      `"${a.title}" duyurusu ${recipients} kullanıcıya bildirim olarak gönderilecek.\n\n` +
      `Bu işlem SADECE BİR KEZ yapılabilir ve geri alınamaz. Devam edilsin mi?`
    );
    if (!ok) return;
    setBusy(true);
    const r = await fetch(apiUrl(`/api/admin/announcements/${a.id}/notify`), {
      method: "POST", headers: authHeaders(),
    }).catch(() => null);
    setBusy(false);
    if (r && r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(`Gönderim başladı: ${d.recipient_count ?? recipients} kullanıcı.`);
    } else {
      const d = r ? await r.json().catch(() => ({})) : {};
      alert(d?.detail || "Gönderilemedi.");
    }
    setSaved(a.id); setTimeout(() => setSaved(null), 1500);
    load();
  }

  // Gönder butonunun durumu — neden kapalı olduğunu etikete yazıyoruz.
  function notifyState(a: A): { label: string; disabled: boolean; title: string } {
    if (a.notify_sent_at) {
      const n = a.notify_recipient_count;
      return {
        label: `✓ Gönderildi${n != null ? ` (${n})` : ""}`,
        disabled: true,
        title: `Bildirim ${new Date(a.notify_sent_at).toLocaleString("tr-TR")} tarihinde gönderildi. Bir duyuru için yalnızca bir kez gönderilir.`,
      };
    }
    if (!a.is_published) {
      return { label: "🔒 Önce yayına al", disabled: true, title: "Bildirim göndermek için duyuru yayında olmalı." };
    }
    return { label: "🔔 Bildirim Gönder", disabled: false, title: `${recipients} kullanıcıya gönderilir.` };
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>{editing ? "✏️ Duyuruyu Düzenle" : "➕ Yeni Duyuru"}</h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 12, lineHeight: 1.5 }}>
          Gövde <strong>düz metin</strong>dir: satır sonları korunur, çıplak bağlantılar tıklanabilir olur.
          HTML çalışmaz. Bağlantı adresi (slug) başlıktan üretilir.
        </p>
        <div style={{ display: "grid", gap: 8, background: "var(--bg-panel)", padding: 14, borderRadius: 12 }}>
          <input value={form.title} placeholder="Başlık"
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-elevated)", color: "var(--text-strong)", fontWeight: 600, fontSize: 15 }} />
          <input value={form.summary} placeholder="Özet (liste ve bildirimde görünür, en fazla 300 karakter)"
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
            style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-elevated)", color: "var(--text-soft)", fontSize: 14 }} />
          <textarea value={form.body} placeholder="Duyuru metni (düz metin)" rows={8}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-elevated)", color: "var(--text-strong)", fontSize: 14, fontFamily: "var(--font-body)", lineHeight: 1.6, resize: "vertical" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Check label="Yayında" on={form.is_published} onChange={(v) => setForm({ ...form, is_published: v })} />
            <span style={{ flex: 1 }} />
            {editing && (
              <button onClick={startNew} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "transparent", color: "var(--text-soft)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                Vazgeç
              </button>
            )}
            <button onClick={save} disabled={busy || !form.title.trim()} style={{
              padding: "8px 18px", borderRadius: 8, border: "none",
              background: "var(--accent)", color: "#1a1330", fontWeight: 700, fontSize: 13,
              cursor: busy || !form.title.trim() ? "default" : "pointer",
              opacity: busy || !form.title.trim() ? 0.5 : 1,
            }}>{editing ? "Kaydet" : "Oluştur"}</button>
          </div>
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>📢 Tüm Duyurular</h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 12 }}>
          Bildirim gönderimi uygulama içi bildirim oluşturur (push değil) ve duyuru başına yalnızca bir kez yapılabilir.
          Şu an <strong>{recipients}</strong> kullanıcı alıcı durumunda.
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          {items.length === 0 && (
            <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Henüz duyuru yok.</p>
          )}
          {items.map((a) => {
            const ns = notifyState(a);
            return (
              <div key={a.id} style={{
                padding: "10px 12px", background: "var(--bg-panel)", borderRadius: 10,
                display: "grid", gap: 8, opacity: a.is_published ? 1 : 0.7,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
                    background: a.is_published ? "rgba(58,167,109,.18)" : "var(--bg-elevated)",
                    color: a.is_published ? "var(--tile-correct)" : "var(--text-dim)",
                  }}>{a.is_published ? "YAYINDA" : "TASLAK"}</span>
                  <span style={{ flex: "1 1 160px", minWidth: 120, fontWeight: 600, color: "var(--text-strong)" }}>{a.title}</span>
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>/duyurular/{a.slug}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <a href={`/duyurular/${a.slug}`} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 13, color: "var(--text-soft)", textDecoration: "none", padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border-soft)" }}>
                    👁️ Gör
                  </a>
                  <button onClick={() => startEdit(a)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-elevated)", color: "var(--text-strong)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                    ✏️ Düzenle
                  </button>
                  <button onClick={() => notify(a)} disabled={ns.disabled || busy} title={ns.title} style={{
                    padding: "6px 12px", borderRadius: 8,
                    background: ns.disabled ? "var(--bg-elevated)" : (saved === a.id ? "var(--tile-correct)" : "var(--accent)"),
                    color: ns.disabled ? "var(--text-dim)" : (saved === a.id ? "#fff" : "#1a1330"),
                    fontWeight: 700, fontSize: 13,
                    cursor: ns.disabled || busy ? "default" : "pointer",
                    border: ns.disabled ? "1px solid var(--border-soft)" : "none",
                  }}>{ns.label}</button>
                  <span style={{ flex: 1 }} />
                  <button onClick={() => remove(a)} title="Sil" style={{ padding: "6px 8px", borderRadius: 8, border: "none", background: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 15 }}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Push kurulumunu doğrulamak için: yalnızca ADMİNİN KENDİ cihazlarına test gönderir. */
function PushTestButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function send() {
    setBusy(true); setResult(null);
    try {
      const r = await fetch(apiUrl("/api/admin/push/test"), { method: "POST", headers: authHeaders() });
      const d = await r.json();
      if (!d.configured) {
        setOk(false);
        setResult("Firebase anahtarı yok: sunucuda FIREBASE_CREDENTIALS_B64 tanımlı değil veya geçersiz.");
      } else if (d.skipped === "no_device") {
        setOk(false);
        setResult("Kayıtlı cihazın yok. Önce /ayarlar/bildirimler sayfasından bu tarayıcıya izin ver.");
      } else if (d.sent > 0) {
        setOk(true);
        setResult(`Gönderildi: ${d.sent}/${d.devices} cihaz.` + (d.failed ? ` ${d.failed} başarısız.` : ""));
      } else {
        setOk(false);
        setResult(`Gönderilemedi (${d.devices} cihaz denendi). ${(d.errors || []).join(" | ") || d.error || ""}`);
      }
    } catch {
      setOk(false); setResult("İstek başarısız.");
    }
    setBusy(false);
  }

  return (
    <div style={{ marginTop: 6, marginBottom: 8 }}>
      <button onClick={send} disabled={busy} style={{
        padding: "9px 16px", borderRadius: 9, border: "none",
        background: "var(--accent)", color: "#1a1330", fontWeight: 700, fontSize: 13,
        cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
      }}>{busy ? "Gönderiliyor…" : "🔔 Kendime test bildirimi gönder"}</button>
      {result && (
        <div style={{
          marginTop: 8, fontSize: 13, lineHeight: 1.45,
          color: ok ? "var(--tile-correct)" : "var(--accent-hot)",
        }}>{result}</div>
      )}
    </div>
  );
}
