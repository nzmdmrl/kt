import type { Metadata } from "next";
import { SITE_URL, serverApiUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  let host = "";
  let arenaName = "Özel Arena";
  try {
    const r = await fetch(serverApiUrl(`/api/arena/custom/${encodeURIComponent(params.code)}/public`), {
      cache: "no-store",
    });
    if (r.ok) {
      const d = await r.json();
      host = d.host || "";
      arenaName = d.name || arenaName;
    }
  } catch {}

  const title = host
    ? `${host} ile arenada kelime tahmini oyna`
    : "Arenada kelime tahmini oyna";
  const description = host
    ? `${host} seni "${arenaName}" arenasına davet etti. Hızlı kelime tahmin yarışına katıl!`
    : "Özel arenaya katıl, arkadaşlarınla hızlı kelime tahmin yarışı yap.";
  const url = `${SITE_URL}/arena/ozel/${params.code}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      locale: "tr_TR",
      siteName: "Kelime Tahmin",
    },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: false, follow: false },
  };
}

export default function OzelArenaCodeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
