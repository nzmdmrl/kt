/**
 * Avatar adresi — TEK KAYNAK.
 *
 * Hesap açılırken sunucu hazır bir avatar yazar (backend: app/game/avatars.py),
 * bu yüzden normalde `avatar_url` doludur ve her ekran AYNI yüzü gösterir.
 * Yedek yalnızca botlar, misafirler ve avatar alanı bir şekilde boş kalmış
 * eski kayıtlar için devreye girer.
 *
 * Eskiden bu adres 15 ayrı dosyada elle kuruluyordu ve tohum her yerde farklıydı
 * (kimi yerde kullanıcı adı, kimi yerde görünen ad) — aynı kişi ekranlar arasında
 * başka başka yüzlerle görünüyordu. Değişiklik gerekirse artık tek yer burası.
 */

const STYLE = "thumbs";

/** Tohumdan (kullanıcı adı / görünen ad) sabit avatar adresi üretir. */
export function fallbackAvatar(seed?: string | null): string {
  return `https://api.dicebear.com/7.x/${STYLE}/svg?seed=${encodeURIComponent(seed || "?")}`;
}

/** Kayıtlı avatar varsa onu, yoksa tohumdan üretileni döner. */
export function avatarSrc(url?: string | null, seed?: string | null): string {
  return url || fallbackAvatar(seed);
}
