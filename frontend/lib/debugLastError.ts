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

/** Ekrandan okunacak; uzun metin kutuyu taşırmasın. */
const MAX_MESSAGE = 400;

export type DebugError = {
  /** Hatanın oluştuğu an (epoch ms). */
  at: number;
  /** Hangi aşama: "eklenti" | "sunucu" | "yapılandırma" */
  stage: string;
  /** Hata metni — eklentiden/sunucudan geldiği gibi. */
  message: string;
  /** Varsa hata kodu (Capacitor köprüsü `code` taşıyabilir). */
  code: string;
  /** Hata sınıfının adı — ör. "CapacitorException". */
  name: string;
};

/** Hata nesnesinden okunabilir alanları çıkarır; biçim ne olursa olsun patlamaz. */
function describe(err: unknown): Omit<DebugError, "at" | "stage"> {
  let message = "";
  let code = "";
  let name = "";
  try {
    const e = err as any;
    name = String(e?.name ?? e?.constructor?.name ?? "").slice(0, 40);
    message = String(e?.message ?? e?.errorMessage ?? e ?? "");
    // Capacitor köprüsü `code`, bazı eklentiler `errorCode`/`status` kullanıyor.
    const raw = e?.code ?? e?.errorCode ?? e?.status;
    code = raw === undefined || raw === null ? "" : String(raw);
  } catch {
    message = "(hata nesnesi okunamadı)";
  }
  return { message: message.slice(0, MAX_MESSAGE), code: code.slice(0, 60), name };
}

/** Son hatayı kaydeder (öncekini ezer — ilgilendiğimiz hep sonuncusu). */
export function recordDebugError(stage: string, err: unknown): void {
  try {
    const row: DebugError = { at: Date.now(), stage, ...describe(err) };
    localStorage.setItem(KEY, JSON.stringify(row));
  } catch {
    /* depo yok/dolu — teşhis uğruna akış bozulmaz */
  }
}

export function readDebugError(): DebugError | null {
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
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* yok say */
  }
}
