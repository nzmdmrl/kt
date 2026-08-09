"use client";

import { AuthProvider } from "@/lib/auth";
import HeartbeatPinger from "@/components/HeartbeatPinger";
import ChallengeWatcher from "@/components/ChallengeWatcher";
import UiClickSound from "@/components/UiClickSound";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {/* Her sayfada çalışan global presence + maç teklifi izleyici */}
      <HeartbeatPinger />
      <ChallengeWatcher />
      {/* Maç dışındaki tüm sayfalarda buton tıklama sesi */}
      <UiClickSound />
      {children}
    </AuthProvider>
  );
}
