"use client";

/**
 * Üye Ara — kullanıcı adına göre üye arama + arkadaş ekleme.
 *
 * TÜM ÜYELER LİSTELENMEZ: en az 2 harf yazılmadan istek bile gitmez, sonuç
 * listesi boş kalır. (Sunucu da aynı alt sınırı uygular — profile.py.)
 *
 * Arama giriş GEREKTİRMEZ; arkadaş ekleme gerektirir. Misafir arayabilir ama
 * düğme yerine "Giriş yap" bağlantısı görür.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/Logo";

const MIN_CHARS = 2;
/** Her tuşta istek atmamak için bekleme (ms). */
const DEBOUNCE_MS = 300;

type FriendStatus = "none" | "friends" | "request_sent" | "request_received" | "self";

type Row = {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  level?: number | null;
  friend_status: FriendStatus;
};

export default function UyeAraPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState("");

  /** Yavaş dönen eski isteğin yeni sonucu ezmesini engeller. */
  const reqId = useRef(0);

  const search = useCallback(async (term: string) => {
    const mine = ++reqId.current;
    if (term.trim().length < MIN_CHARS) {
      setRows([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    setErr("");
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("kt_token") : null;
      const r = await fetch(
        apiUrl(`/api/profile/search?q=${encodeURIComponent(term.trim())}`),
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined, cache: "no-store" }
      );
      if (!r.ok) throw new Error();
      const d = await r.json();
      if (mine !== reqId.current) return;   // daha yeni bir arama var
      setRows(Array.isArray(d.users) ? d.users : []);
      setSearched(true);
    } catch {
      if (mine !== reqId.current) return;
      setErr("Arama yapılamadı, tekrar dene.");
      setRows([]);
      setSearched(true);
    } finally {
      if (mine === reqId.current) setSearching(false);
    }
  }, []);

  // Yazmayı bırakınca ara.
  useEffect(() => {
    const t = setTimeout(() => void search(q), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, search]);

  async function addFriend(row: Row) {
    if (!user || busy) return;
    setBusy(row.id);
    // İyimser güncelleme: düğme hemen değişsin, hata olursa geri alınır.
    setRows((rs) => rs.map((x) => (x.id === row.id ? { ...x, friend_status: "request_sent" } : x)));
    try {
      const token = localStorage.getItem("kt_token");
      const r = await fetch(apiUrl(`/api/friends/request/${row.id}`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error();
    } catch {
      setRows((rs) => rs.map((x) => (x.id === row.id ? { ...x, friend_status: row.friend_status } : x)));
      setErr("İstek gönderilemedi, tekrar dene.");
    } finally {
      setBusy(null);
    }
  }

  const tooShort = q.trim().length > 0 && q.trim().length < MIN_CHARS;

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "20px 14px 40px" }}>
      <div className="kt-mobile-only" style={{ marginBottom: 16 }}><a href="/"><Logo size={32} /></a></div>

      <h1 className="brand-mono" style={{ fontSize: 24, margin: "0 0 6px" }}>🔎 Üye Ara</h1>
      <p style={{ color: "var(--text-dim)", fontSize: 12.5, lineHeight: 1.55, marginBottom: 14 }}>
        Kullanıcı adını yaz, çıkan listeden arkadaş ekle. En az {MIN_CHARS} harf gerekir —
        üyeler topluca listelenmez.
      </p>

      <div style={{ position: "relative", marginBottom: 6 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Kullanıcı adı…"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          style={{
            width: "100%", padding: "13px 42px 13px 16px", borderRadius: 12,
            border: "2px solid var(--border-soft)", background: "var(--bg-elevated)",
            color: "var(--text-strong)", fontSize: 16,
          }}
        />
        <span style={{
          position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
          color: "var(--text-dim)", fontSize: 16,
        }}>
          {searching ? "⏳" : "🔎"}
        </span>
      </div>

      {tooShort && (
        <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 10 }}>
          En az {MIN_CHARS} harf yaz…
        </p>
      )}
      {err && <p style={{ color: "var(--accent-hot)", fontSize: 13, marginBottom: 10 }}>{err}</p>}

      {!user && searched && rows.length > 0 && (
        <p style={{ color: "var(--text-dim)", fontSize: 12.5, marginBottom: 10 }}>
          Arkadaş eklemek için <a href="/giris" style={{ color: "var(--accent)" }}>giriş yap</a>.
        </p>
      )}

      {searched && rows.length === 0 && !searching && (
        <p style={{ color: "var(--text-dim)", textAlign: "center", padding: 30, lineHeight: 1.6 }}>
          Bu adda üye bulunamadı.<br />Yazımı kontrol edip tekrar dene.
        </p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((row) => (
          <div key={row.id} style={{
            background: "var(--bg-panel)", border: "1px solid var(--border-soft)",
            borderRadius: 14, padding: "12px 14px",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <img
              src={row.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(row.display_name)}`}
              alt=""
              style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--bg-elevated)", flexShrink: 0 }}
            />
            <a href={`/profil/${row.username}`} style={{ flex: 1, minWidth: 0, textDecoration: "none" }}>
              <div style={{
                color: "var(--text-strong)", fontWeight: 700, fontSize: 15,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {row.display_name}
              </div>
              <div style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 2 }}>
                @{row.username}
                {row.level ? ` · Seviye ${row.level}` : ""}
              </div>
            </a>
            <FriendButton row={row} loggedIn={!!user} busy={busy === row.id} onAdd={() => addFriend(row)} />
          </div>
        ))}
      </div>
    </main>
  );
}

/** Sağdaki düğme — arkadaşlık durumuna göre değişir. */
function FriendButton({
  row, loggedIn, busy, onAdd,
}: {
  row: Row; loggedIn: boolean; busy: boolean; onAdd: () => void;
}) {
  const base: React.CSSProperties = {
    padding: "9px 12px", borderRadius: 10, fontSize: 13, fontWeight: 700,
    flexShrink: 0, whiteSpace: "nowrap", border: "none",
  };

  if (!loggedIn) {
    return (
      <a href="/giris" style={{ ...base, background: "var(--bg-elevated)", color: "var(--text-soft)", border: "1px solid var(--border-soft)", textDecoration: "none" }}>
        Giriş yap
      </a>
    );
  }
  if (row.friend_status === "friends") {
    return (
      <span style={{ ...base, background: "rgba(63,185,80,.15)", color: "var(--tile-correct)", border: "1px solid rgba(63,185,80,.35)" }}>
        🤝 Arkadaşın
      </span>
    );
  }
  if (row.friend_status === "request_sent") {
    return (
      <span style={{ ...base, background: "var(--bg-elevated)", color: "var(--text-dim)", border: "1px solid var(--border-soft)" }}>
        ⏳ Gönderildi
      </span>
    );
  }
  if (row.friend_status === "request_received") {
    // Teklifi o göndermiş — kabul/ret bildirimler sayfasında yapılır.
    return (
      <a href="/bildirimler" style={{ ...base, background: "var(--accent)", color: "#1a1330", textDecoration: "none" }}>
        ✅ Yanıtla
      </a>
    );
  }
  return (
    <button onClick={onAdd} disabled={busy}
      style={{ ...base, background: "var(--accent)", color: "#1a1330", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
      🤝 Ekle
    </button>
  );
}
