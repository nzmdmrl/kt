"use client";

import { useEffect, useState, useRef } from "react";
import { apiUrl } from "@/lib/api";
import { isSoundEnabled } from "@/lib/sound";

// Yeni unvan kazanılınca: ekran kararır, konfeti patlar, unvan gösterilir, müzik çalar, 5sn sonra kapanır.
export default function TitleCelebration({ title, onClose }: {
  title: { name: string; icon: string } | null;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!title) return;
    setVisible(true);

    // Müzik (admin yüklediyse title_up slotu).
    if (isSoundEnabled()) {
      try {
        const a = new Audio(apiUrl("/api/sounds/file/title_up"));
        a.volume = 0.8;
        a.play().catch(() => {});
        audioRef.current = a;
      } catch {}
    }

    // 5 sn sonra kapan.
    const t = setTimeout(() => {
      setVisible(false);
      try { audioRef.current?.pause(); } catch {}
      setTimeout(onClose, 400); // fade-out sonrası
    }, 5000);

    return () => {
      clearTimeout(t);
      try { audioRef.current?.pause(); } catch {}
    };
  }, [title]);

  if (!title) return null;

  // Konfeti parçacıkları (rastgele renk/konum/gecikme).
  const colors = ["#e0940a", "#3fb950", "#c44a7e", "#4a8fc4", "#7b52c4", "#f0c419"];
  const confetti = Array.from({ length: 60 }).map((_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    dur: 2.2 + Math.random() * 1.5,
    color: colors[i % colors.length],
    size: 6 + Math.random() * 8,
    rot: Math.random() * 360,
  }));

  return (
    <div
      onClick={() => { setVisible(false); try { audioRef.current?.pause(); } catch {} setTimeout(onClose, 300); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,.82)",
        display: "grid", placeItems: "center",
        paddingBottom: "var(--kt-banner-space, 0px)",
        opacity: visible ? 1 : 0, transition: "opacity .4s ease",
        overflow: "hidden", cursor: "pointer",
      }}
    >
      {/* Konfeti */}
      {confetti.map((c, i) => (
        <span key={i} style={{
          position: "absolute", top: -20, left: `${c.left}%`,
          width: c.size, height: c.size * 0.6, background: c.color,
          borderRadius: 2, transform: `rotate(${c.rot}deg)`,
          animation: `confettiFall ${c.dur}s linear ${c.delay}s infinite`,
        }} />
      ))}

      {/* Unvan kartı */}
      <div style={{
        textAlign: "center", transform: visible ? "scale(1)" : "scale(0.7)",
        transition: "transform .5s cubic-bezier(.2,1.4,.4,1)", zIndex: 2,
      }}>
        <div style={{ fontSize: 15, color: "var(--accent)", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 12 }}>
          YENİ UNVAN!
        </div>
        <div style={{
          fontSize: 90, lineHeight: 1, marginBottom: 16,
          animation: "titlePop .6s cubic-bezier(.2,1.6,.4,1)",
          filter: "drop-shadow(0 0 24px rgba(224,148,10,.6))",
        }}>
          {title.icon}
        </div>
        <div className="brand-mono" style={{ fontSize: 40, color: "#fff", fontWeight: 800, textShadow: "0 2px 20px rgba(224,148,10,.5)" }}>
          {title.name}
        </div>
      </div>

      <style>{`
        @keyframes confettiFall {
          0% { top: -20px; opacity: 1; }
          100% { top: 105vh; opacity: 0.9; }
        }
        @keyframes titlePop {
          0% { transform: scale(0) rotate(-30deg); }
          60% { transform: scale(1.25) rotate(8deg); }
          100% { transform: scale(1) rotate(0); }
        }
      `}</style>
    </div>
  );
}
