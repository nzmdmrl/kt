"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import ArenaGame from "@/components/ArenaGame";

export default function ArenaPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

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

  return <ArenaGame onExit={() => router.push("/")} />;
}
