"use client";

/**
 * Sonuç paylaşım metinleri.
 *
 * Paylaşılan adres oyuncunun bulunduğu sayfadır (ör. /arena, /oyna,
 * /gunun-kelimesi); metin ise sonuca göre zenginleştirilir:
 *   "⚔️ Nazım, Ahmet'i 200-0 yendi!"  ·  "🥈 Nazım arenada 2. oldu!"
 *
 * Not: Facebook paylaşımında metin gösterilmez (sadece adresin OG başlığı
 * çıkar) — bu Facebook'un kısıtı. WhatsApp / X / Telegram metni taşır.
 */

import { SITE_URL } from "./site";

/** Paylaşılacak adres: bulunulan sayfa (sorgu parametreleri atılır). */
export function pageUrl(): string {
  if (typeof window === "undefined") return SITE_URL;
  return `${window.location.origin}${window.location.pathname}`.replace(/\/$/, "") || window.location.origin;
}

const VOWELS = "aeıioöuü";
const ACC_SUFFIX: Record<string, string> = {
  a: "ı", ı: "ı", e: "i", i: "i", o: "u", u: "u", "ö": "ü", "ü": "ü",
};

/** Türkçe belirtme hâli: "Nazım" -> "Nazım'ı", "Ayşe" -> "Ayşe'yi". */
export function acc(name: string): string {
  const base = (name || "").trim().replace(/[.\s]+$/, "");
  if (!base) return name || "";
  const lower = base.toLocaleLowerCase("tr");
  let lastVowel = "";
  for (let i = lower.length - 1; i >= 0; i--) {
    if (VOWELS.includes(lower[i])) { lastVowel = lower[i]; break; }
  }
  const suffix = ACC_SUFFIX[lastVowel] || "i";
  const endsWithVowel = VOWELS.includes(lower[lower.length - 1]);
  return `${base}'${endsWithVowel ? "y" : ""}${suffix}`;
}

const FOOTER = "🎯 Kelime Tahmin — Türkçe kelime oyunu";

/** 1v1 düello sonucu. */
export function matchShareText(o: {
  me: string; opp: string; myScore: number; oppScore: number; draw?: boolean; won?: boolean;
}): string {
  const me = o.me || "Oyuncu";
  const opp = o.opp || "Rakip";
  if (o.draw) {
    return `🤝 ${me} ve ${opp} ${o.myScore}-${o.oppScore} berabere kaldı!\n⚔️ 1v1 Düello\n${FOOTER}`;
  }
  if (o.won) {
    return `🏆 ${me}, ${acc(opp)} ${o.myScore}-${o.oppScore} yendi!\n⚔️ 1v1 Düello\n${FOOTER}`;
  }
  return `⚔️ ${opp}, ${acc(me)} ${o.oppScore}-${o.myScore} yendi. Rövanş vakti! 🔥\n${FOOTER}`;
}

/** Arena sonucu (5 kişilik hız yarışı). */
export function arenaShareText(o: {
  me: string; rank: number; score: number; correct?: number; total?: number; players?: number;
}): string {
  const me = o.me || "Oyuncu";
  const medal = o.rank === 1 ? "🥇" : o.rank === 2 ? "🥈" : o.rank === 3 ? "🥉" : "🎮";
  const head = o.rank === 1
    ? `🏆 ${me} arenada BİRİNCİ oldu! 🥇`
    : `${medal} ${me} arenada ${o.rank}. oldu!`;
  const detail = [
    `⚡ ${o.score} puan`,
    o.correct != null && o.total != null ? `✅ ${o.correct}/${o.total} doğru` : "",
    o.players ? `👥 ${o.players} kişilik arena` : "",
  ].filter(Boolean).join(" · ");
  return `${head}\n${detail}\n${FOOTER}`;
}

/** Günün kelimesi sonucu (emoji ızgarasıyla). */
export function dailyShareText(o: {
  rows: { state: string }[][]; maxRows: number; won: boolean; date?: string;
}): string {
  const grid = o.rows.map((row) =>
    row.map((t) => (t.state === "correct" ? "🟩" : t.state === "present" ? "🟨" : "⬛")).join("")
  ).join("\n");
  const result = o.won ? `${o.rows.length}/${o.maxRows}` : `X/${o.maxRows}`;
  const head = o.won ? `📅 Günün Kelimesi ${result} ✅` : `📅 Günün Kelimesi ${result} 😔`;
  return `${head}${grid ? `\n${grid}` : ""}\n${FOOTER}`;
}

/** Maraton bölüm sonucu. */
export function soloShareText(o: { me?: string; level: number; stars: number; total?: number }): string {
  const stars = "⭐".repeat(Math.max(0, Math.min(3, o.stars))) + "☆".repeat(Math.max(0, 3 - o.stars));
  const who = o.me ? `${o.me} · ` : "";
  const total = o.total ? `\n🌟 Toplam yıldız: ${o.total}` : "";
  return `🏃 ${who}Maraton Bölüm ${o.level} tamamlandı!\n${stars}${total}\n${FOOTER}`;
}
