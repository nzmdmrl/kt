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
  | "joker_yellow" | "joker_green" | "joker_time"
  | "music1" | "music2" | "music3" | "music4" | "music5" | "music6";

let audioCtx: AudioContext | null = null;
let uploadedSlots: Set<string> = new Set();
let soundEnabled = true;
let volume = 0.7;
const audioCache: Record<string, HTMLAudioElement> = {};

// Ses açık/kapalı durumu için dinleyiciler (UI senkronu) + localStorage kalıcılığı.
const soundListeners = new Set<(on: boolean) => void>();
export function isSoundEnabled(): boolean {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("kt_sound");
    if (saved !== null) soundEnabled = saved === "1";
  }
  return soundEnabled;
}
export function onSoundChange(fn: (on: boolean) => void): () => void {
  soundListeners.add(fn);
  return () => soundListeners.delete(fn);
}
export function toggleSound(): boolean {
  setSoundEnabled(!soundEnabled);
  return soundEnabled;
}

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
  // Kayıtlı tercih varsa onu kullan (kullanıcı daha önce kapatmışsa kapalı kalsın).
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("kt_sound");
    soundEnabled = saved !== null ? saved === "1" : enabled;
  } else {
    soundEnabled = enabled;
  }
  volume = Math.max(0, Math.min(1, vol / 100));
  try {
    const res = await fetch(apiUrl("/api/sounds"));
    const data = await res.json();
    uploadedSlots = new Set((data.slots || []).filter((s: any) => s.uploaded).map((s: any) => s.slot));
  } catch { uploadedSlots = new Set(); }
}

export function setSoundEnabled(v: boolean) {
  soundEnabled = v;
  if (typeof window !== "undefined") localStorage.setItem("kt_sound", v ? "1" : "0");
  if (!v) { stopMusic(); stopTicking(); stopRadar(); }
  soundListeners.forEach((fn) => fn(v));
}
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
    case "round_start":
      // Melodik, ferah bir açılış (yükselen üçlü + oktav dokunuşu).
      tone(587, 0.14, "sine", 0, 0.9);      // re
      tone(740, 0.14, "sine", 0.12, 0.9);   // fa#
      tone(880, 0.16, "sine", 0.24, 0.9);   // la
      tone(1175, 0.22, "sine", 0.38, 0.7);  // yüksek re (parlaklık)
      break;
    case "match_start":
      // Güçlü, coşkulu maç başlangıcı.
      tone(523, 0.16, "triangle", 0, 0.9);
      tone(659, 0.16, "triangle", 0.15, 0.9);
      tone(784, 0.16, "triangle", 0.3, 0.9);
      tone(1047, 0.3, "triangle", 0.45, 0.8);
      break;
    case "opponent_found":
      // Sıcak, davetkâr "bulundu" melodisi (yumuşak yükselen).
      tone(523, 0.12, "sine", 0, 0.9);      // do
      tone(659, 0.12, "sine", 0.1, 0.9);    // mi
      tone(784, 0.14, "sine", 0.2, 0.9);    // sol
      tone(1047, 0.2, "sine", 0.32, 0.75);  // yüksek do
      break;
    case "joker_green":
      // Parlak, olumlu "açılış" (yeşil harf).
      tone(659, 0.1, "sine", 0, 0.9); tone(988, 0.18, "sine", 0.1, 0.8); break;
    case "joker_yellow":
      // Orta tonlu, meraklı (sarı harf).
      tone(587, 0.1, "triangle", 0, 0.9); tone(740, 0.16, "triangle", 0.1, 0.8); break;
    case "joker_time":
      // "Zaman kazandın" — hafif yükselen çift nota.
      tone(523, 0.1, "sine", 0, 0.9); tone(659, 0.1, "sine", 0.1, 0.9); tone(880, 0.16, "sine", 0.2, 0.8); break;
    case "tick": {
      // Yumuşak tık. intensity 0..1 -> ses seviyesi ve hafif tizlik artar.
      const it = opts?.intensity ?? 0;
      // Yumuşak, alçak bir "tak": sine dalga, düşük frekans, yumuşak zarf.
      const c = ctx();
      if (!c) break;
      const now = c.currentTime;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = 330 + it * 200;  // 330Hz -> 530Hz (yumuşak aralık)
      const peak = volume * (0.04 + it * 0.5) * 0.5;  // kısıktan yükselene
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.015);  // yumuşak attack
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);  // yumuşak decay
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(now);
      osc.stop(now + 0.13);
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

// --- Geri sayım tık-tık motoru (kademeli: 20-10 çok kısık, 10 biraz, 5'ten yükselir) ---
let tickTimer: ReturnType<typeof setInterval> | null = null;
export function startTicking(getSecondsLeft: () => number) {
  stopTicking();
  tickTimer = setInterval(() => {
    const left = getSecondsLeft();
    if (left <= 0) { stopTicking(); return; }
    // Kademeli yoğunluk (intensity 0..1):
    //   > 10 sn : çok kısık (0.08)
    //   10-6 sn : hafif duyulur (0.2 -> 0.35)
    //   <= 5 sn : belirgin yükselir (0.5 -> 1.0)
    let intensity: number;
    if (left > 10) {
      intensity = 0.08;
    } else if (left > 5) {
      // 10sn:0.2 ... 6sn:0.35
      intensity = 0.2 + (10 - left) * 0.0375;
    } else {
      // 5sn:0.5 ... 1sn:1.0
      intensity = 0.5 + (5 - left) * 0.125;
    }
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
// --- Ana sayfa müziği (sadece yüklü mp3; sentetik yok) ---
let musicEl: HTMLAudioElement | null = null;

export function startMusic() {
  if (!soundEnabled) return;
  stopMusic();
  // Sadece yüklü müzik (mp3) varsa çal. Sentetik ambient YOK — admin mp3 yüklemezse
  // ana sayfada müzik olmaz (Nazım tercihi).
  const uploaded = ["music1", "music2", "music3", "music4", "music5", "music6"].filter((m) => uploadedSlots.has(m));
  if (uploaded.length > 0) {
    playRandomUploadedMusic(uploaded);
  }
}

function playRandomUploadedMusic(list: string[]) {
  const pick = list[Math.floor(Math.random() * list.length)];
  musicEl = new Audio(apiUrl(`/api/sounds/file/${pick}`));
  musicEl.volume = volume * 0.4;
  musicEl.onended = () => playRandomUploadedMusic(list); // bitince rastgele bir sonraki
  musicEl.play().catch(() => {});
}

export function stopMusic() {
  if (musicEl) { musicEl.pause(); musicEl.onended = null; musicEl = null; }
}
