"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { startRadar, stopRadar, playSound, initSound } from "@/lib/sound";
import { useAuth } from "@/lib/auth";
import { useGuestAccess } from "@/lib/guestAccess";
import Logo from "@/components/Logo";
import MatchGame from "@/components/MatchGame";
import GuestJoin from "@/components/GuestJoin";
import VsScreen from "@/components/VsScreen";
import TutorialDemo from "@/components/TutorialDemo";

function getAnonId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("kt_player_id");
  if (!id) {
    id = "p_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("kt_player_id", id);
  }
  return id;
}

type Mode = "menu" | "createSetup" | "searching" | "vs" | "match";

export default function OynaPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  // Misafir 1v1 erişimi admin ayarıyla kapatılabilir (guest_match_enabled).
  const access = useGuestAccess();
  const guestBlocked = !user && access !== null && !access.match;
  const gateReady = !authLoading && (!!user || access !== null);
  const [playerId, setPlayerId] = useState("");
  const [name, setName] = useState("");
  const [elo, setElo] = useState(1000);

  const [mode, setMode] = useState<Mode>("menu");
  const [code, setCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [bot, setBot] = useState(false);
  const [botElo, setBotElo] = useState(1000);
  const [oppInfo, setOppInfo] = useState<{ name: string; elo: number } | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [err, setErr] = useState("");
  const [searchSeconds, setSearchSeconds] = useState(0);
  const pollRef = useRef<any>(null);
  // Sayfaya ana sayfadan (?mode=create / ?join= / ?duel=) mı gelindi? "Geri" hedefini belirler.
  const fromHomeRef = useRef(false);
  // Özel oda akışı mı (oda kur / kodla katıl)? Sadece burada "Geri" butonu gösterilir.
  const [roomFlow, setRoomFlow] = useState(false);
  // Özel oda ayarları (kişi sayısı · tur · bekleme süresi).
  const [roomSize, setRoomSize] = useState(2);
  const [roomRounds, setRoomRounds] = useState(1);
  const [roomWait, setRoomWait] = useState(120);

  // Ses: rakip aranırken radar çal; VS/maç moduna geçince rakip bulundu sesi.
  useEffect(() => {
    initSound(true, 70);
  }, []);
  const prevMode = useRef<Mode>("menu");
  useEffect(() => {
    if (mode === "searching") {
      startRadar();
    } else {
      stopRadar();
      // Aramadan VS ekranına geçtiyse rakip bulundu sesi.
      if (prevMode.current === "searching" && mode === "vs") {
        playSound("opponent_found");
      }
    }
    prevMode.current = mode;
    return () => { if (mode === "searching") stopRadar(); };
  }, [mode]);

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

  // Maç teklifi kabul edildiyse URL'de ?duel=CODE ile gelinir -> direkt o odaya bağlan.
  useEffect(() => {
    if (!playerId || !gateReady || guestBlocked) return;
    const params = new URLSearchParams(window.location.search);
    // Ana sayfadan ?ogretici=1 ile gelince öğreticiyi aç.
    if (params.get("ogretici") === "1") {
      setShowTutorial(true);
      return;
    }
    const duel = params.get("duel");
    if (duel && mode === "menu") {
      fromHomeRef.current = true;
      setCode(duel);
      setOppInfo({ name: "Rakip", elo: 1000 });
      setBot(false);
      setMode("vs");
      return;
    }
    // Ana sayfadan direkt mod seçimi: ?mode=bot|create|search  veya ?join=KOD
    if (mode === "menu") {
      const jc = params.get("join");
      if (jc) { fromHomeRef.current = true; setBot(false); joinRoomWith(jc); return; }
      const m = params.get("mode");
      if (m === "bot") { fromHomeRef.current = true; setBot(true); setBotElo(elo); createBotSolo(); }
      else if (m === "create") { fromHomeRef.current = true; setMode("createSetup"); }
      else if (m === "search") { fromHomeRef.current = true; startSearch(); }
    }
  }, [playerId, gateReady, guestBlocked]);

  // --- Rakip Bul (matchmaking) ---
  const startSearch = useCallback(async () => {
    if (!name.trim()) return setErr("Önce bir isim gir");
    setErr("");
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("kt_token") : null;
      const res = await fetch(apiUrl("/api/mm/join"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ player_id: playerId, name, elo }),
      });
      const data = await res.json();
      // Misafir 1v1 erişimi kapalıysa sunucu da engeller.
      if (data.guest_blocked) {
        setErr(data.message || "1v1 düello için giriş yapmalısın.");
        return;
      }
      // Terk cezası: engelliyse aramaya girme, uyar.
      if (data.banned) {
        setErr(data.message || "Şu an eşleştirme engellisin. Bota karşı oynayabilirsin.");
        return;
      }
    } catch {
      setErr("Sunucuya bağlanılamadı");
      return;
    }
    setMode("searching");
    setSearchSeconds(0);
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

  // Özel odada rakip beklerken "Geri": odadan çık.
  // Ana sayfadan (?mode=create / ?join=) gelindiyse ana sayfaya, yoksa Oyna menüsüne döner.
  const leaveRoom = useCallback(() => {
    setCode(null);
    setOppInfo(null);
    setBot(false);
    setRoomFlow(false);
    if (fromHomeRef.current) { router.push("/"); return; }
    setMode("menu");
  }, [router]);

  // --- Oda kur / katıl ---
  async function createRoom() {
    if (!name.trim()) return setErr("Önce bir isim gir");
    setErr("");
    try {
      const res = await fetch(apiUrl("/api/room/create"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Host adı: davet linki önizlemesinde "X ile kelime tahmin oyna" başlığı için.
        // size/rounds/wait_seconds: oda kurulum ekranındaki seçimler.
        body: JSON.stringify({
          host: (user?.display_name || name || "").trim(),
          size: roomSize,
          rounds: roomRounds,
          wait_seconds: roomWait,
          custom: true,
        }),
      });
      const data = await res.json();
      setCode(data.code);
      setBot(false);
      setRoomFlow(true);
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
    setRoomFlow(true);
    setMode("match");
  }
  // Ana sayfadan ?join=KOD ile gelince: kodu doğrudan kullan.
  function joinRoomWith(rawCode: string) {
    const c = (rawCode || "").trim().toUpperCase();
    if (c.length < 4) { setMode("menu"); return; }
    setJoinCode(c);
    setCode(c);
    setBot(false);
    setRoomFlow(true);
    setMode("match");
  }

  // --- render ---
  if (!gateReady) {
    return <main style={pageStyle}><div style={{ display: "grid", placeItems: "center", minHeight: "50vh", color: "var(--text-soft)" }}>Yükleniyor…</div></main>;
  }
  // Misafir 1v1 kapalıysa: üyelik ekranı.
  if (guestBlocked) {
    return (
      <GuestJoin
        allowed={false}
        icon="🎮"
        title="1v1 Düello"
        subtitle="Düello şu an sadece üyelere açık."
      />
    );
  }
  // Öğretici demo: her şeyin üstünde, maçtan bağımsız.
  if (showTutorial) {
    return <TutorialDemo onClose={() => setShowTutorial(false)} />;
  }

  if (mode === "match" && code && playerId) {
    return (
      <main style={pageStyle}>
        <MatchGame
          key={code}
          code={code}
          playerId={playerId}
          name={name || "Oyuncu"}
          bot={bot}
          botElo={botElo}
          isGuest={!user}
          invitable={roomFlow && !bot}
          onLeave={roomFlow ? leaveRoom : undefined}
          onRematch={() => {
            // Rövanş: aynı rakip tipiyle (bot/insan) yeni oda + yeni maç.
            // Yeni oda kodu + VS ekranı; key={code} sayesinde MatchGame sıfırdan kurulur.
            const newCode = "R" + Math.random().toString(36).slice(2, 7).toUpperCase();
            setCode(newCode);
            setMode("vs");
          }}
        />
      </main>
    );
  }

  if (mode === "vs" && code && oppInfo) {
    return (
      <main style={pageStyle}>
        <VsScreen
          me={{ name: name || "Sen", elo, avatar_url: user?.avatar_url }}
          opponent={{ name: oppInfo.name, elo: oppInfo.elo, is_bot: bot }}
          onDone={() => setMode("match")}
        />
      </main>
    );
  }

  // Özel oda kurulum ekranı: kişi sayısı · tur sayısı · bekleme süresi
  if (mode === "createSetup") {
    const sizeDesc: Record<number, string> = {
      2: "Klasik düello: buzzer'ı kapan cevaplar, bilemezse sıra rakibe geçer.",
      3: "İlk buzzer'ı kapan cevaplar; bilemezse kalan iki kişi yarışır, o da bilemezse son kişi cevaplar. Sonra herkes yeniden yarışır.",
      4: "İlk buzzer'ı kapan cevaplar; bilemezse 3 kişi, sonra 2 kişi yarışır, en son kalan kişi cevaplar. Sonra yarış baştan başlar.",
    };
    return (
      <main style={pageStyle}>
        <div style={{ display: "grid", gap: 18, maxWidth: 420, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => (fromHomeRef.current ? router.push("/") : setMode("menu"))}
              style={{ background: "var(--bg-panel)", border: "1px solid var(--border-soft)", borderRadius: "50%", width: 34, height: 34, cursor: "pointer", fontSize: 16, color: "var(--text-strong)" }}>←</button>
            <h1 className="brand-mono" style={{ fontSize: 22, margin: 0 }}>🚪 Özel Oda Kur</h1>
          </div>

          {!user && (
            <div>
              <label style={labelStyle}>Görünen adın</label>
              <input value={name} onChange={(e) => saveName(e.target.value)} placeholder="Adın" maxLength={24} style={inputStyle} />
            </div>
          )}

          {/* Kişi sayısı */}
          <div>
            <label style={labelStyle}>Kaç kişilik?</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[2, 3, 4].map((n) => (
                <button key={n} onClick={() => setRoomSize(n)} style={chipStyle(roomSize === n)}>
                  {n} kişi
                </button>
              ))}
            </div>
            <p style={{ color: "var(--text-dim)", fontSize: 12.5, lineHeight: 1.5, marginTop: 8 }}>
              {sizeDesc[roomSize]}
            </p>
          </div>

          {/* Tur sayısı */}
          <div>
            <label style={labelStyle}>Kaç tur?</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRoomRounds(n)} style={chipStyle(roomRounds === n)}>
                  {n}
                </button>
              ))}
            </div>
            <p style={{ color: "var(--text-dim)", fontSize: 12.5, lineHeight: 1.5, marginTop: 8 }}>
              Her turda <strong style={{ color: "var(--accent)" }}>5 veya 6 harfli rastgele</strong> bir kelime gelir.
            </p>
          </div>

          {/* Bekleme süresi */}
          <div>
            <label style={labelStyle}>Bekleme süresi</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[60, 120, 300, 600].map((sec) => (
                <button key={sec} onClick={() => setRoomWait(sec)} style={chipStyle(roomWait === sec)}>
                  {sec >= 60 ? `${sec / 60} dk` : `${sec} sn`}
                </button>
              ))}
            </div>
            <p style={{ color: "var(--text-dim)", fontSize: 12.5, lineHeight: 1.5, marginTop: 8 }}>
              Oda {roomSize} kişiye ulaşınca maç <strong>otomatik başlar</strong>. Bu süre içinde
              dolmazsa oda <strong>kapanır</strong> ve kod geçersiz olur.
            </p>
          </div>

          <button onClick={createRoom} style={primaryBtn}>🚪 Odayı Kur</button>
          {err && <p style={{ color: "var(--accent-hot)", fontSize: 14, textAlign: "center" }}>{err}</p>}
        </div>
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
        <div style={{ textAlign: "center", position: "relative" }}>
          <h1 className="brand-mono" style={{ fontSize: 26 }}>Oyna</h1>
          <button
            onClick={() => setShowTutorial(true)}
            title="Nasıl oynanır — öğreticiyi izle"
            style={{
              position: "absolute", right: -6, top: -6, width: 32, height: 32, borderRadius: "50%",
              border: "1px solid var(--border-soft)", background: "var(--bg-panel)",
              color: "var(--accent)", fontSize: 16, fontWeight: 700, cursor: "pointer",
            }}
          >?</button>
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

          <button onClick={() => { setErr(""); setMode("createSetup"); }} style={ghostBtn}>Özel Oda Kur</button>
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
      playSound("opponent_found");
      setMode("vs");
    } catch {
      setErr("Oda oluşturulamadı");
    }
  }
}

const pageStyle: React.CSSProperties = {
  flex: 1, maxWidth: 560, width: "100%", margin: "0 auto", padding: "28px 18px 60px",
  overflowX: "hidden",
  boxSizing: "border-box",
};
function chipStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1, minWidth: 56, padding: "11px 10px", borderRadius: 11, cursor: "pointer",
    border: active ? "2px solid var(--accent)" : "1px solid var(--border-soft)",
    background: active ? "var(--accent)" : "var(--bg-panel)",
    color: active ? "#1a1330" : "var(--text-soft)",
    fontWeight: 800, fontSize: 15, fontFamily: "var(--font-body)",
  };
}

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
