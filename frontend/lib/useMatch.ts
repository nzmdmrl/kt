"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { API_BASE } from "./api";

// WebSocket taban adresi: API_BASE http(s) -> ws(s)
function wsBase(): string {
  if (API_BASE) {
    return API_BASE.replace(/^http/, "ws");
  }
  // API_BASE boşsa aynı origin
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}`;
  }
  return "";
}

export type Tile = { letter: string; state: "correct" | "present" | "absent" };
export type Row = { player_id: string; tiles: Tile[] };
export type PublicPlayer = {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  is_bot: boolean;
};
export type RoundPublic = {
  index: number;
  length: number;
  max_rows: number;
  first_letter: string;
  rows: Row[];
  turn_player_id: string | null;
  time_left: number;
  answer_time_left: number;
  solved_by: string | null;
  finished: boolean;
  reveal_word: string | null;
};
export type MatchState = {
  match_id: string;
  phase: "waiting" | "round_active" | "round_over" | "finished";
  round_index: number;
  players: PublicPlayer[];
  round: RoundPublic | null;
};

export type ServerMessage = {
  type: string;
  [key: string]: any;
};

export function useMatch(
  code: string | null,
  playerId: string,
  name: string,
  bot?: boolean,
  botElo?: number
) {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<MatchState | null>(null);
  const [lastEvent, setLastEvent] = useState<ServerMessage | null>(null);
  const [error, setError] = useState<string>("");
  const [flash, setFlash] = useState<string>(""); // geçici bildirim (buzzer, timeout)
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!code) return;
    let url = `${wsBase()}/api/ws/match/${code}?player_id=${encodeURIComponent(
      playerId
    )}&name=${encodeURIComponent(name)}`;
    if (bot) {
      url += `&bot=1&bot_elo=${botElo ?? 1000}`;
    }
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setError("Bağlantı hatası");

    ws.onmessage = (ev) => {
      const msg: ServerMessage = JSON.parse(ev.data);
      setLastEvent(msg);
      switch (msg.type) {
        case "state":
          setState(msg.state);
          break;
        case "error":
          setError(msg.message);
          setTimeout(() => setError(""), 2500);
          break;
        case "buzzer_taken":
          setFlash(`Sıra kapıldı`);
          setTimeout(() => setFlash(""), 1200);
          break;
        case "turn_timeout":
          setFlash("Süre doldu, sıra değişti");
          setTimeout(() => setFlash(""), 1400);
          break;
        default:
          break;
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const send = useCallback((data: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }, []);

  const buzzer = useCallback(() => send({ action: "buzzer" }), [send]);
  const guess = useCallback((word: string) => send({ action: "guess", word }), [send]);

  return { connected, state, lastEvent, error, flash, buzzer, guess };
}
