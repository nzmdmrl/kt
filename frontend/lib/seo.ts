/**
 * Sayfa SEO yardımcıları (yalnızca sunucu tarafı — generateMetadata içinde kullanılır).
 *
 * Başlık / açıklama / anahtar kelime / paylaşım görseli backend'den gelir
 * (`/api/seo/meta/{key}`) ve admin panelindeki "🔍 SEO" sekmesinden düzenlenir.
 * Backend'e ulaşılamazsa aşağıdaki gömülü yedek metinler kullanılır — sayfa
 * hiçbir zaman başlıksız kalmaz.
 */

import type { Metadata } from "next";
import { SITE_URL, serverApiUrl } from "@/lib/site";

export const SITE_NAME = "Kelime Tahmin";

export type SeoMeta = {
  key: string;
  path: string;
  title: string;
  description: string;
  keywords: string[];
  image_path: string | null;
  indexable: boolean;
  priority: number;
  site_name: string;
};

// Backend'e ulaşılamazsa kullanılacak yedek (backend/app/models/seo_page.py ile aynı).
const FALLBACK: Record<string, { title: string; description: string; path: string; indexable: boolean }> = {
  home: {
    title: "Kelime Tahmin Oyunu — Online Kelime Tahmin Maçları",
    description:
      "Karşılıklı kelime tahmin oyunu oyna! Gerçek rakiplerle online kelime tahmin maçları yap, arenada yarış, ligde kupa ve rozet kazan.",
    path: "/",
    indexable: true,
  },
  duel: {
    title: "1v1 Kelime Düellosu — Rakibinle Karşılıklı Kelime Tahmini",
    description: "Gerçek rakiplerle sıra tabanlı 1v1 kelime düellosu oyna. Rakip bul, arkadaşını davet et veya bota karşı pratik yap.",
    path: "/oyna",
    indexable: true,
  },
  arena: {
    title: "Kelime Arenası — 5 Kişilik Hızlı Kelime Yarışı",
    description: "5 kişilik arenada kelime tahmin yarışı! En hızlı doğru cevabı ver, podyuma çık, kupa ve XP kazan.",
    path: "/arena",
    indexable: true,
  },
  custom_arena: {
    title: "Özel Arena Kur — Arkadaşlarınla Kelime Yarışı",
    description: "Kendi arenani kur, kodu paylaş, arkadaşlarınla kelime tahmin yarışı yap.",
    path: "/arena/ozel",
    indexable: true,
  },
  solo: {
    title: "Maraton — Bölüm Bölüm Kelime Tahmin Oyunu",
    description: "Tek başına oyna! Maraton modunda bölümleri sırayla geç, rekorunu kır.",
    path: "/solo",
    indexable: true,
  },
  daily: {
    title: "Günün Kelimesi — Her Gün Yeni Türkçe Kelime Bulmacası",
    description: "Her gün yeni bir Türkçe kelime! Günün kelimesini en az denemede bul ve skorunu paylaş.",
    path: "/gunun-kelimesi",
    indexable: true,
  },
  league: {
    title: "Lig ve Sıralamalar — Günlük, Aylık ve Tüm Zamanlar",
    description: "Kelime Tahmin ligi: günlük, aylık ve tüm zamanlar sıralamaları. Kupa ve madalya kazan.",
    path: "/lig",
    indexable: true,
  },
  league_archive: {
    title: "Lig Arşivi — Geçmiş Dönem Şampiyonları",
    description: "Geçmiş günlerin ve ayların lig şampiyonları, kupa ve madalya sahipleri.",
    path: "/lig/arsiv",
    indexable: true,
  },
  login: {
    title: "Giriş Yap veya Ücretsiz Üye Ol",
    description: "Ücretsiz üye ol; puanların, kupaların ve rozetlerin kayıtlı kalsın.",
    path: "/giris",
    indexable: true,
  },
  how: {
    title: "Nasıl Oynanır — Kelime Tahmin Oyunu Kuralları",
    description: "1v1 düello, arena, maraton ve günün kelimesi modlarının kuralları adım adım.",
    path: "/nasil-oynanir",
    indexable: true,
  },
  profile: {
    title: "Oyuncu Profili",
    description: "Oyuncunun istatistikleri: maç sayısı, galibiyet oranı, puanı, unvanı, kupaları ve rozetleri.",
    path: "/profil",
    indexable: true,
  },
  history: { title: "Maç Geçmişim", description: "Oynadığın maçların sonuçları ve kazandığın puanlar.", path: "/gecmis", indexable: false },
  notifications: { title: "Bildirimler", description: "Arkadaşlık istekleri, yeni unvanlar ve arena ödüllerin.", path: "/bildirimler", indexable: false },
  menu: { title: "Menü", description: "Ayarlar, profil, lig ve diğer bölümlere hızlı erişim.", path: "/menu", indexable: false },
  privacy: {
    title: "Gizlilik Politikası ve KVKK Aydınlatma Metni",
    description: "Kelime Tahmin'de hangi kişisel verilerin işlendiğini, ne amaçla kullanıldığını ve KVKK haklarınızı açıklar.",
    path: "/gizlilik",
    indexable: true,
  },
  terms: {
    title: "Kullanım Koşulları",
    description: "Kelime Tahmin'i kullanırken geçerli olan kurallar: hesap, adil oyun, sorumluluk ve hesap kapatma.",
    path: "/kosullar",
    indexable: true,
  },
  cookies: {
    title: "Çerez Politikası",
    description: "Kelime Tahmin'in tarayıcınızda hangi bilgileri sakladığı, neden sakladığı ve nasıl temizleyebileceğiniz.",
    path: "/cerez",
    indexable: true,
  },
  default: {
    title: "Kelime Tahmin — Online Kelime Tahmin Oyunu",
    description: "Karşılıklı kelime tahmin oyunu. Rakip bul, arenada yarış, ligde kupa kazan.",
    path: "",
    indexable: false,
  },
};

function fallbackMeta(key: string): SeoMeta {
  const f = FALLBACK[key] || FALLBACK.default;
  return {
    key,
    path: f.path,
    title: f.title,
    description: f.description,
    keywords: [],
    image_path: null,
    indexable: f.indexable,
    priority: 0.5,
    site_name: SITE_NAME,
  };
}

/** Tek sayfanın SEO verisi (backend + varsayılan). */
export async function fetchSeo(key: string): Promise<SeoMeta> {
  try {
    const r = await fetch(serverApiUrl(`/api/seo/meta/${key}`), { next: { revalidate: 60 } });
    if (r.ok) {
      const d = (await r.json()) as SeoMeta;
      if (d && d.title) return d;
    }
  } catch {}
  return fallbackMeta(key);
}

/** Tüm sayfalar (sitemap + favicon için). */
export async function fetchSeoAll(): Promise<{ pages: SeoMeta[]; favicon_path: string | null }> {
  try {
    const r = await fetch(serverApiUrl("/api/seo/meta"), { next: { revalidate: 60 } });
    if (r.ok) return await r.json();
  } catch {}
  return { pages: Object.keys(FALLBACK).map(fallbackMeta), favicon_path: null };
}

/** Görsel yolunu paylaşımda kullanılabilir mutlak adrese çevirir. */
export function absoluteImage(imagePath: string | null): string | null {
  if (!imagePath) return null;
  return serverApiUrl(imagePath);
}

type Overrides = {
  /** Dinamik sayfalarda başlığı ez (örn. profil: "Ahmet — Oyuncu Profili"). */
  title?: string;
  description?: string;
  /** Canonical yolu ez (örn. /profil/ahmet). */
  path?: string;
  noindex?: boolean;
  /** Başlığa site adı eklenmesin (ana sayfa — başlık zaten site adını içerir). */
  absoluteTitle?: boolean;
  /** Başlığın önüne eklenir (örn. profil: "Ahmet — Oyuncu Profili"). */
  titlePrefix?: string;
};

/**
 * Sayfa metadata'sı üretir. Kullanım:
 *   export const generateMetadata = () => pageMetadata("arena");
 */
export async function pageMetadata(key: string, ov: Overrides = {}): Promise<Metadata> {
  const seo = await fetchSeo(key);
  const title = ov.title || (ov.titlePrefix ? `${ov.titlePrefix} — ${seo.title}` : seo.title);
  const description = ov.description || seo.description;
  const path = ov.path ?? seo.path;
  const url = `${SITE_URL}${path || ""}`;
  const image = absoluteImage(seo.image_path);
  const index = ov.noindex ? false : seo.indexable;

  return {
    title: ov.absoluteTitle ? { absolute: title } : title,
    description,
    keywords: seo.keywords.length ? seo.keywords : undefined,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      locale: "tr_TR",
      siteName: seo.site_name || SITE_NAME,
      images: image ? [{ url: image, width: 1200, height: 630, alt: title }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
    robots: { index, follow: index },
  };
}
