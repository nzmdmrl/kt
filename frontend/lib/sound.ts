// Ses yöneticisi.
//
// Her ses "slot"u için: sunucuda yüklü mp3 varsa onu çalar, yoksa Web Audio API
// ile sentetik bir ses üretir. Böylece admin mp3 yüklemese bile her zaman ses olur.
//
// Ayarlar (sesEnabled, volume) admin panelden gelir; burada uygulanır.

import { apiUrl } from "./api";

type Slot = "button" | "correct" | "wrong" | "win" | "lose" | "round_start" | "music";

let audioCtx: AudioContext | null = null;
let uploadedSlots: Set<string> = new Set();
let soundEnabled = true;
let volume = 0.7;
const audioCache: Record<string, HTMLAudioElement> = {};

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

// Sunucudan hangi slotlarda yüklü ses var öğren + ayarları uygula.
export async function initSound(enabled: boolean, vol: number) {
  soundEnabled = enabled;
  volume = Math.max(0, Math.min(1, vol / 100));
  try {
    const res = await fetch(apiUrl("/api/sounds"));
    const data = await res.json();
    uploadedSlots = new Set((data.slots || []).filter((s: any) => s.uploaded).map((s: any) => s.slot));
  } catch {
    uploadedSlots = new Set();
  }
}

export function setSoundEnabled(v: boolean) { soundEnabled = v; }
export function setVolume(v: number) { volume = Math.max(0, Math.min(1, v / 100)); }

// Sentetik ses tonları (slot -> frekans/tip/süre).
function playSynth(slot: Slot) {
  const c = ctx();
  if (!c) return;
  const now = c.currentTime;

  const beep = (freq: number, dur: number, type: OscillatorType = "sine", delay = 0, vol = 1) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + delay);
    gain.gain.linearRampToValueAtTime(volume * vol * 0.3, now + delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now + delay);
    osc.stop(now + delay + dur);
  };

  switch (slot) {
    case "button":
      beep(600, 0.08, "triangle");
      break;
    case "correct":
      beep(523, 0.1, "sine", 0); beep(659, 0.1, "sine", 0.1); beep(784, 0.15, "sine", 0.2);
      break;
    case "wrong":
      beep(200, 0.2, "sawtooth");
      break;
    case "win":
      beep(523, 0.12, "sine", 0); beep(659, 0.12, "sine", 0.12);
      beep(784, 0.12, "sine", 0.24); beep(1047, 0.25, "sine", 0.36);
      break;
    case "lose":
      beep(400, 0.15, "sine", 0); beep(300, 0.15, "sine", 0.15); beep(200, 0.3, "sine", 0.3);
      break;
    case "round_start":
      beep(440, 0.1, "square", 0); beep(660, 0.12, "square", 0.1);
      break;
    default:
      break;
  }
}

// Bir sesi çal — yüklü mp3 varsa onu, yoksa sentetik.
export function playSound(slot: Slot) {
  if (!soundEnabled) return;
  if (uploadedSlots.has(slot)) {
    try {
      let el = audioCache[slot];
      if (!el) {
        el = new Audio(apiUrl(`/api/sounds/file/${slot}`));
        audioCache[slot] = el;
      }
      el.volume = volume;
      el.currentTime = 0;
      el.play().catch(() => playSynth(slot));
    } catch {
      playSynth(slot);
    }
  } else {
    playSynth(slot);
  }
}

// Arka plan müziği (yüklüyse) — döngüsel.
let musicEl: HTMLAudioElement | null = null;
export function startMusic() {
  if (!uploadedSlots.has("music")) return;
  if (!musicEl) {
    musicEl = new Audio(apiUrl("/api/sounds/file/music"));
    musicEl.loop = true;
    musicEl.volume = volume * 0.4;
  }
  musicEl.play().catch(() => {});
}
export function stopMusic() {
  if (musicEl) { musicEl.pause(); musicEl.currentTime = 0; }
}
