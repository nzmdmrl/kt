import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// /robots.txt — kişisel ve geçici sayfalar aramaya kapalı.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/yonetim", "/bildirimler", "/gecmis", "/menu", "/oda/", "/arena/ozel/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
