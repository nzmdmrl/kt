/**
 * Geçiş (interstitial) reklamı — YERLEŞİM KURALLARI.
 *
 * TEMEL KURAL: reklam yalnızca kullanıcı oyun akışından OYUN OLMAYAN bir hedefe
 * çıkarken gösterilir (ana sayfa, /lig, profil, maraton haritası).
 * ASLA gösterilmez:
 *   - tur arasında (round_over / arena reveal),
 *   - "tekrar oyna", "rövanş", "sonraki bölüm", "tekrar dene", "yeni rakip",
 *     "yeni oda", "tekrar arenaya gir" — hepsi "oynamaya devam ediyorum" demek,
 *     üstelik çok oyunculuda karşıda BEKLEYEN bir rakip olabilir,
 *   - maç yarıda terk edilince (oturum bitmedi; ayrıca kullanıcı zaten sinirli).
 *
 * MAÇ = bir OTURUM, bir tur değil. 3 turluk özel oda 1 maçtır; sayaç yalnızca
 * oturumun tamamı bitince artar (noteMatchFinished).
 *
 * Sayaç ve son gösterim zamanı localStorage'da, CİHAZ bazlıdır (misafir dahil).
 *
 * Bu dosya Capacitor eklentisini İÇE AKTARMAZ: native köprüyü NativeBootstrap
 * configureInterstitial ile enjekte eder. Tarayıcıda `runtime` hep null kalır,
 * hiçbir kapı açılmaz, tek satır fazladan JS inmez.
 */

/** Reklamın mod bazlı aç/kapa anahtarları — backend DEFAULT_INTERSTITIAL_MODES ile aynı. */
export type AdMode =
  | "gunun_kelimesi"
  | "maraton"
  | "pratik"
  | "duello"
  | "arena"
  | "oda"
  | "ozel_arena";

const COUNT_KEY = "kt_ad_match_count";
const LAST_KEY = "kt_ad_last_ts";

/** Reklam gösterimi hiçbir koşulda gezinmeyi bundan uzun bekletemez. */
const SHOW_TIMEOUT_MS = 2500;

type Runtime = {
  /** İlanı ÖNCEDEN yükler (gecikme olmasın diye). Hazırsa hemen döner. */
  prepare: () => Promise<void>;
  /** Hazır ilanı gösterir. Hazır değilse reddeder. */
  show: () => Promise<void>;
  /** prepare tamamlandı mı — hazır değilse BEKLEMEDEN vazgeçilir. */
  isReady: () => boolean;
};

type Rules = {
  everyN: number;
  minSeconds: number;
  skipFirstN: number;
  modes: Partial<Record<AdMode, boolean>>;
};

let runtime: Runtime | null = null;
let rules: Rules | null = null;

/** Native köprü + admin kuralları — yalnızca NativeBootstrap çağırır. */
export function configureInterstitial(next: { runtime: Runtime; rules: Rules }) {
  runtime = next.runtime;
  rules = next.rules;
}

function readInt(key: string): number {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeInt(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
}

/** Cihazda bugüne kadar TAMAMLANMIŞ oturum sayısı. */
export function matchCount(): number {
  return readInt(COUNT_KEY);
}

/**
 * Bir oturum TAMAMEN bitti (maç sonu ekranı gerçekten göründü).
 * Tur sonunda, arena reveal'ında ya da yarıda terkte ÇAĞRILMAZ.
 * Mod kapalı olsa bile artar: bu "toplam tamamlanan maç" sayacıdır.
 *
 * Ayrıca bir sonraki ilanı şimdiden yüklemeye başlar — kullanıcı sonuç ekranını
 * okurken hazır olur, çıkışta bekleme olmaz.
 */
export function noteMatchFinished(_mode: AdMode) {
  writeInt(COUNT_KEY, matchCount() + 1);
  void runtime?.prepare().catch(() => {});
}

/** Reklam gösterilebilir mi — TÜM koşullar sağlanmalı. */
function eligible(mode: AdMode): boolean {
  // isNative + ads.enabled + interstitial_enabled + dolu birim kimliği:
  // hepsi sağlanmazsa NativeBootstrap runtime'ı hiç kurmaz.
  if (!runtime || !rules) return false;
  // Mod kapalıysa (ör. ozel_arena varsayılan kapalı) çık.
  if (rules.modes[mode] !== true) return false;

  const count = matchCount();
  // Yeni kullanıcının ilk N maçı reklamsız.
  if (count <= rules.skipFirstN) return false;
  if (rules.everyN <= 0) return false;
  if (count % rules.everyN !== 0) return false;

  const last = readInt(LAST_KEY);
  if (last > 0 && Date.now() - last < rules.minSeconds * 1000) return false;

  return true;
}

function withTimeout(p: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("interstitial timeout")), ms);
    p.then(
      () => { clearTimeout(t); resolve(); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/**
 * Koşullar tutuyorsa reklamı gösterir. `true` DÖNERSE reklam GERÇEKTEN gösterildi.
 * Hiçbir durumda hata fırlatmaz ve gezinmeyi bloklamaz:
 *   - ilan henüz hazır değilse BEKLEMEZ, vazgeçer,
 *   - gösterim patlarsa/askıda kalırsa (SHOW_TIMEOUT_MS) log'layıp geçer.
 * Zaman damgası YALNIZCA reklam gösterildiğinde güncellenir.
 */
export async function maybeShowInterstitial(mode: AdMode): Promise<boolean> {
  try {
    if (!eligible(mode)) return false;
    if (!runtime!.isReady()) {
      // Önceden hazırlanamamış (ağ yavaş / no fill). Kullanıcıyı BEKLETME;
      // bir sonraki çıkış için şimdiden yüklemeye başla.
      console.warn("[native] interstitial hazır değil, atlanıyor:", mode);
      void runtime!.prepare().catch(() => {});
      return false;
    }
    await withTimeout(runtime!.show(), SHOW_TIMEOUT_MS);
    writeInt(LAST_KEY, Date.now());
    // Bir sonrakini şimdiden yükle.
    void runtime!.prepare().catch(() => {});
    return true;
  } catch (e) {
    console.warn("[native] interstitial gösterilemedi:", e);
    void runtime?.prepare().catch(() => {});
    return false;
  }
}

/**
 * Oyun akışından çıkış: reklam koşulları tutuyorsa gösterir, SONRA gezinir.
 * Reklam gösterilmese/patlasa bile `go()` HER ZAMAN çalışır.
 */
export async function exitWithAd(mode: AdMode, go: () => void): Promise<void> {
  try {
    await maybeShowInterstitial(mode);
  } catch {}
  go();
}

/**
 * `<a href="...">` bağlantılarını reklamlı çıkışa çevirir — görünüm ve davranış
 * aynı kalır (href durur: uzun basma, yeni sekme, orta tık bozulmaz).
 *
 *     <a {...adExitProps("duello", "/")} style={...}>🏠 Ana Sayfa</a>
 *
 * Yeni sekme/kaydırma niyeti (ctrl/cmd/shift/orta tık) varsa karışmaz.
 */
export function adExitProps(mode: AdMode, href: string) {
  return {
    href,
    onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      void exitWithAd(mode, () => {
        try { window.location.href = href; } catch {}
      });
    },
  };
}
