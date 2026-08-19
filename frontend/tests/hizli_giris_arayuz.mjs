// Hızlı Giriş Aşama 2 — gerçek tarayıcıda arayüz senaryoları.
// Chromium (Playwright) ile http://127.0.0.1:3001 üzerindeki test kurulumunu sürer.
import { chromium, devices } from "playwright";

const BASE = "http://127.0.0.1:3001";
let ok = 0, fail = 0;
const errors = [];

function check(label, cond, extra = "") {
  if (cond) { ok++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${extra}`); }
}

async function newPage(browser, mobile) {
  const ctx = await browser.newContext(
    mobile ? devices["Pixel 5"] : { viewport: { width: 1280, height: 900 } }
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  return { ctx, page };
}

const browser = await chromium.launch();

// ---------------------------------------------------------------- 1
console.log("\n1) İlk giriş — popup kendiliğinden çıkıyor (mobil)");
{
  const { ctx, page } = await newPage(browser, true);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".np-sheet", { timeout: 8000 });
  check("popup açıldı", await page.isVisible(".np-sheet"));
  check("metin doğru",
    (await page.textContent(".np-title"))?.includes("sana nasıl hitap edelim"));
  check("buton 'Oynamaya başla'", (await page.textContent(".np-cta"))?.trim() === "Oynamaya başla");
  check("alan otomatik odaklandı",
    await page.evaluate(() => document.activeElement?.classList.contains("np-input")));
  check("'Giriş yap' bağlantısı var", (await page.textContent(".np-alt"))?.includes("Giriş yap"));
  check("kullanıcı adı gösterilmiyor", !(await page.textContent(".np-sheet"))?.includes("@"));

  // Mobilde alta yapışık mı? (bottom sheet)
  const box = await page.locator(".np-sheet").boundingBox();
  const vh = page.viewportSize().height;
  check("mobilde alttan yükselen sayfa", Math.abs((box.y + box.height) - vh) < 3,
    `alt kenar ${box.y + box.height} / ekran ${vh}`);
  check("mobilde tam genişlik", box.width >= page.viewportSize().width - 2, String(box.width));

  // Dışarı tıklamak KAPATMAMALI.
  await page.mouse.click(10, 60);
  await page.waitForTimeout(400);
  check("dışarı tıklayınca kapanmıyor", await page.isVisible(".np-sheet"));

  // Kısa isim hatası
  await page.fill(".np-input", "Ay");
  await page.click(".np-cta");
  await page.waitForSelector(".np-error", { timeout: 3000 });
  check("kısa isim hatası doğru metin",
    (await page.textContent(".np-error"))?.trim() === "Adın en az 3 harf/rakam içermeli");

  // ✕ ile kapanır
  await page.click(".np-close");
  await page.waitForTimeout(400);
  check("✕ ile kapanıyor", !(await page.isVisible(".np-sheet")));

  // Kapattıktan sonra oyuna tıklayınca yine çıkar
  await page.click("text=Arena >> nth=0");
  await page.waitForSelector(".np-sheet", { timeout: 5000 });
  check("kapattıktan sonra oyun tıklamasında yine çıkıyor", await page.isVisible(".np-sheet"));
  await ctx.close();
}

// ---------------------------------------------------------------- 2
console.log("\n2) Masaüstü — ortada kart, arkası karartılmış");
{
  const { ctx, page } = await newPage(browser, false);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".np-sheet", { timeout: 8000 });
  const box = await page.locator(".np-sheet").boundingBox();
  const vw = page.viewportSize().width, vh = page.viewportSize().height;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  check("yatayda ortada", Math.abs(cx - vw / 2) < 4, String(cx));
  check("dikeyde ortada", Math.abs(cy - vh / 2) < 4, String(cy));
  check("kart genişliği sınırlı (tam genişlik değil)", box.width < 500, String(box.width));
  const bg = await page.locator(".np-backdrop").evaluate((el) => getComputedStyle(el).backgroundColor);
  check("arka plan karartılmış", /rgba\(0, 0, 0, 0\.6/.test(bg), bg);
  await ctx.close();
}

// ---------------------------------------------------------------- 3
console.log("\n3) İsim yazıp oyuna girme (Enter ile)");
{
  const { ctx, page } = await newPage(browser, true);
  await page.goto(`${BASE}/arena`, { waitUntil: "networkidle" });
  await page.waitForSelector(".np-sheet", { timeout: 8000 });
  check("arenaya hesapsız girince popup çıkıyor", await page.isVisible(".np-sheet"));
  check("misafir seçeneği YOK", !(await page.content()).includes("Misafir Olarak Katıl"));

  await page.fill(".np-input", "Ayşe Gül");
  await page.press(".np-input", "Enter");
  // Popup hemen kapanmalı (beklenmez).
  await page.waitForSelector(".np-sheet", { state: "detached", timeout: 3000 });
  check("popup hemen kapandı (bekletme yok)", true);

  // Oyun ekranı gelmeli (arena bağlanıyor / rakip aranıyor).
  await page.waitForFunction(() => !document.body.innerText.includes("İsmini yaz, başla"),
    null, { timeout: 10000 });
  const token = await page.evaluate(() => localStorage.getItem("kt_token"));
  check("oturum jetonu kaydedildi", !!token && token.length > 20);
  const me = await page.evaluate(async (t) => {
    const r = await fetch("http://127.0.0.1:8099/api/auth/me", { headers: { Authorization: `Bearer ${t}` } });
    return r.json();
  }, token);
  check("görünen ad yazıldığı gibi", me.user.display_name === "Ayşe Gül", me.user.display_name);
  check("kullanıcı adı türetildi (aysegul)", /^aysegul\d*$/.test(me.user.username), me.user.username);
  check("hesap doğrulanmamış", me.user.verified === false);
  await ctx.close();
}

// ---------------------------------------------------------------- 4
console.log("\n4) Ana sayfa doğrulama şeridi");
{
  const { ctx, page } = await newPage(browser, true);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".np-sheet", { timeout: 8000 });
  await page.fill(".np-input", "Banner Testi");
  await page.click(".np-cta");
  await page.waitForSelector(".vb-btn", { timeout: 10000 });
  check("şerit doğrulanmamış hesaba görünüyor",
    (await page.textContent(".vb-btn"))?.includes("Profili doğrula ve kaydet"));

  // Kapat -> gizlenmeli, 3 gün boyunca gelmemeli
  await page.click(".vb-close");
  await page.waitForTimeout(300);
  check("✕ ile gizleniyor", (await page.locator(".vb-btn:visible").count()) === 0);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  check("yenilemede geri gelmiyor", (await page.locator(".vb-btn:visible").count()) === 0);

  // Kapatma damgasını 3 günden eskiye çekince şerit geri gelmeli.
  await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith("kt_verify_hide_"));
    localStorage.setItem(k, String(Date.now() - 1000));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".vb-btn", { timeout: 10000 });
  check("süre dolunca geri geliyor", await page.isVisible(".vb-btn"));
  await ctx.close();
}

// ---------------------------------------------------------------- 5
console.log("\n5) Doğrulama sayfası — normal akış");
{
  const { ctx, page } = await newPage(browser, true);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".np-sheet", { timeout: 8000 });
  await page.fill(".np-input", "Dogrulama Testi");
  await page.click(".np-cta");
  await page.waitForSelector(".vb-btn", { timeout: 10000 });
  await page.click(".vb-btn");
  await page.waitForURL("**/dogrula", { timeout: 8000 });
  await page.waitForTimeout(800);
  const body = await page.evaluate(() => document.body.innerText);
  check("üstte görünen ad var", body.includes("Dogrulama Testi"));
  check("üstte kullanıcı adı var", /@dogrulamatesti/.test(body), body.match(/@\w+/)?.[0]);
  check("açıklama metni doğru",
    body.includes("Başka bir cihazda oynayabilmek için gerekli") &&
    body.includes("doğrulanmamış hesabın kaybolur"));
  check("e-posta alanı BOŞ", (await page.inputValue('input[type="email"]')) === "");
  check("şifre alanı BOŞ", (await page.inputValue('input[type="password"]')) === "");

  await page.fill('input[type="email"]', "yeni@ornek.com");
  await page.fill('input[type="password"]', "gizli123");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await page.waitForFunction(() => document.body.innerText.includes("Hesabın kaydedildi"), null, { timeout: 8000 });
  check("hesap doğrulandı ekranı geldi", true);

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  check("doğrulandıktan sonra şerit kayboldu", (await page.locator(".vb-btn:visible").count()) === 0);
  await ctx.close();
}

// ---------------------------------------------------------------- 6
console.log("\n6) Doğrulama sayfası — e-posta başkasında (taşıma akışı)");
{
  // Önce hedef hesabı normal kayıtla oluştur.
  const { ctx: c0, page: p0 } = await newPage(browser, true);
  await p0.goto(BASE, { waitUntil: "networkidle" });
  const reg = await p0.evaluate(async () => {
    const r = await fetch("http://127.0.0.1:8099/api/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "eski@ornek.com", password: "eskisifre", display_name: "Eski Hesap" }),
    });
    return r.json();
  });
  check("hedef hesap kuruldu (mevcut e-posta kaydı bozulmadı)", !!reg.token);
  // Hedefe biraz ilerleme yaz.
  await p0.evaluate(async (t) => {
    // XP eklemek için doğrudan uç yok; sadece varlığı yeterli.
    return t;
  }, reg.token);
  await c0.close();

  const { ctx, page } = await newPage(browser, true);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".np-sheet", { timeout: 8000 });
  await page.fill(".np-input", "Tasima Testi");
  await page.click(".np-cta");
  await page.waitForSelector(".vb-btn", { timeout: 10000 });
  const kaynakToken = await page.evaluate(() => localStorage.getItem("kt_token"));

  await page.goto(`${BASE}/dogrula`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.fill('input[type="email"]', "eski@ornek.com");
  await page.fill('input[type="password"]', "yenisifre");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await page.waitForFunction(() => document.body.innerText.includes("Bu e-posta zaten kayıtlı"),
    null, { timeout: 8000 });
  check("taşıma adımı açıldı (hata ekranı DEĞİL)", true);
  const t2 = await page.evaluate(() => document.body.innerText);
  check("kullanıcıya anlaşılır açıklama var", t2.includes("ilerlemeni oraya taşıyabilirsin"));
  check("ne taşınacağı gösteriliyor", t2.includes("Taşınacak ilerleme"));

  await page.fill('input[type="password"]', "eskisifre");
  await page.getByRole("button", { name: "Giriş yap ve ilerlemeyi taşı" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("İlerlemen taşındı"),
    null, { timeout: 12000 });
  check("taşıma tamamlandı", true);
  const t3 = await page.evaluate(() => document.body.innerText);
  check("artık hedef hesapla oynuyor", /@eskihesap/.test(t3), t3.match(/@\w+/g)?.join(","));

  // Kaynak hesabın jetonu artık geçersiz olmalı (hesap silindi).
  const gone = await page.evaluate(async (t) => {
    const r = await fetch("http://127.0.0.1:8099/api/auth/me", { headers: { Authorization: `Bearer ${t}` } });
    return r.status;
  }, kaynakToken);
  check("kaynak hesap silindi (eski jeton 401)", gone === 401, String(gone));
  await ctx.close();
}

// ---------------------------------------------------------------- 7
console.log("\n7) Misafir girişi kalktı");
{
  const { ctx, page } = await newPage(browser, true);
  for (const path of ["/arena", "/oyna", "/gunun-kelimesi", "/solo", "/arena/ozel", "/arkadaslar"]) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    const html = await page.content();
    check(`${path}: misafir seçeneği yok`,
      !html.includes("Misafir Olarak Katıl") && !html.includes("Misafir olarak oynayabilirsin"));
  }
  await ctx.close();
}

// ---------------------------------------------------------------- 8
console.log("\n8) Profil düzenleme — kullanıcı adı alanı");
{
  const { ctx, page } = await newPage(browser, false);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".np-sheet", { timeout: 8000 });
  await page.fill(".np-input", "Profil Testi");
  await page.click(".np-cta");
  await page.waitForTimeout(2500);
  const uname = await page.evaluate(async () => {
    const t = localStorage.getItem("kt_token");
    const r = await fetch("http://127.0.0.1:8099/api/auth/me", { headers: { Authorization: `Bearer ${t}` } });
    return (await r.json()).user.username;
  });
  await page.goto(`${BASE}/profil/${uname}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.locator("text=Düzenle").locator("visible=true").first().click();
  await page.waitForTimeout(1500);
  const modal = await page.evaluate(() => document.body.innerText);
  check("kullanıcı adı bölümü var", modal.includes("Kullanıcı Adı"));
  check("profil adresi açıklaması var", modal.includes("Profil adresin"));
  await ctx.close();
}

await browser.close();

console.log("\n" + "=".repeat(52));
console.log(`SONUÇ (tarayıcı):  ${ok} başarılı, ${fail} başarısız`);
if (errors.length) {
  console.log("\nTarayıcı konsolundaki hatalar:");
  [...new Set(errors)].slice(0, 15).forEach((e) => console.log("  ! " + e));
}
console.log("=".repeat(52));
process.exit(fail || errors.filter((e) => !e.includes("Failed to load resource")).length ? 1 : 0);
