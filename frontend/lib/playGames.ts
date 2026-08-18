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
 * İKİ AŞAMA: önce sessiz, sonra bir kez signIn()
 * ---------------------------------------------
 * 1) `isAuthenticated()` — ekran açmadan sorar. Oturum zaten açıksa iş biter.
 * 2) Açık değilse `signIn()` BİR KEZ denenir. Play Games v2'de doğru davranış
 *    budur: SDK oturumu kendiliğinden açamadıysa (ör. kullanıcı daha önce
 *    reddetmiş, profil seçilmemiş) girişi yalnız signIn() başlatabilir.
 *
 * signIn() KULLANICIYA EKRAN GÖSTEREBİLİR. Bilinçli bir tercih: aksi halde
 * sessiz giriş ilk kurulumdan sonra hiçbir zaman toparlanamıyordu. O da
 * başarısızsa vazgeçilir ve kullanıcı her zamanki giriş ekranını görür.
 *
 * BİR KEZ: signIn yalnız uygulama oturumu başına bir defa denenir (signInTried).
 * Kullanıcı reddettiyse her sayfa gezinmesinde tekrar tekrar sorulmaz.
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
/** signIn bu uygulama oturumunda denendi mi — kullanıcı üst üste sıkıştırılmasın. */
let signInTried = false;

/** Hata metnini kodu ile birlikte tek satıra indirir (teşhis kutusu için). */
function errText(e: any): string {
  const code = e?.code ?? e?.errorCode ?? "";
  const msg = String(e?.message ?? e ?? "bilinmeyen");
  return (code ? `[${code}] ` : "") + msg.slice(0, 250);
}

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
    let authed = false;
    try {
      const auth = await pg.isAuthenticated();
      authed = auth?.authenticated === true;
      recordTrace("sessiz kontrol", `authenticated=${authed}`);
    } catch (e: any) {
      recordTrace("isAuthenticated hatası", errText(e));
    }

    // Sessiz oturum yoksa Play Games girişini BİR KEZ başlat.
    if (!authed) {
      if (signInTried) {
        recordTrace("signIn atlandı", "bu oturumda zaten denendi");
        return { status: "unavailable", reason: "signin-denendi" };
      }
      signInTried = true;
      recordTrace("signIn deneniyor", "ekran çıkabilir");
      try {
        const res = await pg.signIn();
        authed = res?.authenticated === true;
        recordTrace("signIn sonucu", `authenticated=${authed}`);
      } catch (e: any) {
        recordTrace("signIn HATASI", errText(e));
        return { status: "unavailable", reason: `signin-hata: ${errText(e)}` };
      }
      if (!authed) {
        recordTrace("signIn başarısız", "oturum yine açılmadı");
        return { status: "unavailable", reason: "signin-basarisiz" };
      }
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
