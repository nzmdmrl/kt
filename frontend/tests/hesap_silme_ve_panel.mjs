// Hesap silme (Tehlikeli Bölge + /hesap-silme sayfası), şerit boşluğu ve
// admin panelindeki üye yönetimi / cihaz simgesi / ortam istatistikleri.
//
// ÖN KOŞUL: temiz test backend'i + admin@t.com/adminsifre hesabı admin yapılmış.
// Kurulum tests/README.md'de.
import { chromium, devices } from "playwright";

const BASE = "http://127.0.0.1:3001";
const API = "http://127.0.0.1:8099";
let ok = 0, fail = 0;
const errors = [];
const check = (l, c, e = "") => { c ? (ok++, console.log(`  ✓ ${l}`)) : (fail++, console.log(`  ✗ ${l}  ${e}`)); };
const txt = (p) => p.evaluate(() => document.body.innerText);

async function newPage(browser, mobile = true, ua) {
  const base = mobile ? devices["Pixel 5"] : { viewport: { width: 1280, height: 950 } };
  const ctx = await browser.newContext(ua ? { ...base, userAgent: ua } : base);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("dialog", (d) => d.accept());
  return { ctx, page };
}

const browser = await chromium.launch();

// ---------------------------------------------------------------- 1
console.log("\n1) Doğrulama şeridi — masaüstünde üst boşluk");
{
  const { ctx, page } = await newPage(browser, false);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".np-sheet", { timeout: 10000 });
  await page.fill(".np-input", "Serit Testi");
  await page.click(".np-cta");
  await page.waitForSelector(".vb-btn:visible", { timeout: 12000 });
  const gap = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".vb-row")].find((e) => e.offsetParent !== null);
    const r = row.getBoundingClientRect();
    // Üstündeki en yakın görünür öğe (TopBar) ile arasındaki boşluk.
    const bar = document.querySelector(".home-desktop > div");
    const b = bar.getBoundingClientRect();
    return Math.round(r.top - b.bottom);
  });
  check("masaüstünde şeridin üstünde boşluk var", gap >= 12, `${gap}px`);
  await ctx.close();
}
{
  const { ctx, page } = await newPage(browser, true);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".np-sheet", { timeout: 10000 });
  await page.fill(".np-input", "Mobil Serit");
  await page.click(".np-cta");
  await page.waitForSelector(".vb-btn:visible", { timeout: 12000 });
  const mt = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".vb-row")].find((e) => e.offsetParent !== null);
    return getComputedStyle(row).marginTop;
  });
  check("mobilde üst boşluk EKLENMEDİ (görünüm bozulmadı)", mt === "0px", mt);
  await ctx.close();
}

// ---------------------------------------------------------------- 2
console.log("\n2) Tehlikeli Bölge — doğrulanmamış hesap ismiyle onaylar");
{
  const { ctx, page } = await newPage(browser, true);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".np-sheet", { timeout: 10000 });
  await page.fill(".np-input", "Silinecek Kisi");
  await page.click(".np-cta");
  await page.waitForSelector(".vb-btn:visible", { timeout: 12000 });
  const uname = await page.evaluate(async (api) => {
    const r = await fetch(api + "/api/auth/me", {
      headers: { Authorization: "Bearer " + localStorage.getItem("kt_token") },
    });
    return (await r.json()).user.username;
  }, API);

  await page.goto(`${BASE}/profil/${uname}?duzenle=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2200);
  let t = await txt(page);
  check("düzenleme ekranı ?duzenle=1 ile açıldı", t.includes("Profili Düzenle"), t.slice(0, 200));
  check("Tehlikeli Bölge bölümü var", t.includes("Tehlikeli Bölge"), t.slice(0, 400));
  check("'Hesabımı sil' düğmesi var", t.includes("Hesabımı sil"));

  await page.click("text=Hesabımı sil");
  await page.waitForTimeout(1500);
  t = await txt(page);
  check("ne kaybedileceği açıkça yazıyor",
    t.includes("tüm ilerlemen") && t.includes("Rozetlerin") && t.includes("sıralamalarından"),
    t.slice(0, 600));
  check("geri alınamayacağı yazıyor", t.includes("geri alınamaz"));
  check("maç geçmişinin kalacağı yazıyor", t.includes("Silinmiş üye"));
  check("isim yazması isteniyor", t.includes("Silinecek Kisi") && t.includes("Onaylamak için"), t.slice(0, 600));

  const inp = page.locator('input[placeholder="Silinecek Kisi"]');
  await inp.fill("yanlis");
  await page.click("text=Evet, hesabımı sil");
  await page.waitForTimeout(1500);
  t = await txt(page);
  check("yanlış onayda silinmiyor", t.includes("Onaylamak için adını tam olarak yaz"), t.slice(0, 500));

  await inp.fill("Silinecek Kisi");
  await page.click("text=Evet, hesabımı sil");
  await page.waitForTimeout(3000);
  const tokenAfter = await page.evaluate(() => localStorage.getItem("kt_token"));
  check("silindi ve oturum kapandı", tokenAfter === null, String(tokenAfter));
  // Playwright evaluate TEK argüman alır — ikisini nesnede topla.
  const gone = await page.evaluate(async ({ api, u }) => {
    const r = await fetch(api + "/api/profile/" + u);
    return r.status;
  }, { api: API, u: uname });
  check("profil sayfası artık açılmıyor (404)", gone === 404, String(gone));
  await ctx.close();
}

// ---------------------------------------------------------------- 3
console.log("\n3) /hesap-silme — uygulama dışından erişilebilen sayfa");
{
  const { ctx, page } = await newPage(browser, true);
  await page.goto(`${BASE}/hesap-silme`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const t = await txt(page);
  check("sayfa GİRİŞ GEREKTİRMEDEN açılıyor", t.includes("Hesap Silme"), t.slice(0, 200));
  check("silinen veriler listeleniyor", t.includes("Silinen veriler"), t.slice(0, 500));
  check("saklanan veriler açıklanıyor", t.includes("Saklanan veriler") && t.includes("Silinmiş üye"));
  check("girişsize talep formu gösteriliyor", t.includes("Giriş yapamıyorsan talep bırak"));

  await page.fill('input[placeholder*="Ayşe"]', "Talep Eden");
  await page.fill('input[type="email"]', "talep@ornek.com");
  await page.click("text=Silme talebi gönder");
  await page.waitForTimeout(2500);
  check("talep gönderildi", (await txt(page)).includes("Talebin bize ulaştı"), (await txt(page)).slice(0, 300));

  // Altbilgide bağlantı var mı (Play denetçisi bulabilsin)
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const hasLink = await page.evaluate(() =>
    !![...document.querySelectorAll('a[href="/hesap-silme"]')].length);
  check("altbilgide 'Hesap Silme' bağlantısı var", hasLink);
  await ctx.close();
}

// ---------------------------------------------------------------- 4
console.log("\n4) Admin — üye yönetimi, cihaz simgesi, ortam istatistikleri");
{
  const { ctx, page } = await newPage(browser, false);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(async (api) => {
    const r = await fetch(api + "/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@t.com", password: "adminsifre" }),
    });
    localStorage.setItem("kt_token", (await r.json()).token);
  }, API);

  await page.goto(`${BASE}/yonetim`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  let t = await txt(page);
  check("özet açıldı", t.includes("Canlı Durum"), t.slice(0, 200));
  check("'Ortama Göre' tablosu var", t.includes("Ortama Göre"), t.slice(0, 600));
  for (const label of ["Mobil uygulama", "Mobil tarayıcı", "Masaüstü", "Ziyaretçi", "Yeni üye", "Doğrulama"])
    check(`"${label}" satırı/sütunu var`, t.includes(label), "");
  check("mevcut özet bozulmadı", t.includes("Online kişi") && t.includes("Genel") && t.includes("En İyi Oyuncular"));

  // --- aralık seçici
  for (const r of ["Bugün", "Dün", "Bu hafta", "Bu ay"])
    check(`"${r}" aralık düğmesi var`, t.includes(r), "");
  check("ziyaretçi sayımının anlamı yazılı",
    t.includes("günlük tekil sayıların toplamı"), t.slice(0, 900));

  // Aralık değiştirince sunucudan YENİ veri gelmeli (istek gözlenir).
  const istekler = [];
  page.on("request", (req) => {
    if (req.url().includes("/admin/platform-stats")) istekler.push(req.url());
  });
  await page.getByRole("button", { name: "Bu ay", exact: true }).click();
  await page.waitForTimeout(2000);
  check("aralık değişince yeni istek atıldı",
    istekler.some((u) => u.includes("range=month")), istekler.join(" | "));
  t = await txt(page);
  check("tablo aynı kaldı (3 ortam × 3 ölçü)",
    t.includes("Mobil uygulama") && t.includes("Ziyaretçi") && t.includes("Toplam"), t.slice(0, 400));
  await page.getByRole("button", { name: "Dün", exact: true }).click();
  await page.waitForTimeout(2000);
  check("dün aralığı da çekiliyor",
    istekler.some((u) => u.includes("range=yesterday")), istekler.join(" | "));
  await page.getByRole("button", { name: "Bugün", exact: true }).click();
  await page.waitForTimeout(1500);

  await page.click("text=👥 Üyeler");
  await page.waitForTimeout(2500);
  t = await txt(page);
  check("üye listesi açıldı", t.includes("Kayıtlı üye sayısı"), t.slice(0, 200));
  for (const f of ["Tümü", "Aktif", "Pasif", "Gölge banlı", "Silinmiş"])
    check(`"${f}" süzgeci var`, t.includes(f), "");
  const icons = await page.evaluate(() =>
    [...document.querySelectorAll('[title="Mobil uygulama"],[title="Masaüstü"],[title="Mobil tarayıcı"]')].length);
  check("cihaz simgeleri çiziliyor", icons > 0, String(icons));
  check("işlem düğmeleri var", t.includes("Pasife al") && t.includes("Gölge ban"));

  // Pasife al -> geri al.
  // DİKKAT: isim denetimi bazı hesapları KENDİLİĞİNDEN pasife almış olabilir
  // (kurulumdaki küfürlü isim), bu yüzden "hiç PASİF yok" diye bakılmaz —
  // rozet SAYISININ artıp azalmasına bakılır.
  const pasifSay = async () =>
    (await page.locator("text=PASİF").count());
  const once = await pasifSay();
  await page.locator("text=⛔ Pasife al").first().click();
  await page.waitForTimeout(2500);
  check("PASİF rozeti çıktı", (await pasifSay()) === once + 1, `${once} -> ${await pasifSay()}`);
  await page.locator("text=↩︎ Geri al").first().click();
  await page.waitForTimeout(2500);
  check("geri alındı", (await pasifSay()) === once, `${once} -> ${await pasifSay()}`);

  // Silinmiş süzgeci
  await page.click("text=Silinmiş");
  await page.waitForTimeout(2000);
  t = await txt(page);
  check("silinmiş üyeler süzülebiliyor", t.includes("Silinmiş üye") || t.includes("Sonuç yok"), t.slice(0, 300));

  // Eski sekmeler
  for (const [tab, marker] of [["⚙️ Ayarlar", "Değişiklikler yeni başlayan"], ["⚡ Hızlı Giriş", "Doğrulanmamış hesap"], ["🔎 İsim Kontrol", "arka planda denetlenir"]]) {
    await page.click(`text=${tab}`);
    await page.waitForTimeout(1800);
    check(`${tab} bozulmadı`, (await txt(page)).includes(marker), (await txt(page)).slice(0, 150));
  }
  await ctx.close();
}

await browser.close();
console.log("\n" + "=".repeat(52));
console.log(`SONUÇ:  ${ok} başarılı, ${fail} başarısız`);
const real = [...new Set(errors)].filter((e) => !e.includes("Failed to load resource"));
if (real.length) { console.log("\nTarayıcı hataları:"); real.slice(0, 10).forEach((e) => console.log("  ! " + e)); }
console.log("=".repeat(52));
process.exit(fail || real.length ? 1 : 0);
