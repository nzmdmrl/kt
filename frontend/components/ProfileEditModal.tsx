"use client";

import { useState, useEffect } from "react";
import { apiUrl } from "@/lib/api";

// Profil düzenleme modalı: username/email/şifre değiştir + gizlilik ayarları.
export default function ProfileEditModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");

  function token() { return typeof window !== "undefined" ? localStorage.getItem("kt_token") : null; }
  function headers() { return { "Content-Type": "application/json", Authorization: `Bearer ${token()}` }; }

  useEffect(() => {
    fetch(apiUrl("/api/account/me"), { headers: headers() })
      .then((r) => r.json())
      .then((d) => { setData(d); setUsername(d.username || ""); setEmail(d.email || ""); })
      .catch(() => setErr("Bilgiler yüklenemedi"));
  }, []);

  function flash(m: string, isErr = false) {
    if (isErr) { setErr(m); setMsg(""); } else { setMsg(m); setErr(""); }
    setTimeout(() => { setMsg(""); setErr(""); }, 3000);
  }

  async function post(path: string, body: any, okMsg: string) {
    try {
      const r = await fetch(apiUrl(path), { method: "POST", headers: headers(), body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { flash(j.detail || "Hata", true); return false; }
      flash(okMsg);
      return true;
    } catch { flash("Bağlantı hatası", true); return false; }
  }

  async function togglePrivacy(field: string, value: boolean) {
    const ok = await post("/api/account/privacy", { [field]: value }, "Ayar kaydedildi");
    if (ok) setData((d: any) => ({ ...d, [field]: value }));
  }

  if (!data) {
    return (
      <Overlay onClose={onClose}>
        <div style={{ color: "var(--text-soft)", padding: 20 }}>Yükleniyor…</div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 className="brand-mono" style={{ fontSize: 20, margin: 0 }}>Profili Düzenle</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: 22, cursor: "pointer" }}>×</button>
      </div>

      {msg && <div style={notice("var(--tile-correct)")}>{msg}</div>}
      {err && <div style={notice("var(--accent-hot)")}>{err}</div>}

      {/* Avatar galerisi */}
      <Section title="Profil Fotoğrafı">
        <AvatarPicker
          current={data.avatar_url}
          onPick={async (url) => {
            const ok = await post("/api/account/avatar", { avatar_url: url }, "Avatar güncellendi");
            if (ok) setData((d: any) => ({ ...d, avatar_url: url }));
          }}
        />
      </Section>

      {/* Gizlilik */}
      <Section title="Gizlilik">
        <Toggle
          label="Online durumumu göster"
          value={data.show_online}
          onChange={(v) => togglePrivacy("show_online", v)}
        />
        <Toggle
          label="Maç tekliflerine açığım"
          value={data.allow_challenges}
          onChange={(v) => togglePrivacy("allow_challenges", v)}
        />
      </Section>

      {/* Kullanıcı adı */}
      <Section title="Kullanıcı Adı">
        <div style={{ display: "flex", gap: 8 }}>
          <input value={username} onChange={(e) => setUsername(e.target.value)} style={input} />
          <button onClick={() => post("/api/account/username", { username }, "Kullanıcı adı güncellendi")} style={btn}>Kaydet</button>
        </div>
      </Section>

      {/* E-posta */}
      <Section title="E-posta">
        <div style={{ display: "flex", gap: 8 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" style={input} />
          <button onClick={() => post("/api/account/email", { email }, "E-posta güncellendi")} style={btn}>Kaydet</button>
        </div>
      </Section>

      {/* Şifre */}
      <Section title="Şifre Değiştir">
        {data.has_password && (
          <input value={curPw} onChange={(e) => setCurPw(e.target.value)} type="password" placeholder="Mevcut şifre" style={{ ...input, marginBottom: 8 }} />
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <input value={newPw} onChange={(e) => setNewPw(e.target.value)} type="password" placeholder="Yeni şifre" style={input} />
          <button
            onClick={async () => {
              const ok = await post("/api/account/password", { current_password: curPw, new_password: newPw }, "Şifre güncellendi");
              if (ok) { setCurPw(""); setNewPw(""); }
            }}
            style={btn}
          >Kaydet</button>
        </div>
      </Section>
    </Overlay>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 200,
        display: "grid", placeItems: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-panel)", borderRadius: 16, padding: 22,
          width: "min(460px, 100%)", maxHeight: "90vh", overflowY: "auto",
          border: "1px solid var(--border-soft)", boxShadow: "var(--shadow-soft)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// DiceBear avatar galerisi — rastgele üretilir, "yenile" ile yeni seçenekler gelir.
const AVATAR_STYLES = ["thumbs", "bottts", "fun-emoji", "adventurer", "big-smile", "avataaars", "micah", "notionists", "lorelei", "personas"];

function randomAvatars(count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const style = AVATAR_STYLES[Math.floor(Math.random() * AVATAR_STYLES.length)];
    // Rastgele tohum (harf+rakam).
    const seed = Math.random().toString(36).slice(2, 10);
    out.push(`https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`);
  }
  return out;
}

function AvatarPicker({ current, onPick }: { current?: string | null; onPick: (url: string) => void }) {
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    // İlk açılışta üret; mevcut avatar varsa onu da başa ekle.
    const gen = randomAvatars(17);
    setOptions(current ? [current, ...gen] : randomAvatars(18));
  }, []);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 10 }}>
        {options.map((url, i) => {
          const selected = current === url;
          return (
            <button
              key={url + i}
              onClick={() => onPick(url)}
              style={{
                padding: 0, borderRadius: 10, cursor: "pointer", overflow: "hidden",
                border: selected ? "2px solid var(--accent)" : "2px solid var(--border-soft)",
                background: "var(--bg-elevated)", aspectRatio: "1", lineHeight: 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </button>
          );
        })}
      </div>
      <button
        onClick={() => setOptions(randomAvatars(18))}
        style={{
          width: "100%", padding: "10px", borderRadius: 9, cursor: "pointer",
          border: "1px solid var(--border-soft)", background: "var(--bg-elevated)",
          color: "var(--text-strong)", fontSize: 14, fontWeight: 600,
        }}
      >
        🎲 Yeni Seçenekler Üret
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-soft)", marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
      <span style={{ fontSize: 14, color: "var(--text-strong)" }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
          position: "relative", background: value ? "var(--accent)" : "var(--bg-elevated)", transition: "background .2s", flexShrink: 0,
        }}
      >
        <span style={{ position: "absolute", top: 3, left: value ? 25 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
      </button>
    </div>
  );
}

const input: React.CSSProperties = {
  flex: 1, padding: "10px 12px", borderRadius: 9, border: "1px solid var(--tile-border)",
  background: "var(--bg-elevated)", color: "var(--text-strong)", fontSize: 14, minWidth: 0,
};
const btn: React.CSSProperties = {
  padding: "10px 16px", borderRadius: 9, border: "none", background: "var(--accent)",
  color: "#1a1330", fontWeight: 700, fontSize: 14, cursor: "pointer", flexShrink: 0,
};
const notice = (color: string): React.CSSProperties => ({
  background: "var(--bg-elevated)", border: `1px solid ${color}`, color,
  borderRadius: 9, padding: "8px 12px", fontSize: 13, marginBottom: 12,
});
