"use client";

import { useEffect, useRef } from "react";
import { apiUrl } from "@/lib/api";
import { isSoundEnabled } from "@/lib/sound";

type Track = { id: number; name: string };

// Bir bölümün müzik havuzundan rastgele mp3 çalar; biterken fade-out ile
// sıradaki rastgele parçaya geçer. enabled false olunca durur.
// Ses açık (isSoundEnabled) değilse hiç çalmaz.
export function useSectionMusic(section: string, enabled: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tracksRef = useRef<Track[]>([]);
  const volumeRef = useRef<number>(0.5);
  const lastIdxRef = useRef<number>(-1);
  const stopRef = useRef(false);

  useEffect(() => {
    stopRef.current = false;

    async function start() {
      if (!enabled || !isSoundEnabled()) return;
      try {
        const r = await fetch(apiUrl(`/api/music/${section}`));
        const d = await r.json();
        tracksRef.current = d.tracks || [];
        volumeRef.current = Math.max(0, Math.min(1, (d.volume ?? 50) / 100));
      } catch { return; }
      if (!tracksRef.current.length || stopRef.current) return;
      playNext();
    }

    function pickIndex(): number {
      const n = tracksRef.current.length;
      if (n === 1) return 0;
      let idx = Math.floor(Math.random() * n);
      // aynı parçayı üst üste çalma
      if (idx === lastIdxRef.current) idx = (idx + 1) % n;
      return idx;
    }

    function playNext() {
      if (stopRef.current || !tracksRef.current.length || !isSoundEnabled()) return;
      const idx = pickIndex();
      lastIdxRef.current = idx;
      const track = tracksRef.current[idx];
      const a = new Audio(apiUrl(`/api/music/file/${track.id}`));
      a.volume = 0;
      audioRef.current = a;

      // Fade-in
      const target = volumeRef.current;
      let v = 0;
      const fadeIn = setInterval(() => {
        v = Math.min(target, v + target / 15);
        a.volume = v;
        if (v >= target) clearInterval(fadeIn);
      }, 60);

      // Bitmeden ~2.5sn önce fade-out başlat, sonra sıradakine geç
      a.addEventListener("timeupdate", function onTime() {
        if (a.duration && a.currentTime > a.duration - 2.5) {
          a.removeEventListener("timeupdate", onTime);
          const fadeOut = setInterval(() => {
            a.volume = Math.max(0, a.volume - target / 20);
            if (a.volume <= 0.01) { clearInterval(fadeOut); a.pause(); }
          }, 100);
        }
      });
      a.addEventListener("ended", () => { if (!stopRef.current) playNext(); });
      a.play().catch(() => {});
    }

    start();

    return () => {
      stopRef.current = true;
      const a = audioRef.current;
      if (a) {
        // fade-out ederek durdur
        const fo = setInterval(() => {
          a.volume = Math.max(0, a.volume - 0.1);
          if (a.volume <= 0.01) { clearInterval(fo); a.pause(); }
        }, 50);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, enabled]);
}
