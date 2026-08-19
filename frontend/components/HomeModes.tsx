"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAccountGate } from "@/lib/accountGate";
import { useIsoLayoutEffect } from "@/lib/useIsoLayoutEffect";
import AnimatedWordmark from "@/components/AnimatedWordmark";
import { HOME_BUTTON_DEFAULTS, type HomeButtons } from "@/lib/homeButtons";
import { avatarSrc } from "@/lib/avatar";

type LevelInfo = { level: number; xp: number; level_xp: number; level_need: number };
type TitleInfo = {
  title: string; title_icon?: string; title_progress: number;
  next_title: string | null; xp_to_next: number; xp?: number;
};

// Profil kartı verilerinin (seviye/unvan/maraton bölümü) yerel önbelleği.
// Sayfa açılışında ağ beklenmeden aynı içerik gösterilir, arka planda tazelenir.
function homeCacheKey(uid: number) { return `kt_home_${uid}`; }
function readHomeCache(uid: number): any {
  try { const raw = localStorage.getItem(homeCacheKey(uid)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function saveHomeCache(uid: number, patch: any) {
  try {
    const cur = readHomeCache(uid) || {};
    localStorage.setItem(homeCacheKey(uid), JSON.stringify({ ...cur, ...patch }));
  } catch {}
}

// Ana sayfa mod ekranı — desktop + mobil ortak. Sıralama: Arena/Özel Arena üstte,
// sonra 1v1 Düello bölümü, sonra Maraton/Günün Kelimesi/Lig.
//
// `style` = arayüz stili (admin → ⚙️ Ayarlar → "Arayüz stili"):
//   stil1 → klasik (eski) görünüm, stil2 → yeni görünüm.
// Sadece GÖRÜNÜM değişir; modlar/rotalar/veri her iki stilde de aynıdır.
export default function HomeModes({ style = "stil2", buttons }: {
  style?: "stil1" | "stil2";
  /** Admin → 🏠 Ana Sayfa: buton ikonları/renkleri. Verilmezse varsayılan tasarım. */
  buttons?: HomeButtons;
}) {
  // Buton görünümü: admin ayarı > koddaki varsayılan.
  const btn = (key: string) => ({ ...HOME_BUTTON_DEFAULTS[key], ...(buttons?.[key] || {}) });
  // `bg` boşsa inline stil verilmez -> globals.css'teki varsayılan renk kalır.
  const bgStyle = (key: string) => {
    const b = btn(key).bg;
    return b ? { background: b } : undefined;
  };
  // Arka plan (dekor) ikonu boşsa sol ikonun aynısı kullanılır.
  const decoIcon = (key: string) => btn(key).deco_icon || btn(key).icon;
  const { user, loading } = useAuth();
  // Hesap kapısı: hesapsız kişi bir oyuna tıkladığında isim popup'ı açılır,
  // adını yazınca hesap açılır ve tıkladığı oyun kaldığı yerden başlar.
  const { ensureAccount, openNamePrompt, autoPrompt } = useAccountGate();
  const router = useRouter();

  /** Oyun aç — hesap yoksa önce isim popup'ı. Lig gibi izleme sayfaları hariç. */
  function play(href: string) {
    ensureAccount(() => router.push(href));
  }
  const [lvl, setLvl] = useState<LevelInfo | null>(null);
  const [title, setTitle] = useState<TitleInfo | null>(null);
  const [soloLevel, setSoloLevel] = useState<number | null>(null);
  const [joinCode, setJoinCode] = useState("");
  // Kart alt satırları: günün kelimesini bugün kaç kişi çözdü + günlük lig sıram.
  const [dailySolved, setDailySolved] = useState<number | null>(null);
  const [dailyRank, setDailyRank] = useState<number | null>(null);

  function token() { return typeof window !== "undefined" ? localStorage.getItem("kt_token") : null; }

  // 1) Önbellekten anında doldur (ekran boyanmadan önce) — sıçrama olmaz.
  useIsoLayoutEffect(() => {
    if (!user) return;
    const c = readHomeCache(user.id);
    if (!c) return;
    if (c.lvl) setLvl(c.lvl);
    if (c.title) setTitle(c.title);
    if (c.soloLevel != null) setSoloLevel(c.soloLevel);
  }, [user?.id]);

  // 2) Arka planda tazele + önbelleği güncelle.
  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    fetch(apiUrl("/api/account/level"), { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then((d) => { setLvl(d); saveHomeCache(uid, { lvl: d }); }).catch(() => {});
    fetch(apiUrl("/api/solo/progress"), { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then((d) => {
        const sl = d.current_level ?? null;
        setSoloLevel(sl); saveHomeCache(uid, { soloLevel: sl });
      }).catch(() => {});
    if (user.username) {
      fetch(apiUrl(`/api/profile/${user.username}`), { headers: { Authorization: `Bearer ${token()}` } })
        .then((r) => r.json()).then((d) => {
          const t = d.title_info || null;
          setTitle(t); saveHomeCache(uid, { title: t });
        }).catch(() => {});
    }
  }, [user]);

  // İlk giriş: hesapsız ziyaretçiye isim popup'ı oturumda BİR KEZ kendiliğinden
  // açılır. Kişi kapatırsa bir daha kendiliğinden çıkmaz (bkz. lib/accountGate).
  useEffect(() => { autoPrompt(); }, [autoPrompt]);

  // 3) Günün kelimesi sayacı (herkese açık) + günlük lig sıram (girişliyse).
  useEffect(() => {
    fetch(apiUrl("/api/daily/stats?length=5"))
      .then((r) => r.json()).then((d) => setDailySolved(d.solved_count ?? 0)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!user) { setDailyRank(null); return; }
    fetch(apiUrl("/api/league/me?scope=daily"), { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then((d) => setDailyRank(d?.entry?.rank ?? null)).catch(() => setDailyRank(null));
  }, [user]);

  const avatar = avatarSrc(user?.avatar_url, user?.username || "guest");
  const level = lvl?.level ?? user?.level ?? 1;
  const pct = title?.title_progress ?? 0;   // backend 0-100 döner
  const profileHref = `/profil/${encodeURIComponent(user?.username || "")}`;
  const xp = title?.xp ?? lvl?.xp ?? 0;

  function joinRoom() {
    const c = joinCode.trim().toUpperCase();
    if (c.length < 4) return;
    play(`/oyna?join=${encodeURIComponent(c)}`);
  }

  // Üst modlar: Arena + Özel Arena + Maraton (1v1'in üstünde)
  const topModes = [
    { key: "arena", label: "Arena", href: "/arena", desc: "Çok kişili yarış" },
    { key: "custom_arena", label: "Özel Arena", href: "/arena/ozel", desc: "Arkadaşlarınla" },
    { key: "marathon", label: "Maraton", href: "/solo", desc: soloLevel != null ? `Bölüm ${soloLevel}` : "Bölüm bölüm ilerle" },
  ];
  // Alt modlar: Günün Kelimesi, Lig (başlıksız).
  // desc2: canlı veri satırı (aynı punto). Mobilde SADECE bu satır görünür,
  // üstteki sabit açıklama (desc) gizlenir — yer kazanmak için.
  const bottomModes = [
    {
      key: "daily", label: "Günün Kelimesi", href: "/gunun-kelimesi",
      desc: "Günlük bulmaca",
      desc2: dailySolved != null ? `Bugün ${dailySolved.toLocaleString("tr")} kişi çözdü` : "",
    },
    {
      key: "league", label: "Lig", href: "/lig",
      desc: "Sıralamalar",
      desc2: dailyRank ? `Günlük ${dailyRank}. sıradasın` : "1v1 maç yap, lige katıl",
    },
  ];

  const s2 = style === "stil2";
  // Stil 2'de kartların sağında, kart sınırıyla kırpılan büyük dekoratif ikon.
  const deco = (icon: string) => (s2 ? <span className="hm-deco" aria-hidden>{icon}</span> : null);

  return (
    <div className={`home-modes-wrap${s2 ? " hm-s2" : ""}`}>
      {/* Stil 2: animasyonlu KELİME TAHMİN kutu logosu.
          Boyut giriş durumundan bağımsız sabit — auth yüklenirken/yüklendikten
          sonra ölçü değişmesin, sayfa kaymasın. */}
      {s2 && (
        <div className="hm-wordmark">
          <AnimatedWordmark />
        </div>
      )}

      {/* Profil / karşılama kartı — puan, madalya, rozet sayılarıyla */}
      {user ? (
        <div className="hm-profile-wrap">
          {/* Avatar kartın dışında, solda — profile linkli.
              Seviye rozeti mobilde avatarın altında, masaüstünde isim satırında. */}
          <div className="hm-avatar-col">
            <a href={profileHref} className="hm-avatar-link" aria-label="Profilim">
              <img src={avatar} alt="" className="hm-avatar" />
            </a>
            <span className="hm-badge hm-badge--under">Lv {level}</span>
          </div>
          <div className="hm-profile">
            <div className="hm-name-row">
              <a href={profileHref} className="hm-name hm-name-link">{user.display_name || user.username}</a>
              <span className="hm-badge hm-badge--row">Lv {level}</span>
            </div>
            {/* Unvan gelişimi — XP'nin yanında unvan */}
            {!title ? (
              /* Unvan/XP verisi ilk kez yükleniyor — kart yüksekliği sabit kalsın */
              <div className="xp-progress hm-xp" aria-hidden="true">
                <div className="xp-row"><span className="hm-skel hm-skel-line" style={{ width: 200, height: 12 }} /></div>
                <div className="xp-track" />
              </div>
            ) : (
              <div className="xp-progress hm-xp">
                <div className="xp-row">
                  <span className="hm-xp-left">
                    <span className="xp-now">💎 {xp.toLocaleString("tr")} XP</span>
                    {title.title && <span className="hm-title">{title.title_icon || "🏅"} {title.title}</span>}
                  </span>
                  {title.next_title && (
                    <span className="xp-next">
                      {title.next_title} için {(title.xp_to_next ?? 0).toLocaleString("tr")} XP
                    </span>
                  )}
                </div>
                <div className="xp-track"><div className="xp-fill" style={{ width: `${pct}%` }} /></div>
              </div>
            )}
          </div>
        </div>
      ) : loading ? (
        /* Kullanıcı henüz bilinmiyor: misafir yazısı yerine profil kartı iskeleti
           (aynı yükseklik) — içerik gelince zıplama/flaş olmaz. */
        <div className="hm-profile-wrap" aria-hidden="true">
          {/* İskelet de aynı yerleşimi kurar (mobilde rozet avatarın altında) */}
          <div className="hm-avatar-col">
            <div className="hm-avatar hm-skel" />
            <span className="hm-skel hm-skel-line hm-badge--under" style={{ width: 46, height: 18, borderRadius: 20 }} />
          </div>
          <div className="hm-profile">
            <div className="hm-name-row">
              <span className="hm-skel hm-skel-line" style={{ width: 150, height: 20 }} />
              <span className="hm-skel hm-skel-line hm-badge--row" style={{ width: 46, height: 18, borderRadius: 20 }} />
            </div>
            <div className="xp-progress hm-xp">
              <div className="xp-row"><span className="hm-skel hm-skel-line" style={{ width: 200, height: 12 }} /></div>
              <div className="xp-track" />
            </div>
          </div>
        </div>
      ) : (
        <div className="hm-guest">
          {/* Stil 2'de site adını zaten animasyonlu kutu logosu gösteriyor */}
          {!s2 && <div className="brand-mono hm-guest-title">Kelime Tahmin</div>}
          {/* Hesap açmak artık tek isim yazmak: doğrudan popup'ı açar
              (giriş sayfasına gitmez — WebView'de tam sayfa geçişi sorunluydu). */}
          <button type="button" className="hm-guest-cta" onClick={() => openNamePrompt()}>
            <span className="hm-guest-cta-icon">👋</span>
            <span className="hm-guest-cta-text">
              <span className="hm-guest-cta-title">İsmini yaz, hemen oyna</span>
              <span className="hm-guest-cta-sub">Puanların, rozetlerin ilk maçtan itibaren kaydedilsin</span>
            </span>
            <span className="hm-guest-cta-arrow">→</span>
          </button>
        </div>
      )}

      {/* ARENA + ÖZEL ARENA (en üstte) */}
      <div className="hm-modes-grid hm-top-modes">
        {topModes.map((m) => (
          <button key={m.href} className="hm-mode" onClick={() => play(m.href)} style={bgStyle(m.key)}>
            <span className="hm-mode-icon">{btn(m.key).icon}</span>
            <span className="hm-mode-text">
              <span className="hm-mode-label">{m.label}</span>
              <span className="hm-mode-desc">{m.desc}</span>
            </span>
            {deco(decoIcon(m.key))}
          </button>
        ))}
      </div>

      {/* 1v1 DÜELLO BÖLÜMÜ */}
      <section className="hm-section">
        <h2 className="hm-h2">🎮 1v1 Düello</h2>

        <button className="hm-hero-btn" onClick={() => play("/oyna?mode=search")} style={bgStyle("duel")}>
          <span className="hm-hero-icon">{btn("duel").icon}</span>
          <span className="hm-hero-text">
            <span className="hm-hero-title">Oyna</span>
            <span className="hm-hero-sub">1v1 Düello · Rakip bul</span>
          </span>
          <span className="hm-hero-arrow">→</span>
          {deco(decoIcon("duel"))}
        </button>

        <div className="hm-1v1-grid">
          <button className="hm-tile hm-tile-bot" onClick={() => play("/oyna?mode=bot")} style={bgStyle("bot")}>
            <span className="hm-tile-icon">{btn("bot").icon}</span>
            <span className="hm-tile-label">1vB Pratik</span>
            <span className="hm-tile-desc">Bota karşı</span>
            {deco(decoIcon("bot"))}
          </button>
          <button className="hm-tile hm-tile-room" onClick={() => play("/oyna?mode=create")} style={bgStyle("room")}>
            <span className="hm-tile-icon">{btn("room").icon}</span>
            <span className="hm-tile-label">Özel Oda Kur</span>
            <span className="hm-tile-desc">Arkadaşını davet et</span>
            {deco(decoIcon("room"))}
          </button>
        </div>

        <div className="hm-join">
          <span className="hm-join-icon">🔑</span>
          <input
            className="hm-join-input"
            placeholder={s2 ? "ODA KODU" : "Oda kodu"}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && joinRoom()}
            maxLength={8}
          />
          <button className="hm-join-btn" onClick={joinRoom}>Katıl</button>
        </div>
      </section>

      {/* GÜNÜN KELİMESİ / LİG (başlıksız) */}
      <div className="hm-modes-grid hm-bottom-modes">
        {bottomModes.map((m) => (
          <button
            key={m.href}
            className="hm-mode"
            /* Lig bir oyun değil, sıralama tablosu — hesapsız da bakılabilir. */
            onClick={() => (m.key === "league" ? router.push(m.href) : play(m.href))}
            style={bgStyle(m.key)}
          >
            <span className="hm-mode-icon">{btn(m.key).icon}</span>
            <span className="hm-mode-text">
              <span className="hm-mode-label">{m.label}</span>
              <span className="hm-mode-desc hm-desc-static">{m.desc}</span>
              {m.desc2 && <span className="hm-mode-desc">{m.desc2}</span>}
            </span>
            {deco(decoIcon(m.key))}
          </button>
        ))}
      </div>
    </div>
  );
}
