"use client";

// Sesli tanıma hook'u — TEK arayüz, İKİ arka uç:
//
//   • native (Capacitor kabuğu) → @capacitor-community/speech-recognition
//     (Android: SpeechRecognizer, iOS: SFSpeechRecognizer)
//   • web (normal tarayıcı)     → Web Speech API (webkitSpeechRecognition)
//
// Neden: Android System WebView, Chrome'un aksine Web Speech API'yi GETİRMEZ.
// Uygulama canlı siteyi yüklediği için aynı JS iki ortamda da çalışıyor; ayrım
// burada, tek noktada yapılır. Çağıran dört ekran (ArenaGame, MatchGame,
// SoloGame, gunun-kelimesi) hangi arka ucun çalıştığını BİLMEZ.
//
// Ortak arayüz: { supported, listening, error, start, stop }
//
//   supported — İKİ koşulun birden sağlanması: (a) admin bayrağı açık,
//               (b) ortamda tanıma GERÇEKTEN var (native: plugin available(),
//               web: Web Speech API nesnesi). Çağıran ekranlar false ise mikrofon
//               düğmesini ve "🎤 basılı tut & söyle" ipucunu hiç basmaz; düğme
//               görünmez, "görünür ama bozuk" olmaz.
//
//               Bayraklar: app_settings -> "app.mic"
//               (admin → 📱 Mobil & Reklam → 🎤 Mikrofon (sesli tahmin) kartı)
//                 web_enabled -> tarayıcı  (eksik/okunamazsa AÇIK sayılır)
//                 app_enabled -> uygulama  (eksik/okunamazsa KAPALI sayılır)
//               Uygulama bayrağı web bayrağına BAĞIMLIDIR (web kapalıysa uygulama
//               da kapalı) — aynı kural sunucuda da uygulanır.
//   start()   — Promise<boolean>: tanıma GERÇEKTEN başladıysa true. 1v1'de söz
//               hakkı (buzzer) yalnızca bu true döndükten SONRA alınır — izin
//               diyaloğu reddedilirse oyuncu sırasını boşa harcamamış olur.
//   stop()    — dinlemeyi bitirir; sonuç onResult ile geri döner.
//
// Basılı tut & konuş davranışı iki tarafta da aynı: pointerdown → start(),
// pointerup → (çağıran taraftaki 1 sn gecikmeden sonra) stop().

import { useRef, useState, useCallback, useEffect } from "react";
import { detectPlatform } from "@/lib/platform";
import { loadAppConfig, type FlagsConfig, type MicConfig } from "@/lib/appConfig";

// TypeScript için minimal tip tanımları (Web Speech API standart d.ts'de yok).
type SpeechRecognitionType = any;

type SpeechPlugin =
  typeof import("@capacitor-community/speech-recognition")["SpeechRecognition"];

/** Web: onstart hiç gelmezse start() promise'i sonsuza kilitlenmesin. */
const START_TIMEOUT_MS = 8000;
/** Native: stop() sonrası nihai sonucun gelmesi için tanınan bekleme payı. */
const FINAL_GRACE_MS = 1500;

const PERM_DENIED_MSG =
  "Mikrofon izni yok — telefon ayarlarından açabilirsin. Kelimeyi yazarak da oynayabilirsin.";

// ----------------------------------------------------------- TANILAMA ----
// GEÇİCİ: mikrofon düğmesinin uygulamada neden çıkmadığını bulmak için.
// Sorun tespit edilince bu bloğu ve slog() çağrılarını sil.
// Chrome'da chrome://inspect → konsol → filtre: [speech]

function slog(...parts: any[]) {
  try {
    // eslint-disable-next-line no-console
    console.log("[speech]", ...parts);
  } catch {}
}

/** Hata nesnesini loga basılabilir hâle getirir. */
function errInfo(e: any) {
  if (!e) return "(hata yok)";
  return {
    message: e?.message ?? String(e),
    code: e?.code,
    name: e?.name,
  };
}

/** Native köprüde plugin GERÇEKTEN kayıtlı mı (APK'da var mı)? */
function pluginRegistered(): string {
  try {
    const cap = (window as any).Capacitor;
    if (!cap) return "Capacitor yok";
    if (typeof cap.isPluginAvailable !== "function") return "isPluginAvailable yok";
    return String(cap.isPluginAvailable("SpeechRecognition"));
  } catch (e: any) {
    return "hata: " + (e?.message ?? String(e));
  }
}

function getRecognition(): SpeechRecognitionType | null {
  if (typeof window === "undefined") return null;
  const SR =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;
  return SR ? new SR() : null;
}

export function useSpeech(onResult: (text: string) => void, lang = "tr-TR") {
  /** Ortam yeteneği: plugin available() / Web Speech nesnesi. Bayraktan bağımsız. */
  const [capable, setCapable] = useState(false);
  /** Admin bayrağı bu ortam için izin veriyor mu? Yapılandırma gelene kadar null. */
  const [flagAllowed, setFlagAllowed] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");

  // Dışarı verilen tek kapı: bayrak AÇIK **ve** ortam yetenekli.
  const supported = capable && flagAllowed === true;

  // İlk effect'e kadar "none" — sunucu ve istemci ilk boyaması aynı kalsın,
  // ayrıca native import'u normal tarayıcıda ASLA tetiklenmesin.
  const [backend, setBackend] = useState<"none" | "web" | "native">("none");

  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  // GEÇİCİ tanılama: log satırlarında güncel değerleri okuyabilmek için
  // (state'i bağımlılığa eklemiyoruz ki callback kimlikleri değişmesin).
  const supportedRef = useRef(supported);
  supportedRef.current = supported;
  const listeningRef = useRef(listening);
  listeningRef.current = listening;
  const flagAllowedRef = useRef(flagAllowed);
  flagAllowedRef.current = flagAllowed;

  useEffect(() => {
    const platform = detectPlatform();
    const next = platform === "web" ? "web" : "native";
    setBackend(next);
    // GEÇİCİ tanılama
    slog("mount:", {
      platform,
      backend: next,
      isNative: platform !== "web",
      pluginRegistered: pluginRegistered(),
      webSpeechCtor:
        typeof window !== "undefined" &&
        !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
      ua: typeof navigator !== "undefined" ? navigator.userAgent : "(yok)",
    });
  }, []);

  // ------------------------------------------------------- ADMİN BAYRAĞI ----
  // app_settings -> "app.flags" (public /api/app-config, 60 sn cache).
  //
  // Yapılandırma okunamazsa (backend kapalı / tablo yok) VARSAYILANA düşeriz:
  //   web      -> AÇIK  (bugünkü davranış korunur, mikrofon kaybolmaz)
  //   uygulama -> KAPALI (kapalı yayınlama isteği: panelden açılacak)
  useEffect(() => {
    if (backend === "none") return;
    let alive = true;

    loadAppConfig(detectPlatform()).then((cfg) => {
      if (!alive) return;
      const mic: MicConfig = (cfg?.["app.mic"] as MicConfig) || {};
      // GEÇİŞ: ayar "app.flags" içinden "app.mic"e taşındı. Eski cache'lenmiş
      // yapılandırmayı görmüş bir sekme yeni anahtarı bulamayabilir — o durumda
      // eski alanlara düşülür. Bir sürüm sonra bu satırlar silinebilir.
      const old: FlagsConfig = (cfg?.["app.flags"] as FlagsConfig) || {};
      const webRaw = mic.web_enabled ?? old.mic_web_enabled;
      const appRaw = mic.app_enabled ?? old.mic_app_enabled;

      const web = webRaw !== false; // eksikse açık
      const app = appRaw === true;  // eksikse kapalı
      // Bağımlılık kuralı burada da uygulanır: web kapalıysa uygulama da kapalı.
      const allowed = backend === "native" ? web && app : web;
      setFlagAllowed(allowed);
      slog("bayraklar:", {
        yapılandırmaGeldi: !!cfg,
        "app.mic": mic,
        eskiAlanlar: { mic_web_enabled: old.mic_web_enabled, mic_app_enabled: old.mic_app_enabled },
        backend,
        izinVar: allowed,
      });
    });

    return () => {
      alive = false;
    };
  }, [backend]);

  // GEÇİCİ tanılama: hook'un dışarı verdiği son `supported` değeri.
  useEffect(() => {
    slog("supported =", supported, "(backend:", backend, "| ortam yetenekli:", capable,
      "| bayrak izni:", flagAllowed + ")");
  }, [supported, backend, capable, flagAllowed]);

  // ---------------------------------------------------------------- WEB ----
  // Bu bölüm bugüne kadar çalışan koddur; tek ekleme onstart (start() promise'i
  // için "gerçekten başladı" sinyali). Tanıma davranışı değişmedi.

  const recRef = useRef<SpeechRecognitionType>(null);
  /** start() promise'ini bir kez sonuçlandıran yardımcı (onstart / onerror / onend). */
  const startResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const startTimerRef = useRef<any>(null);

  const settleStart = useCallback((ok: boolean) => {
    if (startTimerRef.current) {
      clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }
    const resolve = startResolveRef.current;
    startResolveRef.current = null;
    if (resolve) resolve(ok);
  }, []);

  useEffect(() => {
    if (backend !== "web") return;

    const rec = getRecognition();
    if (!rec) {
      setCapable(false);
      return;
    }
    setCapable(true);
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 3;

    rec.onstart = () => {
      settleStart(true);
    };
    rec.onresult = (event: any) => {
      // En iyi sonucu al (tek kelime beklediğimiz için ilk alternatif genelde yeter).
      const transcript = event.results[0][0].transcript.trim();
      onResultRef.current(transcript);
    };
    rec.onerror = (event: any) => {
      // "no-speech", "aborted" gibi hatalar normal; sadece izin reddini gösterelim.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Mikrofon izni gerekli");
      } else if (event.error === "no-speech") {
        setError("Ses algılanamadı, tekrar dene");
      }
      setListening(false);
      settleStart(false);
    };
    rec.onend = () => {
      setListening(false);
      settleStart(false);
    };

    recRef.current = rec;
    return () => {
      settleStart(false);
      recRef.current = null;
      try {
        rec.abort();
      } catch {}
    };
  }, [backend, lang, settleStart]);

  const startWeb = useCallback((): Promise<boolean> => {
    setError("");
    const rec = recRef.current;
    if (!rec) {
      slog("startWeb: Web Speech nesnesi yok → false");
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      settleStart(false); // önceki bekleyen promise varsa kapat
      startResolveRef.current = resolve;
      startTimerRef.current = setTimeout(() => settleStart(false), START_TIMEOUT_MS);
      try {
        rec.start();
        setListening(true);
      } catch {
        // Zaten çalışıyorsa start() hata verir; yoksay (onstart yine gelir).
      }
    });
  }, [settleStart]);

  const stopWeb = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {}
    setListening(false);
  }, []);

  // ------------------------------------------------------------- NATIVE ----
  // Plugin akışı (Android tarafı okunarak kuruldu):
  //   start({partialResults:true}) → startListening() başarılıysa promise HEMEN
  //   resolve olur (= tanıma gerçekten başladı). Hem ara hem NİHAİ sonuç
  //   "partialResults" olayından gelir. stop() çağrıldıktan sonra Android son
  //   kez onResults gönderir — bu yüzden stop'ta hemen değil, son sonucu
  //   bekleyip (ya da FINAL_GRACE_MS dolunca) sonucu teslim ediyoruz.

  const pluginRef = useRef<SpeechPlugin | null>(null);
  const lastTextRef = useRef("");
  const stoppingRef = useRef(false);
  const nativeListeningRef = useRef(false);
  const graceRef = useRef<any>(null);

  /** Elimizdeki en son metni teslim et (yoksa kullanıcıya kısa uyarı). */
  const flushNative = useCallback(() => {
    if (graceRef.current) {
      clearTimeout(graceRef.current);
      graceRef.current = null;
    }
    if (!stoppingRef.current) return;
    stoppingRef.current = false;
    const text = lastTextRef.current.trim();
    lastTextRef.current = "";
    if (text) onResultRef.current(text);
    else setError("Ses algılanamadı, tekrar dene");
  }, []);

  useEffect(() => {
    if (backend !== "native") return;

    let cancelled = false;
    let handle: { remove: () => Promise<void> } | null = null;

    (async () => {
      try {
        // Dinamik import: normal tarayıcıda bu satıra HİÇ gelinmez.
        const { SpeechRecognition } = await import(
          "@capacitor-community/speech-recognition"
        );
        // GEÇİCİ tanılama: JS nesnesi var mı, native köprüde kayıtlı mı?
        // (JS nesnesi HER ZAMAN gelir — asıl soru köprüde kayıtlı olup olmadığı.
        //  false ise plugin APK'ya girmemiş demektir: cap sync + yeni build gerek.)
        slog("plugin JS nesnesi:", !!SpeechRecognition, "| köprüde kayıtlı:", pluginRegistered());

        let available = false;
        try {
          const res = await SpeechRecognition.available();
          available = res.available;
          slog("available() =", res);
        } catch (e) {
          slog("available() HATASI:", errInfo(e));
          throw e; // davranış aynı: hata → supported=false
        }

        // GEÇİCİ tanılama: yalnız OKUMA — izin diyaloğu çıkarmaz, akışı etkilemez.
        try {
          const perm = await SpeechRecognition.checkPermissions();
          slog("checkPermissions() =", perm);
        } catch (e) {
          slog("checkPermissions() HATASI:", errInfo(e));
        }

        if (cancelled) return;
        if (!available) {
          // Cihazda tanıma servisi yok → düğme hiç görünmesin.
          slog("available=false → cihazda tanıma servisi yok, düğme gizlenecek");
          setCapable(false);
          return;
        }

        const h = await SpeechRecognition.addListener("partialResults", (data) => {
          const match = (data?.matches || []).find((m) => m && m.trim());
          if (match) lastTextRef.current = match.trim();
          // stop() sonrası gelen ilk sonuç nihai sonuçtur → beklemeden teslim et.
          if (stoppingRef.current && match) flushNative();
        });
        if (cancelled) {
          try {
            await h.remove();
          } catch {}
          return;
        }

        handle = h;
        pluginRef.current = SpeechRecognition;
        slog("native kurulum TAMAM → ortam yetenekli (capable=true)");
        setCapable(true);
      } catch (e) {
        slog("native kurulum HATASI → capable=false:", errInfo(e));
        if (!cancelled) setCapable(false);
      }
    })();

    return () => {
      cancelled = true;
      if (graceRef.current) {
        clearTimeout(graceRef.current);
        graceRef.current = null;
      }
      stoppingRef.current = false;
      const plugin = pluginRef.current;
      pluginRef.current = null;
      if (nativeListeningRef.current && plugin) {
        nativeListeningRef.current = false;
        plugin.stop().catch(() => {});
      }
      handle?.remove?.().catch(() => {});
    };
  }, [backend, flushNative]);

  const startNative = useCallback(async (): Promise<boolean> => {
    setError("");
    const plugin = pluginRef.current;
    if (!plugin) {
      slog("startNative: plugin hazır DEĞİL (kurulum başarısız olmuştu) → false");
      return false;
    }
    if (nativeListeningRef.current) return true;

    try {
      // İzin İLK basışta istenir (uygulama açılışında değil).
      let perm = await plugin.checkPermissions();
      slog("basışta checkPermissions() =", perm);
      if (perm.speechRecognition !== "granted") {
        perm = await plugin.requestPermissions();
        slog("requestPermissions() =", perm);
      }
      if (perm.speechRecognition !== "granted") {
        slog("izin verilmedi → false");
        setError(PERM_DENIED_MSG);
        return false;
      }

      lastTextRef.current = "";
      stoppingRef.current = false;
      if (graceRef.current) {
        clearTimeout(graceRef.current);
        graceRef.current = null;
      }

      // partialResults:true → promise, startListening() BAŞARILI olunca döner.
      await plugin.start({
        language: lang,
        maxResults: 3,
        partialResults: true,
        popup: false,
      });

      nativeListeningRef.current = true;
      setListening(true);
      slog("plugin.start() TAMAM → dinleniyor");
      return true;
    } catch (e) {
      slog("plugin.start() HATASI:", errInfo(e));
      setError("Sesli tahmin başlatılamadı, tekrar dene");
      nativeListeningRef.current = false;
      setListening(false);
      return false;
    }
  }, [lang]);

  const stopNative = useCallback(() => {
    const plugin = pluginRef.current;
    if (!plugin || !nativeListeningRef.current) return;

    nativeListeningRef.current = false;
    setListening(false);
    stoppingRef.current = true;
    plugin.stop().catch(() => {});

    // Nihai sonuç gelmezse (örn. "No match") bekleyip kısa uyarı göster.
    if (graceRef.current) clearTimeout(graceRef.current);
    graceRef.current = setTimeout(() => flushNative(), FINAL_GRACE_MS);
  }, [flushNative]);

  // --------------------------------------------------------------- ORTAK ----

  const start = useCallback((): Promise<boolean> => {
    // GEÇİCİ tanılama — her mikrofon basışında.
    slog("BASILDI:", {
      backend,
      supported: supportedRef.current,
      bayrakİzni: flagAllowedRef.current,
      listening: listeningRef.current,
      pluginHazır: !!pluginRef.current,
      köprüdeKayıtlı: pluginRegistered(),
    });
    const p = backend === "native" ? startNative() : startWeb();
    p.then((ok) => slog("start() sonucu =", ok));
    return p;
  }, [backend, startNative, startWeb]);

  const stop = useCallback(() => {
    if (backend === "native") stopNative();
    else stopWeb();
  }, [backend, stopNative, stopWeb]);

  return { supported, listening, error, start, stop };
}
