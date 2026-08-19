// App Links kurulumu — uçtan uca kontrol.
//
// 1) /.well-known/assetlinks.json sitede doğru içerik türüyle servis ediliyor mu
//    (Next rewrite -> backend). Android bu adresi YÖNLENDİRMESİZ ister.
// 2) AndroidManifest'te beyan edilen HER yol gerçekten çalışan bir sayfaya mı
//    denk geliyor? Yanlış yazılmış bir pathPrefix sessizce hiçbir şey yapmaz;
//    bu kontrol onu yakalar.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:3001";
const MANIFEST = process.env.MANIFEST
  || "/root/projeler/kelimetahmin/mobile/android/app/src/main/AndroidManifest.xml";

let ok = 0, fail = 0;
const check = (l, c, e = "") => { c ? (ok++, console.log(`  ✓ ${l}`)) : (fail++, console.log(`  ✗ ${l}  ${e}`)); };

// Her pathPrefix için sitede gerçekten var olan örnek bir adres.
const ORNEK = {
  "/oda": "/oda/ABC123",
  "/oyna": "/oyna",
  "/arena": "/arena/ozel",
  "/solo": "/solo",
  "/gunun-kelimesi": "/gunun-kelimesi",
  "/profil": "/profil/nazim",
  "/lig": "/lig/arsiv",
  "/arkadaslar": "/arkadaslar",
  "/uye-ara": "/uye-ara",
  "/bildirimler": "/bildirimler",
  "/gecmis": "/gecmis",
  "/duyurular": "/duyurular",
  "/dogrula": "/dogrula",
  "/destek": "/destek",
};

const xml = readFileSync(MANIFEST, "utf8");
// DİKKAT: yorum satırlarında da "autoVerify" kelimesi geçiyor. Bu yüzden
// AÇILIŞ ETİKETİNDEN kapanışa kadar olan gerçek bloğu alıyoruz.
const bas = xml.indexOf('<intent-filter android:autoVerify="true">');
const son = bas >= 0 ? xml.indexOf("</intent-filter>", bas) : -1;
const filtre = bas >= 0 && son > bas ? xml.slice(bas, son) : "";

console.log("\n1) Manifest beyanı");
check("autoVerify=\"true\" intent-filter bulundu", filtre.length > 0, "blok okunamadı");
const hostlar = [...(filtre || "").matchAll(/android:host="([^"]+)"/g)].map((m) => m[1]);
check("yalnız www beyan edilmiş", hostlar.length === 1 && hostlar[0] === "www.kelimetahmin.com",
  hostlar.join(", "));
check("şema https", /android:scheme="https"/.test(filtre || ""));
const tamYol = [...(filtre || "").matchAll(/android:path="([^"]+)"/g)].map((m) => m[1]);
check("ana sayfa TAM yol olarak (pathPrefix değil)", tamYol.includes("/"), tamYol.join(", "));

const prefixler = [...(filtre || "").matchAll(/android:pathPrefix="([^"]+)"/g)].map((m) => m[1]);
console.log(`     beyan edilen ${prefixler.length} yol öneki: ${prefixler.join(" ")}`);

console.log("\n2) Dışarıda bırakılanlar gerçekten dışarıda");
for (const disarida of ["/hesap-silme", "/gizlilik", "/kosullar", "/cerez",
                        "/iletisim", "/hakkimizda", "/nasil-oynanir", "/yonetim", "/giris"]) {
  const yakalanir = prefixler.some((p) => disarida.startsWith(p));
  check(`${disarida} uygulamada AÇILMAYACAK`, !yakalanir,
    yakalanir ? `"${prefixler.find((p) => disarida.startsWith(p))}" öneki yakalıyor` : "");
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

console.log("\n3) assetlinks.json sitede servis ediliyor");
{
  const r = await page.request.get(`${BASE}/.well-known/assetlinks.json`, { maxRedirects: 0 });
  check("HTTP 200 (yönlendirme YOK)", r.status() === 200, String(r.status()));
  check("içerik türü application/json",
    (r.headers()["content-type"] || "").includes("application/json"),
    r.headers()["content-type"] || "");
  let j = null;
  try { j = JSON.parse(await r.text()); } catch {}
  check("geçerli JSON", Array.isArray(j), (await r.text()).slice(0, 120));
}

console.log("\n4) Beyan edilen her yol gerçek bir sayfaya gidiyor");
for (const p of prefixler) {
  const url = ORNEK[p];
  if (!url) { check(`${p} için örnek adres tanımlı`, false, "teste örnek ekle"); continue; }
  const r = await page.request.get(BASE + url, { maxRedirects: 0 });
  check(`${p} -> ${url} (${r.status()})`, r.status() === 200, String(r.status()));
}
{
  const r = await page.request.get(BASE + "/", { maxRedirects: 0 });
  check(`/ -> ana sayfa (${r.status()})`, r.status() === 200, String(r.status()));
}

await browser.close();
console.log("\n" + "=".repeat(52));
console.log(`SONUÇ:  ${ok} başarılı, ${fail} başarısız`);
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
