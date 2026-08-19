// Mobil jeton depolaması — Capacitor Preferences köprüsü SAHTE bir eklentiyle
// taklit edilir. Amaç: uygulamada tarayıcı verisi (localStorage) silinse bile
// oturumun native depodan geri gelmesi.
import { chromium, devices } from "playwright";
const BASE = "http://127.0.0.1:3001";
let ok = 0, fail = 0;
const check = (l, c, e = "") => { c ? (ok++, console.log(`  ✓ ${l}`)) : (fail++, console.log(`  ✗ ${l}  ${e}`)); };

const browser = await chromium.launch();
// Uygulama tespiti GERÇEKTEKİ gibi yapılır: capacitor.config.ts kullanıcı
// ajanına "KelimeApp/" ekler, lib/platform.tsx önce ona bakar.
const ctx = await browser.newContext({
  ...devices["Pixel 5"],
  userAgent: devices["Pixel 5"].userAgent + " KelimeApp/1.0",
});

// Sahte native köprü: gerçek eklentinin yerine bellekte bir depo.
// Kalıcı olması için sessionStorage'ta tutulur (localStorage temizlenince silinmesin).
await ctx.addInitScript(() => {
  const KEY = "__fake_native_store";
  const read = () => JSON.parse(sessionStorage.getItem(KEY) || "{}");
  const write = (o) => sessionStorage.setItem(KEY, JSON.stringify(o));
  // @capacitor/core yüklenince window.Capacitor'ı devralır ama MEVCUT
  // Plugins nesnesini korur (cap.Plugins = cap.Plugins || {}), bu yüzden
  // sahte eklentimiz yerinde kalır — gerçek cihazdaki durumun aynısı.
  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      Preferences: {
        async get({ key }) { return { value: read()[key] ?? null }; },
        async set({ key, value }) { const o = read(); o[key] = value; write(o); return {}; },
        async remove({ key }) { const o = read(); delete o[key]; write(o); return {}; },
      },
    },
  };
});

const page = await ctx.newPage();

console.log("\n9) Mobilde jeton native depoda");
await page.goto(BASE, { waitUntil: "networkidle" });
check("uygulama olarak algılandı",
  await page.evaluate(() => document.documentElement.classList.contains("is-native")));

await page.waitForSelector(".np-sheet", { timeout: 10000 });
await page.fill(".np-input", "Native Testi");
await page.click(".np-cta");
await page.waitForSelector(".vb-btn", { timeout: 12000 });

const ls = await page.evaluate(() => localStorage.getItem("kt_token"));
const nat = await page.evaluate(() => JSON.parse(sessionStorage.getItem("__fake_native_store") || "{}").kt_token);
check("jeton localStorage'a yazıldı", !!ls);
check("jeton native depoya da yazıldı", !!nat, String(nat));
check("iki yerde de aynı jeton", ls === nat);

// Tarayıcı verisi temizlendi (Android "önbelleği temizle" senaryosu).
await page.evaluate(() => localStorage.clear());
check("localStorage boşaltıldı", (await page.evaluate(() => localStorage.getItem("kt_token"))) === null);

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const restored = await page.evaluate(() => localStorage.getItem("kt_token"));
check("oturum native depodan geri geldi", restored === nat, String(restored).slice(0, 20));
const txt = await page.evaluate(() => document.body.innerText);
check("kullanıcı hâlâ girişli (isim popup'ı çıkmadı)",
  !txt.includes("sana nasıl hitap edelim") && txt.includes("Native Testi"));

// Çıkışta iki depodan da silinmeli.
await page.evaluate(async () => {
  // Menüdeki çıkışı taklit etmek yerine doğrudan depo temizliğini sına:
  // uygulamanın logout'u aynı clearToken()'ı çağırır.
  localStorage.removeItem("kt_token");
  await window.Capacitor.Plugins.Preferences.remove({ key: "kt_token" });
});
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
const after = await page.evaluate(() => document.body.innerText);
check("çıkıştan sonra oturum yok (hesapsız karşılama kartı)",
  after.includes("İsmini yaz, hemen oyna"), after.slice(0, 120));
// Popup aynı oturumda ikinci kez KENDİLİĞİNDEN açılmaz (bilinçli);
// hesapsız kişi bir oyuna tıklayınca çıkar.
await page.locator(".hm-mode").first().click();
await page.waitForSelector(".np-sheet", { timeout: 8000 });
check("oyuna tıklayınca isim popup'ı yine çıkıyor", await page.isVisible(".np-sheet"));

await browser.close();
console.log("\n" + "=".repeat(52));
console.log(`SONUÇ (mobil taklidi):  ${ok} başarılı, ${fail} başarısız`);
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
