// Aşama 4 — admin panelinin iki yeni sekmesi gerçek tarayıcıda.
//
// ÖN KOŞUL (her koşudan önce TEMİZ backend):
//   1) admin@t.com / adminsifre hesabı açılmış ve users.is_admin = 1 yapılmış,
//   2) 66.66.66.66 IP'sinden "Orospu Cocugu" ve "Admin Yardimci" adlarıyla
//      iki hızlı hesap açılmış (denetim ikisini de işaretler).
// Kurulum adımları tests/README.md içinde.
import { chromium } from "playwright";
const BASE = "http://127.0.0.1:3001";
const API = "http://127.0.0.1:8099";
let ok = 0, fail = 0;
const errors = [];
const check = (l, c, e = "") => { c ? (ok++, console.log(`  ✓ ${l}`)) : (fail++, console.log(`  ✗ ${l}  ${e}`)); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("dialog", (d) => d.accept());

// Admin olarak giriş: jetonu doğrudan yerleştir.
await page.goto(BASE, { waitUntil: "domcontentloaded" });
const token = await page.evaluate(async (api) => {
  const r = await fetch(api + "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@t.com", password: "adminsifre" }),
  });
  const j = await r.json();
  localStorage.setItem("kt_token", j.token);
  return j.token;
}, API);
check("admin girişi", !!token);

await page.goto(`${BASE}/yonetim`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

console.log("\n1) Sekmeler görünüyor");
const body0 = await page.evaluate(() => document.body.innerText);
check("🔎 İsim Kontrol sekmesi var", body0.includes("İsim Kontrol"), body0.slice(0, 200));
check("⚡ Hızlı Giriş sekmesi var", body0.includes("Hızlı Giriş"));
check("eski sekmeler duruyor",
  ["📊 Özet", "⚙️ Ayarlar", "🏷️ Ad Mod", "🔔 Bildirim Türleri", "🎫 Destek"]
    .every((t) => body0.includes(t)), body0.slice(0, 400));

console.log("\n2) İsim Kontrol sekmesi");
await page.click("text=🔎 İsim Kontrol");
await page.waitForTimeout(2000);
let t = await page.evaluate(() => document.body.innerText);
check("işaretlenen isim listeleniyor", t.includes("Orospu Cocugu"), t.slice(0, 400));
check("güven derecesi görünüyor", /%95/.test(t), t.slice(0, 400));
check("hangi katman yakaladı yazıyor", t.includes("kara liste"), t.slice(0, 400));
check("kayıt IP'si görünüyor", t.includes("66.66.66.66"), t.slice(0, 400));
check("hesap durumu görünüyor", t.includes("hesap pasif"), t.slice(0, 400));
check("otomatik kapatıldı etiketi var", t.includes("otomatik kapatıldı"));
check("gerekçe yazıyor", t.includes("küfür: orospu"));
check("sınırdaki isim de listede", t.includes("Admin Yardimci"));
check("sınırdaki hesap AKTİF", t.includes("hesap aktif"));
check("üç işlem düğmesi var",
  t.includes("Temiz") && t.includes("Pasife al") && t.includes("IP'ye gölge ban"));
check("OpenAI uyarısı görünüyor (anahtar yok)", t.includes("OPENAI_API_KEY"), t.slice(0, 600));

console.log("\n3) IP'ye gölge ban");
const banBtn = page.locator("text=IP'ye gölge ban").first();
await banBtn.click();
await page.waitForTimeout(2500);
t = await page.evaluate(() => document.body.innerText);
check("ban uygulandı bildirimi", t.includes("IP banlandı") || t.includes("hesap işaretlendi"), t.slice(0, 300));
// Popup'ı kapat
const okBtn = page.locator("button", { hasText: /^Tamam$|^Kapat$|^OK$/ }).first();
if (await okBtn.count()) await okBtn.click().catch(() => {});
await page.waitForTimeout(600);
await page.click("text=🚫 IP banları");
await page.waitForTimeout(1500);
t = await page.evaluate(() => document.body.innerText);
check("ban listesinde görünüyor", t.includes("66.66.66.66"), t.slice(0, 400));

console.log("\n4) Temiz işaretleme -> hesap yeniden açılır");
await page.click("text=Bekleyen");
await page.waitForTimeout(1500);
const cleanBtn = page.locator("text=✓ Temiz").first();
if (await cleanBtn.count()) {
  await cleanBtn.click();
  await page.waitForTimeout(2000);
  const st = await page.evaluate(async (api) => {
    const r = await fetch(api + "/api/admin/name-flags?status=clean", {
      headers: { Authorization: "Bearer " + localStorage.getItem("kt_token") },
    });
    return (await r.json()).flags.length;
  }, API);
  check("kayıt 'temiz' listesine geçti", st > 0, String(st));
} else { check("temiz düğmesi bulundu", false, "düğme yok"); }

console.log("\n5) Hızlı Giriş sekmesi");
await page.click("text=⚡ Hızlı Giriş");
await page.waitForTimeout(2500);
t = await page.evaluate(() => document.body.innerText);
check("durum kutuları var",
  t.includes("Doğrulanmamış hesap") && t.includes("Gölge banlı") && t.includes("Pasif hesap"), t.slice(0, 400));
for (const label of [
  "İsimle hesap açma açık", "Aynı IP'den en fazla hesap",
  "Doğrulama şeridi kaç gün gizlensin", "1. hatırlatma bildirimi gönderilsin",
  "Hatırlatma için en az oyun sayısı", "2. hatırlatma gönderilsin",
  "1. hatırlatma başlığı", "1. hatırlatma metni",
  "İsim denetimi açık", "2. katman (OpenAI) kullanılsın",
  "İsim Kontrol listesine düşme eşiği", "Otomatik pasife alma eşiği",
]) check(`"${label}" alanı var`, t.includes(label), "");

console.log("\n6) Ayar kaydetme çalışıyor");
const ipInput = page.locator("input[type=number]").first();
await ipInput.fill("17");
await ipInput.press("Enter");
await page.waitForTimeout(1800);
const saved = await page.evaluate(async (api) => {
  const r = await fetch(api + "/api/admin/quick-auth", {
    headers: { Authorization: "Bearer " + localStorage.getItem("kt_token") },
  });
  const j = await r.json();
  return j.fields.find((f) => f.key === "quick_signup_ip_limit").value;
}, API);
check("sayı ayarı kaydedildi", saved === "17", saved);

// Metin alanı
const ta = page.locator("textarea").first();
await ta.fill("Panelden yazılmış hatırlatma metni.");
// Kaydet düğmesi alanı DEĞİŞENE kadar pasif kalıyor (doğru davranış) —
// bu yüzden metin alanının KENDİ kartındaki düğmeye basılır.
await ta.locator("xpath=following-sibling::button").click();
await page.waitForTimeout(1800);
const savedText = await page.evaluate(async (api) => {
  const r = await fetch(api + "/api/admin/quick-auth", {
    headers: { Authorization: "Bearer " + localStorage.getItem("kt_token") },
  });
  const j = await r.json();
  return j.fields.find((f) => f.key === "verify_reminder_body").value;
}, API);
check("metin ayarı kaydedildi", savedText === "Panelden yazılmış hatırlatma metni.", savedText);

console.log("\n7) Eski sekmeler hâlâ çalışıyor");
for (const [tab, marker] of [["⚙️ Ayarlar", "Değişiklikler yeni başlayan maçlarda"], ["🏷️ Ad Mod", "Bekleyen"], ["📊 Özet", ""]]) {
  await page.click(`text=${tab}`);
  await page.waitForTimeout(1500);
  const txt = await page.evaluate(() => document.body.innerText);
  check(`${tab} açılıyor`, marker ? txt.includes(marker) : txt.length > 200, txt.slice(0, 150));
}

await browser.close();
console.log("\n" + "=".repeat(52));
console.log(`SONUÇ (admin paneli):  ${ok} başarılı, ${fail} başarısız`);
const real = [...new Set(errors)].filter((e) => !e.includes("Failed to load resource"));
if (real.length) { console.log("\nTarayıcı hataları:"); real.slice(0, 10).forEach((e) => console.log("  ! " + e)); }
console.log("=".repeat(52));
process.exit(fail || real.length ? 1 : 0);
