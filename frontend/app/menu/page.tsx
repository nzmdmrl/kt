"use client";

import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import { useState, useEffect } from "react";
import { getThemeMode, setThemeMode, effectiveTheme } from "@/lib/theme";
import { isSoundEnabled, setSoundEnabled } from "@/lib/sound";
import { usePlatform } from "@/lib/platform";
import { useAppConfig, type FlagsConfig } from "@/lib/appConfig";
import { readDebugError, clearDebugError, type DebugError } from "@/lib/debugLastError";

// Menü — ayar odaklı. Mod butonları ana sayfada olduğu için burada YOK.
export default function MenuPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [dark, setDark] = useState(true);
  const [sound, setSound] = useState(true);

  useEffect(() => {
    try { setDark(effectiveTheme() !== "light"); } catch {}
    try { setSound(isSoundEnabled()); } catch {}
  }, []);

  function toggleTheme() {
    const next = dark ? "light" : "dark";
    setThemeMode(next); setDark(!dark);
  }
  function toggleSound() {
    const next = !sound;
    setSoundEnabled(next); setSound(next);
  }

  return (
    // Masaüstünde 520px'lik kolon; MOBİLDE tam genişlik (globals.css .kt-menu-wrap).
    <main className="kt-menu-wrap">
      <div className="kt-mobile-only" style={{ marginBottom: 16 }}><a href="/"><Logo size={32} /></a></div>
      {/* Ayarlar (toggle'lar) */}
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-soft)", marginBottom: 10, marginTop: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Ayarlar</div>
      <div style={{ display: "grid", gap: 10, marginBottom: 28 }}>
        <ToggleRow icon={dark ? "🌙" : "☀️"} label={dark ? "Gece modu" : "Gündüz modu"} on={dark} onClick={toggleTheme} />
        <ToggleRow icon="🔊" label="Ses" on={sound} onClick={toggleSound} />
        {user && (
          <button onClick={() => router.push("/ayarlar/bildirimler")} style={{ ...rowStyle, cursor: "pointer", width: "100%", textAlign: "left" }}>
            <span style={{
              fontSize: 22, width: 40, height: 40, flexShrink: 0, borderRadius: 11,
              background: "var(--bg-elevated)", display: "grid", placeItems: "center",
            }}>🔔</span>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 16, color: "var(--text-strong)" }}>Bildirim ayarları</span>
            <span style={{ color: "var(--text-dim)", fontSize: 18 }}>›</span>
          </button>
        )}
      </div>

      {/* Yönetici — sadece admin görür */}
      {user?.is_admin && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-soft)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Yönetici</div>
          <div style={{ display: "grid", gap: 10, marginBottom: 28 }}>
            <button onClick={() => router.push("/oyna?mode=reklam")} style={{ ...rowStyle, cursor: "pointer", width: "100%", textAlign: "left" }}>
              <span style={{
                fontSize: 22, width: 40, height: 40, flexShrink: 0, borderRadius: 11,
                background: "var(--bg-elevated)", display: "grid", placeItems: "center",
              }}>📣</span>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 16, color: "var(--text-strong)" }}>Reklam Oyunu</span>
              <span style={{ color: "var(--text-dim)", fontSize: 18 }}>›</span>
            </button>
            <button onClick={() => router.push("/yonetim")} style={{ ...rowStyle, cursor: "pointer", width: "100%", textAlign: "left" }}>
              <span style={{
                fontSize: 22, width: 40, height: 40, flexShrink: 0, borderRadius: 11,
                background: "var(--bg-elevated)", display: "grid", placeItems: "center",
              }}>🛠️</span>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 16, color: "var(--text-strong)" }}>Yönetim Paneli</span>
              <span style={{ color: "var(--text-dim)", fontSize: 18 }}>›</span>
            </button>
          </div>
        </>
      )}

      {/* Hesap & bilgi butonları */}
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-soft)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Hesap & Bilgi</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {user && (
          <NavRow icon="👤" label="Profilim" onClick={() => router.push(`/profil/${user.username}`)} />
        )}
        {user && <NavRow icon="🤝" label="Arkadaşlarım" onClick={() => router.push("/arkadaslar")} />}
        <NavRow icon="🔎" label="Üye Ara" onClick={() => router.push("/uye-ara")} />
        <NavRow icon="🔔" label="Bildirimler" onClick={() => router.push("/bildirimler")} />
        <NavRow icon="🕐" label="Geçmiş" onClick={() => router.push("/gecmis")} />
        <NavRow icon="❓" label="Nasıl Oynanır" onClick={() => router.push("/nasil-oynanir")} />
        <NavRow icon="ℹ️" label="Hakkımızda" onClick={() => router.push("/hakkimizda")} />
        <NavRow icon="🔒" label="Gizlilik" onClick={() => router.push("/gizlilik")} />
        <NavRow icon="📄" label="Şartlar" onClick={() => router.push("/kosullar")} />
        <NavRow icon="🍪" label="Çerezler" onClick={() => router.push("/cerez")} />
        <NavRow icon="✉️" label="İletişim" onClick={() => router.push("/iletisim")} />
        {user && <NavRow icon="🎫" label="Destek" onClick={() => router.push("/destek")} />}
        {user && (
          <button onClick={logout} style={{ ...rowStyle, color: "var(--accent-hot)", cursor: "pointer", width: "100%", textAlign: "left", gridColumn: "1 / -1" }}>
            <span style={{ fontSize: 22, width: 40, height: 40, flexShrink: 0, borderRadius: 11, background: "rgba(217,90,90,.12)", display: "grid", placeItems: "center" }}>🚪</span>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 16, color: "var(--accent-hot)" }}>Çıkış Yap</span>
          </button>
        )}
      </div>

      <TokenDebug />
    </main>
  );
}

// ===================================================================
// GEÇİCİ TEŞHİS BLOĞU — silinecek.
//
// Amaç: "uygulama neden giriş yapmış açılıyor?" sorusunu USB kablosu ve
// chrome://inspect olmadan yanıtlamak. Jetonun ÜRETİLME zamanı, verilerin
// temizlendiği andan ÖNCEyse jeton hayatta kalmış demektir; SONRAysa bir şey
// gerçekten yeniden giriş yapıyor demektir.
//
// KURALLAR:
//  - Yalnız OKUR. Hiçbir oturum mantığına dokunmaz, jetonu doğrulamaz,
//    yazmaz, silmez, ağa istek atmaz.
//  - Yalnız UYGULAMADA ve yalnız admin panelden "app.flags.debug_panel"
//    açıkken çizilir; web'de ve bayrak kapalıyken tek satır bile basmaz.
//  - Jetonun kendisini GÖSTERMEZ (uzunluğunu söyler) — omuz üstünden
//    okunup kopyalanabilecek bir sır ekrana yazılmasın.
//
// İş bitince: bu blok + <TokenDebug /> çağrısı + app.flags.debug_panel alanı
// (backend varsayılanı ve admin paneldeki kutu) kaldırılacak.
// ===================================================================

/** backend/app/core/security.py:21 → TOKEN_EXPIRE_DAYS ile AYNI olmalı. */
const TOKEN_EXPIRE_DAYS = 30;

function fmtTime(ms: number): string {
  try {
    return new Date(ms).toLocaleString("tr-TR");
  } catch {
    return String(ms);
  }
}

/** JWT gövdesini (imza DOĞRULAMADAN) çözer — sadece gösterim için. */
function decodePayload(token: string): Record<string, any> | null {
  try {
    const part = token.split(".")[1];
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(
      decodeURIComponent(
        json
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join(""),
      ),
    );
  } catch {
    return null;
  }
}

function readTokenLines(): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem("kt_token");
  } catch {
    return ["kt_token: OKUNAMADI (depoya erişilemedi)"];
  }
  if (!raw) return ["kt_token: YOK — bu cihazda kayıtlı oturum jetonu bulunmuyor"];

  const lines = [`kt_token: VAR (${raw.length} karakter)`];
  const p = decodePayload(raw);
  if (!p) {
    lines.push("jeton çözümlenemedi (biçim beklenenden farklı)");
    return lines;
  }

  lines.push(`sub (kullanıcı id): ${p.sub ?? "—"}`);

  const exp = Number(p.exp);
  if (Number.isFinite(exp) && exp > 0) {
    const expMs = exp * 1000;
    const issuedMs = expMs - TOKEN_EXPIRE_DAYS * 24 * 60 * 60 * 1000;
    // Jetonun içinde iat YOK; üretilme anı exp'ten geri sayılarak bulunuyor.
    lines.push(`üretilme (exp − ${TOKEN_EXPIRE_DAYS} gün): ${fmtTime(issuedMs)}`);
    lines.push(`geçerlilik sonu (exp): ${fmtTime(expMs)}`);
  } else {
    lines.push("exp okunamadı — üretilme zamanı hesaplanamıyor");
  }
  return lines;
}

function TokenDebug() {
  const { isNative, ready } = usePlatform();
  const config = useAppConfig();
  const [lines, setLines] = useState<string[] | null>(null);
  const [version, setVersion] = useState("okunuyor…");
  const [lastErr, setLastErr] = useState<DebugError | null>(null);

  const flags: FlagsConfig = (config?.["app.flags"] as FlagsConfig) || {};
  const enabled = ready && isNative && flags.debug_panel === true;

  // localStorage effect'te okunur: sunucu ve istemcinin ilk boyaması aynı kalsın.
  useEffect(() => {
    if (!enabled) {
      setLines(null);
      return;
    }
    setLines(readTokenLines());
    setLastErr(readDebugError());
  }, [enabled]);

  // Sürüm adı manifest'ten gelir; WebView okuyamaz, native eklenti okur.
  // Hangi paketi test ettiğini kesin görmek için: versionName (versionCode).
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const info = await App.getInfo();
        if (alive) setVersion(`${info.version} (${info.build})`);
      } catch {
        if (alive) setVersion("okunamadı");
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);

  if (!enabled || !lines) return null;

  return (
    <div
      style={{
        marginTop: 28,
        padding: "12px 14px",
        borderRadius: 10,
        border: "1px dashed var(--border-soft)",
        background: "var(--bg-panel)",
        color: "var(--text-dim)",
        fontSize: 11,
        lineHeight: 1.7,
        fontFamily: "ui-monospace, monospace",
        wordBreak: "break-word",
        // Ekrandan okunup kopyalanabilsin (uzun basınca seçim çıksın).
        userSelect: "text",
        WebkitUserSelect: "text",
        WebkitTouchCallout: "default",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>🔧 teşhis (geçici)</div>

      <div>sürüm: {version}</div>
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}

      <div style={{ borderTop: "1px dashed var(--border-soft)", margin: "8px 0 6px" }} />

      {lastErr ? (
        <>
          <div style={{ fontWeight: 700 }}>
            son giriş hatası · {fmtTime(lastErr.at)} · aşama: {lastErr.stage}
          </div>
          {lastErr.code && <div>kod: {lastErr.code}</div>}
          {lastErr.name && <div>tür: {lastErr.name}</div>}
          <div style={{ color: "var(--accent-hot)" }}>{lastErr.message || "(mesaj boş)"}</div>
          <button
            onClick={() => {
              clearDebugError();
              setLastErr(null);
            }}
            style={{
              marginTop: 6,
              padding: "3px 8px",
              fontSize: 10,
              fontFamily: "inherit",
              borderRadius: 6,
              border: "1px solid var(--border-soft)",
              background: "var(--bg-elevated)",
              color: "var(--text-dim)",
              cursor: "pointer",
            }}
          >
            temizle
          </button>
        </>
      ) : (
        <div>son giriş hatası: yok</div>
      )}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 16, padding: "17px 18px",
  background: "var(--bg-panel)", borderRadius: 14, color: "var(--text-strong)",
  border: "1px solid var(--border-soft)", boxShadow: "0 1px 3px rgba(0,0,0,.15)",
  fontSize: 16,
};

function NavRow({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
      padding: "16px 8px", background: "var(--bg-panel)", borderRadius: 14,
      border: "1px solid var(--border-soft)", boxShadow: "0 1px 3px rgba(0,0,0,.15)",
      cursor: "pointer", width: "100%", minHeight: 92,
    }}>
      <span style={{
        fontSize: 24, width: 46, height: 46, flexShrink: 0, borderRadius: 13,
        background: "var(--bg-elevated)", display: "grid", placeItems: "center",
      }}>{icon}</span>
      <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text-strong)", textAlign: "center", lineHeight: 1.2, wordBreak: "break-word" }}>{label}</span>
    </button>
  );
}

function ToggleRow({ icon, label, on, onClick }: { icon: string; label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ ...rowStyle, cursor: "pointer", width: "100%", textAlign: "left" }}>
      <span style={{
        fontSize: 22, width: 40, height: 40, flexShrink: 0, borderRadius: 11,
        background: "var(--bg-elevated)", display: "grid", placeItems: "center",
      }}>{icon}</span>
      <span style={{ flex: 1, fontWeight: 600, fontSize: 16, color: "var(--text-strong)" }}>{label}</span>
      <span style={{
        width: 48, height: 28, borderRadius: 14, background: on ? "var(--accent)" : "var(--bg-elevated)",
        position: "relative", transition: "background .2s", flexShrink: 0,
        border: on ? "none" : "1px solid var(--border-soft)",
      }}>
        <span style={{
          position: "absolute", top: 2, left: on ? 22 : 2, width: 22, height: 22, borderRadius: "50%",
          background: "#fff", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.3)",
        }} />
      </span>
    </button>
  );
}
