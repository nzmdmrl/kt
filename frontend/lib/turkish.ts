// Türkçe'ye uygun büyük harf dönüşümü.
// JavaScript'in standart toUpperCase() Türkçe bilmez: küçük "i" -> "I" yapar,
// oysa Türkçede "i" -> "İ" (noktalı), "ı" -> "I" (noktasız) olmalı.
// Bu fonksiyon önce Türkçe'ye özel harfleri elle çevirir, sonra kalanı çevirir.

const TR_UPPER_MAP: Record<string, string> = {
  i: "İ",
  "ı": "I",
  "ş": "Ş",
  "ğ": "Ğ",
  "ü": "Ü",
  "ö": "Ö",
  "ç": "Ç",
};

export function toUpperTr(text: string): string {
  let out = "";
  for (const ch of text) {
    out += TR_UPPER_MAP[ch] ?? ch.toUpperCase();
  }
  return out;
}
