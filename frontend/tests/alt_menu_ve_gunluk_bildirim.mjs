// Alt menü arka planı (10px aşağı, öğeler yerinde) + admin "📣 Günün Bildirimi" sekmesi.
import { chromium, devices } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:3001";
const API = process.env.API || "http://127.0.0.1:8099";
let ok = 0, fail = 0;
const check = (l, c, e = "") => { c ? (ok++, console.log(`  ✓ ${l}`)) : (fail++, console.log(`  ✗ ${l}  ${e}`)); };

const browser = await chromium.launch();

async function hesap(ad) {
  const r = await fetch(`${API}/api/auth/quick`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: ad }),
  });
  return r.json();
}

console.log("\n1) Alt menü — arka plan aşağıda, öğeler yerinde");
{
  const { token } = await hesap("Menu Testi");
  const ctx = await browser.newContext(devices["Pixel 5"]);
  await ctx.addInitScript((t) => localStorage.setItem("kt_token", t), token);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const olcum = await page.evaluate(() => {
    const bar = document.querySelector(".kt-bottom-nav-bar");
    if (!bar) return null;
    const b = bar.getBoundingClientRect();
    const btns = [...bar.querySelectorAll("button")];
    const yan = btns.filter((x) => !(x.textContent || "").includes("Ana"));
    const ana = btns.find((x) => (x.textContent || "").includes("Ana"));
    return {
      paddingTop: getComputedStyle(bar).paddingTop,
      barTop: b.top,
      yanTop: Math.min(...yan.map((x) => x.getBoundingClientRect().top)),
      anaTop: ana ? ana.getBoundingClientRect().top : null,
      yuvarlakBorder: ana ? getComputedStyle(ana.querySelector("span")).borderTopWidth : null,
    };
  });
  check("alt bar bulundu", !!olcum, "bar yok");
  check("panelin üst dolgusu kalktı (10px -> 0)", olcum.paddingTop === "0px", olcum.paddingTop);
  // Öğeler alta hizalı; üst dolgu kalkınca panelin üst kenarı 10px AŞAĞI indi,
  // öğeler yerinde kaldı. Ölçülen: yuvarlak Ana düğmesi panelin üstünden taşıyor.
  check("ana yuvarlak panelin üst kenarından taşıyor",
    olcum.anaTop < olcum.barTop, `ana ${olcum.anaTop} / bar ${olcum.barTop}`);
  check("ana düğme yan öğelerden yukarıda",
    olcum.anaTop < olcum.yanTop, `ana ${olcum.anaTop} / yan ${olcum.yanTop}`);
  check("yan öğeler panelin içinde duruyor",
    olcum.yanTop > olcum.barTop, `yan ${olcum.yanTop} / bar ${olcum.barTop}`);
  check("yuvarlak halka 6px", olcum.yuvarlakBorder === "6px", String(olcum.yuvarlakBorder));
  await ctx.close();
}

console.log("\n2) Admin — 📣 Günün Bildirimi sekmesi");
{
  // Yönetici jetonu DIŞARIDAN gelir: hesabı açıp is_admin'i işaretlemek test
  // veritabanına dokunmayı gerektiriyor, onu çağıran betik yapıyor
  // (ADMIN_TOKEN=... node alt_menu_ve_gunluk_bildirim.mjs).
  const token = process.env.ADMIN_TOKEN;
  if (!token) { console.log("  ! ADMIN_TOKEN verilmedi, admin bölümü atlandı"); process.exit(fail ? 1 : 0); }

  const ctx = await browser.newContext({ ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((t) => localStorage.setItem("kt_token", t), token);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/yonetim`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const sekme = page.getByRole("button", { name: /Günün Bildirimi/ });
  check("sekme görünüyor", await sekme.count() === 1, (await page.locator("body").innerText()).slice(0, 200));
  await sekme.first().click();
  await page.waitForTimeout(2000);

  // Testin tekrar tekrar çalışabilmesi için önce BİLİNEN duruma çekiyoruz.
  const api = (yol, opt = {}) => fetch(`${API}${yol}`, {
    ...opt,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opt.headers || {}) },
  });
  await api("/api/admin/daily-push", {
    method: "PUT", body: JSON.stringify({ key: "daily_word_push_enabled", value: "0" }),
  });
  const once = await (await api("/api/admin/daily-push")).json();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: /Günün Bildirimi/ }).first().click();
  await page.waitForTimeout(1500);

  const metin = await page.locator("body").innerText();
  check("metin listesi gösteriliyor",
    metin.includes(`Bildirim metinleri (${once.messages.length})`), metin.slice(0, 400));
  check("önizlemede kutulu ipucu var", metin.includes("⬜"), metin.slice(0, 400));
  check("kapalı durumu doğru yazıyor", metin.includes("Günlük bildirim kapalı"), metin.slice(0, 300));
  check("deneme düğmesi var", await page.getByRole("button", { name: /deneme gönder/ }).count() === 1);

  // Aç/kapa anahtarı gerçekten kaydediyor mu?
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("button")].find(
      (b) => b.offsetWidth === 56 && b.offsetHeight === 30);
    if (el) el.click();
  });
  await page.waitForTimeout(1500);
  check("açılınca panel 'açık' yazıyor",
    (await page.locator("body").innerText()).includes("Günlük bildirim açık"));
  const durum = await (await api("/api/admin/daily-push")).json();
  check("ayar sunucuya yazıldı", durum.enabled === true, JSON.stringify(durum).slice(0, 160));

  // Yeni metin ekle (sayı bir artmalı)
  await page.getByPlaceholder(/Yeni metin/).fill("Test metni {kelime} deneme");
  await page.getByRole("button", { name: "Ekle" }).click();
  await page.waitForTimeout(1500);
  check("yeni metin eklendi",
    (await page.locator("body").innerText()).includes(`Bildirim metinleri (${once.messages.length + 1})`),
    (await page.locator("body").innerText()).slice(0, 300));

  // Testi başladığı yere geri sar: eklenen metni sil, anahtarı kapat.
  const son = await (await api("/api/admin/daily-push")).json();
  const eklenen = son.messages.find((m) => m.text.startsWith("Test metni"));
  if (eklenen) await api(`/api/admin/daily-push/messages/${eklenen.id}`, { method: "DELETE" });
  await api("/api/admin/daily-push", {
    method: "PUT", body: JSON.stringify({ key: "daily_word_push_enabled", value: "0" }),
  });

  await ctx.close();
}

await browser.close();
console.log(`\n${"=".repeat(52)}\nSONUÇ:  ${ok} başarılı, ${fail} başarısız\n${"=".repeat(52)}`);
process.exit(fail ? 1 : 0);
