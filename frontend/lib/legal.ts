/**
 * Yasal metinlerde geçen künye bilgileri — tek yerden yönetilir.
 *
 * Gizlilik / Kullanım Koşulları / Çerez Politikası sayfaları bu sabitleri kullanır.
 * Şirket bilgisi değişirse SADECE burası güncellenir.
 *
 * DOLDURULACAK: TICARET_UNVANI, ADRES ve MERSIS gerçek değerlerle değiştirilmeli
 * (KVKK aydınlatma metninde veri sorumlusunun açık kimliği zorunludur).
 */

export const COMPANY = {
  /** Markanın arkasındaki şirket/işletme adı */
  name: "Patron Panda",
  /** Resmî ticaret unvanı — ticaret sicilindeki tam ad */
  legalName: "Patron Panda",
  /** Platform (oyun) adı */
  product: "Kelime Tahmin",
  domain: "kelimetahmin.com",
  site: "https://www.kelimetahmin.com",
  /** Genel iletişim ve KVKK başvuru adresi */
  email: "iletisim@kelimetahmin.com",
  /** Gizlilik/veri talepleri için ayrı kutu kullanılıyorsa burada değiştir */
  privacyEmail: "iletisim@kelimetahmin.com",
  /** Açık adres — KVKK başvurularının yazılı olarak yapılabilmesi için gerekli */
  address: "Türkiye",
  /** Hizmetin kullanımı için asgari yaş */
  minAge: 13,
} as const;

/** Tüm yasal sayfalarda gösterilen son güncelleme tarihi */
export const LEGAL_UPDATED = "Ağustos 2026";
