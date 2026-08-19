"use client";

/**
 * Oturum jetonunun saklandığı yer.
 *
 * NEDEN AYRI BİR DOSYA
 * --------------------
 * "Hızlı Giriş" ile açılan (henüz doğrulanmamış) hesabın TEK dayanağı bu
 * jetondur: e-postası, şifresi yok. Jeton silinirse kişi hesabına bir daha
 * ULAŞAMAZ — puanı, seviyesi, rozetleri gider.
 *
 * Web'de localStorage yeterli. UYGULAMADA değil: WebView'in localStorage'ı
 * "tarayıcı verisi" sayılır ve Android tarafından temizlenebilir (kullanıcı
 * "uygulama önbelleğini temizle" derse, sistem yer açarsa, bazı temizlik
 * uygulamaları çalışırsa). Bu yüzden uygulamada jeton AYRICA native depolamaya
 * (Capacitor Preferences → Android'de SharedPreferences) yazılır; orası ancak
 * uygulama kaldırılınca silinir.
 *
 * NASIL ÇALIŞIR
 * -------------
 *  yazarken : localStorage'a HEMEN (senkron), native'e arka planda (ateşle-unut)
 *  okurken  : önce localStorage (senkron, hızlı yol) — doluysa iş biter
 *             boşsa ve uygulamadaysak native depodan geri yüklenir (async)
 *  silerken : ikisi birden
 *
 * Böylece web davranışı BİREBİR eskisi gibi kalır (tek satır fazladan iş yok),
 * uygulamada ise localStorage silinse bile kullanıcı hesabında kalır.
 *
 * EKLENTİYE ERİŞİM: @capacitor/preferences paketi frontend'e KURULMAZ. Eklenti
 * native tarafta zaten var (mobile/package.json + capacitor.plugins.json), biz
 * de köprüdeki proxy'yi lib/playGames.ts'teki yöntemle kendimiz kuruyoruz:
 * registerPlugin("Preferences"). İsim, native tarafta kayıtlı adla aynıdır.
 * Tarayıcıda bu kod hiç çalışmaz — önce detectPlatform() kontrol edilir.
 */

import { detectPlatform } from "./platform";

export const TOKEN_KEY = "kt_token";

/**
 * "Son hesap" hatırası — ÇIKIŞIN SİLMEDİĞİ ayrı anahtar.
 *
 * NEDEN VAR
 * ---------
 * Doğrulanmamış hesabın tek anahtarı oturum jetonudur. Kullanıcı "Çıkış yap"a
 * basınca o jeton silinir ve hesabına bir daha ULAŞAMAZ: aynı ismi yazsa bile
 * kullanıcı adı dolu olduğu için "nazim2" diye YENİ bir hesap açılır, eskisi
 * ve içindeki bütün ilerleme sonsuza dek erişilemez kalır.
 *
 * Bu yüzden çıkışta jetonun bir kopyası BURADA bırakılır ve isim popup'ında
 * "<İsim> olarak devam et" seçeneği çıkar. Kullanıcı "Farklı isimle başla"
 * derse hatıra silinir.
 *
 * GÜVENLİK
 * --------
 * Hatıra YALNIZCA doğrulanmamış hesaplar için tutulur. Doğrulanmış hesap
 * (e-posta + şifre ya da Google) çıkış yaptığında hatıra bırakılmaz — o kişi
 * zaten e-postasıyla geri girebilir ve "çıktım ama hâlâ girilebiliyor"
 * durumu doğmamalıdır. Hesap doğrulanır doğrulanmaz hatıra silinir.
 */
export const LAST_KEY = "kt_last_account";

export type LastAccount = { token: string; name: string };

/** Native depo proxy'si — ilk kullanımda kurulur, sonra yeniden kullanılır. */
let nativeStore: any | null = null;
let nativeStoreTried = false;

async function getNativeStore(): Promise<any | null> {
  if (detectPlatform() === "web") return null;
  if (nativeStoreTried) return nativeStore;
  nativeStoreTried = true;
  try {
    const direct = (window as any).Capacitor?.Plugins?.Preferences;
    if (direct) { nativeStore = direct; return nativeStore; }
    const { registerPlugin } = await import("@capacitor/core");
    nativeStore = registerPlugin("Preferences");
  } catch {
    nativeStore = null;   // eklenti yoksa sessizce web davranışına düşülür
  }
  return nativeStore;
}

/** localStorage — her ortamda çalışır, hatası yutulur (gizli sekme vb.). */
function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
}
function lsRemove(key: string) {
  try { localStorage.removeItem(key); } catch {}
}

/**
 * Hızlı yol: jetonu senkron oku. Uygulamada localStorage boşsa `null` dönebilir
 * ama jeton native depoda DURUYOR olabilir — o durumu restoreToken() kapatır.
 */
export function readTokenSync(): string | null {
  return lsGet(TOKEN_KEY);
}

/**
 * Uygulamada localStorage boşaldıysa jetonu native depodan geri yükler.
 * Bulursa localStorage'a da yazar (bundan sonra hızlı yol yeter) ve döner.
 * Web'de ya da eklenti yoksa null döner — çağıran taraf hiçbir şey yapmaz.
 */
export async function restoreToken(): Promise<string | null> {
  const store = await getNativeStore();
  if (!store) return null;
  try {
    const res = await store.get({ key: TOKEN_KEY });
    const value = res?.value ? String(res.value) : "";
    if (!value) return null;
    lsSet(TOKEN_KEY, value);
    return value;
  } catch {
    return null;
  }
}

/** Jetonu kaydeder: localStorage hemen, native depo arka planda. */
export function saveToken(token: string) {
  lsSet(TOKEN_KEY, token);
  void getNativeStore().then((s) => s?.set({ key: TOKEN_KEY, value: token })).catch(() => {});
}

/** Çıkışta iki yerden de siler. */
export function clearToken() {
  lsRemove(TOKEN_KEY);
  void getNativeStore().then((s) => s?.remove({ key: TOKEN_KEY })).catch(() => {});
}


// ---------------------------------------------------------------- son hesap

function parseLast(raw: string | null): LastAccount | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (o && typeof o.token === "string" && o.token.length > 20) {
      return { token: o.token, name: String(o.name || "") };
    }
  } catch {}
  return null;
}

/** Hatırayı yazar (localStorage hemen, native depo arka planda). */
export function rememberAccount(token: string, name: string) {
  const raw = JSON.stringify({ token, name });
  lsSet(LAST_KEY, raw);
  void getNativeStore().then((s) => s?.set({ key: LAST_KEY, value: raw })).catch(() => {});
}

/** Hızlı yol: hatırayı senkron oku. */
export function readLastAccountSync(): LastAccount | null {
  return parseLast(lsGet(LAST_KEY));
}

/**
 * Uygulamada localStorage temizlenmişse hatırayı native depodan geri yükler.
 * Web'de ya da eklenti yoksa null döner.
 */
export async function restoreLastAccount(): Promise<LastAccount | null> {
  const store = await getNativeStore();
  if (!store) return null;
  try {
    const res = await store.get({ key: LAST_KEY });
    const parsed = parseLast(res?.value ? String(res.value) : null);
    if (parsed) lsSet(LAST_KEY, JSON.stringify(parsed));
    return parsed;
  } catch {
    return null;
  }
}

/** Hatırayı unut — "Farklı isimle başla" ve hesap doğrulanınca çağrılır. */
export function forgetLastAccount() {
  lsRemove(LAST_KEY);
  void getNativeStore().then((s) => s?.remove({ key: LAST_KEY })).catch(() => {});
}
