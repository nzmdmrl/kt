"use client";

/**
 * Native kabuk başlatıcısı — SADECE Capacitor uygulaması içinde çalışır.
 *
 * Uygulama canlı siteyi (server.url) yüklediği için tüm eklenti JS'i burada,
 * frontend paketinde durur. Kurallar:
 *
 *  1) usePlatform().isNative false ise HİÇBİR ŞEY yapılmaz — normal tarayıcı
 *     kullanıcısı için bu bileşen tamamen etkisizdir (tek satır DOM/istek yok).
 *  2) Eklentiler YALNIZCA dinamik import() ile yüklenir; böylece tarayıcı
 *     paketine girmez, ayrı chunk'ta kalır ve hiç indirilmez.
 *  3) Her eklenti çağrısı try/catch içinde: bir hata sayfayı ASLA bozmaz,
 *     sadece konsola düşer.
 *
 * Yaptıkları:
 *  - Push: Android bildirim kanalları (grup başına bir kanal), izin, kayıt,
 *    token'ın /api/devices/register'a gönderilmesi, bildirime tıklayınca
 *    yönlendirme, uygulama açıkken hafif iç uyarı (toast).
 *  - AdMob: /api/app-config'teki ayara göre alt banner. Bant HER ZAMAN ekranın
 *    DİBİNDEDİR (showBanner margin: 0 — SABİT, asla değiştirilmez), ALT BAR
 *    onun üstüne kalkar. Kaldırma miktarı (navLift) barın kendisine satır içi
 *    `bottom` + !important olarak yazılır; admin alanları (ek boşluk / sabit
 *    değer) BU değeri ayarlar. Akışta bırakılacak yer --kt-banner-space'e
 *    yazılır (ÖLÇÜLEREK) + gövdeye "has-native-banner"
 *    sınıfı eklenir. OYUN EKRANLARINDA (alt barın basılmadığı /oyna, /arena,
 *    /solo, /gunun-kelimesi, /oda) bant GİZLENMEZ: aynı kaldırma bu kez sayfanın
 *    kendi dip elemanlarına uygulanır (--kt-game-space, applyGameSpace).
 *    ads.admob.banner_hidden_paths ARTIK BOŞ gelir ama alan duruyor: oraya yol
 *    yazılırsa banner o sayfada yine gizlenir; ilan YENİDEN YÜKLENMEZ, aynı
 *    banner gizlenip gösterilir (hideBanner/resumeBanner).
 *  - Durum çubuğu (Android): webview varsayılan olarak saat/pil satırının ARKASINA
 *    çiziliyordu. overlaysWebView=false + tema rengiyle zemin verilir; işe
 *    yaramazsa (Android 15+ zorunlu edge-to-edge) ölçülen çubuk yüksekliği üst
 *    rezerv olarak yazılır (setupStatusBar).
 *  - Geri tuşu: sayfa geçmişi varsa geri git, yoksa uygulamayı arka plana al
 *    (uygulamadan çıkma YOK).
 */

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { useAuth, useAdFree } from "@/lib/auth";
import { usePlatform, type Platform } from "@/lib/platform";
import { loadAppConfig, type AdMobConfig } from "@/lib/appConfig";
import { configureInterstitial, setInterstitialAdFree, type AdMode } from "@/lib/interstitial";
import { showToast } from "@/lib/webpush";

/**
 * Bildirim grupları okunamazsa kullanılan yedek liste.
 * backend/app/api/routes/notification_prefs.py → DEFAULT_GROUPS ile aynı.
 * Kanallar Android'de bir kez kurulur; sunucu ulaşılamaz diye eksik kalmasınlar.
 */
const FALLBACK_GROUPS: { code: string; label: string }[] = [
  { code: "game", label: "Oyun ve Maç" },
  { code: "social", label: "Sosyal" },
  { code: "league", label: "Lig" },
  { code: "achievement", label: "Başarımlar" },
  { code: "system", label: "Sistem" },
];

/** Yüksek öncelikli tek grup: maç/oda davetleri anlık görünmeli. */
const HIGH_IMPORTANCE_GROUP = "game";

const BANNER_BODY_CLASS = "has-native-banner";
/** Bant + alt bar tek parça görünsün diye serilen dolgu şeridinin id'si. */
const BANNER_FILL_ID = "kt-native-banner-fill";
/** Alt bar bu sayfada basılı mı — rezerv spacer'a mı gövdeye mi yazılacak. */
const NAV_PRESENT_CLASS = "has-bottom-nav";
const BANNER_HEIGHT_VAR = "--kt-banner-h";
/**
 * Ekranın altından, akıştaki içeriğin bitmesi gereken çizgiye olan mesafe.
 * Alt bar basılıysa = navLift + BAR yüksekliği (yani barın üst kenarı),
 * bar yoksa = navLift.
 */
const BANNER_SPACE_VAR = "--kt-banner-space";
/**
 * ALT BARIN ekranın dibinden yüksekliği (navLift). Satır içi stille birlikte
 * yazılır; satır içi stil bir şekilde barı bulamazsa CSS bu değişkenden okur.
 */
const NAV_LIFT_VAR = "--kt-nav-lift";

/**
 * OYUN EKRANLARINDA dip elemanların bandın üstüne çekilme payı
 * (= navLift + admin "oyun ekranı ek payı"). Oyun dışı sayfada ve bant yokken 0px.
 */
const GAME_SPACE_VAR = "--kt-game-space";

/** Oyun ekranındayız + bant görünür (gövdeye eklenir). */
const GAME_SCREEN_CLASS = "kt-game-screen";

/** Alt bar ölçülemezse kullanılacak yükseklik (globals.css'teki spacer değeri). */
const NAV_HEIGHT_FALLBACK = 76;

/** Alt barı basan eleman — satır içi stil buraya yazılır. */
const NAV_SELECTOR = ".kt-bottom-nav-bar";

/**
 * Ekran yüksekliğine KİLİTLİ oyun kabuğu (min-height: 100vh) — dibindeki şerit
 * doğrudan ekranın altına oturduğu için bandın altında kalan tek eleman tipi.
 * Bugün: arena (ArenaShell) ve maraton haritası.
 *
 * Tedavi: min-height 100vh yerine `calc(100vh - oyun payı)`. Böylece kabuğun ALT
 * KENARI bandın üstüne çıkar, sayfa uzamaz (akış rezervini gövde üstlenir) ve
 * içerik uzunsa kabuk yine büyür.
 *
 * KURAL: bu sınıfı alan eleman React tarafında da
 *   minHeight: "calc(100vh - var(--kt-game-space, 0px))"
 * yazmalıdır. Sebep: eleman JS'in haberi olmadan yeniden monte olabilir (ör. arena
 * reveal tablosundan soru ekranına dönüş) — değişken sayesinde daha ilk boyamada
 * doğru yükseklikle gelir, buradaki satır içi yazım yalnızca pekiştirir.
 */
const GAME_FILL_SELECTOR = ".kt-game-fill";

/**
 * Oyun ekranları — alt barın basılmadığı, bandın sayfa içeriğine değdiği yollar.
 * Eşleşme pathMatches ile ("/arena" -> "/arena/ozel/ABC" de kapsanır).
 * BottomNav.tsx → hideOn ve DesktopChrome.tsx → HIDE_ON listeleriyle aynı fikir;
 * buradaki listede yönetim/giriş yok (onlar oyun değil, zaten alt barsız sayfa
 * kuralına -- gövde dolgusu -- düşerler).
 */
const GAME_PATHS = ["/oyna", "/arena", "/solo", "/gunun-kelimesi", "/oda"];

/**
 * GOOGLE'IN RESMİ TEST REKLAM BİRİMLERİ — tek yer burası, başka yere kopyalama.
 * https://developers.google.com/admob/android/test-ads
 *
 * NEDEN GEREKLİ: eklentiye `isTesting: true` göndermek YETMİYOR. Android tarafında
 * test birimi yalnızca `adId` HİÇ verilmediğinde devreye giriyor
 * (AdOptions.java: `this.adId = call.getString("adId", getTestingId())`), biz ise
 * her zaman gerçek birimi gönderiyorduk. Yeni açılmış bir reklam birimi henüz
 * yayın yapmadığı için istek "No fill" (kod 3) dönüyor ve banner hiç çıkmıyordu.
 *
 * Bu yüzden: ads.admob.test_mode AÇIKKEN aşağıdaki test birimleri kullanılır
 * (isTesting: true da gönderilmeye devam eder), KAPALIYKEN app_settings'teki
 * gerçek birimler aynen kullanılır.
 */
const TEST_AD_UNITS = {
  banner: "ca-app-pub-3940256099942544/6300978111",
  interstitial: "ca-app-pub-3940256099942544/1033173712",
} as const;

/**
 * Banner'ın gizleneceği yolların yedeği — ayar okunamazsa kullanılır.
 * backend/app/api/routes/app_settings.py → DEFAULT_BANNER_HIDDEN_PATHS ile aynı:
 * artık BOŞ. Oyun ekranlarında bant gizlenmiyor, dip elemanlar onun üstüne
 * çekiliyor (bkz. GAME_PATHS / applyGameSpace).
 */
const FALLBACK_BANNER_HIDDEN_PATHS: string[] = [];

/**
 * Geçiş reklamının mod bazlı aç/kapası — ayar okunamazsa kullanılır.
 * backend/app/api/routes/app_settings.py → DEFAULT_INTERSTITIAL_MODES ile aynı.
 * ÖZEL ARENA VARSAYILAN KAPALI (ödülsüz, arkadaş modu).
 */
const FALLBACK_INTERSTITIAL_MODES: Record<string, boolean> = {
  gunun_kelimesi: true,
  maraton: true,
  pratik: true,
  duello: true,
  arena: true,
  oda: true,
  ozel_arena: false,
};

/** Kurulum belge başına bir kez çalışsın (dev StrictMode çift render'ı dahil). */
let bootstrapped = false;

function log(...args: any[]) {
  console.warn("[native]", ...args);
}

/** Güvenli alan (alt) — env() gerçek px olarak ölçülür, ham metin okunmaz. */
function measureSafeBottom(): number {
  try {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;left:-9999px;bottom:0;width:1px;height:env(safe-area-inset-bottom, 0px)";
    document.body.appendChild(probe);
    const h = Math.round(probe.getBoundingClientRect().height);
    probe.remove();
    return h;
  } catch {
    return 0;
  }
}

/**
 * YIĞIN (ekranın altından yukarı doğru):
 *
 *     [ güvenli alan (gesture bar) ]   <- şerit doldurur
 *     [ BANT — ekranın dibine SABİT ]  <- native katman, margin HER ZAMAN 0
 *     [ (admin ek boşluk) ]            <- şerit doldurur
 *     [ ALT BAR ]                      <- bottom = navLift (satır içi, !important)
 *     [ sayfa içeriği ]                <- altında bar + navLift kadar yer ayrılır
 *
 * TEK OYNAYAN ŞEY ALT BARDIR. Bant hiç kımıldamaz: showBanner'a verilen margin
 * Android tarafında yok sayılıyor (BannerExecutor bottom hizalı AdView koyuyor),
 * bu yüzden admin alanları oraya bağlanırsa hiçbir etkisi olmaz. Admin alanları
 * artık navLift'i belirler:
 *
 *     navLift = bant yüksekliği + güvenli alan + banner_margin_extra
 *     banner_margin_override > 0 ise  navLift = banner_margin_override
 *
 * Aynı navLift üç yere birden uygulanır: barın satır içi `bottom`u, arkadaki
 * dolgu şeridinin yüksekliği ve içerik rezervi (--kt-banner-space, ÖLÇÜLEREK).
 */

/** O anki gerçek ölçüler — hiçbiri sabit değil, hepsi çalışma anında okunur. */
type NavMetrics = {
  safe: number;
  innerHeight: number;
  navPresent: boolean;
  navHeight: number;
  navTop: number;
  navBottom: number;
  /** getComputedStyle(bar).bottom — kaldırmanın GERÇEKTEN uygulandığının kanıtı. */
  navComputedBottom: string;
  /** Ekran altından içeriğin bitmesi gereken çizgiye (barın üst kenarı) mesafe. */
  space: number;
};

function measureNav(): NavMetrics {
  const safe = measureSafeBottom();
  const innerHeight = window.innerHeight;
  try {
    const bar = document.querySelector<HTMLElement>(NAV_SELECTOR);
    if (bar) {
      // getBoundingClientRect bekleyen düzeni zorlar: --kt-banner-h yeni
      // yazıldıysa bile buradaki değerler kaldırma SONRASI hâli gösterir.
      const r = bar.getBoundingClientRect();
      if (r.height > 0) {
        return {
          safe,
          innerHeight,
          navPresent: true,
          navHeight: Math.round(r.height),
          navTop: Math.round(r.top),
          navBottom: Math.round(r.bottom),
          navComputedBottom: getComputedStyle(bar).bottom,
          space: Math.round(innerHeight - r.top),
        };
      }
    }
  } catch {}
  // Bar bu sayfada basılı değil (ör. /giris, oyun ekranı): yalnızca navLift.
  return {
    safe,
    innerHeight,
    navPresent: false,
    navHeight: NAV_HEIGHT_FALLBACK,
    navTop: innerHeight,
    navBottom: innerHeight,
    navComputedBottom: "-",
    space: navLiftPx,
  };
}

/**
 * Bandın gerçek yüksekliğini uygular. TEK KAYNAK burasıdır:
 *  - --kt-banner-h yazılır (bilgi amaçlı; konumlandırma navLift'ten gelir),
 *  - has-native-banner sınıfı açılır/kapanır,
 *  - navLift ve rezerv (--kt-banner-space) yeniden hesaplanır.
 * Bant yokken değişkenler 0px'e döner → düzen web'dekiyle birebir aynı.
 */
let bannerHeightPx = 0;

/** Alt barın ekranın dibinden yüksekliği — hesaplanan ve UYGULANAN değer. */
let navLiftPx = 0;

/** Admin → Mobil & Reklam ayarları (setupAdMob doldurur). */
let adminLiftExtra = 0;
let adminLiftOverride = 0;
/** Admin → "oyun ekranı ek payı" (yalnız oyun ekranlarındaki dip elemanlara eklenir). */
let adminGameExtra = 0;
/** Konsoldan elle deneme (bkz. __ktBanner.lift) — kaydetmeden önce denemek için. */
let consoleLift: number | null = null;
/** Konsoldan elle deneme (bkz. __ktBanner.game). */
let consoleGameExtra: number | null = null;

/** Oyun ekranı payının UYGULANAN değeri + kaç kabuğa yazıldığı (log için). */
let gameSpacePx = 0;
let gameShellCount = 0;

function setBannerHeight(px: number) {
  try {
    bannerHeightPx = Number.isFinite(px) && px > 0 ? Math.round(px) : 0;
    document.documentElement.style.setProperty(BANNER_HEIGHT_VAR, `${bannerHeightPx}px`);
    document.body.classList.toggle(BANNER_BODY_CLASS, bannerHeightPx > 0);
    applyBannerSpace();
  } catch {}
}

/**
 * navLift = bant + güvenli alan + admin ek boşluk; admin "sabit değer" > 0 ise
 * doğrudan o. Bant yokken/gizliyken 0 → bar web'deki gibi ekranın dibine döner.
 */
function computeNavLift(safe: number): number {
  if (bannerHeightPx <= 0) return 0;
  if (consoleLift !== null) return Math.max(0, Math.round(consoleLift));
  if (adminLiftOverride > 0) return Math.round(adminLiftOverride);
  return Math.max(0, Math.round(bannerHeightPx + safe + adminLiftExtra));
}

/**
 * navLift'i barın KENDİSİNE yazar: satır içi stil + !important, yani hem
 * globals.css hem de React'in style prop'u yenilse bile ezilemez. React bu
 * özelliği hiç yönetmediği için yeniden render'da silinmez; bar unmount olup
 * geri geldiğinde applyBannerSpace tekrar çağrıldığı için yeniden yazılır.
 */
function applyNavLift(lift: number) {
  navLiftPx = lift;
  document.documentElement.style.setProperty(NAV_LIFT_VAR, `${lift}px`);
  try {
    const bar = document.querySelector<HTMLElement>(NAV_SELECTOR);
    if (!bar) return;
    if (lift > 0) bar.style.setProperty("bottom", `${lift}px`, "important");
    else bar.style.removeProperty("bottom");
  } catch {}
}

/**
 * --kt-banner-space = ekranın altından, içeriğin bitmesi gereken çizgiye mesafe.
 * TAHMİN YOK, ölçülür: bar kalktıktan SONRAKİ rect'inin üst kenarı okunur, yani
 *     space = innerHeight - navRect.top = bar yüksekliği + navLift.
 * Bar basılı değilse (ör. /giris) = navLift.
 *  - bar varsa spacer'ın yüksekliği doğrudan bu olur (globals.css),
 *  - yoksa aynı değer gövde dolgusuna gider.
 *
 * SIRA ÖNEMLİ: önce navLift uygulanır, sonra şerit büyütülür, EN SON ölçülür —
 * böylece okunan rect nihai düzeni gösterir.
 */
function applyBannerSpace() {
  try {
    const safe = measureSafeBottom();
    applyNavLift(computeNavLift(safe));
    syncBannerFill();
    const m = measureNav();
    const space = bannerHeightPx > 0 ? m.space : 0;
    document.documentElement.style.setProperty(BANNER_SPACE_VAR, `${space}px`);
    // Alt bar bu sayfada basılı mı? Rezervin spacer'a mı yoksa gövdeye mi
    // yazılacağını bu belirler (bkz. globals.css).
    document.body.classList.toggle(NAV_PRESENT_CLASS, m.navPresent);
    applyGameSpace();
    logBannerLayout(m);
  } catch {}
}

// ------------------------------------------------------ OYUN EKRANI PAYI
//
// Oyun ekranlarında alt bar YOK, yani bandın üstüne kalkacak bir bar da yok —
// banda değen şey sayfanın kendi dip elemanlarıdır (arena oyuncu şeridi gibi).
// Uygulanan mantık alt barınkiyle birebir aynı: değer JS'te hesaplanır, elemanın
// KENDİ satır içi stiline `!important` ile yazılır (React'in style prop'u da,
// globals.css de bunu ezemez), her gezinmede/boyut olayında tazelenir.
//
//     oyun payı = navLift (bant + güvenli alan + admin ek boşluk)
//                 + admin "oyun ekranı ek payı"
//
// İki iş yapılır ve BİRBİRİNİ ETKİLEMEZ (bilerek: biri diğerinin varlığına göre
// karar verseydi, arena reveal tablosu kabuğu bir anlığına söküp taktığında
// hesap bayatlar ve boşluk ya iki kez sayılır ya hiç kalmazdı):
//
//   1) GÖVDE — oyun yolundayken alt dolgu = oyun payı. Akışta biten HER şeyi
//      kapsar (1v1, günün kelimesi, maraton bölümü, arena sonuç/tablo ekranları,
//      misafir kartları…): kaydırılan içerik bandın ARKASINDA değil ÜSTÜNDE biter.
//
//   2) EKRAN YÜKSEKLİĞİNE KİLİTLİ KABUKLAR (.kt-game-fill) — min-height 100vh
//      yerine calc(100vh - pay). Dipteki şerit (arena oyuncu barı) tam bandın
//      üstüne oturur. Kabuk sayfayı UZATMADIĞI için (1) ile toplanmaz: kabuk
//      100vh - pay, gövde dolgusu pay → toplam yine tam 100vh.
//
// Bant yokken (reklamsız hesap / banner kapalı / no fill) pay 0'dır: kabuklar
// calc(100vh - 0px) = 100vh'ye döner, gövdenin satır içi dolgusu tamamen SİLİNİR
// (oyun dışı sayfalarda globals.css yeniden devralsın) — düzen web'dekiyle birebir
// aynı, geride boşluk kalmaz.
function gameExtraPx(): number {
  return consoleGameExtra !== null ? consoleGameExtra : adminGameExtra;
}

function applyGameSpace() {
  try {
    const active = bannerHeightPx > 0 && pathMatches(currentPath, GAME_PATHS);
    const space = active ? Math.max(0, Math.round(navLiftPx + gameExtraPx())) : 0;

    document.documentElement.style.setProperty(GAME_SPACE_VAR, `${space}px`);
    document.body.classList.toggle(GAME_SCREEN_CLASS, active);

    // 1) Gövde rezervi. Oyun ekranında değilsek satır içi dolgu KALDIRILIR ki
    //    globals.css'teki genel kural (--kt-banner-space) yeniden devralsın.
    if (active) document.body.style.setProperty("padding-bottom", `${space}px`, "important");
    else document.body.style.removeProperty("padding-bottom");

    // 2) Kabuklar. Pay 0 olsa bile SİLİNMEZ, 0px'li hâli yazılır: min-height'ı
    //    React de yönetiyor (calc + değişken), removeProperty onu da götürürdü.
    //    ÜST rezerv de düşülür: gövdenin üst dolgusu kabuğu aşağı ittiği için
    //    düşülmezse kabuğun ALTI tam o kadar bandın içine taşar.
    const fills = document.querySelectorAll<HTMLElement>(GAME_FILL_SELECTOR);
    const reserved = space + statusSpacePx;
    fills.forEach((el) => el.style.setProperty("min-height", `calc(100vh - ${reserved}px)`, "important"));

    gameSpacePx = space;
    gameShellCount = fills.length;
  } catch {}
}

/**
 * Kaldırmanın GERÇEKTEN uygulandığının kanıtı — TEK SATIR, her boyut olayında ve
 * her gezinmede basılır: girdiler, hesaplanan navLift ve UYGULANDIKTAN SONRA
 * elemandan geri okunan computed bottom.
 *
 * Geri okunan değer navLift'e eşit değilse stil barı bulamıyor demektir; o zaman
 * ekranın dibindeki sabit konumlu elemanlar dökülür ki barı gerçekte hangi
 * elemanın bastığı görülsün.
 */
function logBannerLayout(m: NavMetrics) {
  try {
    const fill = document.getElementById(BANNER_FILL_ID);
    const fillH = fill ? Math.round(fill.getBoundingClientRect().height) : 0;
    const rectAlt = m.navPresent ? m.innerHeight - m.navBottom : 0;
    const okStr = (a: number, b: number) => (Math.abs(a - b) <= 1 ? "OK" : "HATA");
    const kaynak = consoleLift !== null ? "konsol" : adminLiftOverride > 0 ? "sabit" : "hesap";
    console.log(
      `[native] navLift bant:${bannerHeightPx} güvenli:${m.safe} ek:${adminLiftExtra} ` +
      `sabit:${adminLiftOverride} (${kaynak}) → navLift:${navLiftPx} | ` +
      `nav computed bottom:${m.navComputedBottom} rect payı:${rectAlt} ` +
      `${m.navPresent ? okStr(rectAlt, navLiftPx) : "(bar yok)"} | ` +
      `şerit:${fillH}/${navLiftPx} ${okStr(fillH, navLiftPx)} | ` +
      `rezerv:${m.space} | oyun payı:${gameSpacePx} (ek:${gameExtraPx()}) ` +
      `kabuk:${gameShellCount} | navH:${m.navHeight} innerH:${m.innerHeight}`,
    );
    if (m.navPresent && Math.abs(rectAlt - navLiftPx) > 1) dumpBottomFixed();
  } catch {}
}

/**
 * Stil barı tutmuyorsa: ekranın dibine yapışık sabit/yapışkan elemanları döker.
 * Alt bar gerçekte hangi eleman tarafından basılıyorsa burada görünür.
 */
function dumpBottomFixed() {
  try {
    const ih = window.innerHeight;
    const rows: string[] = [];
    document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
      if (rows.length >= 12) return;
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky") return;
      const r = el.getBoundingClientRect();
      if (r.height < 20 || r.bottom < ih - 260) return;
      rows.push(
        `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}` +
        `${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""} ` +
        `bottom:${cs.bottom} z:${cs.zIndex} rect:${Math.round(r.top)}-${Math.round(r.bottom)}`,
      );
    });
    console.warn("[native] navLift TUTMADI — dipteki sabit elemanlar:\n  " + rows.join("\n  "));
  } catch {}
}

// ------------------------------------------------- BANDIN ARKASINDAKİ DOLGU
//
// Bant native bir katman: WebView'ın ÜSTÜNE çiziliyor, yani altında kalan alan
// hâlâ sayfaya ait ve sayfa zemini (gökyüzü animasyonu) oradan sızıyor. Şerit
// TAM OLARAK bandın kapladığı alanı + altındaki güvenli alanı doldurur; barın
// kendi zeminiyle aynı renk olduğu için "bar + bant" tek parça kuşak okunur.
//
// Kurallar:
//  - yalnızca native'de ve bant GÖRÜNÜRKEN var; bant gizlenince/kapalıyken
//    DOM'dan tamamen silinir (setBannerHeight(0) → syncBannerFill).
//  - yükseklik = navLift, yani barın ALTINDA kalan her şey (bant + güvenli alan
//    + admin ek boşluk). Her boyut olayında/gezinmede yeniden yazılır.
//  - z-index alt barın (50) altında, pointer-events yok → dokunuşu ASLA yemez.
//  - renk SABİT DEĞİL: alt barın hesaplanmış stilinden kopyalanır; bar yoksa
//    (ör. /giris) barın kullandığı --bg-panel belirtecine düşer.

/** Alt barın o anki zemini — renk/gradyan/blur, hesaplanmış stilden okunur. */
function navBackground(): { color: string; image: string; filter: string } {
  try {
    const bar = document.querySelector<HTMLElement>(".kt-bottom-nav-bar");
    if (bar) {
      const cs = getComputedStyle(bar);
      return {
        color: cs.backgroundColor || "var(--bg-panel)",
        image: cs.backgroundImage && cs.backgroundImage !== "none" ? cs.backgroundImage : "none",
        filter: cs.backdropFilter && cs.backdropFilter !== "none" ? cs.backdropFilter : "none",
      };
    }
  } catch {}
  // Bar bu sayfada basılı değil — barın kullandığı belirtecin ta kendisi.
  return { color: "var(--bg-panel)", image: "none", filter: "none" };
}

/** Tema değişince (data-theme) rengi tazelemek için — şerit varken dinler. */
let fillThemeWatcher: MutationObserver | null = null;

function syncBannerFill() {
  try {
    let el = document.getElementById(BANNER_FILL_ID);

    // Bant yok/gizli → iz bırakmadan kaldır.
    if (bannerHeightPx <= 0) {
      el?.remove();
      fillThemeWatcher?.disconnect();
      fillThemeWatcher = null;
      return;
    }

    if (!el) {
      el = document.createElement("div");
      el.id = BANNER_FILL_ID;
      el.setAttribute("aria-hidden", "true");
      el.style.cssText =
        "position:fixed;left:0;right:0;bottom:0;z-index:49;pointer-events:none;";
      document.body.appendChild(el);

      // Gündüz/gece geçişinde bar rengi değişir; kopyalanan renk bayatlamasın.
      fillThemeWatcher = new MutationObserver(() => syncBannerFill());
      fillThemeWatcher.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
    }

    // TAM olarak barın altında kalan boşluk = navLift (bant + güvenli alan +
    // admin ek boşluk). Barın yeri buraya DAHİL DEĞİL: bar bu şeridin üstünde,
    // kendi zeminiyle duruyor. Admin ek boşluğu büyüdükçe şerit de büyür.
    el.style.height = `${navLiftPx}px`;

    const bg = navBackground();
    el.style.backgroundColor = bg.color;
    el.style.backgroundImage = bg.image;
    el.style.setProperty("backdrop-filter", bg.filter);
    el.style.setProperty("-webkit-backdrop-filter", bg.filter);
  } catch {}
}

/** "/arena" kaydı "/arena" ve "/arena/ozel/ABC" ile eşleşir, "/arenax" ile eşleşmez. */
function pathMatches(pathname: string, list: string[]): boolean {
  const p = (pathname || "/").split("?")[0];
  return list.some((raw) => {
    const item = (raw || "").trim();
    if (!item.startsWith("/")) return false;
    const base = item.length > 1 && item.endsWith("/") ? item.slice(0, -1) : item;
    return p === base || p.startsWith(`${base}/`);
  });
}

// --- banner denetimi (modül kapsamı: kurulum bir kez, yol her gezinmede değişir) ---
type BannerControl = {
  hiddenPaths: string[];
  show: () => Promise<void>;
  hide: () => Promise<void>;
};

let bannerCtl: BannerControl | null = null;
let currentPath = "/";

/**
 * Reklamsız (ad-free) hesap. Oturum durumu netleşince applyAdFree ile yazılır.
 * AÇIKKEN: AdMob hiç kurulmaz, bant hiç gösterilmez, bant yüksekliği 0 kalır —
 * yani navLift ve arka şerit de 0 olur (alt bar web'deki yerinde durur).
 */
let adFreeActive = false;
/** setupAdMob bir kez çağrılsın diye (oturum değişiminde yeniden denenir). */
let adMobSetupStarted = false;
/** Hızlı gezinmede göster/gizle çağrıları birbirine karışmasın diye sıraya alınır. */
let bannerQueue: Promise<void> = Promise.resolve();

/** Şu anki yola göre bandı gizler veya geri getirir. Hazır değilse sessiz geçer. */
function applyBannerForPath(): Promise<void> {
  const ctl = bannerCtl;
  if (!ctl) {
    return Promise.resolve();
  }
  // Reklamsız hesapta yol ne olursa olsun bant kapalı.
  const shouldHide = adFreeActive || pathMatches(currentPath, ctl.hiddenPaths);
  bannerQueue = bannerQueue
    .then(() => (shouldHide ? ctl.hide() : ctl.show()))
    .catch(() => {});
  return bannerQueue;
}

/**
 * Push verisinden gelen yolu güvenli hale getirir.
 * Kendi alan adımızın tam adresi gelirse yol kısmına indirilir; dış adres yok sayılır.
 */
function normalizeRoute(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const route = raw.trim();
  if (!route) return null;
  if (route.startsWith("/")) return route;
  try {
    const u = new URL(route);
    if (/(^|\.)kelimetahmin\.com$/i.test(u.hostname)) return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    /* geçersiz adres — yok say */
  }
  return null;
}

export default function NativeBootstrap() {
  const { platform, isNative, ready } = usePlatform();
  const { token: authToken } = useAuth();
  // Reklamsız hak. Durum netleşene kadar (ready=false) reklam AÇILMAZ —
  // hak sahibine bir an bile reklam çıkmasın (bkz. lib/auth.tsx → useAdFree).
  const { adFree, ready: adFreeReady } = useAdFree();
  const router = useRouter();
  const pathname = usePathname();

  // Sayfa değiştikçe banner kararı yenilenir (oyun ekranında gizli).
  // Kurulum henüz bitmediyse yalnızca yol saklanır; setupAdMob sonunda okur.
  useEffect(() => {
    if (!ready || !isNative) return;
    currentPath = pathname || "/";
    void applyBannerForPath();

    // Bildirimler sayfası açıldı: kullanıcı listeyi görüyor, gölgedeki sistem
    // bildirimleri (ve dolayısıyla simge rozeti) burada temizlenir.
    if (pathMatches(currentPath, ["/bildirimler"])) {
      void clearDeliveredNotifications("bildirimler sayfası");
    }

    // Bar bu sayfada var mı yok mu değişmiş olabilir → satır içi kaldırmayı ve
    // içerik rezervini tazele. Bar yeni monte olduysa satır içi stili kaybolur;
    // bu yüzden ilk kareden sonra bir de gecikmeli tekrar uygulanır.
    const raf = requestAnimationFrame(() => applyBannerSpace());
    const late = window.setTimeout(() => applyBannerSpace(), 300);
    // Klavye açılması / döndürme: ölçüler değişir, kaldırma yeniden yazılır.
    const onResize = () => applyBannerSpace();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(late);
      window.removeEventListener("resize", onResize);
    };
  }, [pathname, ready, isNative]);

  // --- yönlendirme kuyruğu -------------------------------------------------
  // Bildirime tıklanarak açılışta (cold start) olay, router hazır olmadan
  // gelebilir. O durumda yol kuyruğa alınır, hazır olunca uygulanır.
  const routerRef = useRef(router);
  routerRef.current = router;
  const navReadyRef = useRef(false);
  const pendingRouteRef = useRef<string | null>(null);

  const go = useCallback((raw: unknown) => {
    const route = normalizeRoute(raw);
    if (!route) return;
    if (!navReadyRef.current) {
      pendingRouteRef.current = route;   // router hazır değil — beklet
      return;
    }
    try {
      routerRef.current.push(route);
    } catch (e) {
      log("yönlendirme başarısız, tam yükleme yapılıyor:", e);
      try { window.location.href = route; } catch {}
    }
  }, []);

  // Bağlanma + ilk kare sonrası router gerçekten kullanılabilir (hydration bitti);
  // o ana kadar biriken yol varsa şimdi uygulanır.
  useEffect(() => {
    let raf = 0;
    const arm = () => {
      navReadyRef.current = true;
      const queued = pendingRouteRef.current;
      if (queued) {
        pendingRouteRef.current = null;
        go(queued);
      }
    };
    if (typeof requestAnimationFrame === "function") raf = requestAnimationFrame(arm);
    else arm();
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [go]);

  // --- push token kaydı ----------------------------------------------------
  // Token giriş yapılmadan da gelebilir; o zaman bellekte tutulur ve kullanıcı
  // giriş yaptığı anda (authToken değişince) gönderilir. Token KAYBOLMAZ.
  const pushTokenRef = useRef<string | null>(null);
  const registeredForJwtRef = useRef<string | null>(null);
  const registeringRef = useRef(false);

  const resyncRef = useRef(false);
  // Her zaman GÜNCEL syncPushToken'ı gösterir (dinleyiciler bir kez bağlanıyor).
  const syncRef = useRef<() => Promise<void>>(async () => {});

  const syncPushToken = useCallback(async () => {
    const token = pushTokenRef.current;
    if (!token) return;
    if (registeringRef.current) {
      resyncRef.current = true;   // istek uçuşta — bitince tekrar dene
      return;
    }

    let jwt: string | null = null;
    try { jwt = localStorage.getItem("kt_token"); } catch {}
    if (!jwt) return;                                   // giriş yok — token bekler
    if (registeredForJwtRef.current === jwt) return;    // bu hesap için kaydedildi

    registeringRef.current = true;
    try {
      const res = await fetch(apiUrl("/api/devices/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          token,
          platform: platform === "ios" ? "ios" : "android",
          device_label: `Kelime Tahmin · ${platform === "ios" ? "iOS" : "Android"}`,
        }),
      });
      if (res.ok) {
        registeredForJwtRef.current = jwt;
      } else {
        // 401 = oturum düştü/misafir. Token bellekte kalır, sonraki girişte tekrar denenir.
        log("cihaz kaydı reddedildi:", res.status);
      }
    } catch (e) {
      log("cihaz kaydı gönderilemedi:", e);
    } finally {
      registeringRef.current = false;
      if (resyncRef.current) {
        resyncRef.current = false;
        void syncRef.current();
      }
    }
  }, [platform]);

  // Giriş/çıkış olduğunda bekleyen token'ı yeniden dene.
  //
  // TETİKLEYİCİ authToken'dır (lib/auth.tsx → applyAuth) ve giriş yolu fark
  // etmez: e-posta/şifre, web Google akışı ve UYGULAMA İÇİ NATIVE GOOGLE GİRİŞİ
  // (/api/auth/google/native) üçü de aynı applyAuth'tan geçer, dolayısıyla push
  // izni verilmiş ama hesapsız beklemekte olan cihaz token'ı burada kaydedilir.
  // Kayıt JWT başına bir kez yapılır (registeredForJwtRef), yani yeniden
  // render'lar boşuna istek atmaz; farklı hesaba geçilirse yeniden gönderilir.
  useEffect(() => {
    if (!ready || !isNative) return;
    void syncPushToken();
  }, [ready, isNative, authToken, syncPushToken]);

  syncRef.current = syncPushToken;

  // --- tek seferlik kurulum ------------------------------------------------
  useEffect(() => {
    if (!ready || !isNative || bootstrapped) return;
    bootstrapped = true;

    void setupStatusBar(platform);
    void setupPush(platform, go, () => syncRef.current(), pushTokenRef);
    void setupAppLifecycle(go);
    // Soğuk açılış: bildirime tıklanarak gelinmiş olabilir, rozet baştan sönsün.
    void clearDeliveredNotifications("açılış");
    // AdMob BURADA kurulmaz: reklamsız hak netleşmeden reklam açılmasın diye
    // aşağıdaki effect'e taşındı.
  }, [ready, isNative, platform, go, syncPushToken]);

  // --- reklamsız hak -------------------------------------------------------
  // Geçiş reklamı sayacı tarayıcıda da tutulduğu için bu effect isNative'e
  // BAKMAZ: web'de de sayaç artmasın.
  // Durum netleşmemişse de bastırılır (fail-closed): en kötü ihtimalle sıradan
  // kullanıcı ilk saniyede bir maç sayacı kaçırır.
  useEffect(() => {
    setInterstitialAdFree(!adFreeReady || adFree);
  }, [adFreeReady, adFree]);

  // AdMob (bant + geçiş köprüsü): oturum durumu çözülmeden başlatılmaz; giriş /
  // çıkış olduğunda yeniden değerlendirilir.
  useEffect(() => {
    if (!ready || !isNative || !adFreeReady) return;
    void applyAdFree(adFree, platform);
  }, [ready, isNative, platform, adFreeReady, adFree]);

  return null;
}

// ---------------------------------------------------------------- PUSH

/** Bildirim gruplarını sunucudan çeker; olmazsa sabit yedek listeye düşer. */
async function fetchGroups(): Promise<{ code: string; label: string }[]> {
  try {
    const r = await fetch(apiUrl("/api/notification-groups"), { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const rows: any[] = Array.isArray(d?.groups) ? d.groups : [];
    const groups = rows
      .filter((g) => typeof g?.code === "string" && g.code)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((g) => ({ code: String(g.code), label: String(g.label || g.code) }));
    if (groups.length) return groups;
    throw new Error("boş liste");
  } catch (e) {
    log("bildirim grupları alınamadı, yedek liste kullanılıyor:", e);
    return FALLBACK_GROUPS;
  }
}

async function setupPush(
  platform: Platform,
  go: (route: unknown) => void,
  syncPushToken: () => Promise<void>,
  pushTokenRef: { current: string | null },
) {
  try {
    const [{ Capacitor }, { PushNotifications }] = await Promise.all([
      import("@capacitor/core"),
      import("@capacitor/push-notifications"),
    ]);
    if (!Capacitor.isPluginAvailable("PushNotifications")) return;

    // 1) Android kanalları: grup başına bir kanal (id = grup kodu).
    //    iOS'ta createChannel yoktur; çağrı hata verirse yutulur.
    if (platform === "android") {
      const groups = await fetchGroups();
      for (const g of groups) {
        const high = g.code === HIGH_IMPORTANCE_GROUP;
        try {
          await PushNotifications.createChannel({
            id: g.code,
            name: g.label,
            description: g.label,
            importance: high ? 5 : 3,
            visibility: 1,
            vibration: high,
            lights: high,
          });
        } catch (e) {
          log(`kanal kurulamadı (${g.code}):`, e);
        }
      }
    }

    // 2) Dinleyiciler izin/kayıttan ÖNCE bağlanmalı — register() sonrası
    //    'registration' olayı hemen gelebilir.
    await PushNotifications.addListener("registration", (t) => {
      pushTokenRef.current = t?.value || null;
      void syncPushToken();
    });

    await PushNotifications.addListener("registrationError", (err) => {
      log("push kaydı başarısız:", err);
    });

    // Uygulama önplandayken gelen bildirim: sistem bildirimi GÖSTERİLMEZ,
    // web push'takiyle aynı hafif iç uyarı basılır.
    await PushNotifications.addListener("pushNotificationReceived", (n) => {
      try {
        showToast(
          n?.title || "Kelime Tahmin",
          n?.body || "",
          normalizeRoute((n?.data as any)?.route) || undefined,
        );
      } catch (e) {
        log("bildirim uyarısı gösterilemedi:", e);
      }
    });

    // Bildirime tıklandı (uygulama kapalıyken de tetiklenir).
    await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      go((action?.notification?.data as any)?.route);
    });

    // 3) İzin → sadece verildiyse kayıt.
    const perm = await PushNotifications.requestPermissions();
    if (perm?.receive !== "granted") return;
    await PushNotifications.register();
  } catch (e) {
    log("push kurulumu başarısız:", e);
  }
}

// ---------------------------------------------------------------- ADMOB

/**
 * Reklamsız durumunu uygular. Oturum değişince de çağrılır (giriş/çıkış):
 *  - açıldıysa: bandı gizle, yüksekliği 0'a çek (navLift + şerit kendiliğinden 0),
 *  - kapandıysa: AdMob daha önce kurulmadıysa şimdi kur, kurulduysa yola göre uygula.
 */
async function applyAdFree(next: boolean, platform: Platform) {
  const changed = adFreeActive !== next;
  adFreeActive = next;
  setInterstitialAdFree(next);

  if (next) {
    if (changed) log("reklamsız hesap — reklam yolları kapatıldı");
    setBannerHeight(0);
    try {
      await bannerCtl?.hide();
    } catch {}
    return;
  }

  if (!adMobSetupStarted) {
    adMobSetupStarted = true;
    await setupAdMob(platform);
    return;
  }
  // Zaten kurulmuştu (ör. reklamsız hesaptan çıkış yapıldı) — bandı geri getir.
  await applyBannerForPath();
}

async function setupAdMob(platform: Platform) {
  try {
    // Reklamsız hesapta AdMob SDK'sı hiç başlatılmaz, tek istek gitmez.
    if (adFreeActive) return;
    const config = await loadAppConfig(platform);
    const admob = config?.["ads.admob"];
    if (!admob?.enabled) { return; }

    const { AdMob, BannerAdSize, BannerAdPosition, BannerAdPluginEvents } =
      await import("@capacitor-community/admob");

    const isTesting = !!admob.test_mode;
    // DİKKAT: initialize Play Services olmayan emülatörde HİÇ ÇÖZÜLMEYEBİLİR.
    // "başlıyor" görünüp "bitti" görünmüyorsa sorun burada demektir.
    await AdMob.initialize({ initializeForTesting: isTesting });

    // ATT (izleme izni) SADECE iOS'ta sorulur; Android'de bu çağrı yoktur.
    if (platform === "ios") {
      try {
        const status = await AdMob.trackingAuthorizationStatus();
        if (status?.status === "notDetermined") {
          await AdMob.requestTrackingAuthorization();
        }
      } catch (e) {
        log("ATT izni sorulamadı:", e);
      }
    }

    // Geçiş reklamı BANNER'DAN BAĞIMSIZ kurulur: banner kapalı olsa da ya da
    // banner birimi girilmemiş olsa da interstitial çalışmaya devam eder.
    setupInterstitial(platform, admob, AdMob, isTesting);

    // --- bundan sonrası SADECE banner ---------------------------------------
    // banner_enabled ayrı anahtar; alan hiç yoksa (migration öncesi kayıt)
    // eskisi gibi AÇIK sayılır.
    if (admob.banner_enabled === false) { return; }

    const configuredUnit = (
      (platform === "ios" ? admob.ios?.banner : admob.android?.banner) || ""
    ).trim();
    // Yapılandırılmış birim boşsa reklam AÇILMAZ (test modunda bile): "ayar yoksa
    // reklam yok" kuralı korunuyor.
    if (!configuredUnit) { return; }

    // Test modunda Google'ın test birimi kullanılır (bkz. TEST_AD_UNITS).
    const useTestUnit = !!admob.test_mode;
    const unit = useTestUnit ? TEST_AD_UNITS.banner : configuredUnit;
    const unitKind = useTestUnit ? "GOOGLE TEST BİRİMİ" : "gerçek birim";

    const hiddenPaths = Array.isArray(admob.banner_hidden_paths)
      ? admob.banner_hidden_paths.filter((p): p is string => typeof p === "string" && !!p.trim())
      : FALLBACK_BANNER_HIDDEN_PATHS;

    // --- banner durumu ---------------------------------------------------
    // Native tarafta banner nesnesinin gerçek hâli. Yanlış durumda çağrı yapmak
    // eklentiyi hataya sokuyor ("You tried to hide a banner that was never shown"),
    // bu yüzden her çağrıdan önce buraya bakılır:
    //   "yok"      -> native AdView YOK (hiç açılmadı ya da yükleme hatasında yok edildi)
    //   "gorunur"  -> ekranda
    //   "gizli"    -> AdView duruyor ama gizlendi (resumeBanner ile geri gelir)
    // ÖNEMLİ: eklenti, ilan yüklenemezse AdView'i destroy edip null yapıyor
    // (BannerExecutor.onAdFailedToLoad) — o yüzden hata durumu "yok"a döner ve
    // sonraki gösterimde resumeBanner değil, YENİ showBanner çağrılır.
    let bannerState: "yok" | "gorunur" | "gizli" = "yok";

    // Admin panelinden ALT BAR kaldırma ince ayarı (Mobil & Reklam sekmesi).
    // DİKKAT: bunlar showBanner'ın margin'ine GİTMEZ — Android orayı yok sayıyor.
    // Yalnızca navLift'i belirler (bkz. computeNavLift).
    adminLiftExtra = Number(admob.banner_margin_extra) || 0;
    adminLiftOverride = Number(admob.banner_margin_override) || 0;
    // Oyun ekranlarındaki dip elemanlara (arena oyuncu şeridi vb.) EKLENEN pay.
    // Alt barı etkilemez — bkz. applyGameSpace.
    adminGameExtra = Number(admob.banner_game_offset_extra) || 0;

    // --- yükseklik: TAHMİN YOK, eklentinin bildirdiği gerçek ölçü kullanılır ---
    // SizeChanged (Android: bannerViewChangeSize, iOS: bannerViewDidReceiveAd
    // sonrası) {width, height} dp taşır; dp WebView'da CSS px'e denk gelir.
    // Eklenti gizlemede de 0 yükseklikli olay yayar — boşluk kendiliğinden kapanır.
    await AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size: any) => {
      const h = Number(size?.height) || 0;
      const shown = bannerState === "gorunur";
      setBannerHeight(shown ? h : 0);
    });
    await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, (err) => {
      // AdMob hata kodları: 0 iç hata, 1 geçersiz istek, 2 ağ, 3 stok yok (no fill).
      // Eklenti AdView'i yok etti: durumu "yok"a çek, yoksa hideBanner patlar.
      bannerState = "yok";
      log("banner yüklenemedi:", err);
      setBannerHeight(0);
    });

    const show = async () => {
      if (bannerState === "gorunur") { return; }
      const resuming = bannerState === "gizli";
      // DİKKAT: boyut olayı çağrının İÇİNDE gelebiliyor; durum önce set edilmezse
      // olay "gizli" sanıp yüksekliği 0 bırakır ve alt bar bandın altında kalır.
      bannerState = "gorunur";
      try {
        if (resuming) {
          // İlan YENİDEN YÜKLENMEZ: var olan banner yeniden görünür yapılır.
          await AdMob.resumeBanner();
        } else {
          // ==================================================================
          // margin: 0 — SABİT. ASLA DEĞİŞTİRME, hiçbir ayara bağlama.
          // Android bu değeri yok sayıyor (bant her hâlükârda ekranın dibine
          // bottom hizalı konuyor), buraya bağlanan admin alanı ÖLÜDÜR.
          // Konumu ayarlayan tek şey navLift'tir → computeNavLift/applyNavLift.
          // ==================================================================
          await AdMob.showBanner({
            adId: unit,
            adSize: BannerAdSize.ADAPTIVE_BANNER,
            position: BannerAdPosition.BOTTOM_CENTER,
            margin: 0,
            isTesting,
          });
        }
        // Yükseklik SizeChanged olayıyla gelir; olay gecikirse boşluk 0 kalır,
        // reklam görünür ama düzen bozulmaz.
      } catch (e) {
        // Çağrı patladıysa native tarafta sağlam bir AdView olduğunu varsayamayız:
        // "yok"a dön ki bir sonraki deneme sıfırdan showBanner yapsın.
        bannerState = "yok";
        log("banner gösterilemedi:", e);
        setBannerHeight(0);
      }
    };

    const hide = async () => {
      // Ölçüyü ÖNCE sıfırla: düzen beklemeden kapanır (anında his).
      setBannerHeight(0);
      if (bannerState !== "gorunur") {
        // Hiç açılmadı ya da zaten gizli/yok — hideBanner çağırmak hata verir.
        return;
      }
      bannerState = "gizli";
      try {
        await AdMob.hideBanner();
      } catch (e) {
        bannerState = "yok";
        log("banner gizlenemedi:", e);
      }
    };

    bannerCtl = { hiddenPaths, show, hide };

    /**
     * Cihazda deneme kancası (chrome://inspect konsolu):
     *   __ktBanner.lift(220)  -> alt barı 220 px'e kaldır (ANINDA görünür)
     *   __ktBanner.lift()     -> konsol denemesini bırak, admin ayarına dön
     *   __ktBanner.game(24)   -> oyun ekranı ek payını 24 px dene (ANINDA görünür)
     *   __ktBanner.game()     -> konsol denemesini bırak, admin ayarına dön
     *   __ktBanner.retry()    -> bandı sıfırdan kur (margin her zaman 0)
     *   __ktBanner.info()     -> o anki tek satır ölçüm dökümü
     * Beğendiğin sayıları /yonetim → Mobil & Reklam → "Alt bar kaldırma — sabit
     * değer" / "Oyun ekranı — ek pay" alanlarına yazınca kalıcı olur.
     */
    (window as any).__ktBanner = {
      /** Barın yüksekliğini anında dener — bant yeniden yüklenmez. */
      lift(px?: number) {
        consoleLift = typeof px === "number" ? px : null;
        applyBannerSpace();
      },
      /** Oyun ekranındaki dip elemanların ek payını anında dener. */
      game(px?: number) {
        consoleGameExtra = typeof px === "number" ? px : null;
        applyBannerSpace();
      },
      async retry() {
        try {
          await AdMob.removeBanner().catch(() => {});
          bannerState = "yok";
          setBannerHeight(0);
          await show();
        } catch (e) {
          log("banner retry başarısız:", e);
        }
      },
      /** Ölçüm satırını istediğin an bastırır (aynısı her boyut olayında da düşer). */
      info() {
        logBannerLayout(measureNav());
      },
    };



    // İlk karar mevcut sayfaya göre: oyun ekranındaysak banner HİÇ açılmaz
    // (açıp hemen kapatma titremesi olmaz, boşuna ilan da yüklenmez).
    await applyBannerForPath();
  } catch (e) {
    log("AdMob kurulumu başarısız:", e);
    setBannerHeight(0);
  }
}

// ------------------------------------------------------ GEÇİŞ (INTERSTITIAL)
//
// Buradaki tek iş native köprüyü kurmaktır: NE ZAMAN gösterileceğine dair TÜM
// kurallar lib/interstitial.ts'te (yerleşim, sayaç, sıklık). Bu ayrım bilinçli:
// oyun ekranları Capacitor'a hiç dokunmadan exitWithAd/noteMatchFinished çağırır,
// tarayıcıda ise köprü hiç kurulmadığı için tüm kapılar kapalı kalır.

type AdMobModule = (typeof import("@capacitor-community/admob"))["AdMob"];

/** Sayı ayarı: geçersizse varsayılan, 0 ise GERÇEKTEN 0 (kasıtlı olabilir). */
function numSetting(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function setupInterstitial(
  platform: Platform,
  admob: AdMobConfig,
  AdMob: AdMobModule,
  isTesting: boolean,
) {
  try {
    // Alan hiç yoksa (migration öncesi kayıt) AÇIK sayılır — banner'daki kuralla aynı.
    if (admob.interstitial_enabled === false) return;

    const configured = (
      (platform === "ios" ? admob.ios?.interstitial : admob.android?.interstitial) || ""
    ).trim();
    // "Ayar yoksa reklam yok": birim girilmemişse test modunda bile açılmaz.
    if (!configured) return;
    const unit = isTesting ? TEST_AD_UNITS.interstitial : configured;

    const modesCfg = admob.interstitial_modes;
    const modes = (modesCfg && typeof modesCfg === "object" ? modesCfg : FALLBACK_INTERSTITIAL_MODES) as
      Partial<Record<AdMode, boolean>>;

    // --- ilanı ÖNCEDEN yükle: çıkışta bekleme olmasın ---------------------
    // prepared = elde gösterilmeyi bekleyen ilan var. Gösterilen ilan tüketilir,
    // yenisi hemen yüklenmeye başlar (lib/interstitial.ts show sonrası prepare der).
    let prepared = false;
    let preparing: Promise<void> | null = null;

    const prepare = (): Promise<void> => {
      if (prepared) return Promise.resolve();
      if (preparing) return preparing;
      preparing = AdMob.prepareInterstitial({ adId: unit, isTesting })
        .then(() => { prepared = true; })
        .catch((e) => {
          // No fill / ağ hatası: sessizce geç, bir sonraki denemede tekrar yüklenir.
          log("interstitial hazırlanamadı:", e);
          throw e;
        })
        .finally(() => { preparing = null; });
      return preparing;
    };

    const show = async (): Promise<void> => {
      if (!prepared) throw new Error("interstitial hazır değil");
      prepared = false;   // bu ilan tüketildi; sonraki için yeniden prepare gerekir
      await AdMob.showInterstitial();
    };

    configureInterstitial({
      runtime: { prepare, show, isReady: () => prepared },
      rules: {
        everyN: numSetting(admob.interstitial_every_n_matches, 5),
        minSeconds: numSetting(admob.interstitial_min_seconds, 90),
        skipFirstN: numSetting(admob.interstitial_skip_first_n, 3),
        modes,
      },
    });

    // İlk ilanı şimdiden yükle — kullanıcı ilk maçını bitirmeden hazır olsun.
    void prepare().catch(() => {});
  } catch (e) {
    log("interstitial kurulumu başarısız:", e);
  }
}

// ---------------------------------------------------------------- DURUM ÇUBUĞU
//
// SORUN: @capacitor/status-bar eklentisinin Android varsayılanı overlaysWebView
// = TRUE (StatusBarConfig.java). Yani webview saat/pil satırının ARKASINDAN
// başlıyor ve sayfanın tepesi sistem çubuğunun altında kalıyor.
//
// ÇÖZÜM (APK YENİDEN DERLEMEDEN): eklenti zaten APK'nın içinde derli
// (mobile/android/app/capacitor.build.gradle → capacitor-status-bar), bu yüzden
// aynı ayar ÇALIŞMA ANINDA JS'ten verilebilir:
//     setOverlaysWebView({ overlay: false })  -> webview çubuğun ALTINDAN başlar
//     setBackgroundColor({ color })           -> çubuk zemini sayfanın tepesiyle aynı
//     setStyle({ style })                     -> ikonlar açık/koyu temaya göre
//
// AMA: bu üç çağrının Android tarafı DEPRECATED API kullanıyor
// (View.setSystemUiVisibility + Window.setStatusBarColor). Uygulama targetSdk 35
// ile derlendiği için ANDROID 15+ cihazlarda bu çağrılar SESSİZCE YOK SAYILIR
// (zorunlu edge-to-edge). Bu yüzden çağrıdan sonra GERÇEKTEN işe yarayıp
// yaramadığı ÖLÇÜLÜR: webview çubuk kadar kısaldıysa tamam; kısalmadıysa
// yedek plana geçilir → ölçülen çubuk yüksekliği kadar üst rezerv
// (--kt-status-space + --kt-safe-top + gövde dolgusu).
//
// Yedek planda görüntü aslında daha da iyi olur: webview çubuğun altına da
// çizdiği için sayfanın gökyüzü gradyanı çubuğun arkasından devam eder, düz renk
// yerine gerçek zemin görünür. Kaybedilen tek şey "düz renkli çubuk" tercihidir.
//
// SADECE ANDROID: iOS'ta çubuk zaten env(safe-area-inset-*) ile doğru çalışıyor
// ve setBackgroundColor iOS'ta desteklenmiyor.

const STATUS_SPACE_VAR = "--kt-status-space";
const STATUS_BODY_CLASS = "has-native-statusbar";
/**
 * Ekrana SABİT elemanların (maç geri butonu, toast'lar, mikrofon balonu, yapışkan
 * başlıklar, modal üst dolgusu) okuduğu değişken. Android'de
 * env(safe-area-inset-top) YALNIZCA çentik için dolar — düz durum çubuğu için 0
 * döner — bu yüzden yedek planda buraya ölçülen çubuk yüksekliği yazılır.
 */
const SAFE_TOP_VAR = "--kt-safe-top";

/** Uygulanan üst rezerv (0 = eklenti yolu tuttu, rezerve gerek yok). */
let statusSpacePx = 0;

/** Sayfanın en üstündeki renk — globals.css'te tema/gökyüzü başına tanımlı. */
function statusBarColor(): string {
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--kt-statusbar")
      .trim();
    if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
  } catch {}
  return "#0e0b1e";
}

function isLightTheme(): boolean {
  try {
    return document.documentElement.getAttribute("data-theme") === "light";
  } catch {
    return false;
  }
}

/**
 * Üst rezervi uygular. Alt bar/bant ile aynı yöntem: satır içi + !important,
 * yani globals.css de React de ezemez. 0 verilince satır içi yazımlar SİLİNİR ve
 * düzen web'dekiyle birebir aynı hâline döner.
 */
function applyStatusSpace(px: number) {
  try {
    statusSpacePx = Number.isFinite(px) && px > 0 ? Math.round(px) : 0;
    const root = document.documentElement;
    root.style.setProperty(STATUS_SPACE_VAR, `${statusSpacePx}px`);
    document.body.classList.toggle(STATUS_BODY_CLASS, statusSpacePx > 0);

    if (statusSpacePx > 0) {
      // Çentiği de koru: gerçek env() değeri daha büyükse o kazansın.
      root.style.setProperty(
        SAFE_TOP_VAR, `max(env(safe-area-inset-top, 0px), ${statusSpacePx}px)`,
      );
      document.body.style.setProperty("padding-top", `${statusSpacePx}px`, "important");
    } else {
      root.style.removeProperty(SAFE_TOP_VAR);   // :root'taki env() tanımına döner
      document.body.style.removeProperty("padding-top");
    }

    // Üst rezerv oyun kabuklarının yüksekliğine de giriyor (bkz. applyGameSpace);
    // karar burada verildiği için alt taraf yeniden hesaplanmalı.
    applyBannerSpace();
  } catch {}
}

/** UA'dan Android ana sürümü (0 = bilinmiyor). Yalnızca teşhis/karar için. */
function androidMajor(): number {
  try {
    const m = navigator.userAgent.match(/Android\s+(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  } catch {
    return 0;
  }
}

async function setupStatusBar(platform: Platform) {
  if (platform !== "android") return;
  try {
    const [{ Capacitor }, { StatusBar, Style }] = await Promise.all([
      import("@capacitor/core"),
      import("@capacitor/status-bar"),
    ]);
    // Eklenti APK'ya derlenmiş mi? (İlk kurulumdan beri derli — bu kontrol
    // yalnızca çok eski bir APK'da sessiz hata yerine NET kayıt bırakmak için.)
    if (!Capacitor.isPluginAvailable("StatusBar")) {
      log("StatusBar eklentisi bu APK'da yok — durum çubuğu ayarı atlandı.");
      return;
    }

    // Çubuk yüksekliği dp cinsinden gelir; WebView'da dp = CSS px.
    // (Eklenti bunu modern WindowInsets API'siyle okur, Android 15'te de doğrudur.)
    let barH = 0;
    let overlaysBefore = true;
    try {
      const info: any = await StatusBar.getInfo();
      barH = Math.round(Number(info?.height) || 0);
      overlaysBefore = info?.overlays !== false;
    } catch (e) {
      log("durum çubuğu bilgisi okunamadı:", e);
    }

    const heightBefore = window.innerHeight;

    await StatusBar.setOverlaysWebView({ overlay: false });
    // Renk/stil overlay tutmasa da verilir: yedek planda zararsız (çubuk saydam
    // kalır), eklenti yolunda ise çubuğun zeminini sayfanın tepesiyle eşitler.
    await applyStatusBarLook(StatusBar, Style);

    /**
     * KARAR. Üç durum var:
     *   a) overlay AÇIKTI ve çağrıdan sonra webview çubuk kadar KISALDI
     *      -> eklenti yolu tuttu, rezerve gerek yok.
     *   b) overlay AÇIKTI ama hiçbir şey değişmedi
     *      -> çağrı yok sayıldı (Android 15+), rezerv gerekir.
     *   c) overlay ZATEN KAPALIYDI (eklenti öyle diyor)
     *      -> Android 15+'ta bayrak okunamadığı için bu bilgi YALAN olabilir;
     *         sürüm 15'in altındaysa gerçekten kapalıdır, üstündeyse rezerv gerekir.
     * Ölçüm asıldır, sürüm yalnızca (c)'deki belirsizliği çözer.
     */
    const decide = () => {
      const shrank = heightBefore - window.innerHeight;
      const worked = barH > 0 && shrank >= barH - 2;
      const alreadyBelow = !overlaysBefore && androidMajor() < 15;
      const space = worked || alreadyBelow || barH <= 0 ? 0 : barH;
      applyStatusSpace(space);
      console.log(
        `[native] durum çubuğu: yükseklik:${barH} overlay(önce):${overlaysBefore} ` +
        `kısalma:${shrank} android:${androidMajor()} → ` +
        `${space > 0 ? `REZERV ${space}px (eklenti yolu tutmadı)` : "eklenti yolu tuttu"}`,
      );
    };

    // Yerleşim bir-iki kare sürebilir; erken ölçüm yanlış karar verdirir.
    window.setTimeout(decide, 400);
    // Ağır açılışta ilk ölçüm kaçarsa ikinci tur düzeltir (uygulaması aynı, fark
    // yoksa hiçbir şey değişmez).
    window.setTimeout(decide, 2000);

    // Tema (gündüz/gece) ve gökyüzü değişince çubuk rengi/ikon tonu tazelenir.
    try {
      const obs = new MutationObserver(() => { void applyStatusBarLook(StatusBar, Style); });
      obs.observe(document.documentElement, {
        attributes: true, attributeFilter: ["data-theme", "data-sky"],
      });
    } catch {}
  } catch (e) {
    log("durum çubuğu ayarlanamadı:", e);
  }
}

type StatusBarModule = (typeof import("@capacitor/status-bar"))["StatusBar"];
type StyleEnum = (typeof import("@capacitor/status-bar"))["Style"];

/** Çubuk zemini = sayfanın tepesindeki renk; ikonlar temaya göre açık/koyu. */
async function applyStatusBarLook(StatusBar: StatusBarModule, Style: StyleEnum) {
  try {
    await StatusBar.setBackgroundColor({ color: statusBarColor() });
    // Style.Dark = KOYU zemin için AÇIK ikon, Style.Light = AÇIK zemin için KOYU ikon.
    await StatusBar.setStyle({ style: isLightTheme() ? Style.Light : Style.Dark });
  } catch (e) {
    log("durum çubuğu görünümü uygulanamadı:", e);
  }
}

// -------------------------------------------------- SİMGE ROZETİ (BADGE)
//
// SORUN: bildirim okunduktan sonra da uygulama simgesinde "1" rozeti kalıyordu.
//
// NEDEN: Android'de rozet AYRI bir sayaç DEĞİLDİR — launcher'lar (Samsung One UI
// dahil) rozeti uygulamanın GÖLGEDEKİ AKTİF bildirim sayısından üretir. Bildirimi
// gölgeden silmeden rozet düşmez; sitedeki "okundu" işareti Android'i ilgilendirmez.
//
// ÇÖZÜM: removeAllDeliveredNotifications() — eklentinin Android karşılığı
// NotificationManager.cancelAll() (PushNotificationsPlugin.java:188), yani gölge
// temizlenir ve rozet kendiliğinden söner.
//
// AYRI BİR "rozeti sıfırla" ÇAĞRISI VAR MI? @capacitor/push-notifications'ın
// Android tarafında YOK (eklentideki `badge` seçeneği yalnız iOS içindir; iOS'ta
// applicationIconBadgeNumber ayrı sıfırlanır). Android'de standart bir rozet API'si
// de yoktur; OEM'e özel yayınlar (Samsung BADGE_COUNT_UPDATE) ya da @capacitor/badge
// gerekir — ikisi de YENİ NATIVE KOD, yani APK derlemesi ister. Gölgeyi temizlemek
// bu cihazlarda rozeti düşürmek için yeterli ve doğru yoldur.
//
// NE ZAMAN: (1) uygulama açılışında, (2) her öne gelişte, (3) /bildirimler açılınca.

async function clearDeliveredNotifications(reason: string) {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.removeAllDeliveredNotifications();
  } catch (e) {
    // İzin verilmemiş / eklenti yok — rozet zaten çıkmaz, sessiz geç.
    log(`bildirim gölgesi temizlenemedi (${reason}):`, e);
  }
}

// ------------------------------------------------------------ UYGULAMA YAŞAM DÖNGÜSÜ

async function setupAppLifecycle(go: (route: unknown) => void) {
  try {
    const { App } = await import("@capacitor/app");

    // --- App Links: dışarıdan gelen kelimetahmin.com linki -----------------
    // WhatsApp'tan gelen https://www.kelimetahmin.com/oda/ABC linkine
    // dokunulunca Android uygulamayı açar ve TAM ADRESİ verir. `go` bunu
    // normalizeRoute ile uygulama içi yola çevirir; BAŞKA alan adı gelirse
    // yok sayar. Sayfa yeniden yüklenmez, içeride yönlendirilir.
    //
    // İki durumda da tetiklenir: uygulama KAPALIYKEN (soğuk açılış) ve
    // AÇIKKEN (launchMode=singleTask -> onNewIntent). Soğuk açılışta router
    // henüz hazır olmayabilir; `go` kendi kuyruğuyla bunu çözüyor
    // (bkz. pendingRouteRef).
    await App.addListener("appUrlOpen", (event) => {
      log("dışarıdan link:", event?.url);
      go(event?.url);
    });

    // Olay bazen dinleyici bağlanmadan ÖNCE gelir (çok hızlı soğuk açılış);
    // uygulamanın hangi adresle açıldığı ayrıca sorulur.
    try {
      const launch = await App.getLaunchUrl();
      if (launch?.url) {
        log("açılış linki:", launch.url);
        go(launch.url);
      }
    } catch {
      // getLaunchUrl her platformda yok — sorun değil, dinleyici yeterli.
    }

    await App.addListener("backButton", ({ canGoBack }) => {
      try {
        if (canGoBack || window.history.length > 1) {
          window.history.back();
        } else {
          // Uygulamadan ÇIKMA yok — arka plana al.
          void App.minimizeApp();
        }
      } catch (e) {
        log("geri tuşu işlenemedi:", e);
      }
    });

    // Uygulama öne geldi: kullanıcı bildirimleri görmüş sayılır, rozet sönsün.
    await App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void clearDeliveredNotifications("öne geldi");
    });
  } catch (e) {
    log("uygulama yaşam döngüsü dinleyicileri kurulamadı:", e);
  }
}
