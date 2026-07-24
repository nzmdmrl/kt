// Sesli tanıma hook'u — Web Speech API (tarayıcı yerleşik, Türkçe).
//
// Kullanım: mikrofona basınca start(), bırakınca stop(). Tanınan metin
// onResult ile geri döner. Tarayıcı desteklemiyorsa supported=false olur
// (o zaman UI klavye girişine düşer — Whisper fallback ileride eklenecek).
//
// Not: Web Speech API Chrome/Edge'de iyi, Safari'de kısıtlı çalışır.
// Android WebView'de cihaza göre değişir. supported bunu yakalar.

import { useRef, useState, useCallback, useEffect } from "react";

// TypeScript için minimal tip tanımları (Web Speech API standart d.ts'de yok).
type SpeechRecognitionType = any;

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
  const recRef = useRef<SpeechRecognitionType>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
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
    };
    rec.onend = () => setListening(false);

    recRef.current = rec;
    return () => {
      try {
        rec.abort();
      } catch {}
    };
  }, [lang]);

  const start = useCallback(() => {
    setError("");
    const rec = recRef.current;
    if (!rec) return;
    try {
      rec.start();
      setListening(true);
    } catch {
      // Zaten çalışıyorsa start() hata verir; yoksay.
    }
  }, []);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {}
    setListening(false);
  }, []);

  return { supported, listening, error, start, stop };
}
