// Çerez bandı: mobil uygulamada ÇIKMAMALI, tarayıcıda çıkmalı.
// Tercih anahtarı (/cerez) her iki ortamda da erişilebilir olmalı — bant
// kalkınca kullanıcının ölçümü kapatma yolu kapanmasın.
import { chromium, devices } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:3001";
let ok = 0, fail = 0;
const check = (l, c, e = "") => { c ? (ok++, console.log(`  ✓ ${l}`)) : (fail++, console.log(`  ✗ ${l}  ${e}`)); };

const browser = await chromium.launch();
const UA_APP = devices["Pixel 5"].userAgent + " KelimeApp/1.0";
const UA_WEB = devices["Pixel 5"].userAgent;

async function ac(ua, yol = "/") {
  const ctx = await browser.newContext({ ...devices["Pixel 5"], userAgent: ua });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${yol}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  return { ctx, page };
}

const bant = (page) => page.locator('[aria-label="Çerez bilgilendirmesi"]');

console.log("\n1) Mobil tarayıcı — bant ÇIKMALI");
{
  const { ctx, page } = await ac(UA_WEB);
  check("bant görünüyor", await bant(page).count() === 1);
  check("metin doğru", (await page.locator("body").innerText()).includes("🍪"));
  check("Kabul et düğmesi var", await page.getByRole("button", { name: "Kabul et" }).count() === 1);
  check("Reddet düğmesi var", await page.getByRole("button", { name: "Reddet" }).count() === 1);

  // Karar verilince bant kapanır ve bir daha çıkmaz.
  await page.getByRole("button", { name: "Reddet" }).click();
  await page.waitForTimeout(400);
  check("karardan sonra bant kapandı", await bant(page).count() === 0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  check("yenilemede tekrar çıkmıyor", await bant(page).count() === 0);
  check("karar kaydedildi",
    await page.evaluate(() => localStorage.getItem("kt_cookie_consent")) === "rejected");
  await ctx.close();
}

console.log("\n2) Mobil UYGULAMA (KelimeApp/) — bant ÇIKMAMALI");
for (const yol of ["/", "/lig", "/gunun-kelimesi"]) {
  const { ctx, page } = await ac(UA_APP, yol);
  check(`${yol} — bant yok`, await bant(page).count() === 0);
  // Sayfa boyanmış mı? (Günün Kelimesi veriyi beklerken sadece "Yükleniyor…"
  // gösterir — bant testi için yeterli, içerik bu testin konusu değil.)
  check(`${yol} — sayfa boyandı`, (await page.locator("body").innerText()).trim().length > 0);
  check(`${yol} — karar kaydı oluşmadı`,
    await page.evaluate(() => localStorage.getItem("kt_cookie_consent")) === null);
  await ctx.close();
}

console.log("\n3) Capacitor köprüsü (UA işareti olmadan) — bant ÇIKMAMALI");
{
  const ctx = await browser.newContext({ ...devices["Pixel 5"], userAgent: UA_WEB });
  await ctx.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  check("Capacitor tespitiyle de gizli", await bant(page).count() === 0);
  await ctx.close();
}

console.log("\n4) Tercih anahtarı /cerez sayfasında (iki ortamda da)");
for (const [ua, ad] of [[UA_WEB, "tarayıcı"], [UA_APP, "uygulama"]]) {
  const { ctx, page } = await ac(ua, "/cerez");
  const metin = await page.locator("body").innerText();
  check(`${ad} — "Ziyaret istatistikleri" bölümü var`, metin.includes("Ziyaret istatistikleri"), metin.slice(0, 200));
  const dugme = page.getByRole("button", { name: /Ölçümü kapat|Ölçüme izin ver/ });
  check(`${ad} — aç/kapa düğmesi var`, await dugme.count() === 1);
  await dugme.first().click();
  await page.waitForTimeout(300);
  check(`${ad} — tercih kaydedildi`,
    ["accepted", "rejected"].includes(await page.evaluate(() => localStorage.getItem("kt_cookie_consent"))));
  await ctx.close();
}

await browser.close();
console.log(`\n${"=".repeat(52)}\nSONUÇ:  ${ok} başarılı, ${fail} başarısız\n${"=".repeat(52)}`);
process.exit(fail ? 1 : 0);
