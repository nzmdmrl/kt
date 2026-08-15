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
 *    sınıfı eklenir. Oyun ekranlarında
 *    (ads.admob.banner_hidden_paths) banner gizlenir; ilan YENİDEN YÜKLENMEZ,
 *    aynı banner gizlenip gösterilir (hideBanner/resumeBanner).
 *  - Geri tuşu: sayfa geçmişi varsa geri git, yoksa uygulamayı arka plana al
 *    (uygulamadan çıkma YOK).
 */

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePlatform, type Platform } from "@/lib/platform";
import { loadAppConfig } from "@/lib/appConfig";
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

/** Alt bar ölçülemezse kullanılacak yükseklik (globals.css'teki spacer değeri). */
const NAV_HEIGHT_FALLBACK = 76;

/** Alt barı basan eleman — satır içi stil buraya yazılır. */
const NAV_SELECTOR = ".kt-bottom-nav-bar";

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
 * backend/app/api/routes/app_settings.py → DEFAULT_BANNER_HIDDEN_PATHS ile aynı.
 */
const FALLBACK_BANNER_HIDDEN_PATHS = ["/oyna", "/arena", "/solo", "/gunun-kelimesi", "/oda"];

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
/** Konsoldan elle deneme (bkz. __ktBanner.lift) — kaydetmeden önce denemek için. */
let consoleLift: number | null = null;

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
    logBannerLayout(m);
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
      `rezerv:${m.space} | navH:${m.navHeight} innerH:${m.innerHeight}`,
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
function pathHidden(pathname: string, list: string[]): boolean {
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
/** Hızlı gezinmede göster/gizle çağrıları birbirine karışmasın diye sıraya alınır. */
let bannerQueue: Promise<void> = Promise.resolve();

/** Şu anki yola göre bandı gizler veya geri getirir. Hazır değilse sessiz geçer. */
function applyBannerForPath(): Promise<void> {
  const ctl = bannerCtl;
  if (!ctl) {
    return Promise.resolve();
  }
  const shouldHide = pathHidden(currentPath, ctl.hiddenPaths);
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
  const router = useRouter();
  const pathname = usePathname();

  // Sayfa değiştikçe banner kararı yenilenir (oyun ekranında gizli).
  // Kurulum henüz bitmediyse yalnızca yol saklanır; setupAdMob sonunda okur.
  useEffect(() => {
    if (!ready || !isNative) return;
    currentPath = pathname || "/";
    void applyBannerForPath();

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
  useEffect(() => {
    if (!ready || !isNative) return;
    void syncPushToken();
  }, [ready, isNative, authToken, syncPushToken]);

  syncRef.current = syncPushToken;

  // --- tek seferlik kurulum ------------------------------------------------
  useEffect(() => {
    if (!ready || !isNative || bootstrapped) return;
    bootstrapped = true;

    void setupPush(platform, go, () => syncRef.current(), pushTokenRef);
    void setupAdMob(platform);
    void setupBackButton();
  }, [ready, isNative, platform, go, syncPushToken]);

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

async function setupAdMob(platform: Platform) {
  try {
    const config = await loadAppConfig(platform);
    const admob = config?.["ads.admob"];
    if (!admob?.enabled) { return; }
    // banner_enabled ayrı anahtar: banner kapatılsa da geçiş reklamı kalır.
    // Alan hiç yoksa (migration öncesi kayıt) eskisi gibi AÇIK sayılır.
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

    const { AdMob, BannerAdSize, BannerAdPosition, BannerAdPluginEvents } =
      await import("@capacitor-community/admob");
    try {
      const { Capacitor } = await import("@capacitor/core");
    } catch {}

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
     *   __ktBanner.retry()    -> bandı sıfırdan kur (margin her zaman 0)
     *   __ktBanner.info()     -> o anki tek satır ölçüm dökümü
     * Beğendiğin sayıyı /yonetim → Mobil & Reklam → "Alt bar kaldırma — sabit
     * değer" alanına yazınca kalıcı olur.
     */
    (window as any).__ktBanner = {
      /** Barın yüksekliğini anında dener — bant yeniden yüklenmez. */
      lift(px?: number) {
        consoleLift = typeof px === "number" ? px : null;
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

// ---------------------------------------------------------------- GERİ TUŞU

async function setupBackButton() {
  try {
    const { App } = await import("@capacitor/app");
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
  } catch (e) {
    log("geri tuşu dinleyicisi kurulamadı:", e);
  }
}
