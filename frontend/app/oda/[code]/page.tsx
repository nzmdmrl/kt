import type { Metadata } from "next";
import { SITE_URL, serverApiUrl } from "@/lib/site";
import RoomRedirect from "./RoomRedirect";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  let host = "";
  try {
    const r = await fetch(serverApiUrl(`/api/room/${encodeURIComponent(params.code)}`), { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      host = d.host_name || "";
    }
  } catch {}

  const title = host ? `${host} ile kelime tahmin oyna` : "Kelime tahmin oyna";
  const description = host
    ? `${host} seni 1v1 kelime tahmin düellosuna davet etti. Odaya katıl ve hemen başla!`
    : "Özel odada 1v1 kelime tahmin düellosuna katıl.";
  const url = `${SITE_URL}/oda/${params.code}`;

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

export default function OdaPage({ params }: { params: { code: string } }) {
  return <RoomRedirect code={params.code} />;
}
