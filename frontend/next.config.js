/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Coolify/Docker'da standalone çıktı imajı küçültür ve hızlandırır.
  output: "standalone",
};
module.exports = nextConfig;
