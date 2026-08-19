"use client";

/**
 * Hesap doğrulama — "Profili doğrula ve kaydet".
 *
 * NE İŞE YARAR
 * ------------
 * İsimle açılan hesabın tek dayanağı cihazdaki oturum jetonudur. Bu sayfada
 * kişi e-posta + şifre ekler; hesap "doğrulanmış" olur ve bundan sonra başka
 * bir cihazdan da girilebilir.
 *
 * İKİ ADIM VAR
 * ------------
 * 1) NORMAL: e-posta boştaysa hesaba eklenir, iş biter.
 * 2) TAŞIMA: e-posta BAŞKA bir hesapta kayıtlıysa sunucu hata vermez — kişi
 *    büyük ihtimalle kendi eski hesabını yazmıştır. O zaman ikinci adım açılır:
 *    eski hesabın şifresiyle giriş yapılır ve buradaki ilerleme oraya TAŞINIR
 *    (XP, maç, rozet, arkadaşlar...). Bu hesap taşıma sırasında silinir.
 *
 * Sunucu tarafı: backend/app/api/routes/auth.py → /auth/verify, /auth/transfer.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, type TransferSummary } from "@/lib/auth";
import Logo from "@/components/Logo";
import AlertPopup from "@/components/AlertPopup";
import { avatarSrc } from "@/lib/avatar";

type Step =
  | { name: "form" }
  | {
      name: "transfer";
      message: string;
      transferToken: string;
      progress: { display_name: string; level: number; xp: number; matches_played: number; wins: number };
    }
  | { name: "done"; moved: TransferSummary | null };

export default function DogrulaPage() {
  const { user, loading, verifyAccount, transferAccount, login, refreshUser } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Şifre İKİ KEZ yazılır. Sebep: yanlış yazılırsa kişi hesabını "kaydettim"
  // sanır, ama başka cihazdan bir daha giremez ve nedenini de anlayamaz —
  // hesabın tek anahtarı o şifre olduğu için geri dönüşü yoktur.
  const [password2, setPassword2] = useState("");
  const [oldPassword, setOldPassword] = useState("");   // taşıma adımı: ESKİ hesabın şifresi
  const [busy, setBusy] = useState(false);
  const [popup, setPopup] = useState("");
  const [step, setStep] = useState<Step>({ name: "form" });

  // Girişsiz kişinin burada işi yok.
  useEffect(() => {
    if (!loading && !user) router.replace("/giris");
  }, [user, loading, router]);

  // Hesap zaten doğrulanmışsa (ör. şerit eski kalmışsa) bilgi ver ve çık.
  const alreadyVerified = !!user && user.verified !== false;

  // Şifreler uyuşuyor mu? (ikinci alana yazılmaya başlanınca gösterilir)
  const pwMismatch = password2.length > 0 && password !== password2;
  const canSave = password.length >= 6 && password === password2;

  async function submitVerify() {
    const mail = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { setPopup("Geçerli bir e-posta gir."); return; }
    if (password.length < 6) { setPopup("Şifre en az 6 karakter olmalı."); return; }
    if (password !== password2) { setPopup("Şifreler birbiriyle uyuşmuyor."); return; }
    setBusy(true);
    try {
      const res = await verifyAccount(mail, password);
      if (res.status === "ok") {
        setStep({ name: "done", moved: null });
        return;
      }
      // E-posta başkasında — taşıma adımına geç.
      setStep({
        name: "transfer",
        message: res.message,
        transferToken: res.transferToken,
        progress: res.progress,
      });
    } catch (e: any) {
      setPopup(e?.message || "Doğrulama başarısız.");
    } finally {
      setBusy(false);
    }
  }

  async function submitTransfer() {
    if (step.name !== "transfer") return;
    if (!oldPassword) { setPopup("Eski hesabının şifresini gir."); return; }
    setBusy(true);
    try {
      // Önce O hesaba giriş yap (jeton değişir), sonra ilerlemeyi oraya taşı.
      await login(email.trim().toLowerCase(), oldPassword);
      const moved = await transferAccount(step.transferToken);
      await refreshUser();
      setStep({ name: "done", moved });
    } catch (e: any) {
      setPopup(e?.message || "İlerleme taşınamadı.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) {
    return <main style={wrap}><p style={{ color: "var(--text-soft)" }}>Yükleniyor…</p></main>;
  }

  return (
    <main style={wrap}>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <a href="/"><Logo size={38} /></a>
      </div>

      <div style={card}>
        {/* --- Kim olduğun (her adımda üstte durur) --- */}
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <img
            src={avatarSrc(user.avatar_url, user.username)}
            alt=""
            style={{ width: 62, height: 62, borderRadius: "50%", border: "2px solid var(--border-soft)" }}
          />
          <div className="brand-mono" style={{ fontSize: 20, marginTop: 8, color: "var(--text-strong)" }}>
            {user.display_name}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 2 }}>@{user.username}</div>
        </div>

        {step.name === "done" ? (
          <>
            <div style={{ fontSize: 40, textAlign: "center" }}>✅</div>
            <h1 style={{ fontSize: 19, textAlign: "center", margin: "10px 0 8px", color: "var(--text-strong)" }}>
              {step.moved ? "İlerlemen taşındı" : "Hesabın kaydedildi"}
            </h1>
            <p style={desc}>
              {step.moved ? (
                <>
                  <b>{step.moved.xp_added.toLocaleString("tr")} XP</b> ve{" "}
                  <b>{step.moved.matches_added.toLocaleString("tr")} maç</b> eski hesabına eklendi.
                  Artık <b>@{step.moved.to_username}</b> hesabıyla oynuyorsun.
                </>
              ) : (
                <>Artık başka bir cihazdan da e-posta ve şifrenle girebilirsin.</>
              )}
            </p>
            <button style={cta} onClick={() => router.push("/")}>Ana sayfaya dön</button>
          </>
        ) : step.name === "transfer" ? (
          <>
            <div style={{ fontSize: 34, textAlign: "center" }}>🔁</div>
            <h1 style={{ fontSize: 18, textAlign: "center", margin: "10px 0 8px", color: "var(--text-strong)" }}>
              Bu e-posta zaten kayıtlı
            </h1>
            <p style={desc}>{step.message}</p>

            {/* Ne taşınacağının özeti — kişi ne kaybedip ne kazandığını görsün. */}
            <div style={box}>
              <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 6 }}>Taşınacak ilerleme</div>
              <div style={{ fontSize: 14.5, color: "var(--text-strong)", fontWeight: 700, lineHeight: 1.7 }}>
                💎 {step.progress.xp.toLocaleString("tr")} XP · 🎮 {step.progress.matches_played} maç
                {step.progress.wins > 0 && <> · 🏆 {step.progress.wins} galibiyet</>}
              </div>
            </div>

            <label style={label}>{email} hesabının şifresi</label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitTransfer(); }}
              placeholder="Eski hesabının şifresi"
              style={input}
              autoComplete="current-password"
            />

            <button style={cta} onClick={submitTransfer} disabled={busy}>
              {busy ? "Taşınıyor…" : "Giriş yap ve ilerlemeyi taşı"}
            </button>

            <p style={{ ...desc, fontSize: 12.5, marginTop: 14 }}>
              Taşıma bittiğinde bu hesap silinir, ilerlemesi eski hesabına eklenir.
              Vazgeçersen{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); setStep({ name: "form" }); setOldPassword(""); }}
                 style={{ color: "var(--accent)" }}>
                başka bir e-posta dene
              </a>.
            </p>
          </>
        ) : alreadyVerified ? (
          <>
            <div style={{ fontSize: 34, textAlign: "center" }}>✅</div>
            <h1 style={{ fontSize: 18, textAlign: "center", margin: "10px 0 8px", color: "var(--text-strong)" }}>
              Hesabın zaten kayıtlı
            </h1>
            <p style={desc}>
              Bu hesapta e-posta kayıtlı; başka bir cihazdan da girebilirsin.
              E-posta veya şifreni değiştirmek istersen profil düzenleme ekranını kullan.
            </p>
            <button style={cta} onClick={() => router.push("/")}>Ana sayfaya dön</button>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 19, textAlign: "center", margin: "0 0 10px", color: "var(--text-strong)" }}>
              Profili doğrula ve kaydet
            </h1>
            <p style={desc}>
              Başka bir cihazda oynayabilmek için gerekli. Telefonunu değiştirirsen veya
              uygulamayı silersen doğrulanmamış hesabın kaybolur.
            </p>

            <label style={label}>E-posta</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ornek@eposta.com"
              style={input}
              autoComplete="email"
              inputMode="email"
            />

            <label style={label}>Şifre</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="En az 6 karakter"
              style={{ ...input, marginBottom: 10 }}
              autoComplete="new-password"
            />

            <label style={label}>Şifre (tekrar)</label>
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canSave) submitVerify(); }}
              placeholder="Aynı şifreyi bir daha yaz"
              style={{
                ...input,
                // Altında uyarı satırı çıkacaksa boşluk küçülür, yoksa normal.
                marginBottom: password2.length > 0 ? 6 : 14,
                borderColor: pwMismatch ? "var(--accent-hot)" : "var(--border-soft)",
              }}
              autoComplete="new-password"
            />
            {password2.length > 0 && (
              <p style={{
                fontSize: 12.5, margin: "0 2px 14px",
                color: pwMismatch ? "var(--accent-hot)" : "var(--tile-correct)",
              }}>
                {pwMismatch ? "Şifreler birbiriyle uyuşmuyor" : "✓ Şifreler eşleşiyor"}
              </p>
            )}

            <button
              style={{ ...cta, opacity: canSave && !busy ? 1 : 0.55,
                       cursor: canSave && !busy ? "pointer" : "default" }}
              onClick={submitVerify}
              disabled={busy || !canSave}
            >
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </button>

            <p style={{ ...desc, fontSize: 12.5, marginTop: 14 }}>
              Adın ve ilerlemen aynen kalır — sadece hesabına bir anahtar eklemiş olursun.
            </p>
          </>
        )}
      </div>

      {popup && <AlertPopup message={popup} onClose={() => setPopup("")} />}
    </main>
  );
}

const wrap: React.CSSProperties = { maxWidth: 460, margin: "0 auto", padding: "28px 18px 40px" };

const card: React.CSSProperties = {
  background: "var(--bg-panel)", border: "1px solid var(--border-soft)",
  borderRadius: 20, padding: "24px 22px", boxShadow: "0 10px 30px rgba(0,0,0,.18)",
};

const desc: React.CSSProperties = {
  color: "var(--text-soft)", fontSize: 13.5, lineHeight: 1.6, textAlign: "center", margin: "0 0 16px",
};

const label: React.CSSProperties = {
  display: "block", fontSize: 12, color: "var(--text-dim)", fontWeight: 600, margin: "0 2px 6px",
};

const input: React.CSSProperties = {
  width: "100%", padding: "13px 14px", borderRadius: 12, marginBottom: 14,
  border: "1px solid var(--border-soft)", background: "var(--bg-elevated)",
  color: "var(--text-strong)", fontSize: 16,
};

const cta: React.CSSProperties = {
  width: "100%", padding: "15px", borderRadius: 13, border: "none", cursor: "pointer",
  background: "linear-gradient(135deg, var(--accent), var(--accent-hot))",
  color: "#1a1330", fontWeight: 900, fontSize: 16.5,
  boxShadow: "0 8px 22px var(--accent-glow)",
};

const box: React.CSSProperties = {
  background: "var(--bg-elevated)", border: "1px solid var(--border-soft)",
  borderRadius: 13, padding: "12px 14px", textAlign: "center", marginBottom: 16,
};
