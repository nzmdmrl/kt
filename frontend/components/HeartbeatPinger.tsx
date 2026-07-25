"use client";

import { useEffect } from "react";
import { apiUrl } from "@/lib/api";

// Giriş yapmış kullanıcı için düzenli "buradayım" sinyali (presence heartbeat).
// 30 sn'de bir gönderir; sekme görünür olduğunda da anında bir kez.
export default function HeartbeatPinger() {
  useEffect(() => {
    function ping() {
      const token = localStorage.getItem("kt_token");
      if (!token) return;
      fetch(apiUrl("/api/presence/heartbeat"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    ping();
    const iv = setInterval(ping, 30000);
    const onVis = () => { if (document.visibilityState === "visible") ping(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  return null;
}
