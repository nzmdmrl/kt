"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/Logo";
import ArenaGame from "@/components/ArenaGame";
import AccountRequired from "@/components/AccountRequired";
import { avatarSrc } from "@/lib/avatar";

type LobbyInfo = {
  code: string; name: string; size: number; wait_seconds: number; seconds_left: number;
  bots_enabled: boolean; word_plan: number[];
  players: { pid: string; name: string; avatar_url: string }[];
  started: boolean;
  /** Geri sayım kurucu arenaya katılınca başlar. */
  owner_joined?: boolean;
};

export default function OzelArenaLobbyPage({ params }: { params: { code: string } }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [info, setInfo] = useState<LobbyInfo | null>(null);
  const [err, setErr] = useState("");
  const [joined, setJoined] = useState(false);

  function token() { return typeof window !== "undefined" ? localStorage.getItem("kt_token") : null; }

  function loadInfo() {
    const t = token();
    fetch(apiUrl(`/api/arena/custom/${params.code}`), t ? { headers: { Authorization: `Bearer ${t}` } } : undefined)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setInfo)
      .catch(() => setErr("Arena bulunamadı veya süresi doldu."));
  }

  // Lobi bilgisi yalnız hesabı olan kişi için tazelenir.
  const canView = !!user;

  // Arenayı kuran, davet ekranındaki "Arenaya Katıl" butonuyla ?katil=1 ile
  // gelir — ara lobi adımı olmadan doğrudan arenaya girer (iki aşama kalktı).
  const [autoJoin, setAutoJoin] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("katil") === "1") setAutoJoin(true);
  }, []);
  useEffect(() => {
    if (autoJoin && canView && !joined) setJoined(true);
  }, [autoJoin, canView, joined]);
  useEffect(() => {
    if (!canView || joined) return;
    loadInfo();
    const t = setInterval(loadInfo, 3000);
    return () => clearInterval(t);
  }, [canView, params.code, joined]);

  if (loading) return <Wrap><Center>Yükleniyor…</Center></Wrap>;

  // Misafirlik kalktı: davet linkiyle gelen kişi de adını yazıp hesap açar.
  // Hesap açılınca `user` dolar ve sayfa kendiliğinden lobiye döner.
  if (!user) {
    return (
      <AccountRequired
        icon="🎪"
        title="Özel Arena"
        subtitle="Arkadaşının kurduğu arenaya katılmak üzeresin. İsmini yaz ve gir."
      />
    );
  }

  // Katıldıysa arena oyununu göster (özel kodla WS bağlanır).
  if (joined) {
    return <ArenaGame customCode={params.code} onExit={() => router.push("/")} />;
  }

  if (err) return <Wrap><Center>{err}</Center></Wrap>;
  if (!info) return <Wrap><Center>Arena yükleniyor…</Center></Wrap>;

  const planText = [4, 5, 6].map((L) => {
    const c = info.word_plan.filter((n) => n === L).length;
    return c > 0 ? `${c}×${L}h` : null;
  }).filter(Boolean).join(" · ");

  return (
    <Wrap>
      <h1 className="brand-mono" style={{ fontSize: 24, marginBottom: 4 }}>🎪 {info.name}</h1>
      <p style={{ color: "var(--text-soft)", marginBottom: 20 }}>
        {info.size} kişilik · {info.word_plan.length} kelime ({planText}) · {info.bots_enabled ? "botlu" : "botsuz"}
      </p>

      {/* Katılan oyuncular */}
      <h2 style={{ fontSize: 14, color: "var(--text-soft)", marginBottom: 10 }}>
        Katılanlar ({info.players.length}/{info.size})
      </h2>
      <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
        {info.players.map((p) => (
          <div key={p.pid} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--bg-panel)", borderRadius: 10 }}>
            <img src={avatarSrc(p.avatar_url, p.name)} alt="" style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--bg-elevated)" }} />
            <span style={{ color: "var(--text-strong)", fontWeight: 600, fontSize: 14 }}>{p.name}</span>
          </div>
        ))}
        {Array.from({ length: Math.max(0, info.size - info.players.length) }).map((_, i) => (
          <div key={`e${i}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--bg-panel)", borderRadius: 10, opacity: 0.4 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--bg-elevated)", display: "grid", placeItems: "center" }}>⏳</div>
            <span style={{ color: "var(--text-dim)", fontSize: 14 }}>Bekleniyor…</span>
          </div>
        ))}
      </div>

      <p style={{ color: "var(--text-dim)", fontSize: 13, textAlign: "center", marginBottom: 20 }}>
        {info.owner_joined === false
          ? "Arenayı kuran katılmadan yarış başlamaz — sen şimdiden katılabilirsin."
          : `Kalan süre: ${info.seconds_left} sn`}
      </p>

      {/* Katıl butonu — WS bağlantısı Parça 3'te tamamlanacak */}
      <button
        onClick={() => setJoined(true)}
        style={{ width: "100%", padding: "15px", borderRadius: 12, border: "none", background: "var(--tile-correct)", color: "#fff", fontWeight: 800, fontSize: 17, cursor: "pointer" }}>
        Arenaya Katıl
      </button>
      <p style={{ color: "var(--text-dim)", fontSize: 12, textAlign: "center", marginTop: 10 }}>
        Yeterli kişi toplanınca yarış otomatik başlar.
      </p>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <main style={{ maxWidth: 520, margin: "0 auto", padding: "24px 18px 40px", minHeight: "60vh" }}><div style={{ marginBottom: 16 }}><a href="/"><Logo size={32} /></a></div>{children}</main>;
}
function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", placeItems: "center", minHeight: "40vh", color: "var(--text-soft)" }}>{children}</div>;
}
