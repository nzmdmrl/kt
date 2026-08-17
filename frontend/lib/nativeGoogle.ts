"use client";

/**
 * Uygulama (Capacitor) içinde Google ile giriş — cihazın NATIVE hesap seçicisi.
 *
 * NEDEN GEREKLİ
 * -------------
 * Google, gömülü WebView içinden OAuth akışını engelliyor (disallowed_useragent).
 * Bu yüzden uygulamada Google Identity Services betiği hiç yüklenemiyor ve giriş
 * ekranında "Google servisi yüklenemedi" hatası çıkıyordu. Çözüm: uygulamada
 * tarayıcı akışı yerine işletim sisteminin hesap seçicisini açmak.
 *
 * EKLENTİ: @capgo/capacitor-social-login (7.x = Capacitor 7 hattı).
 * Android tarafında Google'ın YENİ Credential Manager API'sini kullanır; eski
 * GoogleSignIn API'si Google tarafından kullanımdan kaldırıldığı için bugün
 * bakımlı olan tek makul seçenek budur.
 *
 * KURALLAR
 * --------
 *  - Eklenti SADECE dinamik import() ile yüklenir ve bu dosya YALNIZCA
 *    isNative iken çağrılır: normal tarayıcı kullanıcısı tek byte indirmez
 *    (NativeBootstrap'taki eklenti kuralının aynısı).
 *  - webClientId app_settings'ten gelir ('app.flags'.google_web_client_id,
 *    /api/app-config). Aynı kimlik backend'de audience doğrulamasında kullanılır.
 *  - initialize() kimlik başına BİR kez çağrılır; ikinci girişte tekrarlanmaz.
 */

/** Hesap seçicinin sonucu — arayüz buna göre Türkçe mesaj basar. */
export type NativeGoogleOutcome =
  | { status: "ok"; idToken: string }
  /** Kullanıcı seçiciyi kapattı — HATA DEĞİL, hiçbir şey gösterilmez. */
  | { status: "cancelled" }
  /** Cihazda kullanılabilir Google hesabı yok / seçiciye hesap düşmedi. */
  | { status: "no-account" }
  /** message = EKLENTİNİN HAM mesajı (Türkçeleştirilmemiş) — konsola basılır. */
  | { status: "error"; message: string };

/** Konsol etiketi — Logcat'te `chromium: [INFO:CONSOLE]` altında görünür. */
const TAG = "[google-native]";

/** initialize() hangi client id ile yapıldı — aynıysa tekrar çağrılmaz. */
let initializedFor: string | null = null;

/**
 * id_token'ın taşıdığı iddiaları (claim) ÖZETLER — teşhis için.
 *
 * DEĞER BASMAZ: yalnız alan ADLARI, e-postanın var/yok bilgisi ve aud'un ilk
 * hanesi yazılır (e-posta, ad, foto adresi konsola DÜŞMEZ). Backend token'ı
 * zaten Google'a yeniden doğrulatıyor; buradaki çözümleme sadece "email alanı
 * geldi mi" sorusunu cihazda gözle görmek için, güvenlik kararı vermez.
 */
function claimSummary(idToken: string): string {
  try {
    const payload = idToken.split(".")[1];
    const json = JSON.parse(
      decodeURIComponent(
        atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join(""),
      ),
    );
    return (
      `alanlar=[${Object.keys(json).sort().join(",")}] ` +
      `email=${json.email ? "VAR" : "YOK"} ` +
      `email_verified=${String(json.email_verified)} ` +
      `aud=${String(json.aud || "").slice(0, 14)}…`
    );
  } catch {
    return "(id_token çözümlenemedi)";
  }
}

/** Eklentinin hata metninden kullanıcıya anlatılabilir bir durum çıkarır. */
function classify(raw: unknown): NativeGoogleOutcome {
  const text = String((raw as any)?.message ?? raw ?? "").toLowerCase();
  // Kullanıcı seçiciyi kapattı (Android: "activity is cancelled by the user",
  // iOS: "the user canceled the sign in flow").
  if (text.includes("cancel")) return { status: "cancelled" };
  // Cihazda hesap yok / Credential Manager hiçbir kimlik döndüremedi.
  if (text.includes("nocredential") || text.includes("no credential")) {
    return { status: "no-account" };
  }
  return { status: "error", message: String((raw as any)?.message || raw || "") };
}

/**
 * Native hesap seçiciyi açar ve Google id_token'ını döner.
 * ASLA fırlatmaz — her durum NativeGoogleOutcome olarak döner.
 */
export async function nativeGoogleSignIn(webClientId: string): Promise<NativeGoogleOutcome> {
  const clientId = (webClientId || "").trim();
  if (!clientId) return { status: "error", message: "client-id-yok" };

  try {
    const { SocialLogin } = await import("@capgo/capacitor-social-login");

    if (initializedFor !== clientId) {
      // webClientId Android ve Web için zorunlu; iOS'ta ayrıca iOSClientId
      // gerekir (iOS kabuğu henüz kurulmadı — eklendiğinde buraya o da yazılır).
      await SocialLogin.initialize({ google: { webClientId: clientId } });
      initializedFor = clientId;
    }

    // ------------------------------------------------------------------
    // `scopes` GÖNDERİLMEZ — bilerek.
    //
    // Eklenti scopes verildiğinde MainActivity'nin
    // ModifiedMainActivityForSocialLoginPlugin'den türemesini ŞART koşuyor,
    // aksi halde çağrıyı şu mesajla reddediyor:
    //   "You CANNOT use scopes without modifying the main activity."
    //
    // Ama GoogleProvider.java zaten şu üçünü KOŞULSUZ ekliyor:
    //   userinfo.email + userinfo.profile + openid
    // ve custom scopes yalnızca BUNLARIN ÜSTÜNE eklenmek için var. Daha önce
    // gönderdiğimiz ["email","profile"] bu kümenin alt kümesiydi; hiçbir şey
    // kazandırmıyor, sadece yukarıdaki kapıyı tetikliyordu. Dolayısıyla
    // kaldırmak KAYIPSIZDIR: id_token yine email + email_verified + name +
    // picture + sub taşır (backend zaten bunları Google'a doğrulatıp okuyor).
    //
    // Ek scope'a (Drive, Calendar vb.) gerçekten ihtiyaç doğarsa iş değişir:
    // o zaman MainActivity'yi eklentinin dokümanındaki gibi değiştirmek şart.
    // ------------------------------------------------------------------
    const res = await SocialLogin.login({ provider: "google", options: {} });

    const result: any = res?.result;
    // 'offline' modda idToken gelmez (yalnız serverAuthCode) — biz 'online'
    // varsayılanını kullanıyoruz, yine de tip güvenliği için kontrol edilir.
    const idToken: unknown = result?.idToken;
    if (typeof idToken !== "string" || !idToken) {
      console.error(`${TAG} id_token gelmedi. Ham sonuç:`, res);
      return { status: "error", message: "id-token-yok" };
    }
    // Teşhis satırı: "email=VAR" görüyorsan backend'in ihtiyacı karşılanıyor.
    console.warn(`${TAG} id_token alındı — ${claimSummary(idToken)}`);
    return { status: "ok", idToken };
  } catch (e) {
    // EKLENTİNİN HAM MESAJI: genel Türkçe uyarının arkasında kaybolmasın.
    console.error(`${TAG} eklenti hatası:`, (e as any)?.message ?? e, e);
    return classify(e);
  }
}
