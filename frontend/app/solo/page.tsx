"use client";

import { useState, useEffect, useRef } from "react";
import { useSectionMusic } from "@/lib/useSectionMusic";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import SoloGame from "@/components/SoloGame";

type Progress = { current_level: number; total_stars: number; levels: { level: number; stars: number }[] };

// Yol üstündeki dairelerin yatay konumu (zikzak) — level indeksine göre.
function xOffset(i: number): number {
  const pattern = [50, 72, 50, 28, 50, 72, 50, 28];
  return pattern[i % pattern.length];
}

export default function SoloPage() {
  const { user, loading } = useAuth();
  const [prog, setProg] = useState<Progress | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);

  // Solo modunda arka plan müziği (oyun oynanırken).
  useSectionMusic("solo", playing !== null);

  function token() { return typeof window !== "undefined" ? localStorage.getItem("kt_token") : null; }

  function loadProgress() {
    fetch(apiUrl("/api/solo/progress"), { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then(setProg)
      .catch(() => {});
  }

  useEffect(() => {
    if (user) loadProgress();
  }, [user]);

  // Harita görünürken (oyunda değilken) bulunduğun levele hizala.
  useEffect(() => {
    if (playing !== null || !prog) return;
    const t = setTimeout(() => {
      currentRef.current?.scrollIntoView({ behavior: "auto", block: "center" });
    }, 150);
    return () => clearTimeout(t);
  }, [playing, prog]);

  if (loading) return <Center>Yükleniyor…</Center>;
  if (!user) {
    return (
      <Center>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "var(--text-soft)", marginBottom: 16 }}>Maraton için giriş yapmalısın.</p>
          <a href="/giris" style={{ color: "var(--accent)", fontWeight: 700 }}>Giriş Yap →</a>
        </div>
      </Center>
    );
  }
  if (!prog) return <Center>Yükleniyor…</Center>;

  // Oyun ekranı açıksa onu göster.
  if (playing !== null) {
    return (
      <SoloGame
        key={playing}
        level={playing}
        onExit={() => { setPlaying(null); loadProgress(); }}
        onComplete={(_stars, next) => { loadProgress(); setPlaying(next); }}
      />
    );
  }

  const starsByLevel = new Map(prog.levels.map((l) => [l.level, l.stars]));
  // Gösterilecek level sayısı: açık level + birkaç kilitli (ileriyi göster).
  const shownCount = prog.current_level + 5;
  const levels = Array.from({ length: shownCount }, (_, i) => i + 1);

  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      {/* Üst bar */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center",
        justifyContent: "space-between", padding: "12px 16px",
        background: "var(--bg)", borderBottom: "1px solid var(--border-soft)",
      }}>
        <a href="/" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-soft)", borderRadius: "50%", width: 36, height: 36, display: "grid", placeItems: "center", textDecoration: "none", color: "var(--text-strong)", fontSize: 18 }}>←</a>
        <span className="brand-mono" style={{ fontSize: 18 }}>Maraton</span>
        <span className="brand-mono" style={{ fontSize: 16, color: "var(--accent)" }}>⭐ {prog.total_stars}</span>
      </div>

      {/* Yol haritası — aşağıdan yukarı (1 en altta) */}
      <div ref={scrollRef} style={{ position: "relative", padding: "40px 0 60px", maxWidth: 480, margin: "0 auto" }}>
        {/* En yüksek level en üstte olacak şekilde ters sırada diz */}
        {[...levels].reverse().map((lvl) => {
          const idx = lvl - 1;
          const stars = starsByLevel.get(lvl) ?? 0;
          const locked = lvl > prog.current_level;
          const isCurrent = lvl === prog.current_level;
          const left = xOffset(idx);
          return (
            <div key={lvl} ref={isCurrent ? currentRef : undefined} style={{ position: "relative", height: 120 }}>
              {/* Daire */}
              <button
                onClick={() => { if (!locked) setPlaying(lvl); }}
                disabled={locked}
                style={{
                  position: "absolute", left: `${left}%`, top: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 74, height: 74, borderRadius: "50%",
                  border: isCurrent ? "4px solid var(--accent)" : "3px solid #5a9fd4",
                  background: locked ? "#9a94ad" : isCurrent ? "linear-gradient(145deg,#3a7fc4,#2868a8)" : "#8fbce8",
                  color: locked ? "#d8d4e4" : "#fff",
                  cursor: locked ? "default" : "pointer",
                  fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26,
                  boxShadow: isCurrent ? "0 4px 16px rgba(58,127,196,.5)" : "0 2px 8px rgba(0,0,0,.2)",
                  display: "grid", placeItems: "center",
                }}
              >
                {lvl}
                {locked && <span style={{ position: "absolute", bottom: -6, fontSize: 16 }}>🔒</span>}
              </button>
              {/* Yıldızlar (tamamlanmış leveller) */}
              {!locked && stars > 0 && (
                <div style={{ position: "absolute", left: `${left}%`, top: "calc(50% + 40px)", transform: "translateX(-50%)", display: "flex", gap: 2 }}>
                  {[1, 2, 3].map((s) => (
                    <span key={s} style={{ fontSize: 15, filter: s <= stars ? "none" : "grayscale(1) opacity(0.3)" }}>⭐</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", placeItems: "center", minHeight: "70vh", color: "var(--text-soft)" }}>{children}</div>;
}
