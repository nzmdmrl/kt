"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";

/** Davet linki (/oda/KOD) — oyun ekranına yönlendirir. */
export default function RoomRedirect({ code }: { code: string }) {
  const router = useRouter();
  const clean = (code || "").trim().toUpperCase();

  useEffect(() => {
    if (clean) router.replace(`/oyna?join=${encodeURIComponent(clean)}`);
  }, [clean, router]);

  return (
    <main style={{ maxWidth: 460, margin: "0 auto", padding: "40px 18px", display: "grid", gap: 18, justifyItems: "center" }}>
      <Logo size={40} />
      <div className="brand-mono" style={{ fontSize: 20, color: "var(--text-strong)" }}>Odaya bağlanılıyor…</div>
      <div className="brand-mono" style={{ fontSize: 30, letterSpacing: "0.2em", color: "var(--accent)" }}>{clean}</div>
      <a href={`/oyna?join=${encodeURIComponent(clean)}`} style={{ color: "var(--accent)", fontWeight: 700 }}>
        Odaya gir →
      </a>
    </main>
  );
}
