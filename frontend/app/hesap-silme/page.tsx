"use client";

/**
 * Hesap silme — uygulama DIŞINDAN erişilebilen sayfa.
 *
 * NEDEN VAR
 * ---------
 * Google Play'in "Hesap silme" politikası iki şey istiyor:
 *   1. uygulama İÇİNDEN silme (o, profil → ⚠️ Tehlikeli Bölge),
 *   2. uygulamayı kurmadan da ulaşılabilen, GİRİŞ GEREKTİRMEYEN bir web adresi.
 * Bu sayfa ikincisidir; mağaza formuna bu adres yazılır.
 *
 * Girişli kullanıcıya doğrudan hesabını silebileceği yeri gösterir; girişsiz
 * kişi ise formu doldurup talep bırakır (destek biletine düşer, admin panelde
 * 🎫 Destek sekmesinde görünür).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/Logo";

export default function HesapSilmePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    const n = name.trim();
    const m = email.trim().toLowerCase();
    if (n.length < 2) { setErr("Adını ya da kullanıcı adını yaz."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)) { setErr("Sana ulaşabileceğimiz bir e-posta yaz."); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch(apiUrl("/api/support/tickets"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: n,
          email: m,
          subject: "Hesap silme talebi",
          message:
            "Bu bir HESAP SİLME talebidir.\n\n" +
            `Hesap adı / kullanıcı adı: ${n}\n` +
            `İletişim e-postası: ${m}\n\n` +
            `Ek not: ${note.trim() || "-"}`,
        }),
      });
      if (!r.ok) { setErr("Talep gönderilemedi, lütfen tekrar dene."); return; }
      setSent(true);
    } catch {
      setErr("Bağlantı hatası.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 620, margin: "0 auto", padding: "28px 18px 48px" }}>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <a href="/"><Logo size={38} /></a>
      </div>

      <h1 className="brand-mono" style={{ fontSize: 26, marginBottom: 10, color: "var(--text-strong)" }}>
        Hesap Silme
      </h1>
      <p style={{ color: "var(--text-soft)", fontSize: 14.5, lineHeight: 1.7 }}>
        Kelime Tahmin hesabını istediğin zaman kalıcı olarak silebilirsin.
        Silme işlemi <b>geri alınamaz</b>.
      </p>

      <Box title="Silinen veriler">
        <ul style={ul}>
          <li>E-posta adresin, şifren ve varsa Google bağlantın</li>
          <li>Profil fotoğrafın ve avatarın</li>
          <li>Seviyen, XP&apos;n, rozetlerin, kupaların ve madalyaların</li>
          <li>Arkadaş listen ve arkadaşlık bağların</li>
          <li>Bildirim kayıtların ve cihaz bildirim izinlerin</li>
        </ul>
      </Box>

      <Box title="Saklanan veriler">
        <ul style={ul}>
          <li>
            Oynadığın maçların kayıtları <b>rakiplerinin geçmişinde</b> kalır — ama
            senin adın <b>“Silinmiş üye”</b> olarak görünür, profiline bağlantı olmaz.
          </li>
        </ul>
        <p style={{ ...small, marginTop: 8 }}>
          Bunun sebebi: kaydı tamamen silmek, hiç ilgisi olmayan başka oyuncuların
          maç geçmişini de bozardı.
        </p>
      </Box>

      {/* --- Girişliyse doğrudan silebilir --- */}
      {!loading && user && (
        <Box title="Hesabın açık — hemen silebilirsin" accent>
          <p style={{ color: "var(--text-soft)", fontSize: 14, lineHeight: 1.7, margin: "0 0 12px" }}>
            <b>{user.display_name}</b> olarak giriş yapmışsın. Profil düzenleme
            ekranındaki <b>⚠️ Tehlikeli Bölge</b> bölümünden hesabını tek adımda silebilirsin.
          </p>
          <button
            onClick={() => router.push(`/profil/${user.username}?duzenle=1`)}
            style={cta}
          >
            Profil ayarlarına git →
          </button>
        </Box>
      )}

      {/* --- Girişsizse talep formu --- */}
      {!loading && !user && (
        <Box title="Giriş yapamıyorsan talep bırak">
          {sent ? (
            <p style={{ color: "var(--tile-correct)", fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>
              ✓ Talebin bize ulaştı. En kısa sürede e-posta ile dönüş yapacağız.
            </p>
          ) : (
            <>
              <p style={{ color: "var(--text-soft)", fontSize: 14, lineHeight: 1.7, margin: "0 0 14px" }}>
                Uygulamaya girebiliyorsan hesabını kendin silmen en hızlı yoldur:{" "}
                <b>Menü → Profilim → Düzenle → ⚠️ Tehlikeli Bölge</b>.
                Giriş yapamıyorsan aşağıdaki formu doldur, biz silelim.
              </p>

              <label style={label}>Hesap adın veya kullanıcı adın</label>
              <input value={name} onChange={(e) => { setName(e.target.value); setErr(""); }}
                placeholder="Örn. Ayşe Gül veya aysegul" style={input} />

              <label style={label}>Sana ulaşabileceğimiz e-posta</label>
              <input value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }}
                type="email" inputMode="email" placeholder="ornek@eposta.com" style={input} />

              <label style={label}>Eklemek istediğin bir şey (isteğe bağlı)</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                placeholder="Örn. hangi cihazdan oynuyordun" style={{ ...input, fontFamily: "inherit" }} />

              {err && <p style={{ color: "var(--accent-hot)", fontSize: 13.5, margin: "0 0 10px" }}>{err}</p>}

              <button onClick={submit} disabled={busy} style={{ ...cta, opacity: busy ? 0.6 : 1 }}>
                {busy ? "Gönderiliyor…" : "Silme talebi gönder"}
              </button>
              <p style={{ ...small, marginTop: 10 }}>
                Talebini aldıktan sonra kimliğini doğrulamak için e-posta ile
                yazabiliriz. Silme en geç 30 gün içinde tamamlanır.
              </p>
            </>
          )}
        </Box>
      )}

      <p style={{ ...small, marginTop: 22, textAlign: "center" }}>
        Sorun mu var? <a href="/iletisim" style={{ color: "var(--accent)" }}>İletişim sayfası</a> ·{" "}
        <a href="/gizlilik" style={{ color: "var(--accent)" }}>Gizlilik Politikası</a>
      </p>
    </main>
  );
}

function Box({ title, children, accent }: { title: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <section style={{
      background: "var(--bg-panel)", borderRadius: 16, padding: "18px 18px 20px",
      border: `1px solid ${accent ? "var(--accent)" : "var(--border-soft)"}`,
      marginTop: 18,
    }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-strong)", margin: "0 0 10px" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

const ul: React.CSSProperties = {
  margin: 0, paddingLeft: 18, color: "var(--text-soft)", fontSize: 14, lineHeight: 1.85,
};
const small: React.CSSProperties = { color: "var(--text-dim)", fontSize: 12.5, lineHeight: 1.6 };
const label: React.CSSProperties = {
  display: "block", fontSize: 12, color: "var(--text-dim)", fontWeight: 600, margin: "0 2px 6px",
};
const input: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 12, marginBottom: 14,
  border: "1px solid var(--border-soft)", background: "var(--bg-elevated)",
  color: "var(--text-strong)", fontSize: 15,
};
const cta: React.CSSProperties = {
  width: "100%", padding: "14px", borderRadius: 13, border: "none", cursor: "pointer",
  background: "linear-gradient(135deg, var(--accent), var(--accent-hot))",
  color: "#1a1330", fontWeight: 900, fontSize: 16,
};
