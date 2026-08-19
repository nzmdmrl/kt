// Çıkışta hesap kaybının önlenmesi + doğrulama sayfasında şifre tekrarı.
//
// Kurulum tests/README.md'de (test backend + NEXT_PUBLIC_API_BASE ile derlenmiş
// frontend). Her koşudan önce backend'in SIFIRDAN başlatılması gerekir:
// aynı IP'den açılan hesap sayısı sınırına takılmamak için.
import { chromium, devices } from "playwright";

const BASE = "http://127.0.0.1:3001";
const API = "http://127.0.0.1:8099";
let ok = 0, fail = 0;
const errors = [];
const check = (l, c, e = "") => { c ? (ok++, console.log(`  ✓ ${l}`)) : (fail++, console.log(`  ✗ ${l}  ${e}`)); };

async function newPage(browser, mobile = true) {
  const ctx = await browser.newContext(
    mobile ? devices["Pixel 5"] : { viewport: { width: 1280, height: 900 } }
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  return { ctx, page };
}

const txt = (page) => page.evaluate(() => document.body.innerText);

// Popup oturumda BİR KEZ kendiliğinden açılır (Aşama 2 kararı). Kullanıcının
// uygulamayı kapatıp yeniden açmasını taklit etmek için o damga silinir.
const yenidenAc = async (page) => {
  await page.evaluate(() => sessionStorage.removeItem("kt_name_prompt_seen"));
};
const browser = await chromium.launch();

// ---------------------------------------------------------------- 1
console.log("\n1) Doğrulanmamış kullanıcıya 'Çıkış Yap' GÖSTERİLMİYOR");
const { ctx, page } = await newPage(browser);
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".np-sheet", { timeout: 10000 });
await page.fill(".np-input", "Kayip Testi");
await page.click(".np-cta");
await page.waitForSelector(".vb-btn", { timeout: 12000 });
const uToken = await page.evaluate(() => localStorage.getItem("kt_token"));
check("hesap açıldı", !!uToken);

await page.goto(`${BASE}/menu`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
let t = await txt(page);
check("menüde 'Çıkış Yap' yok", !t.includes("Çıkış Yap"), t.slice(0, 400));
check("yerine 'Profili doğrula ve kaydet' var", t.includes("Profili doğrula ve kaydet"), t.slice(0, 400));

await page.click("text=Profili doğrula ve kaydet");
await page.waitForURL("**/dogrula", { timeout: 8000 });
check("tıklayınca doğrulama sayfası açılıyor", page.url().includes("/dogrula"));

// Masaüstü üst barda da aynı kural
const { ctx: dctx, page: dpage } = await newPage(browser, false);
await dpage.goto(BASE, { waitUntil: "domcontentloaded" });
await dpage.evaluate((t) => localStorage.setItem("kt_token", t), uToken);
await dpage.goto(BASE, { waitUntil: "networkidle" });
await dpage.waitForTimeout(2000);
const dt = await txt(dpage);
check("masaüstü üst barda 'Çıkış' yok", !/\bÇıkış\b/.test(dt), dt.slice(0, 300));
check("masaüstünde 'Profili doğrula' var", dt.includes("Profili doğrula"), dt.slice(0, 300));
await dctx.close();

// ---------------------------------------------------------------- 2
console.log("\n2) Şifre tekrarı — /dogrula");
await page.goto(`${BASE}/dogrula`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const pw = page.locator('input[type="password"]');
check("iki şifre alanı var", (await pw.count()) === 2, String(await pw.count()));

await page.fill('input[type="email"]', "kayip@ornek.com");
await pw.nth(0).fill("gizli123");
await pw.nth(1).fill("gizli999");
await page.waitForTimeout(400);
t = await txt(page);
check("uyuşmazlık uyarısı çıkıyor", t.includes("Şifreler birbiriyle uyuşmuyor"), t.slice(0, 500));
const kaydet = page.getByRole("button", { name: "Kaydet", exact: true });
check("Kaydet düğmesi pasif", await kaydet.isDisabled());

await pw.nth(1).fill("gizli123");
await page.waitForTimeout(400);
t = await txt(page);
check("eşleşince onay yazısı çıkıyor", t.includes("Şifreler eşleşiyor"), t.slice(0, 500));
check("Kaydet düğmesi aktif", !(await kaydet.isDisabled()));

// Sadece ilk alan doluyken kaydedilemesin
await pw.nth(1).fill("");
await page.waitForTimeout(300);
check("ikinci alan boşken kaydedilemiyor", await kaydet.isDisabled());

await pw.nth(1).fill("gizli123");
await kaydet.click();
await page.waitForFunction(() => document.body.innerText.includes("Hesabın kaydedildi"),
  null, { timeout: 10000 });
check("doğru şifreyle kaydedildi", true);
// Gerçekten o şifreyle girilebiliyor mu?
const loginOk = await page.evaluate(async (api) => {
  const r = await fetch(api + "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "kayip@ornek.com", password: "gizli123" }),
  });
  return r.ok;
}, API);
check("kaydedilen şifreyle giriş yapılabiliyor", loginOk);

// ---------------------------------------------------------------- 3
console.log("\n3) Doğrulandıktan sonra normal çıkış düğmesi geliyor");
await page.goto(`${BASE}/menu`, { waitUntil: "networkidle" });
await page.waitForTimeout(1800);
t = await txt(page);
check("'Çıkış Yap' geri geldi", t.includes("Çıkış Yap"), t.slice(0, 400));
check("doğrulama düğmesi kalktı", !t.includes("Profili doğrula ve kaydet"));

console.log("\n   doğrulanmış hesap çıkınca HATIRA BIRAKMAZ");
await page.click("text=Çıkış Yap");
await page.waitForTimeout(1500);
const memAfterVerified = await page.evaluate(() => localStorage.getItem("kt_last_account"));
check("son hesap hatırası yok", memAfterVerified === null, String(memAfterVerified));
await yenidenAc(page);
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".np-sheet", { timeout: 10000 });
t = await txt(page);
check("popup 'devam et' DEĞİL, normal isim ekranı", t.includes("sana nasıl hitap edelim"), t.slice(0, 300));
await ctx.close();

// ---------------------------------------------------------------- 4
console.log("\n4) Doğrulanmamış hesap: çıkış sonrası hesabına dönebiliyor");
const { ctx: c2, page: p2 } = await newPage(browser);
await p2.goto(BASE, { waitUntil: "networkidle" });
await p2.waitForSelector(".np-sheet", { timeout: 10000 });
await p2.fill(".np-input", "Ayşe Gül");
await p2.click(".np-cta");
await p2.waitForSelector(".vb-btn", { timeout: 12000 });
const uid1 = await p2.evaluate(async (api) => {
  const r = await fetch(api + "/api/auth/me", {
    headers: { Authorization: "Bearer " + localStorage.getItem("kt_token") },
  });
  return (await r.json()).user.id;
}, API);
const mem = await p2.evaluate(() => localStorage.getItem("kt_last_account"));
check("hatıra yazıldı", !!mem && mem.includes("Ayşe Gül"), String(mem).slice(0, 80));

// Çıkışı taklit et: doğrulanmamışta düğme yok, ama jeton her yolla kaybolabilir
// (tarayıcı verisi temizliği, uygulama silme öncesi vb.) — hatıra kurtarmalı.
await p2.evaluate(() => localStorage.removeItem("kt_token"));
await yenidenAc(p2);
await p2.goto(BASE, { waitUntil: "networkidle" });
await p2.waitForSelector(".np-sheet", { timeout: 10000 });
t = await txt(p2);
check("popup 'Tekrar hoş geldin' diyor", t.includes("Tekrar hoş geldin"), t.slice(0, 300));
check("'Ayşe Gül olarak devam et' düğmesi var", t.includes("Ayşe Gül olarak devam et"), t.slice(0, 300));
check("'Farklı isimle başla' seçeneği var", t.includes("Farklı isimle başla"));
check("isim alanı gösterilmiyor", (await p2.locator(".np-input").count()) === 0);

await p2.click("text=Ayşe Gül olarak devam et");
await p2.waitForSelector(".np-sheet", { state: "detached", timeout: 8000 });
await p2.waitForTimeout(2500);
const uid2 = await p2.evaluate(async (api) => {
  const r = await fetch(api + "/api/auth/me", {
    headers: { Authorization: "Bearer " + localStorage.getItem("kt_token") },
  });
  return (await r.json()).user.id;
}, API);
check("AYNI hesaba dönüldü (yeni hesap açılmadı)", uid1 === uid2, `${uid1} vs ${uid2}`);
const total = await p2.evaluate(async (api) => {
  const r = await fetch(api + "/api/profile/search?q=ayse");
  return (await r.json()).users.length;
}, API);
check("'aysegul2' gibi ikinci hesap oluşmadı", total === 1, String(total));

// ---------------------------------------------------------------- 5
console.log("\n5) 'Farklı isimle başla' hatırayı siliyor");
await p2.evaluate(() => localStorage.removeItem("kt_token"));
await yenidenAc(p2);
await p2.goto(BASE, { waitUntil: "networkidle" });
await p2.waitForSelector(".np-sheet", { timeout: 10000 });
await p2.click("text=Farklı isimle başla");
await p2.waitForTimeout(600);
check("isim alanı açıldı", (await p2.locator(".np-input").count()) === 1);
check("hatıra silindi",
  (await p2.evaluate(() => localStorage.getItem("kt_last_account"))) === null);
await p2.fill(".np-input", "Yeni Kisi");
await p2.click(".np-cta");
await p2.waitForSelector(".vb-btn", { timeout: 12000 });
const uid3 = await p2.evaluate(async (api) => {
  const r = await fetch(api + "/api/auth/me", {
    headers: { Authorization: "Bearer " + localStorage.getItem("kt_token") },
  });
  return (await r.json()).user.id;
}, API);
check("yeni hesap açıldı", uid3 !== uid1, `${uid3} vs ${uid1}`);
// Yeni hesap da doğrulanmamış -> kendi hatırasını bırakır.
const mem2 = await p2.evaluate(() => localStorage.getItem("kt_last_account"));
check("yeni hesabın hatırası yazıldı", !!mem2 && mem2.includes("Yeni Kisi"), String(mem2).slice(0, 80));
await c2.close();

// ---------------------------------------------------------------- 6
console.log("\n6) Mobilde hatıra native depoda da duruyor");
const nctx = await browser.newContext({
  ...devices["Pixel 5"],
  userAgent: devices["Pixel 5"].userAgent + " KelimeApp/1.0",
});
await nctx.addInitScript(() => {
  const KEY = "__fake_native_store";
  const read = () => JSON.parse(sessionStorage.getItem(KEY) || "{}");
  const write = (o) => sessionStorage.setItem(KEY, JSON.stringify(o));
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
const np = await nctx.newPage();
np.on("pageerror", (e) => errors.push(String(e)));
await np.goto(BASE, { waitUntil: "networkidle" });
await np.waitForSelector(".np-sheet", { timeout: 10000 });
await np.fill(".np-input", "Native Kisi");
await np.click(".np-cta");
await np.waitForSelector(".vb-btn", { timeout: 12000 });
const natMem = await np.evaluate(() =>
  JSON.parse(sessionStorage.getItem("__fake_native_store") || "{}").kt_last_account);
check("hatıra native depoya yazıldı", !!natMem && natMem.includes("Native Kisi"), String(natMem).slice(0, 80));
// Tarayıcı verisi tamamen silinse bile hatıra native depodan gelmeli.
await np.evaluate(() => localStorage.clear());
await np.goto(BASE, { waitUntil: "networkidle" });
await np.waitForTimeout(3000);
const nt = await np.evaluate(() => document.body.innerText);
// Jeton da native depoda olduğu için önce oturum geri gelir — bu da doğru sonuç.
check("kullanıcı hesabını kaybetmedi",
  nt.includes("Native Kisi") || nt.includes("Native Kisi olarak devam et"), nt.slice(0, 250));
await nctx.close();

await browser.close();
console.log("\n" + "=".repeat(52));
console.log(`SONUÇ:  ${ok} başarılı, ${fail} başarısız`);
const real = [...new Set(errors)].filter((e) => !e.includes("Failed to load resource"));
if (real.length) { console.log("\nTarayıcı hataları:"); real.slice(0, 10).forEach((e) => console.log("  ! " + e)); }
console.log("=".repeat(52));
process.exit(fail || real.length ? 1 : 0);
