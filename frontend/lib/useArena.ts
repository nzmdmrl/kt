"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { API_BASE } from "./api";

function wsBase(): string {
  if (API_BASE) return API_BASE.replace(/^http/, "ws");
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}`;
  }
  return "";
}

export type ArenaPlayer = { pid: string; name: string; avatar_url: string; is_bot?: boolean; score?: number };
export type ArenaQuestion = {
  index: number; total: number; length: number;
  first_letter: string; scrambled: string[]; duration: number;
};
export type AnswerState = { pid: string; correct: boolean; flash: boolean };

export type ArenaState = {
  phase: "connecting" | "lobby" | "starting" | "countdown" | "question" | "reveal" | "finished";
  players: ArenaPlayer[];
  countdownN: number;
  question: ArenaQuestion | null;
  questionStartedAt: number;      // client tarafı, süre çubuğu için
  answers: Record<string, AnswerState>;  // pid -> durum (o soru)
  myResult: { correct: boolean; gained: number; flash: boolean } | null;
  revealAnswer: string;
  scores: Record<string, number>;
  ranking: ArenaPlayer[];
};

const initialState: ArenaState = {
  phase: "connecting",
  players: [],
  countdownN: 0,
  question: null,
  questionStartedAt: 0,
  answers: {},
  myResult: null,
  revealAnswer: "",
  scores: {},
  ranking: [],
};

export function useArena(enabled: boolean) {
  const [state, setState] = useState<ArenaState>(initialState);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("kt_token") : null;
    if (!token) return;

    const url = `${wsBase()}/api/ws/arena?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      switch (msg.type) {
        case "lobby":
          setState((s) => ({ ...s, phase: "lobby", players: msg.players || [] }));
          break;
        case "match_start":
          setState((s) => ({ ...s, phase: "starting", players: msg.players || [], scores: {} }));
          break;
        case "countdown":
          setState((s) => ({ ...s, phase: "countdown", countdownN: msg.n }));
          break;
        case "question":
          setState((s) => ({
            ...s, phase: "question",
            question: {
              index: msg.index, total: msg.total, length: msg.length,
              first_letter: msg.first_letter, scrambled: msg.scrambled, duration: msg.duration,
            },
            questionStartedAt: Date.now(),
            answers: {}, myResult: null, revealAnswer: "",
          }));
          break;
        case "player_answered":
          setState((s) => ({
            ...s,
            answers: { ...s.answers, [msg.pid]: { pid: msg.pid, correct: msg.correct, flash: msg.flash } },
          }));
          break;
        case "answer_result":
          setState((s) => ({ ...s, myResult: { correct: msg.correct, gained: msg.gained, flash: msg.flash } }));
          break;
        case "reveal": {
          const revAnswers: Record<string, AnswerState> = {};
          (msg.players || []).forEach((p: any) => {
            revAnswers[p.pid] = { pid: p.pid, correct: p.correct, flash: p.flash };
          });
          setState((s) => ({
            ...s, phase: "reveal", revealAnswer: msg.answer,
            scores: msg.scores || s.scores,
            answers: revAnswers,
            players: s.players.map((p) => ({ ...p, score: (msg.scores || {})[p.pid] ?? p.score })),
          }));
          break;
        }
        case "finished":
          setState((s) => ({ ...s, phase: "finished", ranking: msg.ranking || [] }));
          break;
      }
    };

    return () => { try { ws.close(); } catch {} wsRef.current = null; };
  }, [enabled]);

  const answer = useCallback((guess: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: "answer", guess }));
    }
  }, []);

  return { state, connected, answer };
}
