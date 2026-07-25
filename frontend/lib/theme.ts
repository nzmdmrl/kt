"use client";

// Tema yönetimi: gündüz (light) / gece (dark).
// Mod: "auto" (cihaz saatine göre 07:00-19:00 gündüz), "dark", "light".
// localStorage("kt_theme") ile kalıcı. document.documentElement[data-theme] set edilir.

type ThemeMode = "auto" | "dark" | "light";
type Listener = (mode: ThemeMode, effective: "dark" | "light") => void;

const listeners = new Set<Listener>();

function isDaytime(): boolean {
  const h = new Date().getHours();
  return h >= 7 && h < 19; // 07:00–19:00 arası gündüz
}

export function getThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const v = localStorage.getItem("kt_theme");
  if (v === "light" || v === "dark" || v === "auto") return v;
  return "dark"; // varsayılan: mevcut gece modu
}

export function effectiveTheme(mode: ThemeMode = getThemeMode()): "dark" | "light" {
  if (mode === "auto") return isDaytime() ? "light" : "dark";
  return mode;
}

export function applyTheme(mode: ThemeMode = getThemeMode()): void {
  if (typeof document === "undefined") return;
  const eff = effectiveTheme(mode);
  if (eff === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

export function setThemeMode(mode: ThemeMode): void {
  if (typeof window !== "undefined") localStorage.setItem("kt_theme", mode);
  applyTheme(mode);
  const eff = effectiveTheme(mode);
  listeners.forEach((fn) => fn(mode, eff));
}

// Sıradaki modu döndürür (döngü: dark -> light -> auto -> dark).
export function cycleThemeMode(): ThemeMode {
  const cur = getThemeMode();
  const next: ThemeMode = cur === "dark" ? "light" : cur === "light" ? "auto" : "dark";
  setThemeMode(next);
  return next;
}

export function onThemeChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// auto modda cihaz saati ilerledikçe otomatik geçiş için periyodik kontrol.
if (typeof window !== "undefined") {
  setInterval(() => {
    if (getThemeMode() === "auto") applyTheme("auto");
  }, 60000); // dakikada bir
}
