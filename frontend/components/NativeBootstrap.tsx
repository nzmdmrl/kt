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
const BANNER_HEIGHT_VAR = "--kt-banner-h";
/** Bandın akıştaki içerikten çaldığı yer = boşluk + bant yüksekliği. */
const BANNER_SPACE_VAR = "--kt-banner-space";

/** Bant ile alt navigasyon arasında bırakılan boşluk (dp/CSS px). */
const BANNER_GAP = 10;

/** Alt bar ölçülemezse kullanılacak yükseklik (globals.css'teki spacer değeri). */
const NAV_HEIGHT_FALLBACK = 76;

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

/**
 * GEÇİCİ TEŞHİS — "banner hiç çıkmıyor" sorunu için adım adım iz kaydı.
 * chrome://inspect konsolunda "[banner]" ile filtrelenir. Sorun bulununca SİLİNECEK.
 * Sadece native tarafta çalışır (çağrıldığı yerlerin hepsi isNative kapısının ardında).
 */
function blog(...args: any[]) {
  console.log("[banner]", ...args);
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
 * GEÇİCİ TEŞHİS — ölçüm dökümü. Değişken gerçekten yazılıyor mu, kural kazanıyor mu,
 * bar nereye düşüyor? Yükseklik değiştiğinde ve HER GEZİNMEDE basılır.
 */
function logMeasurements(where: string) {
  try {
    const root = getComputedStyle(document.documentElement);
    const nav = document.querySelector(".kt-bottom-nav-bar");
    const navCs = nav ? getComputedStyle(nav) : null;
    const rect = nav ? nav.getBoundingClientRect() : null;
    blog(
      `ÖLÇÜM [${where}]`,
      "| --kt-banner-h:", root.getPropertyValue("--kt-banner-h").trim() || "(yok)",
      "| --kt-banner-space:", root.getPropertyValue("--kt-banner-space").trim() || "(yok)",
      "| güvenli alan (ölçülen):", `${measureSafeBottom()}px`,
      "| nav yüksekliği (ölçülen):", rect ? Math.round(rect.height) : "(nav yok)",
      "| nav computed bottom:", navCs ? navCs.bottom : "(nav yok)",
      "| nav rect.top:", rect ? Math.round(rect.top) : "(nav yok)",
      "| innerHeight:", window.innerHeight,
      "| screen.height:", window.screen?.height,
      "| dpr:", window.devicePixelRatio,
    );
  } catch {}
}

/**
 * Alt navigasyonun GERÇEK yüksekliği (px). Ölçülür — 76 sabiti yalnızca bar
 * ekranda yokken (oyun ekranı, masaüstü genişliği) yedek olarak kullanılır.
 * Ölçülen değer barın kendi alt dolgusunu, yani güvenli alanı ZATEN içerir.
 */
function measureNavHeight(): { height: number; measured: boolean } {
  try {
    const bar = document.querySelector<HTMLElement>(".kt-bottom-nav-bar");
    if (bar) {
      const h = Math.round(bar.getBoundingClientRect().height);
      if (h > 0) return { height: h, measured: true };
    }
  } catch {}
  return { height: NAV_HEIGHT_FALLBACK + measureSafeBottom(), measured: false };
}

/**
 * Bandın gerçek yüksekliğini uygular.
 *
 * ALT BAR HİÇ OYNATILMAZ — web'deki gibi bottom: 0'da kalır. Bandı yukarı alan
 * şey AdMob'un kendi margin seçeneği (bkz. show()). Burada yalnızca AKIŞTAKİ
 * içeriğin altında bırakılacak yer hesaplanır:
 *
 *   --kt-banner-space = boşluk + bant yüksekliği
 *
 * Alt bar zaten kendi spacer'ıyla (76px + güvenli alan) yer ayırdığı için
 * toplam rezerv = alt bar + boşluk + bant olur; bant içeriğin üstüne binmez.
 * Bant yokken değişken 0px'e döner → düzen web'dekiyle birebir aynı.
 */
function setBannerHeight(px: number) {
  try {
    const h = Number.isFinite(px) && px > 0 ? Math.round(px) : 0;

    const root = document.documentElement;
    root.style.setProperty(BANNER_HEIGHT_VAR, `${h}px`);
    root.style.setProperty(BANNER_SPACE_VAR, h > 0 ? `${h + BANNER_GAP}px` : "0px");
    document.body.classList.toggle(BANNER_BODY_CLASS, h > 0);

    logMeasurements(h > 0 ? `bant ${h}px` : "bant gizli");
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
    blog("gezinme:", currentPath, "-> kurulum HENÜZ BİTMEDİ (banner denetimi yok)");
    return Promise.resolve();
  }
  const shouldHide = pathHidden(currentPath, ctl.hiddenPaths);
  blog(
    "gezinme:", currentPath,
    "| gizli liste:", JSON.stringify(ctl.hiddenPaths),
    "| eşleşti:", shouldHide,
    "->", shouldHide ? "hide()" : "show()",
  );
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

    // GEÇİCİ TEŞHİS: her gezinmede ölçüleri bas (bar sökülüp yeniden basılıyor).
    const raf = requestAnimationFrame(() => logMeasurements(`gezinme ${currentPath}`));
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
    blog("kurulum başlıyor — platform:", platform, "| yol:", currentPath);
    const config = await loadAppConfig(platform);
    const admob = config?.["ads.admob"];
    blog("ayar okundu:", JSON.stringify(admob ?? null));
    if (!admob?.enabled) { blog("ÇIKIŞ: ads.admob.enabled kapalı veya ayar okunamadı"); return; }
    // banner_enabled ayrı anahtar: banner kapatılsa da geçiş reklamı kalır.
    // Alan hiç yoksa (migration öncesi kayıt) eskisi gibi AÇIK sayılır.
    if (admob.banner_enabled === false) { blog("ÇIKIŞ: banner_enabled = false"); return; }

    const configuredUnit = (
      (platform === "ios" ? admob.ios?.banner : admob.android?.banner) || ""
    ).trim();
    // Yapılandırılmış birim boşsa reklam AÇILMAZ (test modunda bile): "ayar yoksa
    // reklam yok" kuralı korunuyor.
    if (!configuredUnit) { blog("ÇIKIŞ: bu platformun banner birim id'si BOŞ"); return; }

    // Test modunda Google'ın test birimi kullanılır (bkz. TEST_AD_UNITS).
    const useTestUnit = !!admob.test_mode;
    const unit = useTestUnit ? TEST_AD_UNITS.banner : configuredUnit;
    const unitKind = useTestUnit ? "GOOGLE TEST BİRİMİ" : "gerçek birim";
    blog("kullanılacak banner birimi:", unit, `(${unitKind})`,
         "| yapılandırılmış birim:", configuredUnit);

    const hiddenPaths = Array.isArray(admob.banner_hidden_paths)
      ? admob.banner_hidden_paths.filter((p): p is string => typeof p === "string" && !!p.trim())
      : FALLBACK_BANNER_HIDDEN_PATHS;

    const { AdMob, BannerAdSize, BannerAdPosition, BannerAdPluginEvents } =
      await import("@capacitor-community/admob");
    try {
      const { Capacitor } = await import("@capacitor/core");
      blog("AdMob eklentisi native tarafta var mı:", Capacitor.isPluginAvailable("AdMob"));
    } catch {}

    const isTesting = !!admob.test_mode;
    // DİKKAT: initialize Play Services olmayan emülatörde HİÇ ÇÖZÜLMEYEBİLİR.
    // "başlıyor" görünüp "bitti" görünmüyorsa sorun burada demektir.
    blog("initialize başlıyor (initializeForTesting =", isTesting, ")");
    await AdMob.initialize({ initializeForTesting: isTesting });
    blog("initialize bitti");

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

    // --- yükseklik: TAHMİN YOK, eklentinin bildirdiği gerçek ölçü kullanılır ---
    // SizeChanged (Android: bannerViewChangeSize, iOS: bannerViewDidReceiveAd
    // sonrası) {width, height} dp taşır; dp WebView'da CSS px'e denk gelir.
    // Eklenti gizlemede de 0 yükseklikli olay yayar — boşluk kendiliğinden kapanır.
    await AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size: any) => {
      const h = Number(size?.height) || 0;
      const shown = bannerState === "gorunur";
      blog("boyut olayı: h =", h, "| durum =", bannerState, "-> --kt-banner-h =", shown ? h : 0);
      setBannerHeight(shown ? h : 0);
    });
    await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, (err) => {
      // AdMob hata kodları: 0 iç hata, 1 geçersiz istek, 2 ağ, 3 stok yok (no fill).
      // Eklenti AdView'i yok etti: durumu "yok"a çek, yoksa hideBanner patlar.
      bannerState = "yok";
      blog("YÜKLENEMEDİ:", JSON.stringify(err), "-> durum: yok");
      log("banner yüklenemedi:", err);
      setBannerHeight(0);
    });
    await AdMob.addListener(BannerAdPluginEvents.Loaded, () => blog("ilan YÜKLENDİ (Loaded)"));
    blog("dinleyiciler bağlandı");

    const show = async () => {
      if (bannerState === "gorunur") { blog("show: zaten görünür, çağrı yok"); return; }
      const resuming = bannerState === "gizli";
      // DİKKAT: boyut olayı çağrının İÇİNDE gelebiliyor; durum önce set edilmezse
      // olay "gizli" sanıp yüksekliği 0 bırakır ve alt bar bandın altında kalır.
      bannerState = "gorunur";
      try {
        if (resuming) {
          // İlan YENİDEN YÜKLENMEZ: var olan banner yeniden görünür yapılır.
          blog("resumeBanner çağrılıyor");
          await AdMob.resumeBanner();
          blog("resumeBanner tamam");
        } else {
          // Bant alt navigasyonun ÜSTÜNE yerleşsin: eklentinin kendi margin'i
          // kullanılır (alt bar hiç oynatılmaz). Margin dp cinsinden gider;
          // eklenti px'e çeviriyor (BannerExecutor: margin * density) ve WebView'da
          // 1 CSS px = 1 dp olduğu için ölçüyü doğrudan px olarak veriyoruz.
          // Ölçülen bar yüksekliği kendi alt dolgusuyla güvenli alanı zaten içerir.
          const nav = measureNavHeight();
          const margin = nav.height + BANNER_GAP;
          blog(
            "showBanner çağrılıyor — adId:", unit, `(${unitKind})`,
            "| isTesting:", isTesting,
            "| nav yüksekliği:", `${nav.height}px`, nav.measured ? "(ölçüldü)" : "(YEDEK: 76 + güvenli alan)",
            "| boşluk:", `${BANNER_GAP}px`,
            "| margin (dp):", margin,
          );
          await AdMob.showBanner({
            adId: unit,
            adSize: BannerAdSize.ADAPTIVE_BANNER,
            position: BannerAdPosition.BOTTOM_CENTER,
            margin,
            isTesting,
          });
          blog("showBanner tamam (ilan yükleme sonucu Loaded/YÜKLENEMEDİ olayında)");
        }
        // Yükseklik SizeChanged olayıyla gelir; olay gecikirse boşluk 0 kalır,
        // reklam görünür ama düzen bozulmaz.
      } catch (e) {
        // Çağrı patladıysa native tarafta sağlam bir AdView olduğunu varsayamayız:
        // "yok"a dön ki bir sonraki deneme sıfırdan showBanner yapsın.
        bannerState = "yok";
        blog("show HATA:", String(e), "-> durum: yok");
        log("banner gösterilemedi:", e);
        setBannerHeight(0);
      }
    };

    const hide = async () => {
      // Ölçüyü ÖNCE sıfırla: düzen beklemeden kapanır (anında his).
      setBannerHeight(0);
      if (bannerState !== "gorunur") {
        // Hiç açılmadı ya da zaten gizli/yok — hideBanner çağırmak hata verir.
        blog("hide: durum =", bannerState, "- çağrı yok");
        return;
      }
      bannerState = "gizli";
      try {
        blog("hideBanner çağrılıyor");
        await AdMob.hideBanner();
        blog("hideBanner tamam");
      } catch (e) {
        bannerState = "yok";
        blog("hide HATA:", String(e), "-> durum: yok");
        log("banner gizlenemedi:", e);
      }
    };

    bannerCtl = { hiddenPaths, show, hide };
    blog("denetim hazır — ilk karar veriliyor, yol:", currentPath);

    // İlk karar mevcut sayfaya göre: oyun ekranındaysak banner HİÇ açılmaz
    // (açıp hemen kapatma titremesi olmaz, boşuna ilan da yüklenmez).
    await applyBannerForPath();
  } catch (e) {
    blog("KURULUM HATASI:", String(e));
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
