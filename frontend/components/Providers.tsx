"use client";

import { PlatformProvider } from "@/lib/platform";
import { AuthProvider } from "@/lib/auth";
import HeartbeatPinger from "@/components/HeartbeatPinger";
import ChallengeWatcher from "@/components/ChallengeWatcher";
import UiClickSound from "@/components/UiClickSound";
import NativeBootstrap from "@/components/NativeBootstrap";
import MicNoticeHost from "@/lib/micNotice";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    // Platform tespiti en dışta: alttaki tüm bileşenler web/native ayrımını görebilsin.
    <PlatformProvider>
      <AuthProvider>
        {/* Her sayfada çalışan global presence + maç teklifi izleyici */}
        <HeartbeatPinger />
        <ChallengeWatcher />
        {/* Maç dışındaki tüm sayfalarda buton tıklama sesi */}
        <UiClickSound />
        {/* Native kabuk: push + AdMob + geri tuşu. Tarayıcıda tamamen etkisiz. */}
        <NativeBootstrap />
        {/* Mikrofon ilk kullanıldığında çıkan bilgilendirme balonu (useSpeech tetikler) */}
        <MicNoticeHost />
        {children}
      </AuthProvider>
    </PlatformProvider>
  );
}
