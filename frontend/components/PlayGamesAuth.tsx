"use client";

/**
 * Play Games SESSİZ girişi + "isim belirle" ekranı — SADECE uygulamada.
 *
 * AKIŞ (kullanıcı hiçbir düğmeye basmaz)
 * --------------------------------------
 * Uygulama açılır → native eklenti Play Games oturumunu zaten açmıştır (üstte
 * Play Games kartı bir görünüp kaybolur) → buradan sunucuya bir yetki kodu
 * gider → sunucu üç şeyden birini der:
 *
 *   a) "oturum açtım"          -> hiçbir ekran çıkmaz, kullanıcı oyuna girer
 *   b) "kimliği hesaba bağladım" (kişi zaten girişliyse) -> yine ekran çıkmaz
 *   c) "bu kimlik yeni"        -> HESAP AÇILMADI, isim ekranı gösterilir
 *
 * (c) ekranında iki yol var: kullanıcı adını yazar (hesap o an açılır) ya da
 * "Zaten hesabım var" der (e-posta ile girer, kimlik mevcut hesabına bağlanır).
 * Ayrıntılı gerekçe: backend/app/api/routes/auth.py → play_games_login.
 *
 * KİMSE KİLİTLİ KALMAZ
 * --------------------
 * Play Games yoksa, yapılandırılmamışsa ya da sessiz giriş başarısızsa hiçbir
 * şey gösterilmez ve site her zamanki gibi çalışır — kullanıcı isterse normal
 * giriş ekranını kullanır. İsim ekranı da kapatılabilir ("Şimdi değil").
 *
 * BİR KEZ ÇALIŞIR
 * ---------------
 * Modül düzeyindeki bayrak sayesinde sayfa gezinmelerinde tekrarlanmaz;
 * uygulama tamamen kapanıp açılınca baştan denenir.
 */

import { useEffect, useState } from "react";
import { apiUrl, getJSON } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePlatform } from "@/lib/platform";

/** Bu uygulama oturumunda sessiz giriş denendi mi? */
let attempted = false;

type View = null | "name" | "login";

export default function PlayGamesAuth() {
  const { isNative, ready } = usePlatform();
  const { token, loading, playGamesSilent, playGamesComplete, playGamesLink, login } = useAuth();

  const [view, setView] = useState<View>(null);
  const [pendingToken, setPendingToken] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Platform belli olmadan, oturum çözülmeden ya da tarayıcıda hiçbir şey yapma.
    if (!ready || !isNative || loading) return;
    // Zaten girişliyse sessiz girişe gerek yok: kullanıcı oturumunu açmış,
    // kimliği bağlamak için ondan izinsiz bir şey yapılmaz.
    if (token) return;
    if (attempted) return;
    attempted = true;

    let cancelled = false;
    (async () => {
      try {
        // 1) Sunucu Play Games'i yapılandırmış mı, hangi kimlikle kod istenecek?
        const status = await getJSON<{ configured: boolean; client_id: string | null }>(
          "/api/auth/play-games/status"
        );
        if (!status.configured || !status.client_id) return;

        // 2) Cihazda sessiz oturum var mı? Yoksa sessizce vazgeç.
        const { playGamesSilentCode } = await import("@/lib/playGames");
        const outcome = await playGamesSilentCode(status.client_id);
        if (outcome.status !== "ok" || cancelled) return;

        // 3) Kodu sunucuya götür.
        const result = await playGamesSilent(outcome.serverAuthCode);
        if (cancelled) return;
        if (result.status === "new") {
          setPendingToken(result.pendingToken);
          setName(result.suggestedName || "");
          setView("name");
        }
        // "signed-in" ise hiçbir şey gösterilmez — kullanıcı zaten içeride.
      } catch (e) {
        // Sessiz akış: kullanıcıya hata gösterilmez, normal giriş ekranı devrede.
        console.warn("[play-games] sessiz giriş tamamlanamadı:", (e as any)?.message ?? e);
      }
    })();

    return () => { cancelled = true; };
  }, [ready, isNative, loading, token, playGamesSilent]);

  if (!view) return null;

  async function saveName() {
    setErr("");
    setBusy(true);
    try {
      await playGamesComplete(pendingToken, name);
      setView(null);
    } catch (e: any) {
      setErr(e.message || "Hesap oluşturulamadı");
    } finally {
      setBusy(false);
    }
  }

  async function loginAndLink() {
    setErr("");
    setBusy(true);
    try {
      await login(email, password);
      // Giriş başarılı — kimliği bu hesaba bağla. Bağlama başarısız olsa bile
      // kullanıcı GİRİŞ YAPMIŞ olur; ekranı kapatıp hatayı göstermek yeterli.
      await playGamesLink(pendingToken);
      setView(null);
    } catch (e: any) {
      setErr(e.message || "Giriş başarısız");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={overlay}>
      <div style={card} role="dialog" aria-label="Play Games girişi">
        <div style={{ fontSize: 34, lineHeight: 1 }}>🎮</div>

        {view === "name" ? (
          <>
            <div className="brand-mono" style={title}>Hoş geldin!</div>
            <p style={desc}>
              Play Games ile giriş yapıldı. Oyunda görünecek adını seç.
            </p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && saveName()}
              placeholder="Adın"
              autoFocus
              style={input}
            />
            <p style={hint}>
              Bu ad hem oyunda görünür hem de kullanıcı adın olur.
            </p>
            {err && <p style={errText}>{err}</p>}
            <button onClick={saveName} disabled={busy || !name.trim()} style={btn(busy || !name.trim())}>
              {busy ? "..." : "Devam Et"}
            </button>
            <button onClick={() => { setErr(""); setView("login"); }} style={linkBtn}>
              Zaten hesabım var
            </button>
          </>
        ) : (
          <>
            <div className="brand-mono" style={title}>Hesabına giriş yap</div>
            <p style={desc}>
              Giriş yaptıktan sonra Play Games hesabın bu hesaba bağlanır —
              puanların ve rozetlerin olduğu gibi kalır.
            </p>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="ornek@eposta.com"
              autoFocus
              style={input}
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && loginAndLink()}
              type="password"
              placeholder="••••••"
              style={{ ...input, marginTop: 8 }}
            />
            {err && <p style={errText}>{err}</p>}
            <button
              onClick={loginAndLink}
              disabled={busy || !email.trim() || !password}
              style={btn(busy || !email.trim() || !password)}
            >
              {busy ? "..." : "Giriş Yap ve Bağla"}
            </button>
            <button onClick={() => { setErr(""); setView("name"); }} style={linkBtn}>
              ← Geri
            </button>
          </>
        )}

        {/* Kimse kilitli kalmasın: kapatınca site normal çalışır. */}
        <button onClick={() => setView(null)} style={{ ...linkBtn, color: "var(--text-dim)" }}>
          Şimdi değil
        </button>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 400,
  display: "grid", placeItems: "center", padding: 16,
  paddingTop: "max(16px, var(--kt-safe-top))",
  paddingBottom: "max(16px, var(--kt-banner-space, 0px))",
};

const card: React.CSSProperties = {
  background: "var(--bg-panel)", borderRadius: 14, padding: "20px 20px 12px",
  width: "min(380px, 100%)", textAlign: "center",
  border: "1px solid var(--accent)", boxShadow: "var(--shadow-soft)",
  display: "grid", gap: 10, justifyItems: "stretch",
};

const title: React.CSSProperties = { fontSize: 18, color: "var(--text-strong)" };
const desc: React.CSSProperties = { fontSize: 14, color: "var(--text-soft)", lineHeight: 1.5, margin: 0 };
const hint: React.CSSProperties = { fontSize: 12, color: "var(--text-dim)", margin: 0, textAlign: "left" };
const errText: React.CSSProperties = { fontSize: 13, color: "var(--accent-hot)", margin: 0 };

const input: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 10,
  border: "2px solid var(--tile-border)", background: "var(--bg-elevated)",
  color: "var(--text-strong)", fontSize: 16, fontFamily: "var(--font-body)",
};

function btn(disabled: boolean): React.CSSProperties {
  return {
    width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
    background: "var(--accent)", color: "#1a1330", fontWeight: 700, fontSize: 16,
    fontFamily: "var(--font-display)",
    opacity: disabled ? 0.55 : 1, cursor: disabled ? "default" : "pointer",
  };
}

const linkBtn: React.CSSProperties = {
  background: "none", border: "none", color: "var(--accent)",
  fontSize: 14, cursor: "pointer", padding: "4px 0",
};
