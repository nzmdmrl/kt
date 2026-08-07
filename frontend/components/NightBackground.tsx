"use client";

import { useEffect, useState, useMemo } from "react";
import { apiUrl } from "@/lib/api";

// Tüm ekranların arkasında sabit (fixed) gece animasyonu: parlayan yıldızlar,
// kayan yıldızlar, ağır hareket eden bulutlar. Admin panelden açılıp kapatılır,
// tema seçilebilir (night / aurora / nebula / snow).
export default function NightBackground() {
  const [enabled, setEnabled] = useState(false);
  const [theme, setTheme] = useState("night");

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

  // Yıldızları bir kez üret (rastgele konum/boyut/parlama gecikmesi).
  const stars = useMemo(() => Array.from({ length: 70 }).map(() => ({
    left: Math.random() * 100,
    top: Math.random() * 100,
    size: Math.random() * 2 + 1,
    delay: Math.random() * 4,
    dur: 2.5 + Math.random() * 3,
  })), []);

  // Kayan yıldızlar (birkaç tane, farklı zamanlarda).
  const shooting = useMemo(() => Array.from({ length: 3 }).map((_, i) => ({
    top: Math.random() * 40,
    left: 40 + Math.random() * 50,
    delay: i * 6 + Math.random() * 4,
    dur: 1.2 + Math.random() * 0.8,
  })), []);

  if (!enabled) return null;

  const themes: Record<string, { bg: string; star: string; cloud: string }> = {
    night:  { bg: "radial-gradient(ellipse at 50% -10%, #1a1640 0%, #0b0a1e 55%, #060512 100%)", star: "#ffffff", cloud: "rgba(120,110,180,.10)" },
    aurora: { bg: "radial-gradient(ellipse at 30% -10%, #10324a 0%, #0a1e2e 45%, #061018 100%)", star: "#dff6ff", cloud: "rgba(60,200,170,.10)" },
    nebula: { bg: "radial-gradient(ellipse at 60% -10%, #3a1650 0%, #1e0e33 50%, #0c0618 100%)", star: "#ffe6ff", cloud: "rgba(200,90,200,.10)" },
    snow:   { bg: "radial-gradient(ellipse at 50% -10%, #1c2740 0%, #12203a 50%, #0a1424 100%)", star: "#eaf2ff", cloud: "rgba(180,200,240,.12)" },
  };
  const t = themes[theme] || themes.night;

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

      {/* Kayan yıldızlar */}
      {shooting.map((s, i) => (
        <span key={`sh-${i}`} style={{
          position: "absolute", top: `${s.top}%`, left: `${s.left}%`,
          width: 2, height: 2, borderRadius: "50%", background: t.star,
          boxShadow: `0 0 6px ${t.star}`,
          animation: `shootingStar ${s.dur}s ease-in ${s.delay}s infinite`,
          opacity: 0,
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
        @keyframes shootingStar {
          0% { opacity: 0; transform: translate(0, 0) scaleX(1); }
          2% { opacity: 1; }
          12% { opacity: 1; transform: translate(-260px, 160px) scaleX(30); }
          16% { opacity: 0; transform: translate(-320px, 200px) scaleX(1); }
          100% { opacity: 0; }
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
