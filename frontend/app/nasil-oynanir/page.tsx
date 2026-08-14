import type { Metadata } from "next";

import Logo from "@/components/Logo";
import GuessDemo from "@/components/GuessDemo";
import PageBody from "@/components/PageBody";
import { fetchPageContent } from "@/lib/pageContent";
import { pageMetadata } from "@/lib/seo";

// SEO: admin → "🔍 SEO" sekmesi (how).
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("how");
}

export const revalidate = 60;

/**
 * Nasıl Oynanır? — görsel anlatım.
 *
 * ÖNEMLİ: Sayfanın düzeni, renk demosu ve mod kartları BU DOSYADADIR; admin
 * panelindeki "📄 Sayfalar" ekranından düzenlenen metin yalnızca en alttaki
 * "Sık sorulanlar" bölümüne basılır. Böylece metin kaydedildiğinde animasyon
 * ve şekiller bozulmaz.
 */

type Mode = {
  icon: string;
  title: string;
  desc: string;
  g1: string;
  g2: string;
  steps: string[];
  tags: string[];
  href: string;
};

const MODES: Mode[] = [
  {
    icon: "⚔️", title: "1v1 Düello", href: "/oyna",
    g1: "#3fc356", g2: "#2f9c42",
    desc: "Oyunun kalbi: iki kişi, tek kelime ve sıra kapma yarışı.",
    steps: [
      "“Rakip Bul”a bas — seviyene yakın bir oyuncu eşleşir.",
      "Tur başında sıra boştur; ilk yazmaya başlayan söz hakkını kapar.",
      "Bilemezsen sıra rakibe geçer; kelimeyi ilk bulan turu kazanır.",
      "Kalan süreye göre puan alırsın, hız bonusu ilk buzzer'ındır.",
    ],
    tags: ["2 oyuncu", "Sıra tabanlı", "ELO + puan", "Rövanş"],
  },
  {
    icon: "🤖", title: "1vB Pratik", href: "/oyna?mode=bot",
    g1: "#7b8794", g2: "#57606a",
    desc: "Bota karşı ısınma turu. Baskı yok, istediğin kadar dene.",
    steps: [
      "Ana sayfadan “1vB Pratik”i seç.",
      "Bot seviyene göre oynar; kuralların tamamı aynıdır.",
      "Sonuç lige işlemez — rahatça pratik yaparsın.",
    ],
    tags: ["Tek başına", "Ödülsüz", "Isınma"],
  },
  {
    icon: "🏟️", title: "Arena", href: "/arena",
    g1: "#e0940a", g2: "#c47a00",
    desc: "Beş kişilik hız yarışı. Sıra yok — herkes aynı anda yazar.",
    steps: [
      "Arenaya gir, oda dolana kadar bekle (eksik yer botla dolar).",
      "Her soruda kelimeyi en hızlı ve doğru yazan puanı kapar.",
      "Cevaplar harf harf çevrilerek açılır; anında kimin bildiğini görürsün.",
      "Podyumda ilk üçe girersen kupa ya da madalya kazanırsın.",
    ],
    tags: ["5 oyuncu", "Hız yarışı", "Kupa & madalya", "XP"],
  },
  {
    icon: "🎪", title: "Özel Arena", href: "/arena/ozel",
    g1: "#7b52c4", g2: "#5e3a9e",
    desc: "Aynı arena, sadece senin davet ettiklerinle.",
    steps: [
      "“Özel Arena”dan oda kur, çıkan kodu arkadaşlarına gönder.",
      "Herkes kodu girip katılır; oyunu sen başlatırsın.",
      "Eğlence için: kupa, madalya ve XP verilmez.",
    ],
    tags: ["Arkadaş grubu", "Kod ile katılım", "Ödülsüz"],
  },
  {
    icon: "🔐", title: "Özel Oda (1v1)", href: "/oyna?mode=create",
    g1: "#3a7fc4", g2: "#2868a8",
    desc: "Rastgele rakip yerine belirlediğin kişiyle düello.",
    steps: [
      "“Özel Oda Kur”a bas, oluşan kodu paylaş.",
      "Arkadaşın ana sayfadaki kutuya kodu yazıp katılır.",
      "Maç normal düello kurallarıyla oynanır.",
    ],
    tags: ["Davetli", "Oda kodu", "1v1 kuralları"],
  },
  {
    icon: "🏃", title: "Maraton", href: "/solo",
    g1: "#4a8fc4", g2: "#2e6da8",
    desc: "Tek kişilik ilerleme modu: bölüm bölüm zorlaşır.",
    steps: [
      "Her bölümde bir kelime ve bir süre vardır.",
      "Kalan süreye göre 1–3 yıldız kazanırsın.",
      "Bölümü geçince bir sonraki açılır; ilerlemen kayıtlıdır.",
    ],
    tags: ["Tek başına", "Yıldızlı bölümler", "XP"],
  },
  {
    icon: "📅", title: "Günün Kelimesi", href: "/gunun-kelimesi",
    g1: "#c44a7e", g2: "#a23763",
    desc: "Herkese aynı kelime, günde tek hak. Sonucunu paylaş.",
    steps: [
      "Kelimenin ilk harfi ve uzunluğu gösterilir.",
      "6 hakkın var; harfler her tahminde renklenir.",
      "Ertesi gün yeni bir kelime gelir.",
    ],
    tags: ["Günlük", "Üyeliksiz oynanır", "Paylaşılabilir"],
  },
  {
    icon: "🏆", title: "Lig ve Ödüller", href: "/lig",
    g1: "#d4a017", g2: "#a87c0c",
    desc: "Puanların seni sıralamada yükseltir, dönem sonunda ödül gelir.",
    steps: [
      "Günlük sıralamaya günün EN İYİ maçının puanı yazılır.",
      "Günlük puanların aylık ve yıllık toplamına eklenir.",
      "Dönem sonunda ilk üç oyuncu kupa ve madalya kazanır.",
    ],
    tags: ["Günlük / aylık", "Kupa", "Madalya", "Rozet"],
  },
];

const FACTS = [
  { icon: "⚡", title: "Hız bonusu", desc: "İlk buzzer'a basan ve erken bilen ek puan alır." },
  { icon: "🃏", title: "Jokerler", desc: "Yeşil harf, sarı harf ve süre uzatma — her maçta sınırlı." },
  { icon: "💎", title: "XP ve unvan", desc: "Her maç XP getirir; XP arttıkça yeni unvanlar açılır." },
  { icon: "🎖️", title: "Rozetler", desc: "Galibiyet, arena ve kelime hedeflerini tamamladıkça açılır." },
];

export default async function NasilOynanirPage() {
  const page = await fetchPageContent("nasil-oynanir");

  return (
    <main style={{ flex: 1, maxWidth: 760, width: "100%", margin: "0 auto", padding: "24px 20px 64px" }}>
      <div className="kt-mobile-only" style={{ marginBottom: 24 }}>
        <a href="/"><Logo size={36} /></a>
      </div>

      <h1 className="brand-mono" style={{ fontSize: 30, marginBottom: 10, textAlign: "center" }}>
        Nasıl Oynanır?
      </h1>
      <p className="ho-lead">
        Kelime Tahmin, gizli kelimeyi rakibinden önce bulma yarışıdır. Kurallar bir
        dakikada öğrenilir; asıl keyif hız ve sıra kapmadadır.
      </p>

      {/* 1) Renklerin anlamı — canlı demo */}
      <section className="ho-section">
        <h2 className="ho-h2">🎨 Önce renkler</h2>
        <p className="ho-sub">
          Bir kelime yazdığında harfler renklenir. Aşağıda gizli kelime <strong>KİTAP</strong>;
          oyuncu önce KALEM deniyor, sonra doğru cevabı buluyor.
        </p>

        <GuessDemo />

        <div className="ho-legend">
          <div className="ho-legend-row">
            <span className="ho-chip" style={{ background: "var(--tile-correct)" }}>K</span>
            <span><strong>Yeşil</strong> — harf doğru ve doğru yerde.</span>
          </div>
          <div className="ho-legend-row">
            <span className="ho-chip" style={{ background: "var(--tile-present)", color: "#17122b" }}>A</span>
            <span><strong>Sarı</strong> — harf kelimede var ama başka yerde.</span>
          </div>
          <div className="ho-legend-row">
            <span className="ho-chip" style={{ background: "var(--tile-absent)" }}>L</span>
            <span><strong>Gri</strong> — bu harf kelimede yok.</span>
          </div>
        </div>
      </section>

      {/* 2) Modlar */}
      <section className="ho-section">
        <h2 className="ho-h2">🎮 Oyun modları</h2>
        <p className="ho-sub">Aynı kelime mantığı, sekiz farklı oynanış. Kartın üstüne dokunup doğrudan başlayabilirsin.</p>
        <div className="ho-modes">
          {MODES.map((m) => (
            <article className="ho-mode" key={m.title} style={{ ["--g1" as any]: m.g1, ["--g2" as any]: m.g2 }}>
              <span className="ho-mode-icon" aria-hidden>{m.icon}</span>
              <h3 className="ho-mode-title">
                <a href={m.href} style={{ color: "inherit", textDecoration: "none" }}>{m.title}</a>
              </h3>
              <p className="ho-mode-desc">{m.desc}</p>
              <ol className="ho-mode-steps">
                {m.steps.map((s, i) => (
                  <li key={i}><span className="ho-step-no">{i + 1}</span><span>{s}</span></li>
                ))}
              </ol>
              <div className="ho-mode-tags">
                {m.tags.map((t) => <span className="ho-tag" key={t}>{t}</span>)}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 3) Puan / ödül şeridi */}
      <section className="ho-section">
        <h2 className="ho-h2">⭐ Puan, joker ve ödüller</h2>
        <p className="ho-sub">Kazanmak kadar hızlı kazanmak da önemli.</p>
        <div className="ho-facts">
          {FACTS.map((f) => (
            <div className="ho-fact" key={f.title}>
              <div className="ho-fact-icon" aria-hidden>{f.icon}</div>
              <div className="ho-fact-title">{f.title}</div>
              <div className="ho-fact-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 4) Yönetilebilir metin — admin panelinden düzenlenir */}
      <section className="ho-section">
        <h2 className="ho-h2">💬 Sık sorulanlar</h2>
        <div style={{ fontSize: 15 }}>
          <PageBody body={page.body} />
        </div>
      </section>

      <div className="ho-cta">
        <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: "var(--text-strong)", marginBottom: 6 }}>
          Hazırsan sıra sende
        </div>
        <p style={{ color: "var(--text-soft)", fontSize: 14, margin: "0 0 16px" }}>
          Üye olmadan da oynayabilirsin — ilk maçın 30 saniye uzağında.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/oyna" style={{
            display: "inline-block", padding: "14px 28px", background: "var(--accent)",
            color: "#1a1330", borderRadius: 12, fontWeight: 700, fontFamily: "var(--font-display)",
          }}>Hemen Oyna →</a>
          <a href="/gunun-kelimesi" style={{
            display: "inline-block", padding: "14px 28px", background: "var(--bg-elevated)",
            color: "var(--text-strong)", border: "1px solid var(--border-soft)",
            borderRadius: 12, fontWeight: 700, fontFamily: "var(--font-display)",
          }}>Günün Kelimesi</a>
        </div>
      </div>

      <div style={{ marginTop: 36, paddingTop: 20, borderTop: "1px solid var(--border-soft)" }}>
        <a href="/" style={{ color: "var(--accent)", fontWeight: 600 }}>← Ana sayfaya dön</a>
      </div>
    </main>
  );
}
