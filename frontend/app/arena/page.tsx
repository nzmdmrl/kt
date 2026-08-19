"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import ArenaGame from "@/components/ArenaGame";
import AccountRequired from "@/components/AccountRequired";

export default function ArenaPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ display: "grid", placeItems: "center", minHeight: "70vh", color: "var(--text-soft)" }}>Yükleniyor…</div>;
  }

  // Misafirlik kalktı: hesapsız kişiye isim popup'ı açılır, adını yazınca
  // hesabı açılır ve `user` dolduğu an bu ekran kendiliğinden arenaya döner.
  if (!user) {
    return (
      <AccountRequired
        icon="🏟️"
        title="Arena"
        subtitle="5 kişilik hız yarışı. İsmini yaz, hemen katıl — yer varsa devam eden arenaya girersin, yoksa yeni arena açılır."
      />
    );
  }

  // Doğrudan eşleşme başlar (rakip arar).
  return <ArenaGame onExit={() => router.push("/")} />;
}
