"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/Logo";
import ShareButtons from "@/components/ShareButtons";
import LinkCopyBox from "@/components/LinkCopyBox";
import AccountRequired from "@/components/AccountRequired";
import { SITE_URL } from "@/lib/site";

import { FRIEND_LABELS, type Friend, type FriendLabelKey } from "@/lib/friendLabels";
type SavedArena = { id: number; name: string; size: number; wait_seconds: number; bots_enabled: boolean; word_plan: number[] };

export default function OzelArenaPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Ayarlar
  const [name, setName] = useState("Özel Arena");
  const [size, setSize] = useState(5);
  const [waitSeconds, setWaitSeconds] = useState(60);
  const [botsEnabled, setBotsEnabled] = useState(false);
  const [count4, setCount4] = useState(2);
  const [count5, setCount5] = useState(2);
  const [count6, setCount6] = useState(2);

  // Oluşturulan lobi
  const [created, setCreated] = useState<{ code: string; name: string } | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  // Davet listesi etiket süzgeci (aile / iş / diğer) — /arkadaslar sayfasından etiketlenir.
  const [labelFilter, setLabelFilter] = useState<"" | FriendLabelKey>("");
  const [invited, setInvited] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState<SavedArena[]>([]);

  function token() { return typeof window !== "undefined" ? localStorage.getItem("kt_token") : null; }

  useEffect(() => {
    if (!user) return;
    fetch(apiUrl("/api/friends"), { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then((d) => setFriends(d.friends || [])).catch(() => {});
    fetch(apiUrl("/api/arena/custom/mine"), { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then((d) => setSaved(d.arenas || [])).catch(() => {});
  }, [user]);

  async function deleteArena(id: number) {
    try {
      const r = await fetch(apiUrl(`/api/arena/custom/mine/${id}`), {
        method: "DELETE", headers: { Authorization: `Bearer ${token()}` },
      });
      if (r.ok) setSaved((list) => list.filter((x) => x.id !== id));
    } catch {}
  }

  const totalWords = count4 + count5 + count6;

  function buildPlan(): number[] {
    const plan: number[] = [];
    for (let i = 0; i < count4; i++) plan.push(4);
    for (let i = 0; i < count5; i++) plan.push(5);
    for (let i = 0; i < count6; i++) plan.push(6);
    return plan.slice(0, 6);
  }

  async function create(preset?: SavedArena) {
    const body = preset ? {
      name: preset.name, size: preset.size, wait_seconds: preset.wait_seconds,
      bots_enabled: preset.bots_enabled, word_plan: preset.word_plan,
    } : {
      name: name.trim() || "Özel Arena", size, wait_seconds: waitSeconds,
      bots_enabled: botsEnabled, word_plan: buildPlan(),
    };
    const r = await fetch(apiUrl("/api/arena/custom/create"), {
      method: "POST", headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const d = await r.json();
      setCreated({ code: d.code, name: d.name });
    }
  }

  async function invite(fid: number) {
    if (!created) return;
    const r = await fetch(apiUrl("/api/arena/custom/invite"), {
      method: "POST", headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ code: created.code, friend_ids: [fid] }),
    });
    if (r.ok) setInvited((s) => new Set(s).add(fid));
  }

  if (loading) return <Wrap><Center>Yükleniyor…</Center></Wrap>;
  if (!user) {
    // Arena kurmak + arkadaş davet etmek hesaba bağlı.
    return (
      <AccountRequired
        icon="🎪"
        title="Özel Arena Kur"
        subtitle="Arkadaşlarınla kendi arenanı kur, kodla davet et."
        note="Kurduğun arenalar hesabında saklanır; aynı ayarlarla tekrar açabilirsin."
      />
    );
  }

  // Lobi görünümü (oluşturulduktan sonra)
  if (created) {
    const origin = typeof window !== "undefined" ? window.location.origin : SITE_URL;
    const link = `${origin}/arena/ozel/${created.code}`;
    const shareTitle = `${user.display_name} ile arenada kelime tahmini oyna`;
    return (
      <Wrap>
        <h1 className="brand-mono" style={{ fontSize: 24, marginBottom: 6 }}>🎪 {created.name}</h1>
        <p style={{ color: "var(--text-soft)", marginBottom: 20 }}>Arena hazır! Arkadaşlarını davet et.</p>

        {/* Link */}
        <div style={{ display: "grid", gap: 8, marginBottom: 12, minWidth: 0 }}>
          <LinkCopyBox link={link} label="🔗 Arena linkini kopyala" />
        </div>

        {/* Sosyal medyada davet */}
        <div style={{ marginBottom: 18 }}>
          <ShareButtons url={link} title={shareTitle} label="Davet et" />
        </div>

        {/* Katıl — davetler gönderildikten sonra tek adımda arenaya girer.
            Bekleme geri sayımı bu butona basılınca başlar (sunucu tarafı). */}
        <div style={{
          border: "1px solid var(--accent)", borderRadius: 14, padding: 14,
          background: "var(--bg-panel)", marginBottom: 26,
        }}>
          <p style={{ color: "var(--text-soft)", fontSize: 13.5, lineHeight: 1.6, margin: "0 0 12px" }}>
            Yukarıdaki <strong style={{ color: "var(--text-strong)" }}>davet linkini kopyalayıp</strong> katılımcılara
            gönderdikten <strong style={{ color: "var(--text-strong)" }}>veya</strong> aşağıdaki listeden
            <strong style={{ color: "var(--text-strong)" }}> arkadaşlarını davet ettikten sonra</strong> “Arenaya
            Katıl”a dokun. Bekleme süresi ancak sen katılınca başlar; sensiz arena başlamaz.
          </p>
          <button
            onClick={() => router.push(`/arena/ozel/${created.code}?katil=1`)}
            style={{
              width: "100%", minWidth: 0, boxSizing: "border-box",
              padding: "17px", borderRadius: 12, border: "none",
              background: "var(--tile-correct)", color: "#fff", fontWeight: 800, fontSize: 18,
              cursor: "pointer", boxShadow: "0 6px 20px rgba(58,167,109,.35)", letterSpacing: "0.02em",
            }}
          >
            🎪 Arenaya Katıl
          </button>
        </div>

        {/* Arkadaş davet */}
        <h2 style={{ fontSize: 15, color: "var(--text-soft)", marginBottom: 10 }}>Arkadaşları davet et</h2>
        {friends.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <LabelChip active={labelFilter === ""} onClick={() => setLabelFilter("")} label={`Tümü (${friends.length})`} />
            {FRIEND_LABELS.map((l) => {
              const n = friends.filter((f) => f.label === l.key).length;
              if (n === 0) return null;
              return (
                <LabelChip
                  key={l.key}
                  active={labelFilter === l.key}
                  color={l.color}
                  onClick={() => setLabelFilter(labelFilter === l.key ? "" : l.key)}
                  label={`${l.icon} ${l.name} (${n})`}
                />
              );
            })}
            <a href="/arkadaslar" style={{ alignSelf: "center", fontSize: 12.5, color: "var(--text-dim)", textDecoration: "none" }}>etiketle →</a>
          </div>
        )}
        {friends.length === 0 ? (
          <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Henüz arkadaşın yok. Linki paylaşarak davet edebilirsin.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {friends.filter((f) => !labelFilter || f.label === labelFilter).map((f) => (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--bg-panel)", borderRadius: 10 }}>
                <img src={f.avatar_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(f.display_name)}`} alt="" style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--bg-elevated)" }} />
                <span style={{ flex: 1, minWidth: 0, color: "var(--text-strong)", fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.display_name}</span>
                  {f.label && (
                    <span style={{ fontSize: 11, flexShrink: 0 }}>
                      {FRIEND_LABELS.find((l) => l.key === f.label)?.icon}
                    </span>
                  )}
                </span>
                <button onClick={() => invite(f.id)} disabled={invited.has(f.id)}
                  style={{ padding: "7px 14px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700, cursor: invited.has(f.id) ? "default" : "pointer", background: invited.has(f.id) ? "var(--bg-elevated)" : "var(--accent)", color: invited.has(f.id) ? "var(--text-dim)" : "#1a1330" }}>
                  {invited.has(f.id) ? "✓ Davet edildi" : "Davet et"}
                </button>
              </div>
            ))}
          </div>
        )}
      </Wrap>
    );
  }

  // Oluşturma ekranı
  return (
    <Wrap>
      <button onClick={() => router.push("/arena")} style={{ background: "none", border: "none", color: "var(--text-soft)", cursor: "pointer", marginBottom: 12, fontSize: 14 }}>← Arena</button>
      <h1 className="brand-mono" style={{ fontSize: 24, marginBottom: 20 }}>🎪 Özel Arena Oluştur</h1>

      {/* İsim */}
      <Label>Arena adı</Label>
      <input value={name} onChange={(e) => setName(e.target.value.slice(0, 64))}
        style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border-soft)", background: "var(--bg-elevated)", color: "var(--text-strong)", fontSize: 16, marginBottom: 20 }} />

      {/* Kişi sayısı */}
      <Label>Kişi sayısı</Label>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setSize(n)} style={pill(size === n)}>{n} kişi</button>
        ))}
      </div>

      {/* Bekleme süresi */}
      <Label>Lobi bekleme süresi: {waitSeconds} sn</Label>
      <input type="range" min={10} max={120} step={10} value={waitSeconds} onChange={(e) => setWaitSeconds(Number(e.target.value))}
        style={{ width: "100%", marginBottom: 20, accentColor: "var(--accent)" }} />

      {/* Bot */}
      <Label>Bot</Label>
      <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
        <button onClick={() => setBotsEnabled(false)} style={pill(!botsEnabled)}>Kapalı</button>
        <button onClick={() => setBotsEnabled(true)} style={pill(botsEnabled)}>Açık</button>
      </div>
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 20 }}>
        {botsEnabled ? "Son 10 saniyede eksik yerler botlarla dolar." : "Bot yok. Süre dolunca gelen kişilerle başlar (en az 2)."}
      </p>

      {/* Kelime planı */}
      <Label>Kelimeler (toplam {totalWords}/6)</Label>
      <div style={{ display: "grid", gap: 10, marginBottom: 6 }}>
        <Counter label="4 harfli" value={count4} set={setCount4} disabledInc={totalWords >= 6} />
        <Counter label="5 harfli" value={count5} set={setCount5} disabledInc={totalWords >= 6} />
        <Counter label="6 harfli" value={count6} set={setCount6} disabledInc={totalWords >= 6} />
      </div>
      {totalWords === 0 && <p style={{ color: "var(--accent-hot)", fontSize: 12, marginBottom: 12 }}>En az 1 kelime seçmelisin.</p>}

      <button onClick={() => create()} disabled={totalWords === 0}
        style={{ width: "100%", padding: "15px", borderRadius: 12, border: "none", background: "var(--accent)", color: "#1a1330", fontWeight: 800, fontSize: 17, cursor: totalWords === 0 ? "default" : "pointer", opacity: totalWords === 0 ? 0.5 : 1, marginTop: 12 }}>
        Arena Oluştur
      </button>

      {/* Önceki arenalarım */}
      {saved.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 15, color: "var(--text-soft)", marginBottom: 10 }}>Önceki arenalarım</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {saved.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--bg-panel)", borderRadius: 10, overflow: "hidden" }}>
                <button onClick={() => create(s)} style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontSize: 22 }}>🎪</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "var(--text-strong)", fontWeight: 600 }}>{s.name}</div>
                    <div style={{ color: "var(--text-dim)", fontSize: 12 }}>
                      {s.size} kişi · {s.word_plan.length} kelime · {s.bots_enabled ? "botlu" : "botsuz"}
                    </div>
                  </div>
                  <span style={{ color: "var(--accent)", fontSize: 13, fontWeight: 700 }}>Tekrar →</span>
                </button>
                <button onClick={() => deleteArena(s.id)} title="Sil" style={{ padding: "12px 14px", background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: 16 }}>🗑️</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Wrap>
  );
}

function Counter({ label, value, set, disabledInc }: { label: string; value: number; set: (n: number) => void; disabledInc: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", background: "var(--bg-panel)", borderRadius: 10 }}>
      <span style={{ flex: 1, color: "var(--text-strong)" }}>{label}</span>
      <button onClick={() => set(Math.max(0, value - 1))} style={counterBtn}>−</button>
      <span className="brand-mono" style={{ width: 24, textAlign: "center", color: "var(--accent)" }}>{value}</span>
      <button onClick={() => !disabledInc && set(value + 1)} disabled={disabledInc} style={{ ...counterBtn, opacity: disabledInc ? 0.4 : 1 }}>+</button>
    </div>
  );
}

const counterBtn: React.CSSProperties = { width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--bg-elevated)", color: "var(--text-strong)", fontSize: 18, cursor: "pointer" };
function pill(active: boolean): React.CSSProperties {
  return { flex: 1, padding: "10px", borderRadius: 10, border: active ? "2px solid var(--accent)" : "1px solid var(--border-soft)", background: active ? "var(--accent-glow)" : "var(--bg-elevated)", color: active ? "var(--accent)" : "var(--text-soft)", fontWeight: 700, cursor: "pointer" };
}
function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-soft)", marginBottom: 8 }}>{children}</div>;
}
function LabelChip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px", borderRadius: 20, cursor: "pointer", fontSize: 12.5, fontWeight: 700,
        border: `1px solid ${active ? (color || "var(--accent)") : "var(--border-soft)"}`,
        background: active ? (color || "var(--accent)") : "var(--bg-panel)",
        color: active ? "#fff" : "var(--text-soft)",
      }}
    >{label}</button>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <main style={{ maxWidth: 520, margin: "0 auto", padding: "24px 18px 40px", minHeight: "60vh" }}><div style={{ marginBottom: 16 }}><a href="/"><Logo size={32} /></a></div>{children}</main>;
}
function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", placeItems: "center", minHeight: "40vh", color: "var(--text-soft)" }}>{children}</div>;
}
