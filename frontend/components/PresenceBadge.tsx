"use client";

import { useState, useEffect } from "react";
import { apiUrl } from "@/lib/api";

// Bir kullanıcının online durumunu gösteren rozet.
// online (yeşil) / maçta (mavi) / çevrimdışı (gri).
// allowChallenges bilgisini de dışarı verir (maç teklifi butonu için).
export default function PresenceBadge({
  userId,
  onStatus,
}: {
  userId: number;
  onStatus?: (status: string, allowChallenges: boolean) => void;
}) {
  const [status, setStatus] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    function load() {
      fetch(apiUrl(`/api/presence/${userId}`))
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          setStatus(d.status);
          setLoaded(true);
          onStatus?.(d.status, d.allow_challenges);
        })
        .catch(() => setLoaded(true));
    }
    load();
    const iv = setInterval(load, 20000); // 20 sn'de bir tazele
    return () => { alive = false; clearInterval(iv); };
  }, [userId]);

  if (!loaded) return null;

  const map: Record<string, { color: string; label: string }> = {
    online: { color: "#3aa76d", label: "Çevrimiçi" },
    in_match: { color: "#4a90d9", label: "Maçta" },
    offline: { color: "var(--text-dim)", label: "Çevrimdışı" },
  };
  const s = map[status] || map.offline;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: "var(--text-soft)" }}>
        {status === "online" ? "Maça hazır" : s.label}
      </span>
    </div>
  );
}
