"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSectionMusic } from "@/lib/useSectionMusic";
import { apiUrl } from "@/lib/api";
import { toUpperTr } from "@/lib/turkish";
import { playSound, initSound } from "@/lib/sound";
import { useSpeech } from "@/lib/useSpeech";
import Logo from "@/components/Logo";
import SoundToggle from "@/components/SoundToggle";
import GuestJoin from "@/components/GuestJoin";
import TapHint from "@/components/TapHint";
import ResultShare from "@/components/ResultShare";
import { dailyShareText } from "@/lib/shareText";
import { useAuth } from "@/lib/auth";
import { useGuestAccess } from "@/lib/guestAccess";

type Tile = { letter: string; state: "correct" | "present" | "absent" };
type DailyInfo = { date: string; length: number; first_letter: string; solved?: boolean };

// Günün ilerlemesi tarayıcıda saklanır: sayfayı yenileyince tahminler kaybolmasın,
// çözdüyse "bugünkü kelimeyi çözdün" ekranı gelsin. Üyede sunucu da bilir
// (/api/daily/word -> solved), bu yüzden başka cihazda da doğru ekran çıkar.
const STATE_KEY = "kt_daily_state";
type SavedState = { date: string; length: number; status: "playing" | "won" | "lost"; rows: Tile[][] };

function loadState(date: string, length: number): SavedState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedState;
    if (s.date !== date || s.length !== length) return null;
    return s;
  } catch { return null; }
}

function saveState(s: SavedState) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch {}
}

const MAX_ROWS = 6;

// Misafirin tarayıcısına özel sabit anahtar — "bugün X kişi çözdü" sayacında
// aynı kişinin tekrar sayılmaması için (üyede token'daki kullanıcı id'si kullanılır).
function dailyClientId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("kt_daily_cid");
  if (!id) {
    id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    localStorage.setItem("kt_daily_cid", id);
  }
  return id;
}
const TILE_COLOR: Record<string, string> = {
  correct: "var(--tile-correct)",
  present: "var(--tile-present)",
  absent: "var(--tile-absent)",
};

export default function DailyPage() {
  const [info, setInfo] = useState<DailyInfo | null>(null);
  const [rows, setRows] = useState<Tile[][]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"playing" | "won" | "lost">("playing");
  const [err, setErr] = useState("");
  // Sunucuya göre bugünkü kelime zaten çözülmüş mü (başka cihazda/oturumda).
  const [alreadySolved, setAlreadySolved] = useState(false);
  // Oyuncu giriş alanına dokundu mu (ilk kez oynayanlara ok ipucu için).
  const [touched, setTouched] = useState(false);
  // Misafir erişimi admin ayarıyla kapatılabilir (guest_daily_enabled).
  const { user, loading: authLoading } = useAuth();
  const access = useGuestAccess();
  const guestBlocked = !user && access !== null && !access.daily;
  const gateReady = !authLoading && (!!user || access !== null);

  // Günün kelimesi müziği (oynarken).
  useSectionMusic("daily", status === "playing");

  useEffect(() => {
    if (!gateReady || guestBlocked) return;
    initSound(true, 70);
    // Üyede token gider: misafir erişimi kapalı olsa da üye oynayabilsin.
    const token = typeof window !== "undefined" ? localStorage.getItem("kt_token") : null;
    fetch(apiUrl(`/api/daily/word?length=5&cid=${dailyClientId()}`), token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d: DailyInfo) => {
        setInfo(d);
        setDraft("");
        // Bugüne ait kayıtlı ilerleme varsa geri yükle.
        const saved = loadState(d.date, d.length);
        if (saved) { setRows(saved.rows || []); setStatus(saved.status); }
        if (d.solved) { setAlreadySolved(true); setStatus("won"); }
      })
      .catch(() => setErr("Günün kelimesi yüklenemedi"));
  }, [gateReady, guestBlocked]);

  const submit = useCallback(async () => {
    if (!info || status !== "playing") return;
    if (draft.length !== info.length) return;
    setErr("");
    try {
      // cid + token: "bugün kaç kişi çözdü" sayacında aynı kişiyi bir kez saymak için.
      const token = localStorage.getItem("kt_token");
      const res = await fetch(
        apiUrl(`/api/daily/check?guess=${encodeURIComponent(draft)}&length=${info.length}&cid=${dailyClientId()}`),
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      );
      const data = await res.json();
      if (!data.valid) { setErr(data.error || "Geçersiz"); playSound("wrong"); return; }
      const newRows = [...rows, data.tiles];
      setRows(newRows);
      setDraft("");
      // Her harfin rengine göre sırayla ses çal (soldan sağa, ~140ms arayla).
      data.tiles.forEach((t: Tile, idx: number) => {
        setTimeout(() => {
          playSound(t.state === "correct" ? "tile_correct" : t.state === "present" ? "tile_present" : "tile_absent");
        }, idx * 140);
      });
      const afterTiles = data.tiles.length * 140 + 200;
      const nextStatus: "playing" | "won" | "lost" =
        data.correct ? "won" : newRows.length >= MAX_ROWS ? "lost" : "playing";
      setStatus(nextStatus);
      saveState({ date: info.date, length: info.length, status: nextStatus, rows: newRows });
      if (nextStatus === "won") setTimeout(() => playSound("win"), afterTiles);
      else if (nextStatus === "lost") setTimeout(() => playSound("lose"), afterTiles);
    } catch {
      setErr("Bağlantı hatası");
    }
  }, [info, status, draft, rows]);

  // Sesli cevap: mikrofonla söylenen kelimeyi input'a yaz.
  const onVoiceResult = useCallback((text: string) => {
    if (!info || status !== "playing") return;
    const clean = toUpperTr(text).replace(/[^A-ZÇĞİÖŞÜI]/g, "").slice(0, info.length);
    if (clean.length > 0) setDraft(clean);
  }, [info, status]);

  const { supported: micSupported, listening, start: micStart, stop: micStop } =
    useSpeech(onVoiceResult, "tr-TR");

  // Bırakınca 1 sn sonra durdur — son heceler de alınsın (maçtaki fix ile aynı).
  const micStopTimer = useRef<any>(null);
  const stopMicDelayed = useCallback(() => {
    if (micStopTimer.current) clearTimeout(micStopTimer.current);
    micStopTimer.current = setTimeout(() => micStop(), 1000);
  }, [micStop]);

  // Bilemedi: bugünkü kelimeyi baştan dener (tahmin tahtası temizlenir).
  function retry() {
    if (!info) return;
    setRows([]);
    setDraft("");
    setErr("");
    setStatus("playing");
    saveState({ date: info.date, length: info.length, status: "playing", rows: [] });
  }

  if (!gateReady) return <Wrap><Centered>Yükleniyor…</Centered></Wrap>;
  if (guestBlocked) {
    return (
      <GuestJoin
        allowed={false}
        icon="📅"
        title="Günün Kelimesi"
        subtitle="Günün kelimesi şu an sadece üyelere açık."
      />
    );
  }
  if (err && !info) return <Wrap><Centered>{err}</Centered></Wrap>;
  if (!info) return <Wrap><Centered>Yükleniyor…</Centered></Wrap>;

  return (
    <Wrap>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <h1 className="brand-mono" style={{ fontSize: 26 }}>Günün Kelimesi</h1>
        <p style={{ color: "var(--text-soft)", fontSize: 14 }}>
          Herkes bugün aynı kelimeyi çözüyor · {info.date}
        </p>
      </div>

      {/* Izgara — başka cihazda çözülmüşse (tahmin geçmişi yoksa) boş tahta gösterme */}
      {!(status === "won" && rows.length === 0) && (
      <div style={{ display: "grid", gap: 6, justifyContent: "center", marginBottom: 20 }}>
        {Array.from({ length: MAX_ROWS }).map((_, i) => {
          const row = rows[i];
          const isCurrent = i === rows.length && status === "playing";
          return (
            <div key={i} style={{ display: "flex", gap: 6 }}>
              {Array.from({ length: info.length }).map((_, j) => {
                let letter = "";
                let bg = "var(--tile-empty)";
                let color = "#fff";
                if (row) {
                  letter = row[j].letter;
                  bg = TILE_COLOR[row[j].state];
                } else if (isCurrent) {
                  letter = j < draft.length ? draft[j] : (j === 0 && draft.length === 0 ? info.first_letter : "");
                  if (j === 0 && draft.length === 0) color = "var(--text-dim)";
                }
                return (
                  <span key={j} style={{
                    width: 52, height: 52, display: "grid", placeItems: "center",
                    borderRadius: 10, fontFamily: "var(--font-display)", fontWeight: 700,
                    fontSize: 24, color, background: bg,
                    border: row ? "none" : "2px solid var(--tile-border)",
                  }}>{letter}</span>
                );
              })}
            </div>
          );
        })}
      </div>
      )}

      {status === "playing" && (
        <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={draft}
              onFocus={() => setTouched(true)}
              onChange={(e) => { setTouched(true); setDraft(toUpperTr(e.target.value).replace(/[^A-ZÇĞİÖŞÜI]/g, "").slice(0, info.length)); }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={`${info.first_letter} ile başla`}
              maxLength={info.length}
              style={{
                padding: "12px 16px", borderRadius: 10, border: "2px solid var(--tile-border)",
                background: "var(--bg-elevated)", color: "var(--text-strong)", fontSize: 20,
                fontFamily: "var(--font-display)", width: 200, textAlign: "center",
                letterSpacing: "0.2em", textTransform: "uppercase",
              }}
            />
            {micSupported && (
              <button
                onPointerDown={(e) => { e.preventDefault(); setTouched(true); micStart(); }}
                onPointerUp={(e) => { e.preventDefault(); stopMicDelayed(); }}
                onPointerLeave={() => { if (listening) stopMicDelayed(); }}
                onContextMenu={(e) => e.preventDefault()}
                title="Basılı tut ve konuş"
                style={{
                  padding: "12px 16px", borderRadius: 10,
                  border: listening ? "2px solid var(--accent-hot)" : "2px solid var(--tile-border)",
                  background: listening ? "var(--accent-glow)" : "var(--bg-elevated)",
                  cursor: "pointer", fontSize: 18, lineHeight: 1,
                }}
              >🎤</button>
            )}
            <button onClick={submit} disabled={draft.length !== info.length} style={{
              padding: "12px 20px", borderRadius: 10, border: "none", background: "var(--accent)",
              color: "#1a1330", fontWeight: 700, fontSize: 16, cursor: "pointer",
              fontFamily: "var(--font-display)", opacity: draft.length === info.length ? 1 : 0.5,
            }}>Dene</button>
          </div>

          {/* İlk kez oynayanlara: giriş alanını gösteren animasyonlu ok */}
          <TapHint show={!touched} storageKey="kt_hint_daily" />

          {micSupported && (
            <p style={{ color: "var(--text-dim)", fontSize: 12 }}>🎤 basılı tut & kelimeyi söyle</p>
          )}
          {err && <p style={{ color: "var(--accent-hot)", fontSize: 14 }}>{err}</p>}
          <p style={{ color: "var(--text-dim)", fontSize: 13 }}>{rows.length}/{MAX_ROWS} hak kullanıldı</p>
        </div>
      )}

      {status !== "playing" && (
        <div style={{ textAlign: "center", background: "var(--bg-panel)", borderRadius: 16, padding: 24 }}>
          <div style={{ fontSize: 40 }}>{status === "won" ? "🎉" : "😔"}</div>
          <div className="brand-mono" style={{ fontSize: 24, color: status === "won" ? "var(--tile-correct)" : "var(--accent-hot)", margin: "8px 0" }}>
            {status === "won"
              ? (rows.length > 0 ? `Bildin! ${rows.length}/${MAX_ROWS}` : "Bugünkü kelimeyi çözdün")
              : "Bilemedin"}
          </div>
          {status === "won" && (
            <p style={{ color: "var(--text-soft)", fontSize: 14, marginBottom: 4 }}>
              Bugünkü kelimeyi çözdün — yarın yeni kelime seni bekliyor.
            </p>
          )}
          {/* Bilemediyse bugünkü kelimeyi yeniden deneyebilir (çözdüyse kilitli). */}
          {status === "lost" && (
            <div style={{ marginTop: 12 }}>
              <button onClick={retry} style={{
                padding: "12px 28px", borderRadius: 12, border: "1px solid var(--border-soft)",
                background: "transparent", color: "var(--text-strong)", fontWeight: 700, fontSize: 15,
                cursor: "pointer",
              }}>🔄 Tekrar Dene</button>
            </div>
          )}
          <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 14 }}>Yarın yeni kelime!</p>
        </div>
      )}

      {/* Sonuç paylaşımı — her zaman EN ALTTA */}
      {status !== "playing" && rows.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <ResultShare
            text={dailyShareText({ rows, maxRows: MAX_ROWS, won: status === "won" })}
            module="daily"
            variant={status === "won" ? "win" : "loss"}
            title="Kelime Tahmin — Günün Kelimesi"
          />
        </div>
      )}

      <div style={{ marginTop: 24, textAlign: "center" }}>
        <a href="/oyna" style={{ color: "var(--accent)", fontWeight: 600 }}>Karşılıklı Oyna →</a>
      </div>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ flex: 1, maxWidth: 520, width: "100%", margin: "0 auto", padding: "24px 18px 60px" }}>
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <a href="/"><Logo size={36} /></a>
        <SoundToggle />
      </div>
      {children}
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", placeItems: "center", minHeight: 200, color: "var(--text-soft)" }}>{children}</div>;
}
