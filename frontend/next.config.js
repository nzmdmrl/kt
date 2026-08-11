/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Coolify/Docker'da standalone çıktı imajı küçültür ve hızlandırır.
  output: "standalone",
  // Tarayıcılar ve bazı botlar favicon'u doğrudan /favicon.ico adresinden ister
  // (<link rel="icon"> etiketine bakmadan). Admin panelinden yüklenen favicon
  // backend'de durduğu için isteği oraya yönlendiriyoruz.
  async rewrites() {
    const api = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");
    if (!api) return [];
    return [{ source: "/favicon.ico", destination: `${api}/api/seo/favicon.ico` }];
  },
};
module.exports = nextConfig;
