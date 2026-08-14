"use client";

import { useState } from "react";
import { toUpperTr } from "@/lib/turkish";

// Maçtan BAĞIMSIZ öğretici demo. Gerçek maç/WS yok.
// Sahte skorbar (Sen + Bot), demo grid, input. Hedef kelime sabit: KALEM.
// Kullanıcı adım adım yönlendirilir; KALEM yazınca harfler yeşil/sarı boyanır.

const TARGET = "KALEM";
const LEN = TARGET.length;

// Bir tahmini hedefe göre renklendir: correct(yeşil)/present(sarı)/absent(gri).
function scoreGuess(guess: string): ("correct" | "present" | "absent")[] {
  const res: ("correct" | "present" | "absent")[] = [];
  const targetArr = TARGET.split("");
  const used = new Array(LEN).fill(false);
  // Önce tam doğrular (yeşil).
  for (let i = 0; i < LEN; i++) {
    if (guess[i] === targetArr[i]) { res[i] = "correct"; used[i] = true; }
  }
  // Sonra yanlış yerde olanlar (sarı) / yok (gri).
  for (let i = 0; i < LEN; i++) {
    if (res[i]) continue;
    const idx = targetArr.findIndex((c, j) => c === guess[i] && !used[j]);
    if (idx >= 0) { res[i] = "present"; used[idx] = true; }
    else res[i] = "absent";
  }
  return res;
}

const COLORS = {
  correct: "var(--tile-correct)",
  present: "var(--tile-present)",
  absent: "var(--tile-absent)",
};

// Örnek dolu satır (renk mantığını göstermek için): KİTAP
// Hedef KALEM ile aynı ilk harf (K) — çünkü oyunda ilk harf ipucu olarak verilir.
// KİTAP -> K yeşil (doğru yer), A sarı (kelimede var, yanlış yer), İ/T/P gri (yok).
const EXAMPLE = "KİTAP";

const STEPS = [
  {
    title: "Kelime Tahmin'e hoş geldin! 👋",
    body: "Rakibinle karşılıklı kelime bilme yarışı. Küçük bir örnekle nasıl oynandığını görelim. Bu bir denemedir, puanın etkilenmez.",
  },
  {
    title: "İlk harf ipucu olarak verilir 🔑",
    body: "Aradığımız 5 harfli kelime K ile başlıyor. Oyunda kelimenin ilk harfi her zaman ipucu olarak açık gelir; kalanını sen bulacaksın.",
  },
  {
    title: "Renkler ne anlama gelir? 🟩🟨⬜",
    body: "Üstteki örnek tahmin KİTAP. K yeşil çünkü doğru harf, doğru yerde. A sarı çünkü kelimede var ama başka yerde. İ, T, P gri çünkü kelimede hiç yok.",
  },
  {
    title: "Şimdi sıra sende ✍️",
    body: "Aşağıdaki kutuya KALEM yazıp Gönder'e bas. (İpucu: K-A-L-E-M)",
  },
  {
    title: "Sesli de söyleyebilirsin 🎤",
    body: "Gerçek maçta mikrofon butonuna basılı tutup kelimeyi söyleyebilirsin; otomatik yazılır.",
  },
  {
    title: "Süre ve puan ⏱️",
    body: "Gerçek maçta toplam süreden geri sayım başlar. Ne kadar hızlı bilirsen kalan süre o kadar çok puana döner.",
  },
  {
    title: "Joker hakların 🃏",
    body: "Zorlandığında joker kullanırsın: bir harfi açığa çıkarır (yeşil/sarı) ya da +10 saniye kazandırır.",
  },
  {
    title: "Oyunun kuralları 📋",
    body: "3 tur oynanır: sırasıyla 4, 5 ve 6 harfli birer kelime. Her turda önce doğru bilen turu kazanır; en çok puanı toplayan maçı kazanır. Hazırsan gerçek bir maça başlayabilirsin!",
  },
];

export default function TutorialDemo({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const [draft, setDraft] = useState("");
  const [guessRow, setGuessRow] = useState<string | null>(null); // kullanıcının gönderdiği KALEM
  const [solved, setSolved] = useState(false);

  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const isGuessStep = i === 3; // "KALEM yaz" adımı

  const exampleScore = scoreGuess(EXAMPLE);
  const guessScore = guessRow ? scoreGuess(guessRow) : null;

  function submit() {
    const clean = toUpperTr(draft).replace(/[^A-ZÇĞİÖŞÜI]/g, "").slice(0, LEN);
    if (clean.length !== LEN) return;
    setGuessRow(clean);
    if (clean === TARGET) {
      setSolved(true);
      // Doğru bilince otomatik bir sonraki adıma geç.
      setTimeout(() => setI((v) => Math.min(STEPS.length - 1, v + 1)), 900);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "var(--bg)", overflowY: "auto" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "calc(20px + var(--kt-safe-top)) 16px calc(40px + var(--kt-safe-bottom) + var(--kt-banner-space, 0px))", display: "grid", gap: 16 }}>
        {/* Üst bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="brand-mono" style={{ fontSize: 18, color: "var(--accent)" }}>Nasıl Oynanır?</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: 24, cursor: "pointer" }}>×</button>
        </div>

        {/* Sahte skorbar */}
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1, background: "var(--accent-glow)", borderRadius: 12, padding: "10px 14px", border: "1px solid var(--accent)" }}>
            <div style={{ fontSize: 13, color: "var(--text-soft)" }}>Sen</div>
            <div className="brand-mono" style={{ fontSize: 22, color: "var(--accent)" }}>{solved ? 100 : 0}</div>
          </div>
          <div style={{ flex: 1, background: "var(--bg-panel)", borderRadius: 12, padding: "10px 14px" }}>
            <div style={{ fontSize: 13, color: "var(--text-soft)" }}>🤖 Bot Rakip</div>
            <div className="brand-mono" style={{ fontSize: 22, color: "var(--text-dim)" }}>0</div>
          </div>
        </div>

        {/* Süre + joker göstergesi (dekoratif) */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "var(--text-dim)" }}>
          <span>⏱️ Süre: 90sn</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center",
              background: "linear-gradient(145deg,#FFD86B,#D4AF37)", color: "#4a3b00", fontWeight: 800, fontSize: 13,
              border: i === 6 ? "2px solid var(--accent)" : "none",
            }}>J</span>
            Joker
          </span>
        </div>

        {/* Demo grid */}
        <div style={{ display: "grid", gap: 6, justifyContent: "center" }}>
          {/* Örnek satır: MAKAS */}
          <Row letters={EXAMPLE} score={exampleScore} highlight={i === 2} />
          {/* Kullanıcı satırı */}
          {guessRow ? (
            <Row letters={guessRow} score={guessScore!} />
          ) : (
            <Row letters={draft.padEnd(LEN).slice(0, LEN)} score={null} active={isGuessStep} />
          )}
        </div>

        {/* Giriş (sadece tahmin adımında aktif) */}
        {isGuessStep && !solved && (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(toUpperTr(e.target.value).replace(/[^A-ZÇĞİÖŞÜI]/g, "").slice(0, LEN))}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="KALEM yaz"
              style={{
                flex: 1, padding: "12px 14px", borderRadius: 10, border: "2px solid var(--accent)",
                background: "var(--bg-elevated)", color: "var(--text-strong)", fontSize: 18,
                textAlign: "center", letterSpacing: "0.15em", fontWeight: 700,
              }}
            />
            <button onClick={submit} style={{
              padding: "12px 20px", borderRadius: 10, border: "none",
              background: "var(--accent)", color: "#1a1330", fontWeight: 700, fontSize: 15, cursor: "pointer",
            }}>Gönder</button>
          </div>
        )}

        {solved && i === 3 && (
          <div style={{ textAlign: "center", color: "var(--tile-correct)", fontWeight: 700, fontSize: 16 }}>
            🎉 Harika! Tüm harfler yeşil — kelimeyi buldun!
          </div>
        )}

        {/* Açıklama kartı */}
        <div style={{
          background: "var(--bg-panel)", borderRadius: 16, padding: 20,
          border: "2px solid var(--accent)", textAlign: "center",
        }}>
          <h2 className="brand-mono" style={{ fontSize: 19, margin: "0 0 8px", color: "var(--accent)" }}>{step.title}</h2>
          <p style={{ color: "var(--text-soft)", fontSize: 15, lineHeight: 1.5, margin: 0 }}>{step.body}</p>

          {/* İlerleme noktaları */}
          <div style={{ display: "flex", gap: 6, justifyContent: "center", margin: "14px 0" }}>
            {STEPS.map((_, idx) => (
              <span key={idx} style={{ width: 7, height: 7, borderRadius: "50%", background: idx === i ? "var(--accent)" : "var(--border-soft)" }} />
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            {!last && <button onClick={onClose} style={btnGhost}>Geç</button>}
            {/* Tahmin adımında, çözülmeden devam edilemez */}
            <button
              onClick={() => { if (last) onClose(); else setI(i + 1); }}
              disabled={isGuessStep && !solved}
              style={{ ...btnPrimary, opacity: isGuessStep && !solved ? 0.5 : 1, cursor: isGuessStep && !solved ? "default" : "pointer" }}
            >
              {last ? "Bitir 🚀" : "Devam →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ letters, score, active, highlight }: {
  letters: string; score: ("correct" | "present" | "absent")[] | null; active?: boolean; highlight?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 6, transition: "transform .3s", ...(highlight ? { transform: "scale(1.04)" } : {}) }}>
      {Array.from({ length: LEN }).map((_, i) => {
        const ch = letters[i]?.trim() || "";
        const bg = score ? COLORS[score[i]] : "var(--tile-empty)";
        const color = score ? "#fff" : "var(--text-strong)";
        return (
          <span key={i} style={{
            width: 46, height: 46, borderRadius: 10, display: "grid", placeItems: "center",
            fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display)",
            background: bg, color,
            border: !score ? (active ? "2px solid var(--accent)" : "1px solid var(--tile-border)") : "none",
          }}>{ch}</span>
        );
      })}
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  padding: "11px 22px", borderRadius: 11, border: "none",
  background: "var(--accent)", color: "#1a1330", fontWeight: 700, fontSize: 15,
};
const btnGhost: React.CSSProperties = {
  padding: "11px 18px", borderRadius: 11, border: "1px solid var(--border-soft)",
  background: "transparent", color: "var(--text-soft)", fontWeight: 600, fontSize: 15, cursor: "pointer",
};
