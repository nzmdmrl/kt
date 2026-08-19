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

export type ArenaPlayer = { pid: string; name: string; avatar_url: string; is_bot?: boolean; score?: number; rank?: number; correct_count?: number; flash_count?: number };
export type ArenaQuestion = {
  index: number; total: number; length: number;
  first_letter: string; scrambled: string[]; duration: number;
};
export type AnswerState = { pid: string; correct: boolean; flash: boolean };

export type PlayerHistory = { correct: boolean; flash: boolean; answered: boolean };
export type RevealPlayer = {
  pid: string; name: string; avatar_url: string; is_bot?: boolean;
  score: number; correct_count: number; history: PlayerHistory[];
};

export type ArenaState = {
  phase: "connecting" | "lobby" | "starting" | "countdown" | "question" | "reveal" | "finished";
  players: ArenaPlayer[];
  countdownN: number;
  countdownLen: number;
  question: ArenaQuestion | null;
  questionStartedAt: number;      // client tarafı, süre çubuğu için
  answers: Record<string, AnswerState>;  // pid -> durum (o soru)
  myResult: { correct: boolean; gained: number; flash: boolean; answer?: string } | null;
  revealAnswer: string;
  revealPlayers: RevealPlayer[];  // tablo için (geçmiş dahil)
  revealTotal: number;            // toplam soru
  totalQuestions: number;         // maçtaki kelime sayısı (oyun moduna göre; lobide de bilinir)
  firstLength: number;            // ilk kelimenin harf sayısı
  size: number;                   // arenanın kişi kapasitesi (özel arenada 2-5)
  scores: Record<string, number>;
  ranking: ArenaPlayer[];
  leftNotice: { name: string; at: number } | null;   // "xxx arenadan çıktı" popup
  rewards: { xp_gained: number; rank: number; won: boolean; new_title?: { name: string; icon: string } | null } | null;
  error: string | null;              // sunucudan gelen hata (ör. misafir girişi kapalı)
};

const initialState: ArenaState = {
  phase: "connecting",
  players: [],
  countdownN: 0,
  countdownLen: 4,
  question: null,
  questionStartedAt: 0,
  answers: {},
  myResult: null,
  revealAnswer: "",
  revealPlayers: [],
  revealTotal: 6,
  totalQuestions: 6,
  firstLength: 4,
  size: 5,
  scores: {},
  ranking: [],
  leftNotice: null,
  rewards: null,
  error: null,
};

export function useArena(enabled: boolean, customCode?: string) {
  const [state, setState] = useState<ArenaState>(initialState);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("kt_token") : null;
    // Yalnız üye bağlanır. Misafirlik Aşama 2'de kalktı (herkesin hesabı var),
    // ölü kalan gid+ad yolu da Aşama 5 temizliğinde silindi.
    if (!token) return;

    let url = `${wsBase()}/api/ws/arena?token=${encodeURIComponent(token)}`;
    if (customCode) url += `&custom=${encodeURIComponent(customCode)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      switch (msg.type) {
        case "lobby":
          setState((s) => ({
            ...s, phase: "lobby", players: msg.players || [],
            totalQuestions: msg.total || s.totalQuestions,
            firstLength: msg.first_length || s.firstLength,
            size: msg.size || s.size,
          }));
          break;
        case "match_start":
          setState((s) => ({ ...s, phase: "starting", players: msg.players || [], scores: {} }));
          break;
        case "countdown":
          setState((s) => ({ ...s, phase: "countdown", countdownN: msg.n, countdownLen: msg.length || s.countdownLen }));
          break;
        case "question":
          setState((s) => ({
            ...s, phase: "question",
            question: {
              index: msg.index, total: msg.total, length: msg.length,
              first_letter: msg.first_letter, scrambled: msg.scrambled, duration: msg.duration,
            },
            totalQuestions: msg.total || s.totalQuestions,
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
          setState((s) => ({ ...s, myResult: { correct: msg.correct, gained: msg.gained, flash: msg.flash, answer: msg.answer } }));
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
            revealPlayers: msg.players || [],
            revealTotal: msg.total || s.revealTotal,
            players: s.players.map((p) => ({ ...p, score: (msg.scores || {})[p.pid] ?? p.score })),
          }));
          break;
        }
        case "finished":
          setState((s) => ({ ...s, phase: "finished", ranking: msg.ranking || [], rewards: msg.rewards || null }));
          break;
        case "error":
          setState((s) => ({ ...s, error: msg.message || "Arenaya bağlanılamadı." }));
          break;
        case "player_left":
          setState((s) => ({
            ...s,
            leftNotice: { name: msg.name || "Bir oyuncu", at: Date.now() },
            // lobideyse oyuncu listesinden de düşür
            players: s.players.filter((p) => p.pid !== msg.pid),
          }));
          break;
      }
    };

    return () => { try { ws.close(); } catch {} wsRef.current = null; };
  }, [enabled, customCode]);

  const answer = useCallback((guess: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: "answer", guess }));
    }
  }, []);

  return { state, connected, answer };
}
