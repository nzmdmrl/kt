"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import ArenaGame from "@/components/ArenaGame";
import Logo from "@/components/Logo";

export default function ArenaPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"menu" | "quick">("menu");

  if (loading) {
    return <div style={{ display: "grid", placeItems: "center", minHeight: "70vh", color: "var(--text-soft)" }}>Yükleniyor…</div>;
  }
  if (!user) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "70vh" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "var(--text-soft)", marginBottom: 16 }}>Arena için giriş yapmalısın.</p>
          <a href="/giris" style={{ color: "var(--accent)", fontWeight: 700 }}>Giriş Yap →</a>
        </div>
      </div>
    );
  }

  if (mode === "quick") {
    return <ArenaGame onExit={() => router.push("/")} />;
  }

  // Menü: Rakip Bul (normal) veya Özel Arena
  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "24px 18px 40px", minHeight: "70vh" }}>
      <div style={{ marginBottom: 16 }}><a href="/"><Logo size={32} /></a></div>
      <h1 className="brand-mono" style={{ fontSize: 28, marginBottom: 6, textAlign: "center" }}>⚔️ Arena</h1>
      <p style={{ color: "var(--text-soft)", textAlign: "center", marginBottom: 30 }}>5 kişilik kelime yarışı</p>

      <button onClick={() => setMode("quick")}
        style={{ width: "100%", padding: "22px 24px", borderRadius: 16, border: "none", background: "linear-gradient(145deg,#e0940a,#c47a00)", color: "#fff", cursor: "pointer", marginBottom: 14, textAlign: "left", boxShadow: "0 4px 16px rgba(224,148,10,.3)" }}>
        <div className="brand-mono" style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>🎯 Rakip Bul</div>
        <div style={{ fontSize: 14, opacity: 0.9 }}>Rastgele oyuncularla hızlı eşleşme</div>
      </button>

      <button onClick={() => router.push("/arena/ozel")}
        style={{ width: "100%", padding: "22px 24px", borderRadius: 16, border: "none", background: "linear-gradient(145deg,#7b52c4,#5e3a9e)", color: "#fff", cursor: "pointer", textAlign: "left", boxShadow: "0 4px 16px rgba(123,82,196,.3)" }}>
        <div className="brand-mono" style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>🎪 Özel Arena</div>
        <div style={{ fontSize: 14, opacity: 0.9 }}>Kendi arenanı kur, arkadaşlarını davet et</div>
      </button>
    </main>
  );
}
