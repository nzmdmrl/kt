"use client";

/**
 * Play Games ile SESSİZ giriş — uygulama (Capacitor) içindeki native köprü.
 *
 * NEDEN SESSİZ
 * ------------
 * Kullanıcı hiçbir düğmeye basmaz. Uygulama açılırken native eklentimizin
 * load() metodu PlayGamesSdk.initialize'ı çağırır; Android'in kendi "Play Games"
 * kartı üstte bir görünüp kaybolur ve oturum zaten açılmış olur. Buradaki iş
 * sadece "oturum açıldı mı?" diye sormak ve açıldıysa sunucumuz için bir yetki
 * kodu istemektir.
 *
 * EKLENTİYE NASIL ULAŞILIR — DİKKAT
 * ---------------------------------
 * `window.Capacitor.Plugins.PlayGames` BOŞTUR. O nesne npm'den kurulan
 * eklentilerle dolar: paketin JS'i yüklenince `registerPlugin("SocialLogin")`
 * gibi bir çağrı yapar ve proxy oraya yazılır. Bizim eklentimizin npm paketi
 * YOK (yalnız native tarafta duruyor), dolayısıyla o çağrıyı yapacak kimse yok.
 * Proxy'yi BURADA kendimiz kuruyoruz: `registerPlugin("PlayGames")`. İsim,
 * Java tarafındaki @CapacitorPlugin(name = "PlayGames") ile birebir aynı olmalı.
 *
 * Bu, akış ilk denemede sessizce çalışmamasının sebebiydi: köprüdeki hazır
 * proxy'ye bakılıyordu, o da hep undefined dönüyordu.
 *
 * GİRİŞ EKRANI AÇILMAZ
 * --------------------
 * Sessiz giriş başarısızsa (cihazda Play Games yok, kullanıcı daha önce
 * reddetmiş, hesap yok...) `signIn()` ÇAĞRILMAZ — çağrılsaydı kullanıcının
 * istemediği bir Google ekranı uygulama açılışında yüzüne çıkardı. Bunun yerine
 * sessizce vazgeçilir ve kullanıcı her zamanki giriş ekranını görür.
 *
 * HER ÇIKIŞ YOLU İZ BIRAKIR
 * -------------------------
 * Fonksiyon nerede vazgeçerse vazgeçsin hem konsola yazar hem de cihazda son
 * durumu saklar (bkz. recordTrace) — /menu'deki teşhis kutusundan okunur.
 * İlk hatada elimizde HİÇBİR satır yoktu; bir daha olmasın diye.
 */

/** Konsol etiketi — Logcat'te `chromium: [INFO:CONSOLE]` altında görünür. */
const TAG = "[play-games]";

/** Son sessiz giriş denemesinin özeti — /menu teşhis kutusu okur. */
const TRACE_KEY = "kt_dbg_playgames";

export type PlayGamesTrace = { at: number; step: string; detail: string };

export function recordTrace(step: string, detail = "") {
  try {
    localStorage.setItem(TRACE_KEY, JSON.stringify({ at: Date.now(), step, detail }));
  } catch {}
  console.warn(`${TAG} ${step}${detail ? " — " + detail : ""}`);
}

export function readTrace(): PlayGamesTrace | null {
  try {
    const raw = localStorage.getItem(TRACE_KEY);
    return raw ? (JSON.parse(raw) as PlayGamesTrace) : null;
  } catch {
    return null;
  }
}

export type PlayGamesOutcome =
  /** Sunucuya götürülecek tek kullanımlık yetki kodu. */
  | { status: "ok"; serverAuthCode: string }
  /** Cihazda oturum yok / SDK sessiz giriş yapamadı. Hata DEĞİL, sıradan durum. */
  | { status: "unavailable"; reason: string };

/** Java tarafındaki @CapacitorPlugin(name = ...) ile AYNI olmalı. */
const PLUGIN_NAME = "PlayGames";

let cached: any | null = null;

/** Eklenti proxy'si + nasıl bulunduğu (teşhis için). */
export async function playGamesPlugin(): Promise<{ pg: any | null; how: string }> {
  if (cached) return { pg: cached, how: "önbellek" };

  // 1) Köprüde hazır proxy (npm eklentileri böyle görünür — bizimki görünmez).
  try {
    const direct = (window as any)?.Capacitor?.Plugins?.[PLUGIN_NAME];
    if (direct) {
      cached = direct;
      return { pg: direct, how: "Capacitor.Plugins" };
    }
  } catch {}

  // 2) Yerel eklenti: JS proxy'sini biz kuruyoruz.
  try {
    const { registerPlugin, Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isPluginAvailable(PLUGIN_NAME)) {
      // Eklenti bu APK'da YOK (eski sürüm) ya da native kayıt yapılmamış.
      return { pg: null, how: "isPluginAvailable=false" };
    }
    cached = registerPlugin(PLUGIN_NAME);
    return { pg: cached, how: "registerPlugin" };
  } catch (e: any) {
    return { pg: null, how: `@capacitor/core yüklenemedi: ${e?.message ?? e}` };
  }
}

/**
 * Sessiz girişi dener ve sunucu için yetki kodunu döner.
 * Başarısızlık normaldir — çağıran taraf mevcut giriş ekranına düşer.
 */
export async function playGamesSilentCode(serverClientId: string): Promise<PlayGamesOutcome> {
  const clientId = (serverClientId || "").trim();
  if (!clientId) {
    recordTrace("vazgeçildi", "client id boş");
    return { status: "unavailable", reason: "client-id-yok" };
  }

  const { pg, how } = await playGamesPlugin();
  if (!pg) {
    recordTrace("eklenti bulunamadı", how);
    return { status: "unavailable", reason: `eklenti-yok (${how})` };
  }
  recordTrace("eklenti bulundu", how);

  try {
    const auth = await pg.isAuthenticated();
    if (!auth?.authenticated) {
      // signIn() BİLEREK çağrılmaz — yukarıdaki "giriş ekranı açılmaz" notu.
      recordTrace("sessiz oturum yok", "normal giriş ekranına düşülüyor");
      return { status: "unavailable", reason: "oturum-yok" };
    }
    recordTrace("oturum var", "yetki kodu isteniyor");

    const res = await pg.requestServerSideAccess({ serverClientId: clientId });
    const code: unknown = res?.serverAuthCode;
    if (typeof code !== "string" || !code) {
      recordTrace("yetki kodu gelmedi", JSON.stringify(res ?? null).slice(0, 200));
      return { status: "unavailable", reason: "kod-yok" };
    }
    recordTrace("yetki kodu alındı", `${code.length} karakter`);
    return { status: "ok", serverAuthCode: code };
  } catch (e: any) {
    // Sessiz akışta kullanıcıya hata GÖSTERİLMEZ; ize yazılır, giriş ekranı açılır.
    recordTrace("eklenti hatası", String(e?.message ?? e).slice(0, 300));
    return { status: "unavailable", reason: String(e?.message ?? e) };
  }
}
