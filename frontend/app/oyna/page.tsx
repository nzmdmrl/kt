"use client";

import { useState, useEffect } from "react";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/Logo";
import MatchGame from "@/components/MatchGame";

// Giriş yapmayan ziyaretçiler için anonim kimlik.
function getAnonId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("kt_player_id");
  if (!id) {
    id = "p_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("kt_player_id", id);
  }
  return id;
}

export default function OynaPage() {
  const { user } = useAuth();
  const [playerId, setPlayerId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (user) {
      // Giriş yapan: gerçek hesap kimliği ve adı
      setPlayerId(`u${user.id}`);
      setName(user.display_name);
    } else {
      setPlayerId(getAnonId());
      const savedName = localStorage.getItem("kt_name") || "";
      setName(savedName);
    }
  }, [user]);

  function saveName(n: string) {
    setName(n);
    if (!user) localStorage.setItem("kt_name", n);
  }

  async function createRoom() {
    if (!name.trim()) return setErr("Önce bir isim gir");
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(apiUrl("/api/room/create"), { method: "POST" });
      const data = await res.json();
      setCode(data.code);
    } catch {
      setErr("Oda oluşturulamadı. Sunucu bağlantısını kontrol et.");
    } finally {
      setBusy(false);
    }
  }

  function joinRoom() {
    if (!name.trim()) return setErr("Önce bir isim gir");
    const c = joinCode.trim().toUpperCase();
    if (c.length < 4) return setErr("Geçerli bir oda kodu gir");
    setCode(c);
  }

  // Maç ekranı
  if (code && playerId) {
    return (
      <main style={pageStyle}>
        <div style={{ marginBottom: 8 }}>
          <a href="/" style={{ color: "var(--text-dim)", fontSize: 14 }}>
            ← ana sayfa
          </a>
        </div>
        <MatchGame code={code} playerId={playerId} name={name || "Oyuncu"} />
      </main>
    );
  }

  // Giriş / oda seçim ekranı
  return (
    <main style={pageStyle}>
      <div style={{ display: "grid", gap: 28, justifyItems: "center" }}>
        <a href="/">
          <Logo size={46} />
        </a>
        <div style={{ textAlign: "center" }}>
          <h1 className="brand-mono" style={{ fontSize: 26 }}>
            Karşılıklı Oyna
          </h1>
          <p style={{ color: "var(--text-soft)", marginTop: 6 }}>
            Bir oda kur ve kodu paylaş, ya da rakibinin kodunu gir.
          </p>
        </div>

        <div style={{ width: "100%", maxWidth: 360, display: "grid", gap: 16 }}>
          {!user && (
            <div>
              <label style={labelStyle}>Görünen adın</label>
              <input
                value={name}
                onChange={(e) => saveName(e.target.value)}
                placeholder="Adın"
                maxLength={24}
                style={inputStyle}
              />
            </div>
          )}
          {user && (
            <div style={{ fontSize: 14, color: "var(--text-soft)", textAlign: "center" }}>
              <span style={{ color: "var(--accent)" }}>{user.display_name}</span> olarak oynuyorsun ·
              ELO {user.elo}
            </div>
          )}

          <button onClick={createRoom} disabled={busy} style={primaryBtn}>
            {busy ? "Oluşturuluyor…" : "Yeni Oda Kur"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-dim)" }}>
            <span style={{ flex: 1, height: 1, background: "var(--border-soft)" }} />
            veya
            <span style={{ flex: 1, height: 1, background: "var(--border-soft)" }} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ODA KODU"
              maxLength={6}
              style={{ ...inputStyle, letterSpacing: "0.2em", textAlign: "center" }}
            />
            <button onClick={joinRoom} style={{ ...primaryBtn, width: "auto", padding: "0 22px" }}>
              Katıl
            </button>
          </div>

          {err && (
            <p style={{ color: "var(--accent-hot)", fontSize: 14, textAlign: "center" }}>{err}</p>
          )}
        </div>

        <p style={{ color: "var(--text-dim)", fontSize: 12, textAlign: "center", maxWidth: 340 }}>
          Test için: iki ayrı tarayıcı sekmesi aç, birinde oda kur, diğerinde kodla katıl.
          Rakip bulma ve botlar sonraki aşamada geliyor.
        </p>
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  flex: 1,
  maxWidth: 560,
  width: "100%",
  margin: "0 auto",
  padding: "28px 18px 60px",
};
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "var(--text-soft)",
  marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "2px solid var(--tile-border)",
  background: "var(--bg-elevated)",
  color: "var(--text-strong)",
  fontSize: 16,
  fontFamily: "var(--font-body)",
};
const primaryBtn: React.CSSProperties = {
  width: "100%",
  padding: "13px 0",
  borderRadius: 10,
  border: "none",
  background: "var(--accent)",
  color: "#1a1330",
  fontWeight: 700,
  fontSize: 16,
  cursor: "pointer",
  fontFamily: "var(--font-display)",
};
