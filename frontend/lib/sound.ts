// Ses yöneticisi — sentetik ses üretimi + yüklü mp3 çalma + ambient müzik.
//
// Her "slot" için: sunucuda yüklü mp3 varsa onu çalar, yoksa Web Audio API ile
// sentetik ses üretir. Ayrıca ana sayfa için sentetik ambient müzik motoru,
// ve geri sayım için tık-tık (son 5 sn yükselen) sesi.

import { apiUrl } from "./api";

type Slot =
  | "button" | "tile_correct" | "tile_present" | "tile_absent"
  | "correct" | "wrong" | "win" | "lose" | "round_start" | "match_start"
  | "radar" | "opponent_found" | "tick"
  | "music1" | "music2" | "music3" | "music4" | "music5" | "music6";

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
    } catch { return null; }
  }
  // Tarayıcı politikası: kullanıcı etkileşimi sonrası resume gerekebilir.
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

export async function initSound(enabled: boolean, vol: number) {
  soundEnabled = enabled;
  volume = Math.max(0, Math.min(1, vol / 100));
  try {
    const res = await fetch(apiUrl("/api/sounds"));
    const data = await res.json();
    uploadedSlots = new Set((data.slots || []).filter((s: any) => s.uploaded).map((s: any) => s.slot));
  } catch { uploadedSlots = new Set(); }
}

export function setSoundEnabled(v: boolean) { soundEnabled = v; if (!v) stopMusic(); }
export function setVolume(v: number) { volume = Math.max(0, Math.min(1, v / 100)); }
export function isUploaded(slot: string) { return uploadedSlots.has(slot); }

// --- Sentetik ses tonları ---
function tone(freq: number, dur: number, type: OscillatorType = "sine", delay = 0, vol = 1) {
  const c = ctx();
  if (!c) return;
  const now = c.currentTime;
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
}

function playSynth(slot: Slot, opts?: { intensity?: number }) {
  switch (slot) {
    case "button": tone(600, 0.08, "triangle"); break;
    case "tile_correct": tone(700, 0.12, "sine"); break;       // yeşil — net, tiz
    case "tile_present": tone(480, 0.12, "triangle"); break;   // sarı — orta
    case "tile_absent": tone(240, 0.1, "sine"); break;         // gri — boğuk
    case "correct":
      tone(523, 0.1, "sine", 0); tone(659, 0.1, "sine", 0.1); tone(784, 0.15, "sine", 0.2); break;
    case "wrong": tone(200, 0.2, "sawtooth"); break;
    case "win":
      tone(523, 0.12, "sine", 0); tone(659, 0.12, "sine", 0.12);
      tone(784, 0.12, "sine", 0.24); tone(1047, 0.28, "sine", 0.36); break;
    case "lose":
      tone(400, 0.15, "sine", 0); tone(300, 0.15, "sine", 0.15); tone(200, 0.3, "sine", 0.3); break;
    case "round_start": tone(440, 0.1, "square", 0); tone(660, 0.12, "square", 0.1); break;
    case "match_start":
      tone(392, 0.15, "square", 0); tone(523, 0.15, "square", 0.15); tone(784, 0.25, "square", 0.3); break;
    case "opponent_found":
      tone(660, 0.1, "sine", 0); tone(880, 0.18, "sine", 0.1); break;
    case "tick": {
      // Geri sayım tık'ı. intensity 0..1 -> son saniyelerde daha yüksek/tiz.
      const it = opts?.intensity ?? 0;
      const freq = 800 + it * 600;
      tone(freq, 0.05, "square", 0, 0.5 + it * 1.5);
      break;
    }
    default: break;
  }
}

// --- Genel çalma (yüklü mp3 varsa onu, yoksa sentetik) ---
export function playSound(slot: Slot, opts?: { intensity?: number }) {
  if (!soundEnabled) return;
  if (uploadedSlots.has(slot)) {
    try {
      let el = audioCache[slot];
      if (!el) { el = new Audio(apiUrl(`/api/sounds/file/${slot}`)); audioCache[slot] = el; }
      el.volume = Math.min(1, volume * (opts?.intensity != null ? (0.4 + opts.intensity * 0.6) : 1));
      el.currentTime = 0;
      el.play().catch(() => playSynth(slot, opts));
    } catch { playSynth(slot, opts); }
  } else {
    playSynth(slot, opts);
  }
}

// --- Geri sayım tık-tık motoru (son 5 sn yükselen) ---
let tickTimer: ReturnType<typeof setInterval> | null = null;
export function startTicking(getSecondsLeft: () => number) {
  stopTicking();
  tickTimer = setInterval(() => {
    const left = getSecondsLeft();
    if (left <= 0) { stopTicking(); return; }
    // Son 5 saniyede yoğunluk (intensity) 0.4'ten 1'e yükselir; öncesinde düşük.
    let intensity = 0.15;
    if (left <= 5) intensity = 1 - (left - 1) / 5;  // 5sn:0.2 ... 1sn:1.0
    playSound("tick", { intensity });
  }, 1000);
}
export function stopTicking() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}

// --- Radar (rakip aranıyor) döngüsü ---
let radarTimer: ReturnType<typeof setInterval> | null = null;
export function startRadar() {
  stopRadar();
  if (!soundEnabled) return;
  if (uploadedSlots.has("radar")) { playSound("radar"); radarTimer = setInterval(() => playSound("radar"), 2000); return; }
  // Sentetik radar: periyodik yükselen "biip".
  const beep = () => { tone(900, 0.12, "sine", 0, 0.6); tone(1200, 0.08, "sine", 0.12, 0.4); };
  beep();
  radarTimer = setInterval(beep, 1500);
}
export function stopRadar() {
  if (radarTimer) { clearInterval(radarTimer); radarTimer = null; }
}

// --- Ana sayfa ambient müziği (sentetik) veya yüklü müzikler (random) ---
let musicEl: HTMLAudioElement | null = null;
let ambientNodes: { osc: OscillatorNode; gain: GainNode }[] = [];
let ambientTimer: ReturnType<typeof setTimeout> | null = null;

export function startMusic() {
  if (!soundEnabled) return;
  stopMusic();
  // Yüklü müzikleri topla (music1..music6).
  const uploaded = ["music1", "music2", "music3", "music4", "music5", "music6"].filter((m) => uploadedSlots.has(m));
  if (uploaded.length > 0) {
    playRandomUploadedMusic(uploaded);
  } else {
    startSyntheticAmbient();
  }
}

function playRandomUploadedMusic(list: string[]) {
  const pick = list[Math.floor(Math.random() * list.length)];
  musicEl = new Audio(apiUrl(`/api/sounds/file/${pick}`));
  musicEl.volume = volume * 0.4;
  musicEl.onended = () => playRandomUploadedMusic(list); // bitince rastgele bir sonraki
  musicEl.play().catch(() => {});
}

// Sentetik ambient: yumuşak, döngüsel akorlar. 6 varyasyon (rastgele).
function startSyntheticAmbient() {
  const c = ctx();
  if (!c) return;
  const chords = [
    [220, 277, 330], [196, 247, 294], [262, 330, 392], [175, 220, 262],
    [233, 294, 349], [208, 262, 311],
  ];
  const variant = Math.floor(Math.random() * chords.length);
  const notes = chords[variant];
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(volume * 0.05, c.currentTime + 2 + i);
    // Yumuşak dalgalanma (LFO benzeri).
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 0.1 + i * 0.03;
    lfoGain.gain.value = volume * 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    lfo.start();
    ambientNodes.push({ osc, gain });
    ambientNodes.push({ osc: lfo as any, gain: lfoGain });
  });
  // Her 30 saniyede bir varyasyon değiştir (yeni "parça" hissi).
  ambientTimer = setTimeout(() => { stopMusic(); startSyntheticAmbient(); }, 30000);
}

export function stopMusic() {
  if (musicEl) { musicEl.pause(); musicEl.onended = null; musicEl = null; }
  if (ambientTimer) { clearTimeout(ambientTimer); ambientTimer = null; }
  const c = audioCtx;
  ambientNodes.forEach((n) => {
    try {
      if (c) n.gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.5);
      setTimeout(() => { try { n.osc.stop(); } catch {} }, 600);
    } catch {}
  });
  ambientNodes = [];
}
