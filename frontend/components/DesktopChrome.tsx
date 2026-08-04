"use client";

import { usePathname } from "next/navigation";
import TopBar from "./TopBar";
import Footer from "./Footer";

// Masaüstünde maç ekranları HARİÇ her sayfada üst menü + footer gösterir.
// Mobilde CSS (.kt-desktop-chrome) ile gizli — mobilde alt nav kullanılıyor.
// Ana sayfa (/) kendi TopBar+Footer'ını render ettiği için burada hariç.
const HIDE_ON = ["/oyna", "/arena", "/solo", "/gunun-kelimesi", "/giris", "/yonetim"];

export default function DesktopChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const hidden = isHome || HIDE_ON.some((p) => pathname?.startsWith(p));

  if (hidden) return <>{children}</>;

  return (
    <>
      <div className="kt-desktop-chrome"><TopBar /></div>
      {children}
      <div className="kt-desktop-chrome"><Footer /></div>
    </>
  );
}
