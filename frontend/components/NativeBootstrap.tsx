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
 *  - AdMob: /api/app-config'teki ayara göre alt banner. Bant, eklentinin margin
 *    seçeneğiyle alt navigasyonun ÜSTÜNE konur (alt bar hiç oynatılmaz, web'deki
 *    gibi bottom: 0'da kalır). Bandın GERÇEK yüksekliği --kt-banner-h'ye, akışta
 *    bırakılacak yer --kt-banner-space'e yazılır + gövdeye "has-native-banner"
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
/** Ekran altından bandın ÜST kenarına mesafe = kullanılan margin + bant yüksekliği. */
const BANNER_SPACE_VAR = "--kt-banner-space";

/** Bant ile alt navigasyon arasında bırakılan boşluk (CSS px). */
const BANNER_GAP = 15;

/** Alt bar ölçülemezse kullanılacak yükseklik (globals.css'teki spacer değeri). */
const NAV_HEIGHT_FALLBACK = 76;

/**
 * CSS px -> eklentinin margin biriminde katsayı.
 *
 * ARİTMETİK: eklenti margin'i px'e şöyle çeviriyor (BannerExecutor.java):
 *     fiziksel_px = margin * density
 * WebView'da ise
 *     fiziksel_px = css_px * devicePixelRatio
 * Android'de density == devicePixelRatio olduğu sürece (bu cihazda 2.75) 1 CSS px
 * = 1 dp olur ve katsayı 1'dir.
 *
 * CİHAZDA DOĞRULANDI: 2400 fiziksel / 2.625 = 915 CSS px genişlik, yani 1 dp =
 * 1 CSS px; margin 112 = nav 97 + boşluk 15 doğru karşılık buldu. Katsayı 1 kalıyor.
 */
const MARGIN_DP_FACTOR = 1;

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
 * Bandın margin'i — HİÇBİRİ SABİT DEĞİL, üçü de çalışma anında ölçülür:
 *
 *   mesafe = window.innerHeight - navRect.top     (ekran altından barın ÜST kenarına)
 *   margin = (mesafe + 15) * MARGIN_DP_FACTOR
 *
 * "Güvenli alan" bu mesafenin İÇİNDE: bar ekranın dibinde (bottom: 0) duruyor ve
 * kendi alt dolgusu `12px + env(safe-area-inset-bottom)` — yani sistem çubuğu payı
 * barın ölçülen yüksekliğine dahil. Log her bileşeni ayrı ayrı basar, doğrulanabilir.
 *
 * Bar ekranda yoksa (oyun ekranı / masaüstü genişliği) yedek: 76 + güvenli alan.
 */
type BannerMargin = {
  margin: number;        // eklentiye geçilen değer
  cssDistance: number;   // ekran altından barın üst kenarına (CSS px)
  navHeight: number;
  navTop: number;
  safe: number;
  innerHeight: number;
  measured: boolean;
};

function computeBannerMargin(): BannerMargin {
  const safe = measureSafeBottom();
  const innerHeight = window.innerHeight;
  try {
    const bar = document.querySelector<HTMLElement>(".kt-bottom-nav-bar");
    if (bar) {
      const r = bar.getBoundingClientRect();
      if (r.height > 0) {
        const cssDistance = Math.round(innerHeight - r.top);
        return {
          margin: Math.round((cssDistance + BANNER_GAP) * MARGIN_DP_FACTOR),
          cssDistance,
          navHeight: Math.round(r.height),
          navTop: Math.round(r.top),
          safe,
          innerHeight,
          measured: true,
        };
      }
    }
  } catch {}
  const cssDistance = NAV_HEIGHT_FALLBACK + safe;
  return {
    margin: Math.round((cssDistance + BANNER_GAP) * MARGIN_DP_FACTOR),
    cssDistance,
    navHeight: cssDistance,
    navTop: innerHeight - cssDistance,
    safe,
    innerHeight,
    measured: false,
  };
}

/**
 * Bandın gerçek yüksekliğini uygular.
 *
 * ALT BAR HİÇ OYNATILMAZ — web'deki gibi bottom: 0'da kalır. Bandı yukarı alan
 * şey AdMob'un kendi margin seçeneği (bkz. show()). Burada yalnızca akıştaki
 * içeriğin altında bırakılacak yer güncellenir (bkz. applyBannerSpace).
 * Bant yokken değişkenler 0px'e döner → düzen web'dekiyle birebir aynı.
 */
let bannerHeightPx = 0;

function setBannerHeight(px: number) {
  try {
    bannerHeightPx = Number.isFinite(px) && px > 0 ? Math.round(px) : 0;
    document.documentElement.style.setProperty(BANNER_HEIGHT_VAR, `${bannerHeightPx}px`);
    document.body.classList.toggle(BANNER_BODY_CLASS, bannerHeightPx > 0);
    applyBannerSpace();
  } catch {}
}

/**
 * Banda GERÇEKTEN geçilen margin. Bant bir kez konumlandıktan sonra native tarafta
 * sabit kaldığı için rezerv hesabı bu değeri izler (yeniden hesaplananı değil).
 */
let activeMargin: number | null = null;

/**
 * --kt-banner-space = ekranın altından BANDIN ÜST KENARINA olan mesafe
 *                   = KULLANILAN margin + bandın bildirdiği yükseklik
 *
 * Yani "bu çizginin altı nav + bant tarafından kaplı" değeri. Tek sayı, bölüşme yok:
 *  - alt bar varsa spacer'ın yüksekliği DOĞRUDAN bu olur (globals.css),
 *  - alt bar basılmayan sayfalarda (ör. /giris) aynı değer gövde dolgusuna gider.
 * Margin admin panelinden değiştirilebildiği (ek boşluk / sabit değer) ve bant
 * yüksekliği yükleme başına değişebildiği için (50 → 60 → 64) HER boyut olayında
 * ve her gezinmede yeniden yazılır.
 */
function applyBannerSpace() {
  try {
    const d = computeBannerMargin();
    const margin = activeMargin ?? d.margin;
    const space = bannerHeightPx > 0 ? margin + bannerHeightPx : 0;
    document.documentElement.style.setProperty(BANNER_SPACE_VAR, `${space}px`);
    // Alt bar bu sayfada basılı mı? Rezervin spacer'a mı yoksa gövdeye mi
    // yazılacağını bu belirler (bkz. globals.css).
    document.body.classList.toggle(NAV_PRESENT_CLASS, d.measured);
    syncBannerFill();
  } catch {}
}

// ------------------------------------------------- BANDIN ARKASINDAKİ DOLGU
//
// Bant native bir katman: WebView'ın ÜSTÜNE çiziliyor, yani altında kalan alan
// hâlâ sayfaya ait ve sayfa zemini (gökyüzü animasyonu) oradan sızıyor. Alt bar
// ekranın dibinde, bant onun 15 px üstünde durduğu için araya ve bandın yanına
// zemin görünüyordu. Bu şerit o alanı alt barın KENDİ zeminiyle doldurur →
// "bar + bant" tek parça renkli bir kuşak gibi okunur.
//
// Kurallar:
//  - yalnızca native'de ve bant GÖRÜNÜRKEN var; bant gizlenince/kapalıyken
//    DOM'dan tamamen silinir (setBannerHeight(0) → syncBannerFill).
//  - yükseklik CSS değişkeninden okunur (--kt-banner-space = ekran altından
//    bandın üst kenarına), böylece her boyut olayında kendiliğinden güncellenir.
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

    // Ekran altından bandın ÜST kenarına: bar + boşluk + bant (+ güvenli alan,
    // barın kendi dolgusunda). Değişken her boyut olayında yeniden yazılıyor.
    el.style.height = `var(${BANNER_SPACE_VAR}, 0px)`;

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

    // Bar bu sayfada var mı yok mu değişmiş olabilir → içerik rezervini tazele.
    const raf = requestAnimationFrame(() => {
      applyBannerSpace();
    });
    return () => cancelAnimationFrame(raf);
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

    // Admin panelinden bant konumu ince ayarı (Mobil & Reklam sekmesi).
    const adminExtra = Number(admob.banner_margin_extra) || 0;
    const adminOverride = Number(admob.banner_margin_override) || 0;
    // Konsoldan elle deneme (bkz. __ktBanner.retry) — kaydetmeden önce denemek için.
    let marginOverride: number | null = null;

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
      activeMargin = null;
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
          // Bant alt navigasyonun ÜSTÜNE yerleşsin: eklentinin kendi margin'i
          // kullanılır (alt bar hiç oynatılmaz).
          //
          // Öncelik: konsoldan elle verilen değer > admin "sabit değer" >
          //          hesaplanan + admin "ek boşluk".
          const computed = computeBannerMargin().margin;
          const margin =
            marginOverride ??
            (adminOverride > 0 ? adminOverride : computed + adminExtra);
          activeMargin = margin;
          applyBannerSpace();   // rezerv kullanılan margin'i izlesin

          console.log(
            "[native] banner margin — hesaplanan:", computed,
            "| ek (admin):", adminExtra,
            "| sabit (admin):", adminOverride,
            "| konsol:", marginOverride ?? "-",
            "| KULLANILAN:", margin,
          );

          await AdMob.showBanner({
            adId: unit,
            adSize: BannerAdSize.ADAPTIVE_BANNER,
            position: BannerAdPosition.BOTTOM_CENTER,
            margin,
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
     *   __ktBanner.retry(220)  -> bandı 220 px margin ile sıfırdan kur
     *   __ktBanner.retry()     -> admin ayarları + hesaplama ile sıfırdan kur
     *   __ktBanner.info()      -> hesaplanan margin ve o anki ölçüler
     * Beğendiğin sayıyı /yonetim → Mobil & Reklam → "Bant konumu — sabit değer"
     * alanına yazınca kalıcı olur. Margin yalnızca bant SIFIRDAN kurulurken
     * uygulandığı için önce removeBanner çağrılıyor.
     */
    (window as any).__ktBanner = {
      async retry(margin?: number) {
        try {
          marginOverride = typeof margin === "number" ? margin : null;
          await AdMob.removeBanner().catch(() => {});
          bannerState = "yok";
          activeMargin = null;
          setBannerHeight(0);
          await show();
        } catch (e) {
          log("banner retry başarısız:", e);
        }
      },
      info() {
        const d = computeBannerMargin();
        console.log(
          "[native] banner ölçüm — hesaplanan margin:", d.margin,
          "| nav yüksekliği:", d.navHeight, d.measured ? "(ölçüldü)" : "(yedek)",
          "| mesafe:", d.cssDistance,
          "| güvenli alan:", d.safe,
          "| bant yüksekliği:", bannerHeightPx,
          "| kullanılan margin:", activeMargin ?? "-",
          "| admin ek/sabit:", adminExtra, "/", adminOverride,
        );
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
