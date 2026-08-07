"use client";

import { useEffect, useState, useMemo } from "react";
import { apiUrl } from "@/lib/api";
import { effectiveTheme } from "@/lib/theme";

// Tüm ekranların arkasında sabit (fixed) gökyüzü animasyonu.
// GECE modu: seçili tema (night/aurora/nebula/snow) — parlayan yıldızlar + ağır bulutlar.
// GÜNDÜZ modu: mavi gökyüzü + güneş + beyaz bulutlar (yıldız yok).
// Admin panelden açılıp kapatılır, gece teması seçilebilir.
export default function NightBackground() {
  const [enabled, setEnabled] = useState(false);
  const [theme, setTheme] = useState("night");
  const [isDay, setIsDay] = useState(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.getAttribute("data-theme") === "light";
  });

  useEffect(() => {
    let alive = true;
    fetch(apiUrl("/api/home/appearance"))
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setEnabled(!!d.night_bg_enabled);
        setTheme(d.night_bg_theme || "night");
        if (d.night_bg_enabled) document.documentElement.setAttribute("data-nightbg", "1");
        else document.documentElement.removeAttribute("data-nightbg");
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Gündüz/gece modunu izle (data-theme değişimini dinle).
  useEffect(() => {
    const update = () => { try { setIsDay(effectiveTheme() === "light"); } catch {} };
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  // Yıldızları bir kez üret (rastgele konum/boyut/parlama gecikmesi).
  const stars = useMemo(() => Array.from({ length: 70 }).map(() => ({
    left: Math.random() * 100,
    top: Math.random() * 100,
    size: Math.random() * 2 + 1,
    delay: Math.random() * 4,
    dur: 2.5 + Math.random() * 3,
  })), []);

  if (!enabled) return null;

  const themes: Record<string, { bg: string; star: string; cloud: string }> = {
    night:  { bg: "radial-gradient(ellipse at 50% -10%, #1a1640 0%, #0b0a1e 55%, #060512 100%)", star: "#ffffff", cloud: "rgba(120,110,180,.10)" },
    aurora: { bg: "radial-gradient(ellipse at 30% -10%, #10324a 0%, #0a1e2e 45%, #061018 100%)", star: "#dff6ff", cloud: "rgba(60,200,170,.10)" },
    nebula: { bg: "radial-gradient(ellipse at 60% -10%, #3a1650 0%, #1e0e33 50%, #0c0618 100%)", star: "#ffe6ff", cloud: "rgba(200,90,200,.10)" },
    snow:   { bg: "radial-gradient(ellipse at 50% -10%, #1c2740 0%, #12203a 50%, #0a1424 100%)", star: "#eaf2ff", cloud: "rgba(180,200,240,.12)" },
  };
  const t = themes[theme] || themes.night;

  // ---- GÜNDÜZ MODU: mavi gökyüzü + güneş + beyaz bulutlar ----
  if (isDay) {
    return (
      <div aria-hidden style={{
        position: "fixed", inset: 0, zIndex: -1, overflow: "hidden", pointerEvents: "none",
        background: "linear-gradient(180deg, #7fc4f5 0%, #aed9f7 45%, #dceffb 100%)",
      }}>
        {/* Güneş (sağ üstte, hafif parıldar) */}
        <div style={{
          position: "absolute", top: "8%", right: "12%", width: 90, height: 90, borderRadius: "50%",
          background: "radial-gradient(circle, #fff6c8 0%, #ffe375 55%, rgba(255,220,90,0) 72%)",
          boxShadow: "0 0 60px rgba(255,225,120,.7)",
          animation: "sunGlow 6s ease-in-out infinite",
        }} />
        {/* Beyaz bulutlar (ağır hareket) */}
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{
            position: "absolute", top: `${10 + i * 20}%`, left: "-45%",
            width: "55%", height: "22%", borderRadius: "50%",
            background: "rgba(255,255,255,.75)", filter: "blur(30px)",
            animation: `cloudDrift ${80 + i * 35}s linear ${i * -18}s infinite`,
          }} />
        ))}
        <style>{`
          @keyframes cloudDrift { from { transform: translateX(0); } to { transform: translateX(240%); } }
          @keyframes sunGlow { 0%,100% { transform: scale(1); opacity: .95; } 50% { transform: scale(1.06); opacity: 1; } }
        `}</style>
      </div>
    );
  }

  // ---- GECE MODU: seçili tema ----
  return (
    <div aria-hidden style={{
      position: "fixed", inset: 0, zIndex: -1, overflow: "hidden",
      background: t.bg, pointerEvents: "none",
    }}>
      {/* Ağır hareket eden bulutlar */}
      <div style={{ position: "absolute", inset: 0 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            position: "absolute", top: `${15 + i * 28}%`, left: "-40%",
            width: "60%", height: "40%", borderRadius: "50%",
            background: t.cloud, filter: "blur(60px)",
            animation: `cloudDrift ${90 + i * 40}s linear ${i * -20}s infinite`,
          }} />
        ))}
      </div>

      {/* Aurora teması için ışık perdesi */}
      {theme === "aurora" && (
        <div style={{
          position: "absolute", top: "-10%", left: "10%", width: "80%", height: "50%",
          background: "linear-gradient(120deg, rgba(60,220,160,.10), rgba(80,140,255,.08), rgba(160,90,255,.06))",
          filter: "blur(50px)", animation: "auroraWave 18s ease-in-out infinite",
        }} />
      )}

      {/* Parlayan yıldızlar */}
      {stars.map((s, i) => (
        <span key={i} style={{
          position: "absolute", left: `${s.left}%`, top: `${s.top}%`,
          width: s.size, height: s.size, borderRadius: "50%",
          background: t.star, boxShadow: `0 0 ${s.size * 2}px ${t.star}`,
          animation: `starTwinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
        }} />
      ))}

      {/* Snow teması için kar taneleri */}
      {theme === "snow" && Array.from({ length: 30 }).map((_, i) => (
        <span key={`snow-${i}`} style={{
          position: "absolute", top: "-5%", left: `${Math.random() * 100}%`,
          width: 3 + Math.random() * 3, height: 3 + Math.random() * 3, borderRadius: "50%",
          background: "rgba(255,255,255,.8)",
          animation: `snowFall ${8 + Math.random() * 8}s linear ${Math.random() * 8}s infinite`,
        }} />
      ))}

      <style>{`
        @keyframes starTwinkle {
          0%, 100% { opacity: .2; transform: scale(.8); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        @keyframes cloudDrift {
          from { transform: translateX(0); }
          to { transform: translateX(240%); }
        }
        @keyframes auroraWave {
          0%, 100% { transform: translateX(0) skewX(0deg); opacity: .7; }
          50% { transform: translateX(40px) skewX(-8deg); opacity: 1; }
        }
        @keyframes snowFall {
          from { transform: translateY(0) translateX(0); opacity: .9; }
          to { transform: translateY(105vh) translateX(30px); opacity: .3; }
        }
      `}</style>
    </div>
  );
}
