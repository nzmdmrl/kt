"use client";

import { useEffect, useLayoutEffect } from "react";

// SSR'da uyarı vermeyen layout effect. Tarayıcıda useLayoutEffect (boyamadan ÖNCE
// çalışır -> önbellekten gelen içerik "pat" diye görünür), sunucuda useEffect.
export const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
