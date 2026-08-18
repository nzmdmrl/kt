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
 * GİRİŞ EKRANI AÇILMAZ
 * --------------------
 * Sessiz giriş başarısızsa (cihazda Play Games yok, kullanıcı daha önce
 * reddetmiş, hesap yok...) `signIn()` ÇAĞRILMAZ — çağrılsaydı kullanıcının
 * istemediği bir Google ekranı uygulama açılışında yüzüne çıkardı. Bunun yerine
 * sessizce vazgeçilir ve kullanıcı her zamanki giriş ekranını görür.
 *
 * KURALLAR (lib/nativeGoogle.ts ile aynı)
 * ---------------------------------------
 *  - Eklenti YALNIZCA dinamik import() ile yüklenir ve bu dosya yalnızca
 *    isNative iken çağrılır: tarayıcı kullanıcısı tek byte indirmez.
 *  - ASLA fırlatmaz; her durum sonuç nesnesi olarak döner.
 *  - serverClientId backend'den gelir (/api/auth/play-games/status) — Play Games
 *    projesinin WEB istemci kimliği. Kodun hangi proje için üretileceğini o belirler.
 */

/** Konsol etiketi — Logcat'te `chromium: [INFO:CONSOLE]` altında görünür. */
const TAG = "[play-games]";

export type PlayGamesOutcome =
  /** Sunucuya götürülecek tek kullanımlık yetki kodu. */
  | { status: "ok"; serverAuthCode: string }
  /** Cihazda oturum yok / SDK sessiz giriş yapamadı. Hata DEĞİL, sıradan durum. */
  | { status: "unavailable"; reason: string };

/** Capacitor köprüsündeki eklentiye erişir; yoksa null. */
function plugin(): any | null {
  try {
    const registry = (window as any)?.Capacitor?.Plugins;
    return registry?.PlayGames ?? null;
  } catch {
    return null;
  }
}

/**
 * Sessiz girişi dener ve sunucu için yetki kodunu döner.
 * Başarısızlık normaldir — çağıran taraf mevcut giriş ekranına düşer.
 */
export async function playGamesSilentCode(serverClientId: string): Promise<PlayGamesOutcome> {
  const clientId = (serverClientId || "").trim();
  if (!clientId) return { status: "unavailable", reason: "client-id-yok" };

  const pg = plugin();
  if (!pg) {
    // Eski sürüm uygulamada eklenti yoktur; site tarayıcıda açılmışsa da öyle.
    return { status: "unavailable", reason: "eklenti-yok" };
  }

  try {
    const auth = await pg.isAuthenticated();
    if (!auth?.authenticated) {
      // signIn() BİLEREK çağrılmaz — yukarıdaki "giriş ekranı açılmaz" notu.
      console.warn(`${TAG} sessiz oturum yok — normal giriş ekranına düşülüyor`);
      return { status: "unavailable", reason: "oturum-yok" };
    }
    const res = await pg.requestServerSideAccess({ serverClientId: clientId });
    const code: unknown = res?.serverAuthCode;
    if (typeof code !== "string" || !code) {
      return { status: "unavailable", reason: "kod-yok" };
    }
    console.warn(`${TAG} sessiz giriş başarılı, yetki kodu alındı`);
    return { status: "ok", serverAuthCode: code };
  } catch (e) {
    // Sessiz akışta kullanıcıya hata GÖSTERİLMEZ; konsola düşer, giriş ekranı açılır.
    console.warn(`${TAG} sessiz giriş yapılamadı:`, (e as any)?.message ?? e);
    return { status: "unavailable", reason: String((e as any)?.message ?? e) };
  }
}
