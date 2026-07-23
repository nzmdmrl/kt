"""
Maç mantığı motoru — saf, senkron, test edilebilir.

Zamanlayıcı ve ağ yok; sadece "şu olay olunca state nasıl değişir" mantığı.
WebSocket katmanı (match_ws.py) bu motoru çağırır, zamanı yönetir ve
sonuçları oyunculara yayınlar.

Kurallar:
  * Tur başında hedef kelime seçilir (gizli), sıra kimsede değildir.
  * Bir oyuncu buzzer alır -> turn_player_id o olur, cevap penceresi açılır.
  * Tahmin doğruysa: kalan tur süresi kadar +puan; ilk buzzer'sa +hız bonusu; tur biter.
  * Tahmin yanlışsa: satır eklenir, sıra rakibe geçer, cevap penceresi kapanır.
  * Cevap penceresi biterse (timeout): sıra rakibe geçer.
  * Satırlar dolar veya tur süresi biterse: tur biter. Kimse bilemediyse
    her iki oyuncuya "en iyi sarı harf" kadar teselli puanı verilir (0-0 önleme).
"""

from __future__ import annotations

import random
from typing import Optional

from app.game.models import (
    MatchPhase, RoundState, GuessRow, GuessTile, TileState, Player,
    ROUND_CONFIG, ROUND_TOTAL_SECONDS, BUZZER_ANSWER_SECONDS, SPEED_BONUS,
)
from app.game.word_engine import evaluate_guess, is_correct, normalize
from app.words.word_service import get_pool


class MatchError(Exception):
    """Kural ihlali (geçersiz hamle) — istemciye hata olarak döner."""


class Match:
    def __init__(self, match_id: str, players: list[Player], lang: str = "tr"):
        if len(players) != 2:
            raise ValueError("Maç tam iki oyuncu ile başlar.")
        self.id = match_id
        self.lang = lang
        self.players: dict[str, Player] = {p.id: p for p in players}
        self.player_order: list[str] = [p.id for p in players]
        self.phase: MatchPhase = MatchPhase.WAITING
        self.round: Optional[RoundState] = None
        self.round_index: int = -1

    # ---- yardımcılar ----
    def opponent_of(self, player_id: str) -> str:
        return self.player_order[1] if self.player_order[0] == player_id else self.player_order[0]

    def _pick_word(self, length: int) -> str:
        return get_pool(length, self.lang).random_word()

    # ---- tur akışı ----
    def start_next_round(self) -> RoundState:
        """Sonraki turu başlatır. Tüm turlar bitmişse maçı bitirir."""
        self.round_index += 1
        if self.round_index >= len(ROUND_CONFIG):
            self.phase = MatchPhase.FINISHED
            self.round = None
            return None  # type: ignore[return-value]

        cfg = ROUND_CONFIG[self.round_index]
        target = self._pick_word(cfg["length"])
        self.round = RoundState(
            index=self.round_index,
            length=cfg["length"],
            max_rows=cfg["rows"],
            target=normalize(target),
            time_left=ROUND_TOTAL_SECONDS,
        )
        self.phase = MatchPhase.ROUND_ACTIVE
        return self.round

    def take_buzzer(self, player_id: str) -> None:
        """Bir oyuncu buzzer'a basar / yazmaya başlar. Sıra boşsa kilidi alır."""
        self._require_active()
        r = self.round
        assert r is not None
        if r.turn_player_id is not None:
            raise MatchError("Sıra şu an başka oyuncuda.")
        if player_id not in self.players:
            raise MatchError("Oyuncu bu maçta değil.")
        r.turn_player_id = player_id
        r.answer_time_left = BUZZER_ANSWER_SECONDS
        if r.first_buzzer_id is None:
            r.first_buzzer_id = player_id

    def submit_guess(self, player_id: str, guess: str) -> dict:
        """
        Sıradaki oyuncunun tahminini işler. Sonuç sözlüğü döner:
          {correct, tiles, points_awarded, round_over, ...}
        """
        self._require_active()
        r = self.round
        assert r is not None
        if r.turn_player_id != player_id:
            raise MatchError("Sıra sizde değil.")

        pool = get_pool(r.length, self.lang)
        g = normalize(guess)

        # Uzunluk kontrolü
        if len(g) != r.length:
            raise MatchError(f"{r.length} harfli bir kelime girin.")
        # İlk harf sabit ipucuna uymalı
        if g[0] != r.target[0]:
            raise MatchError(f"Kelime '{r.target[0]}' harfi ile başlamalı.")
        # Havuzda geçerli kelime mi?
        if not pool.is_valid(g):
            raise MatchError("Bu kelime listede yok.")

        # Değerlendir
        letter_results = evaluate_guess(g, r.target)
        tiles = [GuessTile(lr.letter, TileState(lr.state.value)) for lr in letter_results]
        r.rows.append(GuessRow(player_id=player_id, tiles=tiles))

        correct = is_correct(g, r.target)
        points = 0
        round_over = False

        if correct:
            # Kalan tur süresi kadar puan + (ilk buzzer ise) hız bonusu
            points = max(1, r.time_left)
            if r.first_buzzer_id == player_id:
                points += SPEED_BONUS
            self.players[player_id].score += points
            r.solved_by = player_id
            r.finished = True
            round_over = True
            self.phase = MatchPhase.ROUND_OVER
        else:
            # Yanlış: cevap penceresi kapanır, sıra rakibe geçer
            r.turn_player_id = None
            r.answer_time_left = 0
            # Satırlar doldu mu?
            if len(r.rows) >= r.max_rows:
                round_over = self._finish_round_unsolved()

        return {
            "correct": correct,
            "tiles": [{"letter": t.letter, "state": t.state.value} for t in tiles],
            "points_awarded": points,
            "player_id": player_id,
            "round_over": round_over,
        }

    def on_answer_timeout(self) -> None:
        """Buzzer cevap penceresi doldu — sıra rakibe geçer (satır eklenmez)."""
        self._require_active()
        r = self.round
        assert r is not None
        r.turn_player_id = None
        r.answer_time_left = 0

    def on_round_timeout(self) -> dict:
        """Tur toplam süresi bitti — kimse bilemediyse teselli puanı, tur kapanır."""
        self._require_active()
        return {"round_over": self._finish_round_unsolved()}

    def tick(self) -> None:
        """1 saniyelik zaman ilerlemesi. Zamanlayıcı her saniye çağırır."""
        if self.phase != MatchPhase.ROUND_ACTIVE or self.round is None:
            return
        r = self.round
        if r.time_left > 0:
            r.time_left -= 1
        if r.turn_player_id is not None and r.answer_time_left > 0:
            r.answer_time_left -= 1

    # ---- iç mantık ----
    def _finish_round_unsolved(self) -> bool:
        """Kimse bilemeden tur biter: 0-0 önleme teselli puanı ver."""
        r = self.round
        assert r is not None
        if r.finished:
            return True
        # Her oyuncunun kendi satırlarındaki en yüksek 'sarı' (present) sayısını bul.
        best_present: dict[str, int] = {pid: 0 for pid in self.player_order}
        for row in r.rows:
            present = sum(1 for t in row.tiles if t.state == TileState.PRESENT)
            correct = sum(1 for t in row.tiles if t.state == TileState.CORRECT)
            # Doğru yeşiller de teselliye katkı versin (yanlış yer + doğru yer).
            consolation = present + correct
            if consolation > best_present[row.player_id]:
                best_present[row.player_id] = consolation
        for pid, pts in best_present.items():
            self.players[pid].score += pts
        r.finished = True
        r.turn_player_id = None
        self.phase = MatchPhase.ROUND_OVER
        return True

    def _require_active(self) -> None:
        if self.phase != MatchPhase.ROUND_ACTIVE or self.round is None:
            raise MatchError("Aktif bir tur yok.")

    # ---- sonuç ----
    def result(self) -> dict:
        """Maç sonucu — kazanan, skorlar."""
        scores = {pid: p.score for pid, p in self.players.items()}
        winner = None
        a, b = self.player_order
        if scores[a] > scores[b]:
            winner = a
        elif scores[b] > scores[a]:
            winner = b
        # eşitse winner = None (berabere)
        return {"scores": scores, "winner": winner, "finished": self.phase == MatchPhase.FINISHED}

    def to_public(self, viewer_id: Optional[str] = None) -> dict:
        """Tüm maç durumunun istemci-güvenli görünümü (hedef kelime yok)."""
        return {
            "match_id": self.id,
            "phase": self.phase.value,
            "round_index": self.round_index,
            "players": [self.players[pid].to_public() for pid in self.player_order],
            "round": self.round.to_public() if self.round else None,
        }
