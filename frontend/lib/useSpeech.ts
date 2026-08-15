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
//   supported — cihazda tanıma GERÇEKTEN varsa true. Native tarafta plugin'in
//               available() yanıtına bakılır (cihazda tanıma servisi yoksa false).
//               Çağıran ekranlar false ise mikrofon düğmesini hiç basmaz; düğme
//               görünmez, "görünür ama bozuk" olmaz.
//   start()   — Promise<boolean>: tanıma GERÇEKTEN başladıysa true. 1v1'de söz
//               hakkı (buzzer) yalnızca bu true döndükten SONRA alınır — izin
//               diyaloğu reddedilirse oyuncu sırasını boşa harcamamış olur.
//   stop()    — dinlemeyi bitirir; sonuç onResult ile geri döner.
//
// Basılı tut & konuş davranışı iki tarafta da aynı: pointerdown → start(),
// pointerup → (çağıran taraftaki 1 sn gecikmeden sonra) stop().

import { useRef, useState, useCallback, useEffect } from "react";
import { detectPlatform } from "@/lib/platform";

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

function getRecognition(): SpeechRecognitionType | null {
  if (typeof window === "undefined") return null;
  const SR =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;
  return SR ? new SR() : null;
}

export function useSpeech(onResult: (text: string) => void, lang = "tr-TR") {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");

  // İlk effect'e kadar "none" — sunucu ve istemci ilk boyaması aynı kalsın,
  // ayrıca native import'u normal tarayıcıda ASLA tetiklenmesin.
  const [backend, setBackend] = useState<"none" | "web" | "native">("none");

  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    setBackend(detectPlatform() === "web" ? "web" : "native");
  }, []);

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
      setSupported(false);
      return;
    }
    setSupported(true);
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
    if (!rec) return Promise.resolve(false);
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
        const { available } = await SpeechRecognition.available();
        if (cancelled) return;
        if (!available) {
          // Cihazda tanıma servisi yok → düğme hiç görünmesin.
          setSupported(false);
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
        setSupported(true);
      } catch {
        if (!cancelled) setSupported(false);
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
    if (!plugin) return false;
    if (nativeListeningRef.current) return true;

    try {
      // İzin İLK basışta istenir (uygulama açılışında değil).
      let perm = await plugin.checkPermissions();
      if (perm.speechRecognition !== "granted") {
        perm = await plugin.requestPermissions();
      }
      if (perm.speechRecognition !== "granted") {
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
      return true;
    } catch {
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
    return backend === "native" ? startNative() : startWeb();
  }, [backend, startNative, startWeb]);

  const stop = useCallback(() => {
    if (backend === "native") stopNative();
    else stopWeb();
  }, [backend, stopNative, stopWeb]);

  return { supported, listening, error, start, stop };
}
