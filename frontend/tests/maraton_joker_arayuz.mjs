// Maraton joker düğmesi + alt menü hizası (tarayıcı senaryosu).
// ÖN KOŞUL: test backend'inde solo_jokers_enabled=1, solo_joker_per_level=2.
import { chromium, devices } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:3001";
const API = process.env.API || "http://127.0.0.1:8099";
let ok = 0, fail = 0;
const check = (l, c, e = "") => { c ? (ok++, console.log(`  ✓ ${l}`)) : (fail++, console.log(`  ✗ ${l}  ${e}`)); };

const browser = await chromium.launch();

// İsimle hesap aç ve jetonu tarayıcıya koy.
const res = await fetch(`${API}/api/auth/quick`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Joker Testi" }),
});
const { token } = await res.json();

const ctx = await browser.newContext(devices["Pixel 5"]);
await ctx.addInitScript((t) => localStorage.setItem("kt_token", t), token);
const page = await ctx.newPage();

console.log("\n1) Maraton bölümünde joker düğmesi");
await page.goto(`${BASE}/solo`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
// Haritadan 1. bölümü aç.
await page.getByText("1", { exact: true }).first().click();
await page.waitForTimeout(2500);

const jokerBtn = page.getByRole("button", { name: /Harf Aç/ });
check("joker düğmesi çıkıyor", await jokerBtn.count() === 1, await page.locator("body").innerText());
check("yıldız simgesi kullanılıyor", (await jokerBtn.first().innerText()).includes("★"));
check("kalan hak yazıyor (2)", (await jokerBtn.first().innerText()).includes("(2)"));

// Izgaradaki dolu kutuları say (ilk harf ipucu dahil).
const doluSayisi = async () => page.evaluate(() => {
  const spans = [...document.querySelectorAll("span")].filter(
    (s) => s.style.width === "50px" && s.style.height === "50px");
  return spans.filter((s) => (s.textContent || "").trim().length > 0).length;
});
const once = await doluSayisi();
await jokerBtn.first().click();
await page.waitForTimeout(1200);
const sonra = await doluSayisi();
check("joker bir harf açtı", sonra === once + 1, `${once} -> ${sonra}`);
check("hak 1'e düştü", (await jokerBtn.first().innerText()).includes("(1)"));

await jokerBtn.first().click();
await page.waitForTimeout(1200);
check("ikinci joker de çalıştı", await doluSayisi() === once + 2);
const bitti = await page.getByRole("button", { name: /Joker bitti/ }).count();
check("hak bitince düğme pasifleşti", bitti === 1);

console.log("\n2) Alt menü hizası (ana dışındaki 4 öğe 7px yukarıda)");
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const nav = await page.evaluate(() => {
  const bar = document.querySelector(".kt-bottom-nav-bar");
  if (!bar) return null;
  return [...bar.querySelectorAll("button")].map((b) => ({
    metin: (b.textContent || "").trim(),
    transform: getComputedStyle(b).transform,
  }));
});
check("alt bar var", !!nav && nav.length === 5, JSON.stringify(nav));
// transform "matrix(1, 0, 0, 1, 0, -7)" biçiminde gelir — son sayı kaydırma.
const kaydirma = (t) => Number((t.match(/,\s*(-?\d+(?:\.\d+)?)\)$/) || [])[1] ?? 0);
const yan = (nav || []).filter((b) => !b.metin.includes("Ana"));
const orta = (nav || []).find((b) => b.metin.includes("Ana"));
check("4 yan öğe 7px yukarı alındı",
  yan.length === 4 && yan.every((b) => kaydirma(b.transform) === -7), JSON.stringify(nav));
check("orta (Ana) öğe eskisi gibi 14px yukarıda",
  !!orta && kaydirma(orta.transform) === -14, JSON.stringify(nav));

await browser.close();
console.log(`\n${"=".repeat(52)}\nSONUÇ:  ${ok} başarılı, ${fail} başarısız\n${"=".repeat(52)}`);
process.exit(fail ? 1 : 0);
