"use client";

/**
 * "Bunun için bir hesap gerekiyor" ekranı — eski GuestJoin'in yerine geçti.
 *
 * NEDEN DEĞİŞTİ
 * -------------
 * Eskiden hesapsız ziyaretçiye "Misafir Olarak Katıl" seçeneği sunuluyordu.
 * Misafirin puanı, rozeti, geçmişi hiçbir yere yazılmıyordu — kişi oynuyor ama
 * hiçbir şey biriktirmiyordu. Artık hesap açmak tek isim yazmak olduğu için
 * misafirliğe gerek kalmadı: bu ekran doğrudan isim popup'ını açar.
 *
 * DAVRANIŞ
 *  - Açılır açılmaz isim popup'ı kendiliğinden çıkar (kişi fazladan tıklamasın).
 *  - Popup ✕ ile kapatılırsa arkada bu kart kalır; "İsmini yaz, başla" düğmesi
 *    popup'ı yeniden açar.
 *  - Hesap açılınca `onReady` çalışır (genelde sayfa kendiliğinden ilerler,
 *    çünkü useAuth().user dolunca bu ekran zaten kaybolur).
 */

import { useEffect, useRef } from "react";
import Logo from "@/components/Logo";
import { useAccountGate } from "@/lib/accountGate";

export default function AccountRequired({
  icon = "🎮",
  title,
  subtitle,
  note,
  onReady,
}: {
  icon?: string;
  title: string;
  subtitle?: string;
  note?: string;
  onReady?: () => void;
}) {
  const { openNamePrompt } = useAccountGate();
  // Popup yalnız BİR kez kendiliğinden açılsın; kullanıcı kapattıysa üstüne
  // tekrar açılmasın (yoksa kapatılamayan bir ekran olurdu).
  const auto = useRef(false);

  useEffect(() => {
    if (auto.current) return;
    auto.current = true;
    openNamePrompt(onReady);
    // onReady kasten bağımlılıkta değil: her render'da popup yeniden açılmasın.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNamePrompt]);

  return (
    <main style={{ maxWidth: 460, margin: "0 auto", padding: "28px 18px 40px" }}>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <a href="/"><Logo size={40} /></a>
      </div>

      <div style={{
        background: "var(--bg-panel)", border: "1px solid var(--border-soft)",
        borderRadius: 20, padding: "26px 22px", textAlign: "center",
        boxShadow: "0 10px 30px rgba(0,0,0,.18)",
      }}>
        <div style={{ fontSize: 42, marginBottom: 8 }}>{icon}</div>
        <h1 className="brand-mono" style={{ fontSize: 24, marginBottom: 6, color: "var(--text-strong)" }}>{title}</h1>
        {subtitle && (
          <p style={{ color: "var(--text-soft)", fontSize: 14, lineHeight: 1.5, marginBottom: 18 }}>{subtitle}</p>
        )}

        <button
          type="button"
          onClick={() => openNamePrompt(onReady)}
          style={{
            display: "block", width: "100%", padding: "15px", borderRadius: 13, border: "none",
            background: "linear-gradient(135deg, var(--accent), var(--accent-hot))",
            color: "#1a1330", fontWeight: 900, fontSize: 17, cursor: "pointer",
            boxShadow: "0 8px 22px var(--accent-glow)",
          }}
        >
          İsmini yaz, başla →
        </button>

        <p style={{ color: "var(--text-dim)", fontSize: 12, lineHeight: 1.5, marginTop: 14 }}>
          {note ?? "Tek bir isim yeter; puanların ve rozetlerin ilk maçtan itibaren kaydedilir."}
        </p>

        <a href="/giris" style={{
          display: "inline-block", marginTop: 12, fontSize: 12.5,
          color: "var(--text-dim)", textDecoration: "none", opacity: .85,
        }}>
          Zaten hesabın var mı? Giriş yap
        </a>
      </div>
    </main>
  );
}
