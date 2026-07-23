"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/Logo";
import MatchGame from "@/components/MatchGame";
import VsScreen from "@/components/VsScreen";

function getAnonId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("kt_player_id");
  if (!id) {
    id = "p_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("kt_player_id", id);
  }
  return id;
}

type Mode = "menu" | "searching" | "vs" | "match";

export default function OynaPage() {
  const { user } = useAuth();
  const [playerId, setPlayerId] = useState("");
  const [name, setName] = useState("");
  const [elo, setElo] = useState(1000);

  const [mode, setMode] = useState<Mode>("menu");
  const [code, setCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [bot, setBot] = useState(false);
  const [botElo, setBotElo] = useState(1000);
  const [oppInfo, setOppInfo] = useState<{ name: string; elo: number } | null>(null);
  const [err, setErr] = useState("");
  const [searchSeconds, setSearchSeconds] = useState(0);
  const pollRef = useRef<any>(null);

  useEffect(() => {
    if (user) {
      setPlayerId(`u${user.id}`);
      setName(user.display_name);
      setElo(user.elo);
    } else {
      setPlayerId(getAnonId());
      setName(localStorage.getItem("kt_name") || "");
    }
  }, [user]);

  function saveName(n: string) {
    setName(n);
    if (!user) localStorage.setItem("kt_name", n);
  }

  // --- Rakip Bul (matchmaking) ---
  const startSearch = useCallback(async () => {
    if (!name.trim()) return setErr("Önce bir isim gir");
    setErr("");
    setMode("searching");
    setSearchSeconds(0);
    try {
      await fetch(apiUrl("/api/mm/join"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: playerId, name, elo }),
      });
    } catch {
      setErr("Sunucuya bağlanılamadı");
      setMode("menu");
      return;
    }
    // Poll döngüsü
    pollRef.current = setInterval(async () => {
      setSearchSeconds((s) => s + 1);
      try {
        const r = await fetch(apiUrl(`/api/mm/poll?player_id=${encodeURIComponent(playerId)}`));
        const d = await r.json();
        if (d.matched && d.code) {
          clearInterval(pollRef.current);
          setCode(d.code);
          setBot(!!d.opponent_is_bot);
          setBotElo(d.bot_elo ?? 1000);
          setOppInfo({
            name: d.opponent_is_bot ? "Rakip" : "Rakip",
            elo: d.bot_elo ?? 1000,
          });
          setMode("vs");
        }
      } catch {}
    }, 1500);
  }, [name, playerId, elo]);

  const cancelSearch = useCallback(async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    try {
      await fetch(apiUrl(`/api/mm/leave?player_id=${encodeURIComponent(playerId)}`), { method: "POST" });
    } catch {}
    setMode("menu");
  }, [playerId]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // --- Oda kur / katıl ---
  async function createRoom() {
    if (!name.trim()) return setErr("Önce bir isim gir");
    setErr("");
    try {
      const res = await fetch(apiUrl("/api/room/create"), { method: "POST" });
      const data = await res.json();
      setCode(data.code);
      setBot(false);
      setMode("match");
    } catch {
      setErr("Oda oluşturulamadı");
    }
  }
  function joinRoom() {
    if (!name.trim()) return setErr("Önce bir isim gir");
    const c = joinCode.trim().toUpperCase();
    if (c.length < 4) return setErr("Geçerli bir oda kodu gir");
    setCode(c);
    setBot(false);
    setMode("match");
  }

  // --- render ---
  if (mode === "match" && code && playerId) {
    return (
      <main style={pageStyle}>
        <div style={{ marginBottom: 8 }}>
          <a href="/" style={{ color: "var(--text-dim)", fontSize: 14 }}>← ana sayfa</a>
        </div>
        <MatchGame code={code} playerId={playerId} name={name || "Oyuncu"} bot={bot} botElo={botElo} />
      </main>
    );
  }

  if (mode === "vs" && code && oppInfo) {
    return (
      <main style={pageStyle}>
        <VsScreen
          me={{ name: name || "Sen", elo }}
          opponent={{ name: oppInfo.name, elo: oppInfo.elo, is_bot: bot }}
          onDone={() => setMode("match")}
        />
      </main>
    );
  }

  if (mode === "searching") {
    return (
      <main style={pageStyle}>
        <div style={{ display: "grid", gap: 22, justifyItems: "center", paddingTop: 30 }}>
          <Logo size={44} />
          <div className="brand-mono" style={{ fontSize: 24 }}>Rakip aranıyor…</div>
          <div className="brand-mono" style={{ fontSize: 48, color: "var(--accent)" }}>{searchSeconds}s</div>
          <p style={{ color: "var(--text-soft)", textAlign: "center", maxWidth: 320 }}>
            Sana yakın seviyede bir rakip buluyoruz. 15 saniye içinde bulunamazsa
            bir bot rakip devreye girer.
          </p>
          <button onClick={cancelSearch} style={ghostBtn}>İptal</button>
        </div>
      </main>
    );
  }

  // Menü
  return (
    <main style={pageStyle}>
      <div style={{ display: "grid", gap: 26, justifyItems: "center" }}>
        <a href="/"><Logo size={46} /></a>
        <div style={{ textAlign: "center" }}>
          <h1 className="brand-mono" style={{ fontSize: 26 }}>Oyna</h1>
          {user ? (
            <p style={{ color: "var(--text-soft)", marginTop: 6 }}>
              <span style={{ color: "var(--accent)" }}>{user.display_name}</span> · ELO {user.elo}
            </p>
          ) : (
            <p style={{ color: "var(--text-soft)", marginTop: 6 }}>Misafir olarak oynuyorsun</p>
          )}
        </div>

        <div style={{ width: "100%", maxWidth: 380, display: "grid", gap: 16 }}>
          {!user && (
            <div>
              <label style={labelStyle}>Görünen adın</label>
              <input value={name} onChange={(e) => saveName(e.target.value)} placeholder="Adın" maxLength={24} style={inputStyle} />
            </div>
          )}

          {/* Ana CTA: Rakip Bul */}
          <button onClick={startSearch} style={primaryBtn}>
            🎯 Rakip Bul
          </button>

          {/* Solo */}
          <button
            onClick={() => { setBot(true); setBotElo(elo); createBotSolo(); }}
            style={secondaryBtn}
          >
            🤖 Bota Karşı Oyna
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-dim)" }}>
            <span style={{ flex: 1, height: 1, background: "var(--border-soft)" }} />
            arkadaşınla
            <span style={{ flex: 1, height: 1, background: "var(--border-soft)" }} />
          </div>

          <button onClick={createRoom} style={ghostBtn}>Özel Oda Kur</button>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ODA KODU"
              maxLength={6}
              style={{ ...inputStyle, letterSpacing: "0.2em", textAlign: "center" }}
            />
            <button onClick={joinRoom} style={{ ...ghostBtn, width: "auto", padding: "0 22px" }}>Katıl</button>
          </div>

          {err && <p style={{ color: "var(--accent-hot)", fontSize: 14, textAlign: "center" }}>{err}</p>}
        </div>
      </div>
    </main>
  );

  // Bota karşı hızlı başlat (oda kur + bot bağla)
  async function createBotSolo() {
    if (!name.trim()) { setErr("Önce bir isim gir"); return; }
    setErr("");
    try {
      const res = await fetch(apiUrl("/api/room/create"), { method: "POST" });
      const data = await res.json();
      setCode(data.code);
      setBot(true);
      setBotElo(elo);
      setOppInfo({ name: "Bot Rakip", elo });
      setMode("vs");
    } catch {
      setErr("Oda oluşturulamadı");
    }
  }
}

const pageStyle: React.CSSProperties = {
  flex: 1, maxWidth: 560, width: "100%", margin: "0 auto", padding: "28px 18px 60px",
};
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, color: "var(--text-soft)", marginBottom: 6 };
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 10, border: "2px solid var(--tile-border)",
  background: "var(--bg-elevated)", color: "var(--text-strong)", fontSize: 16, fontFamily: "var(--font-body)",
};
const primaryBtn: React.CSSProperties = {
  width: "100%", padding: "16px 0", borderRadius: 12, border: "none", background: "var(--accent)",
  color: "#1a1330", fontWeight: 700, fontSize: 18, cursor: "pointer", fontFamily: "var(--font-display)",
  boxShadow: "0 8px 24px var(--accent-glow)",
};
const secondaryBtn: React.CSSProperties = {
  width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: "var(--bg-elevated)",
  color: "var(--text-strong)", fontWeight: 600, fontSize: 16, cursor: "pointer", fontFamily: "var(--font-display)",
  borderStyle: "solid", borderWidth: 1, borderColor: "var(--border-soft)",
};
const ghostBtn: React.CSSProperties = {
  width: "100%", padding: "12px 0", borderRadius: 10, border: "1px solid var(--border-soft)",
  background: "transparent", color: "var(--text-soft)", fontWeight: 600, fontSize: 15, cursor: "pointer",
  fontFamily: "var(--font-body)",
};
