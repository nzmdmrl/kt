"use client";

/**
 * Bildirim tercihleri.
 *
 * ÖNEMLİ: Buradaki anahtarlar SADECE push bildirimlerini etkiler. Uygulama içi
 * bildirim satırları (🔔 Bildirimler sayfası) her hâlükârda oluşmaya devam eder.
 *
 * Katalog backend'den gelir (GET /api/notification-types) — pasif türler zaten
 * dönmediği için burada ekstra filtre yok. Değişiklikler 600 ms geciktirilerek
 * (debounce) tek PUT ile kaydedilir.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/Logo";
import { currentWebPushStatus, enableWebPush, type WebPushStatus } from "@/lib/webpush";

type NType = {
  code: string;
  label: string;
  description: string;
  default_enabled: boolean;
  user_editable: boolean;
  enabled: boolean;
};
type NGroup = { code: string; label: string; types: NType[] };
type Device = { id: number; platform: string; device_label: string; last_seen_at: string | null };
type PushSettings = {
  push_master: boolean;
  quiet_start: number | null;
  quiet_end: number | null;
  delivery_mode: string;
};

const SAVE_DELAY = 600;

// Sessiz saat varsayılanı — backend'deki DEFAULT_QUIET_START/END ile aynı olmalı
// (backend/app/api/routes/notification_prefs.py).
const DEFAULT_QUIET_START = 0;
const DEFAULT_QUIET_END = 8;

function token() {
  return typeof window !== "undefined" ? localStorage.getItem("kt_token") : null;
}
function authHeaders(): HeadersInit {
  const t = token();
  return t
    ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

export default function BildirimAyarlariPage() {
  const { user, loading } = useAuth();
  const [groups, setGroups] = useState<NGroup[]>([]);
  const [settings, setSettings] = useState<PushSettings | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  // --- bu tarayıcı + kayıtlı cihazlar ---
  // Durum SADECE mount'ta okunur (izin kutusu AÇMAZ); açma işlemi tıklamayla olur.
  const [pushStatus, setPushStatus] = useState<WebPushStatus | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNote, setPushNote] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);

  const loadDevices = useCallback(() => {
    fetch(apiUrl("/api/devices"), { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setDevices(d.devices || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    setPushStatus(currentWebPushStatus());
    loadDevices();
  }, [user, loadDevices]);

  async function turnOnPush() {
    setPushBusy(true);
    setPushNote("");
    const r = await enableWebPush();          // <- yalnızca bu tıklamadan çağrılır
    setPushBusy(false);
    setPushStatus(r.status === "ok" ? "ok" : r.status);
    setPushNote(r.message || "");
    if (r.status === "ok") loadDevices();
  }

  async function removeDevice(id: number) {
    await fetch(apiUrl(`/api/devices/${id}`), { method: "DELETE", headers: authHeaders() }).catch(() => {});
    loadDevices();
  }

  // Bekleyen değişiklikler — debounce süresi dolunca tek PUT olarak gider.
  const pendingPrefs = useRef<Record<string, boolean>>({});
  const pendingSettings = useRef<Partial<PushSettings>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      fetch(apiUrl("/api/notification-types"), { headers: authHeaders() }).then((r) => r.json()),
      fetch(apiUrl("/api/me/push-preferences"), { headers: authHeaders() }).then((r) => r.json()),
    ])
      .then(([cat, pref]) => {
        setGroups(cat?.groups || []);
        setSettings({
          push_master: pref?.push_master !== false,
          quiet_start: pref?.quiet_start ?? null,
          quiet_end: pref?.quiet_end ?? null,
          delivery_mode: pref?.delivery_mode || "prefer_native",
        });
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [user]);

  const flush = useCallback(async () => {
    const prefs = pendingPrefs.current;
    const setts = pendingSettings.current;
    pendingPrefs.current = {};
    pendingSettings.current = {};
    if (!Object.keys(prefs).length && !Object.keys(setts).length) return;
    setSaving(true);
    await fetch(apiUrl("/api/me/push-preferences"), {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ prefs, ...setts }),
    }).catch(() => {});
    setSaving(false);
  }, []);

  function schedule() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  }

  // Sayfadan ayrılırken bekleyen değişiklik varsa kaybolmasın.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      flush();
    };
  }, [flush]);

  function toggleType(code: string, value: boolean) {
    setGroups((gs) =>
      gs.map((g) => ({
        ...g,
        types: g.types.map((t) => (t.code === code ? { ...t, enabled: value } : t)),
      }))
    );
    pendingPrefs.current[code] = value;
    schedule();
  }

  function patchSettings(patch: Partial<PushSettings>) {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    pendingSettings.current = { ...pendingSettings.current, ...patch };
    schedule();
  }

  if (loading) return <Wrap><Center>Yükleniyor…</Center></Wrap>;
  if (!user)
    return (
      <Wrap>
        <Center>
          <a href="/giris" style={{ color: "var(--accent)" }}>Giriş yap →</a>
        </Center>
      </Wrap>
    );

  const master = settings?.push_master !== false;
  // Sessiz saat "açık" = iki uç da dolu. Kapatınca ikisi birden NULL yazılır.
  const quietOn = settings?.quiet_start != null && settings?.quiet_end != null;

  return (
    <Wrap>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <a href="/bildirimler" style={{ color: "var(--text-dim)", fontSize: 22, textDecoration: "none" }}>←</a>
        <h1 className="brand-mono" style={{ fontSize: 24, margin: 0 }}>🔔 Bildirim Ayarları</h1>
      </div>
      <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 22, lineHeight: 1.5 }}>
        Bu ayarlar yalnızca telefonuna gelen <strong>push bildirimlerini</strong> etkiler.
        Uygulama içindeki 🔔 Bildirimler listesi her zaman dolmaya devam eder.
      </p>

      {/* Bu tarayıcıda bildirim (gerçek izin durumu) */}
      <BrowserPushRow
        status={pushStatus}
        busy={pushBusy}
        note={pushNote}
        onEnable={turnOnPush}
      />

      {/* Kayıtlı cihazlar */}
      {devices.length > 0 && (
        <section style={{ marginTop: 18 }}>
          <div style={sectionTitle}>Cihazlarım</div>
          <div style={{ display: "grid", gap: 8 }}>
            {devices.map((d) => (
              <div key={d.id} style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 12 }}>
                <span style={iconBox}>{d.platform === "web" ? "💻" : d.platform === "ios" ? "📱" : "🤖"}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600, fontSize: 14, color: "var(--text-strong)" }}>
                    {d.device_label || (d.platform === "web" ? "Tarayıcı" : "Uygulama")}
                  </span>
                  <span style={{ display: "block", color: "var(--text-dim)", fontSize: 12, marginTop: 2 }}>
                    Son görülme: {formatSeen(d.last_seen_at)}
                  </span>
                </span>
                <button onClick={() => removeDevice(d.id)} title="Bu cihazı çıkar" style={{
                  padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border-soft)",
                  background: "var(--bg-elevated)", color: "var(--accent-hot)",
                  fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
                }}>Çıkar</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Gönderim tercihi */}
      <section style={{ marginTop: 18 }}>
        <div style={sectionTitle}>Gönderim</div>
        <div style={{ ...cardStyle, opacity: master ? 1 : 0.5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={iconBox}>📮</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 600, fontSize: 15, color: "var(--text-strong)" }}>
                Bildirim nereye gelsin?
              </span>
              <span style={{ display: "block", color: "var(--text-dim)", fontSize: 12.5, marginTop: 3, lineHeight: 1.4 }}>
                Birden fazla cihazın varsa geçerli olur
              </span>
            </span>
          </div>
          <select
            value={settings?.delivery_mode === "all" ? "all" : "prefer_native"}
            disabled={!master}
            onChange={(e) => patchSettings({ delivery_mode: e.target.value })}
            style={{
              marginTop: 10, marginLeft: 48, padding: "8px 10px", borderRadius: 9,
              border: "1px solid var(--border-soft)", background: "var(--bg-elevated)",
              color: "var(--text-strong)", fontSize: 14, cursor: master ? "pointer" : "default",
              maxWidth: "calc(100% - 48px)",
            }}
          >
            <option value="all">Tüm cihazlara</option>
            <option value="prefer_native">Uygulama kuruluysa sadece uygulamaya</option>
          </select>
        </div>
      </section>

      <div style={{ height: 18 }} />

      {/* Ana anahtar */}
      <ToggleRow
        icon="📣"
        label="Push bildirimleri"
        hint={master ? "Açık — seçtiğin türler gönderilir" : "Kapalı — hiçbir push gönderilmez"}
        on={master}
        onChange={(v) => patchSettings({ push_master: v })}
      />

      {/* Sessiz saatler — kapatınca İKİ sütun da NULL olur */}
      <div style={{ ...cardStyle, marginTop: 10, opacity: master ? 1 : 0.5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={iconBox}>🌙</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 600, fontSize: 15, color: "var(--text-strong)" }}>
              Sessiz saatler
            </span>
            <span style={{ display: "block", color: "var(--text-dim)", fontSize: 12.5, marginTop: 3, lineHeight: 1.4 }}>
              Bu aralıkta bildirim gönderilmez
            </span>
          </span>
          <Switch
            on={quietOn}
            disabled={!master}
            onChange={(v) =>
              patchSettings(
                v
                  ? { quiet_start: DEFAULT_QUIET_START, quiet_end: DEFAULT_QUIET_END }
                  : { quiet_start: null, quiet_end: null }
              )
            }
          />
        </div>
        {quietOn ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 48, marginTop: 12, flexWrap: "wrap" }}>
            <HourSelect
              value={settings?.quiet_start ?? DEFAULT_QUIET_START}
              disabled={!master}
              onChange={(v) => patchSettings({ quiet_start: v })}
            />
            <span style={{ color: "var(--text-dim)", fontSize: 13 }}>→</span>
            <HourSelect
              value={settings?.quiet_end ?? DEFAULT_QUIET_END}
              disabled={!master}
              onChange={(v) => patchSettings({ quiet_end: v })}
            />
          </div>
        ) : (
          <div style={{ marginLeft: 48, marginTop: 8, color: "var(--text-dim)", fontSize: 13 }}>Kapalı</div>
        )}
      </div>

      {/* Tür grupları */}
      {!ready ? (
        <p style={{ color: "var(--text-dim)", textAlign: "center", padding: 30 }}>Yükleniyor…</p>
      ) : groups.length === 0 ? (
        <p style={{ color: "var(--text-dim)", textAlign: "center", padding: 30 }}>
          Şu an ayarlanabilir bildirim türü yok.
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.code} style={{ marginTop: 26, opacity: master ? 1 : 0.5 }}>
            <div style={{
              fontSize: 13, fontWeight: 700, color: "var(--text-soft)", marginBottom: 10,
              textTransform: "uppercase", letterSpacing: "0.05em",
            }}>{g.label}</div>
            <div style={{ display: "grid", gap: 8 }}>
              {g.types.map((t) => (
                <ToggleRow
                  key={t.code}
                  label={t.label}
                  hint={t.description}
                  on={t.enabled}
                  locked={!t.user_editable}
                  disabled={!master}
                  onChange={(v) => toggleType(t.code, v)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 24, textAlign: "center", minHeight: 18 }}>
        {saving ? "Kaydediliyor…" : "Değişiklikler otomatik kaydedilir."}
      </p>
    </Wrap>
  );
}

// ---------------------------------------------------------------- parçalar

const cardStyle: React.CSSProperties = {
  padding: "14px 16px", background: "var(--bg-panel)", borderRadius: 14,
  border: "1px solid var(--border-soft)", boxShadow: "0 1px 3px rgba(0,0,0,.15)",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: "var(--text-soft)", marginBottom: 10,
  textTransform: "uppercase", letterSpacing: "0.05em",
};

/** "13 Ağustos 14:20" */
function formatSeen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

/**
 * "Bu tarayıcıda bildirim al" satırı — gerçek izin durumunu gösterir.
 * Engellenmişse buton GÖSTERİLMEZ (tıklamak işe yaramaz, tarayıcı ayarı gerekir).
 */
function BrowserPushRow({
  status, busy, note, onEnable,
}: {
  status: WebPushStatus | null;
  busy: boolean;
  note: string;
  onEnable: () => void;
}) {
  const map: Record<string, { icon: string; text: string; hint: string; action: boolean }> = {
    ok: { icon: "✅", text: "Bu tarayıcıda bildirim açık", hint: "Bildirimler bu cihaza gelecek.", action: false },
    denied: {
      icon: "🚫", text: "Tarayıcı bildirimleri engelliyor",
      hint: "Açmak için tarayıcı ayarlarından bu site için bildirim iznini yeniden ver (adres çubuğundaki 🔒 → Bildirimler → İzin ver), sonra sayfayı yenile.",
      action: false,
    },
    native: { icon: "📱", text: "Uygulama içindesin", hint: "Bildirimler uygulama üzerinden gelir; tarayıcı izni gerekmez.", action: false },
    unsupported: { icon: "🚫", text: "Bu tarayıcı desteklemiyor", hint: "Bildirim için güncel bir Chrome, Edge veya Firefox dene.", action: false },
    "ios-needs-pwa": {
      icon: "📲", text: "Önce ana ekrana ekle",
      hint: "iPhone/iPad'de bildirim için: Paylaş → “Ana Ekrana Ekle”. Sonra uygulamayı ana ekrandan açıp buradan izin ver.",
      action: false,
    },
    "no-config": { icon: "⚙️", text: "Bildirim altyapısı hazır değil", hint: "Site yöneticisi Firebase ayarlarını henüz girmemiş.", action: false },
    error: { icon: "🔔", text: "Bu tarayıcıda bildirim al", hint: "Maç davetleri ve duyurular için izin ver.", action: true },
  };
  const s = map[status || "error"] || map.error;

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={iconBox}>{s.icon}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontWeight: 600, fontSize: 15, color: "var(--text-strong)" }}>{s.text}</span>
          <span style={{ display: "block", color: "var(--text-dim)", fontSize: 12.5, marginTop: 3, lineHeight: 1.4 }}>
            {note || s.hint}
          </span>
        </span>
        {s.action && (
          <button onClick={onEnable} disabled={busy} style={{
            padding: "8px 14px", borderRadius: 9, border: "none",
            background: "var(--accent)", color: "#1a1330", fontWeight: 700, fontSize: 13,
            cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, flexShrink: 0,
          }}>{busy ? "…" : "İzin ver"}</button>
        )}
      </div>
    </div>
  );
}

const iconBox: React.CSSProperties = {
  fontSize: 20, width: 36, height: 36, flexShrink: 0, borderRadius: 11,
  background: "var(--bg-elevated)", display: "grid", placeItems: "center",
};

function ToggleRow({
  icon, label, hint, on, onChange, locked, disabled,
}: {
  icon?: string;
  label: string;
  hint?: string;
  on: boolean;
  onChange: (v: boolean) => void;
  locked?: boolean;
  disabled?: boolean;
}) {
  const off = locked || disabled;
  return (
    <button
      onClick={() => { if (!off) onChange(!on); }}
      disabled={off}
      style={{
        ...cardStyle,
        display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
        cursor: off ? "default" : "pointer",
        opacity: locked ? 0.6 : 1,
      }}
    >
      {icon && <span style={iconBox}>{icon}</span>}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 600, fontSize: 15, color: "var(--text-strong)" }}>
          {locked && <span title="Bu bildirim kapatılamaz" style={{ marginRight: 6 }}>🔒</span>}
          {label}
        </span>
        {hint && (
          <span style={{ display: "block", color: "var(--text-dim)", fontSize: 12.5, marginTop: 3, lineHeight: 1.4 }}>
            {hint}
          </span>
        )}
      </span>
      <SwitchPill on={on} />
    </button>
  );
}

/** Anahtar görünümü (menü sayfasındaki ToggleRow ile aynı ölçüler). */
function SwitchPill({ on }: { on: boolean }) {
  return (
    <span style={{
      width: 48, height: 28, borderRadius: 14, flexShrink: 0,
      background: on ? "var(--accent)" : "var(--bg-elevated)",
      border: on ? "none" : "1px solid var(--border-soft)",
      position: "relative", transition: "background .2s",
    }}>
      <span style={{
        position: "absolute", top: 2, left: on ? 22 : 2, width: 22, height: 22, borderRadius: "50%",
        background: "#fff", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.3)",
      }} />
    </span>
  );
}

/** Tek başına tıklanabilir anahtar (sessiz saat kartı için). */
function Switch({
  on, onChange, disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => { if (!disabled) onChange(!on); }}
      disabled={disabled}
      aria-label="Sessiz saatler"
      style={{
        background: "none", border: "none", padding: 0, flexShrink: 0,
        cursor: disabled ? "default" : "pointer", lineHeight: 0,
      }}
    >
      <SwitchPill on={on} />
    </button>
  );
}

/** Saat seçici. "Kapalı" durumu kartın anahtarıyla yönetilir (ikisini birden NULL yapar). */
function HourSelect({
  value, onChange, disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={String(value)}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        padding: "8px 10px", borderRadius: 9, border: "1px solid var(--border-soft)",
        background: "var(--bg-elevated)", color: "var(--text-strong)",
        fontFamily: "var(--font-display)", fontSize: 14, cursor: disabled ? "default" : "pointer",
      }}
    >
      {Array.from({ length: 24 }, (_, h) => (
        <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
      ))}
    </select>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "24px 18px 40px", minHeight: "60vh" }}>
      <div className="kt-mobile-only" style={{ marginBottom: 16 }}><a href="/"><Logo size={32} /></a></div>
      {children}
    </main>
  );
}
function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", placeItems: "center", minHeight: "40vh", color: "var(--text-soft)" }}>{children}</div>;
}
