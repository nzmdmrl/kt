"use client";

/**
 * ===================================================================
 * GEÇİCİ TEŞHİS — SİLİNECEK.
 *
 * Amaç: uygulamadaki Google girişi telefonda (Play sürümü) patlarken
 * emülatörde çalışıyor. USB kablo olmadığı için Logcat okunamıyor, bu yüzden
 * SON hatanın ham metni cihazda saklanıp /menu sayfasındaki teşhis kutusunda
 * gösteriliyor.
 *
 * KURALLAR:
 *  - Oturum mantığına DOKUNMAZ. Sadece bir localStorage anahtarı yazar/okur.
 *  - Hiçbir zaman fırlatmaz: depo erişilemezse sessizce vazgeçer.
 *  - Kişisel veri saklamaz — yalnız eklentinin/sunucunun hata metni.
 *
 * İş bitince: bu dosya + çağrıları (lib/nativeGoogle.ts,
 * components/GoogleSignIn.tsx) + /menu'deki gösterim kaldırılacak.
 * ===================================================================
 */

const KEY = "kt_dbg_last_error";

/** HAM metin isteniyor — yalnız uçuk uzunluklar kırpılır. */
const MAX_MESSAGE = 1000;

export type DebugError = {
  /** Hatanın oluştuğu an (epoch ms). */
  at: number;
  /** Hangi aşama: "eklenti" | "sunucu" | "yapılandırma" */
  stage: string;
  /** Hata metni — eklentiden/sunucudan geldiği gibi, kırpılmadan. */
  message: string;
  /** Varsa hata kodu (Capacitor köprüsü `code` taşıyabilir). */
  code: string;
  /** Hata sınıfının adı — ör. "CapacitorException". */
  name: string;
  /** Yukarıdakilere girmeyen diğer alanlar (ör. Capacitor `data`). */
  extra: string;
};

/**
 * BELLEKTEKİ kopya — birincil kaynak.
 * Modül kapsamı olduğu için /giris → /menu geçişinde (istemci tarafı yönlendirme)
 * yaşamaya devam eder. localStorage yalnızca AYNAdır: uygulama tamamen kapanıp
 * açılırsa hata yine okunabilsin diye. Okuma sırasında bellek varsa o kazanır.
 */
let inMemory: DebugError | null = null;

/** Hata nesnesinden okunabilir alanları çıkarır; biçim ne olursa olsun patlamaz. */
function describe(err: unknown): Omit<DebugError, "at" | "stage"> {
  let message = "";
  let code = "";
  let name = "";
  let extra = "";
  try {
    const e = err as any;
    name = String(e?.name ?? e?.constructor?.name ?? "").slice(0, 60);
    message = String(e?.message ?? e?.errorMessage ?? e ?? "");
    // Capacitor köprüsü `code`, bazı eklentiler `errorCode`/`status` kullanıyor.
    const raw = e?.code ?? e?.errorCode ?? e?.status;
    code = raw === undefined || raw === null ? "" : String(raw);

    // Yukarıdakilere girmeyen ne varsa: Capacitor bazen `data` taşıyor, native
    // istisna sınıfının adı da orada gizli olabilir.
    if (e && typeof e === "object") {
      const rest: Record<string, unknown> = {};
      for (const k of Object.keys(e)) {
        if (["message", "code", "errorCode", "status", "name", "stack"].includes(k)) continue;
        rest[k] = (e as any)[k];
      }
      if (Object.keys(rest).length) extra = JSON.stringify(rest).slice(0, 400);
    }
  } catch {
    message = message || "(hata nesnesi okunamadı)";
  }
  return { message: message.slice(0, MAX_MESSAGE), code: code.slice(0, 60), name, extra };
}

/** Son hatayı kaydeder (öncekini ezer — ilgilendiğimiz hep sonuncusu). */
export function recordDebugError(stage: string, err: unknown): void {
  const row: DebugError = { at: Date.now(), stage, ...describe(err) };
  inMemory = row;                       // birincil: bellek
  try {
    localStorage.setItem(KEY, JSON.stringify(row));   // ayna: kapanıp açılırsa
  } catch {
    /* depo yok/dolu — teşhis uğruna akış bozulmaz */
  }
}

export function readDebugError(): DebugError | null {
  if (inMemory) return inMemory;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const row = JSON.parse(raw);
    return row && typeof row === "object" ? (row as DebugError) : null;
  } catch {
    return null;
  }
}

export function clearDebugError(): void {
  inMemory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* yok say */
  }
}
