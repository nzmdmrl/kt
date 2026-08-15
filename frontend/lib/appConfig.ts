"use client";

/**
 * Uygulama yapılandırması (reklam / push / mağaza rozetleri).
 *
 * Kaynak: backend GET /api/app-config?platform=web|android|ios
 * (backend/app/api/routes/app_settings.py — is_public=true satırlar tek JSON'da).
 *
 * Kurallar:
 *  - Ağ isteği platform başına BİR kez yapılır, sonuç modül kapsamında saklanır;
 *    aynı sayfada kaç bileşen çağırırsa çağırsın tek istek gider.
 *  - ASLA hata fırlatmaz ve render'ı BEKLETMEZ: yüklenene kadar (veya hata/timeout
 *    durumunda) null döner, çağıran taraf o an hiçbir şey göstermez.
 *  - Backend'e ulaşılamazsa ya da tablo henüz yoksa sessizce null kalır.
 */

import { useEffect, useState } from "react";
import { apiUrl } from "./api";
import { usePlatform, type Platform } from "./platform";

export type AdSenseConfig = {
  enabled: boolean;
  client: string;
  slots: { header: string; in_content: string; footer: string };
};

export type AdMobConfig = {
  enabled: boolean;
  /** Ana anahtar açıkken banner ayrıca kapatılabilir (geçiş reklamı etkilenmez). */
  banner_enabled?: boolean;
  interstitial_enabled?: boolean;
  test_mode: boolean;
  android?: { app_id: string; banner: string; interstitial: string };
  ios?: { app_id: string; banner: string; interstitial: string };
  /** Banner'ın gizleneceği yollar (oyun ekranları) — admin panelinden düzenlenir. */
  banner_hidden_paths?: string[];
  /** ALT BARIN kaldırma miktarına (navLift) eklenecek px — bandın margin'i DEĞİL. */
  banner_margin_extra?: number;
  /** 0'dan büyükse navLift hesabı yok sayılır, alt bar tam bu yüksekliğe konur. */
  banner_margin_override?: number;
  /** Geçiş reklamı: her kaç TAMAMLANMIŞ maçta bir gösterilsin (0 = kapalı). */
  interstitial_every_n_matches?: number;
  /** İki geçiş reklamı arasında en az kaç saniye geçmeli. */
  interstitial_min_seconds?: number;
  /** Yeni kullanıcının ilk kaç maçı reklamsız (cihaz bazlı). */
  interstitial_skip_first_n?: number;
  /** Mod bazlı aç/kapa — anahtarlar lib/interstitial.ts → AdMode. */
  interstitial_modes?: Record<string, boolean>;
};

/** Davranış bayrakları (backend: DEFAULT_APP_SETTINGS -> "app.flags"). */
export type FlagsConfig = {
  /** Maç teklifinin geçerlilik süresi (saniye). */
  challenge_ttl_seconds?: number;
  /** ESKİ yer — mikrofon artık "app.mic" satırında. Yalnız geçiş için okunur. */
  mic_web_enabled?: boolean;
  /** ESKİ yer — mikrofon artık "app.mic" satırında. Yalnız geçiş için okunur. */
  mic_app_enabled?: boolean;
};

/** Mikrofon / sesli tahmin (backend: DEFAULT_APP_SETTINGS -> "app.mic"). */
export type MicConfig = {
  /** Tarayıcıda sesli tahmin — Web Speech API yolu. Eksikse AÇIK sayılır. */
  web_enabled?: boolean;
  /**
   * Uygulamada sesli tahmin — native tanıma plugin'i. Eksikse KAPALI sayılır.
   * web_enabled'a bağımlıdır: web kapalıyken uygulama açık olamaz (sunucu da
   * bu kombinasyonu reddeder, bkz. backend app_settings.py).
   */
  app_enabled?: boolean;
  /** Mikrofon ilk kullanıldığında bilgilendirme balonu çıksın mı. */
  notice_enabled?: boolean;
  /** Balon metni (admin panelden düzenlenir). */
  notice_text?: string;
  /** Balon cihaz başına kaç kez gösterilsin (0 = hiç). */
  notice_times?: number;
  /** Balon kaç saniye ekranda kalsın. */
  notice_seconds?: number;
};

export type StoresConfig = {
  badges_enabled: boolean;
  play_url: string;
  ios_url: string;
  show_on_paths: string[];
};

/** Anahtarlar backend'deki DEFAULT_APP_SETTINGS ile birebir aynı (noktalı). */
export type AppConfig = {
  "ads.adsense"?: AdSenseConfig;
  "ads.admob"?: AdMobConfig;
  "push.firebase"?: Record<string, any>;
  "app.stores"?: StoresConfig;
  "app.flags"?: FlagsConfig;
  "app.mic"?: MicConfig;
  [key: string]: any;
};

// --- modül kapsamı önbelleği (platform başına tek istek) ---
const cache: Partial<Record<Platform, AppConfig>> = {};
const inflight: Partial<Record<Platform, Promise<AppConfig | null>>> = {};

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((fn) => {
    try { fn(); } catch {}
  });
}

/** Yapılandırmayı getirir (varsa önbellekten). Hata durumunda null döner. */
export function loadAppConfig(platform: Platform): Promise<AppConfig | null> {
  const hit = cache[platform];
  if (hit) return Promise.resolve(hit);

  const pending = inflight[platform];
  if (pending) return pending;

  const p = (async (): Promise<AppConfig | null> => {
    try {
      const r = await fetch(apiUrl(`/api/app-config?platform=${platform}`), {
        cache: "no-store",
      });
      if (!r.ok) return null;
      const d = await r.json();
      const config: AppConfig =
        d && typeof d.config === "object" && d.config !== null ? d.config : {};
      cache[platform] = config;
      notify();
      return config;
    } catch {
      // Ağ/JSON hatası — sessizce yut, çağıran null görür.
      return null;
    } finally {
      delete inflight[platform];
    }
  })();

  inflight[platform] = p;
  return p;
}

/** Önbellekteki değer (istek atmaz) — SSR'da her zaman null. */
export function getCachedAppConfig(platform: Platform): AppConfig | null {
  return cache[platform] || null;
}

/**
 * Yapılandırmayı döner; yüklenirken veya hata durumunda null.
 * Platform tespiti tamamlanmadan istek atılmaz (yanlış platformla sorulmasın).
 */
export function useAppConfig(): AppConfig | null {
  const { platform, ready } = usePlatform();
  const [config, setConfig] = useState<AppConfig | null>(() =>
    ready ? getCachedAppConfig(platform) : null
  );

  useEffect(() => {
    if (!ready) return;
    let alive = true;

    const sync = () => {
      const c = getCachedAppConfig(platform);
      if (alive && c) setConfig(c);
    };
    sync();
    listeners.add(sync);

    loadAppConfig(platform).then((c) => {
      if (alive && c) setConfig(c);
    });

    return () => {
      alive = false;
      listeners.delete(sync);
    };
  }, [platform, ready]);

  return config;
}
