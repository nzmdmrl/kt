"use client";

import { PlatformProvider } from "@/lib/platform";
import { AuthProvider } from "@/lib/auth";
import HeartbeatPinger from "@/components/HeartbeatPinger";
import ChallengeWatcher from "@/components/ChallengeWatcher";
import ArenaCallWatcher from "@/components/ArenaCallWatcher";
import UiClickSound from "@/components/UiClickSound";
import NativeBootstrap from "@/components/NativeBootstrap";
import MicNoticeHost from "@/lib/micNotice";
import { AccountGateProvider } from "@/lib/accountGate";
import VisitPing from "@/components/VisitPing";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    // Platform tespiti en dışta: alttaki tüm bileşenler web/native ayrımını görebilsin.
    <PlatformProvider>
      <AuthProvider>
        {/* Hesap kapısı: "isimle hesap aç" popup'ını her sayfadan açılabilir kılar.
            AuthProvider'ın İÇİNDE olmalı — useAuth'a bakar. */}
        <AccountGateProvider>
        {/* Oturum başına bir kez ziyaret sinyali (admin özet sayıları) */}
        <VisitPing />
        {/* Her sayfada çalışan global presence + maç teklifi izleyici */}
        <HeartbeatPinger />
        <ChallengeWatcher />
        {/* Arenaya anlık davet popup'ı — sadece oyun dışı sayfalarda */}
        <ArenaCallWatcher />
        {/* Maç dışındaki tüm sayfalarda buton tıklama sesi */}
        <UiClickSound />
        {/* Native kabuk: push + AdMob + geri tuşu. Tarayıcıda tamamen etkisiz. */}
        <NativeBootstrap />
        {/* Mikrofon ilk kullanıldığında çıkan bilgilendirme balonu (useSpeech tetikler) */}
        <MicNoticeHost />
        {children}
        </AccountGateProvider>
      </AuthProvider>
    </PlatformProvider>
  );
}
