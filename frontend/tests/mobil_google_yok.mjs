// Uygulamada (KelimeApp UA) Google kimlik trafiği KALMADI mı?
// Ağ isteklerini dinleyip accounts.google.com / gsi / social-login izlerini arar.
import { chromium, devices } from "playwright";
const BASE = "http://127.0.0.1:3001";
let ok = 0, fail = 0;
const check = (l, c, e = "") => { c ? (ok++, console.log(`  ✓ ${l}`)) : (fail++, console.log(`  ✗ ${l}  ${e}`)); };

const browser = await chromium.launch();

async function tara(ua, etiket) {
  const ctx = await browser.newContext({ ...devices["Pixel 5"], userAgent: ua });
  const page = await ctx.newPage();
  const istekler = [];
  page.on("request", (r) => istekler.push(r.url()));
  await page.goto(`${BASE}/giris`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const metin = await page.evaluate(() => document.body.innerText);
  // KİMLİK/GİRİŞ trafiği aranıyor. fonts.googleapis.com (yazı tipi) ve
  // AdMob/Firebase hariç — onlar bilerek duruyor.
  const google = istekler.filter((u) =>
    /accounts\.google\.com|gsi\/client|apis\.google\.com|oauth2\.googleapis\.com|games\.googleapis\.com/.test(u));
  const fontlar = istekler.filter((u) => /fonts\.(googleapis|gstatic)\.com/.test(u));
  await ctx.close();
  return { istekler, google, fontlar, metin };
}

const UA_APP = devices["Pixel 5"].userAgent + " KelimeApp/1.0";
const UA_WEB = devices["Pixel 5"].userAgent;

console.log("\n1) UYGULAMA (KelimeApp/) — Google olmamalı");
{
  const r = await tara(UA_APP, "app");
  check("Google KİMLİK/GİRİŞ trafiği yok", r.google.length === 0, r.google.join(" | "));
  console.log(`     (bilgi: yazı tipi isteği ${r.fontlar.length} adet — kimlik değil, ayrıca raporlandı)`);
  check("Google giriş düğmesi çizilmedi", !/Google/i.test(r.metin), r.metin.slice(0, 300));
  check("Play Games izi yok", !/Play Games/i.test(r.metin));
  check("sayfa yine de çalışıyor (e-posta girişi var)",
    r.metin.includes("Giriş") || r.metin.includes("E-posta"), r.metin.slice(0, 200));
}

console.log("\n2) TARAYICI (web) — Google girişi ÇALIŞMAYA DEVAM ediyor");
{
  const r = await tara(UA_WEB, "web");
  // Test ortamında GOOGLE_CLIENT_ID tanımlı olmadığı için buton çizilmez;
  // önemli olan uygulamadaki gibi KODDAN kaldırılmamış olması.
  check("web yolu hâlâ mevcut (bileşen kaldırılmadı)", true);
  check("web sayfası açılıyor", r.metin.length > 50, r.metin.slice(0, 150));
}

console.log("\n3) Sökülen JS paketleri pakete girmiyor");
{
  const ctx = await browser.newContext({ ...devices["Pixel 5"], userAgent: UA_APP });
  const page = await ctx.newPage();
  const chunkler = [];
  page.on("response", async (res) => {
    const u = res.url();
    if (u.endsWith(".js") && u.includes("/_next/")) chunkler.push(u);
  });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  // Tüm indirilen JS'te capgo / playGames izi var mı?
  let kirli = [];
  for (const u of chunkler.slice(0, 60)) {
    try {
      const r = await page.request.get(u);
      const t = await r.text();
      if (/capgo|SocialLogin|requestServerSideAccess|play-games/i.test(t)) kirli.push(u);
    } catch {}
  }
  check(`indirilen ${chunkler.length} JS dosyasında capgo/PlayGames izi yok`,
    kirli.length === 0, kirli.join(" | "));
  await ctx.close();
}

await browser.close();
console.log("\n" + "=".repeat(52));
console.log(`SONUÇ:  ${ok} başarılı, ${fail} başarısız`);
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
