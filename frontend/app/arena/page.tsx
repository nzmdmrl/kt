"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useGuestAccess } from "@/lib/guestAccess";
import ArenaGame from "@/components/ArenaGame";
import GuestJoin from "@/components/GuestJoin";

export default function ArenaPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const access = useGuestAccess();
  // Misafir isim yazıp katıldıysa burada tutulur (üyelerde kullanılmaz).
  const [guestName, setGuestName] = useState<string | null>(null);

  if (loading || (!user && access === null)) {
    return <div style={{ display: "grid", placeItems: "center", minHeight: "70vh", color: "var(--text-soft)" }}>Yükleniyor…</div>;
  }

  // Misafir: admin ayarı açıksa isim yazıp katılır, kapalıysa üyelik ekranı.
  if (!user && !guestName) {
    return (
      <GuestJoin
        allowed={!!access?.arena}
        icon="🏟️"
        title="Arena"
        subtitle={access?.arena
          ? "5 kişilik hız yarışı. İsmini yaz, hemen katıl — yer varsa devam eden arenaya girersin, yoksa yeni arena açılır."
          : "Arena şu an sadece üyelere açık."}
        joinLabel="Misafir Olarak Katıl"
        onJoin={(n) => setGuestName(n)}
      />
    );
  }

  // Doğrudan eşleşme başlar (rakip arar).
  return <ArenaGame guestName={guestName ?? undefined} onExit={() => router.push("/")} />;
}
