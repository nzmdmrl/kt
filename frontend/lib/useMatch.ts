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
  avatar_url?: string | null;
  trophies?: number;
  medals?: number;
  badges?: number;
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
  joker_greens?: Record<string, string>;
  joker_yellows?: { index: number; letter: string }[];
  joker_used_by?: string[];
  // 3-4 kişilik odada bu döngüde hakkını kullanmış oyuncular (buzzer'a basamaz).
  blocked_ids?: string[];
};

// Oda bilgisi (özel oda): kaç kişilik, kaç tur, bekleme süresi.
export type RoomInfo = {
  code: string;
  host_name?: string;
  size: number;
  rounds: number;
  wait_seconds: number;
  seconds_left: number;
  player_count: number;
  is_full: boolean;
  match_started: boolean;
  expired?: boolean;
  custom?: boolean;
  /** Hedef kelime elle belirlendi mi (Reklam Oyunu)? Kelimenin kendisi GELMEZ. */
  fixed_word?: boolean;
};
export type MatchState = {
  match_id: string;
  phase: "waiting" | "round_active" | "round_over" | "finished";
  round_index: number;
  total_rounds?: number;      // maçtaki toplam tur (mod 2'de 1)
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
  botElo?: number,
  botId?: number
) {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<MatchState | null>(null);
  const [lastEvent, setLastEvent] = useState<ServerMessage | null>(null);
  const [error, setError] = useState<string>("");
  const [flash, setFlash] = useState<string>(""); // geçici bildirim (buzzer, timeout)
  const [jokers, setJokers] = useState<any>(null); // oyuncu başına kalan joker hakları
  const [room, setRoom] = useState<RoomInfo | null>(null);   // oda ayarları (özel oda)
  const [expired, setExpired] = useState("");                // oda süresi doldu mesajı
  const [leftNotice, setLeftNotice] = useState<{ name: string; at: number } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!code) return;
    let url = `${wsBase()}/api/ws/match/${code}?player_id=${encodeURIComponent(
      playerId
    )}&name=${encodeURIComponent(name)}`;
    if (bot) {
      url += `&bot=1&bot_elo=${botElo ?? 1000}`;
      // VS ekranında gösterilen botun ta kendisi odaya eklensin.
      if (botId) url += `&bot_id=${botId}`;
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
          if ((msg as any).jokers) setJokers((msg as any).jokers);
          break;
        case "error":
          setError(msg.message);
          setTimeout(() => setError(""), 4500);
          break;
        case "buzzer_taken":
          setFlash(`Sıra kapıldı`);
          setTimeout(() => setFlash(""), 3200);
          break;
        case "turn_timeout":
          setFlash("Süre doldu, sıra değişti");
          setTimeout(() => setFlash(""), 3400);
          break;
        case "joined":
        case "lobby":
          if ((msg as any).room) setRoom((msg as any).room);
          break;
        case "room_expired":
          setExpired(msg.message || "Süre doldu, oda kapandı.");
          break;
        case "player_left":
          // 3-4 kişilik odada biri ayrıldı — maç devam eder.
          setLeftNotice({ name: msg.name || "Bir oyuncu", at: Date.now() });
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
  const emote = useCallback((emoji: string) => send({ action: "emote", emoji }), [send]);
  const useJoker = useCallback((kind: string) => send({ action: "joker", kind }), [send]);
  const rematchRequest = useCallback(() => send({ action: "rematch_request" }), [send]);
  const rematchAccept = useCallback(() => send({ action: "rematch_accept" }), [send]);
  const rematchDecline = useCallback(() => send({ action: "rematch_decline" }), [send]);

  return {
    connected, state, lastEvent, error, flash, buzzer, guess, emote, useJoker, jokers,
    room, expired, leftNotice,
    rematchRequest, rematchAccept, rematchDecline,
  };
}
