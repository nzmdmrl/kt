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
        # Joker hakları (maç boyunca, oyuncu başına). Admin panelden ayarlanır.
        # jokers_enabled kapalıysa tüm haklar 0 (joker sistemi devre dışı).
        from app.game.settings_service import cached_bool, cached_int
        if cached_bool("jokers_enabled", True):
            jy = cached_int("joker_yellow_count", 2)
            jg = cached_int("joker_green_count", 1)
            jt = cached_int("joker_time_count", 1)
        else:
            jy = jg = jt = 0
        self.jokers: dict[str, dict[str, int]] = {
            pid: {"yellow": jy, "green": jg, "time": jt} for pid in self.players
        }

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
        # Ayarları cache'ten oku (admin panelden değiştirilebilir); yoksa varsayılan.
        from app.game.settings_service import cached_int
        length = cfg["length"]
        rows = cached_int(f"rows_{length}", cfg["rows"])
        total_secs = cached_int("round_total_seconds", ROUND_TOTAL_SECONDS)
        self.round = RoundState(
            index=self.round_index,
            length=length,
            max_rows=rows,
            target=normalize(target),
            time_left=total_secs,
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
        from app.game.settings_service import cached_int as _ci; r.answer_time_left = _ci("buzzer_answer_seconds", BUZZER_ANSWER_SECONDS)
        if r.first_buzzer_id is None:
            r.first_buzzer_id = player_id

    def can_use_letter_joker(self) -> bool:
        """
        Harf jokerleri (sarı/yeşil) bu turda kullanılabilir mi?
        Kural (ilk harf hariç bilinen ek harf sayısına göre):
          4 harf: 0 ek harf biliniyorsa aktif (1 olunca pasif)
          5 harf: <=1 ek harf biliniyorsa aktif (2 olunca pasif)
          6 harf: <=2 ek harf biliniyorsa aktif (3 olunca pasif)
        Yani eşik = length - 4. Bilinen ek harf < eşik+1 ... aslında:
          aktif eşiği: known < (length - 3)
          4: known < 1  (yani 0)
          5: known < 2  (0 veya 1)
          6: known < 3  (0,1,2)
        """
        r = self.round
        if not r:
            return False
        known = r.known_extra_letters()
        return known < (r.length - 3)

    def use_joker(self, player_id: str, kind: str) -> dict:
        """
        Joker kullanır. kind: 'yellow' | 'green' | 'time'.
        - Turun başında, buzzer boşken ve oyuncu maçtaysa kullanılabilir.
        - Kullanınca sıra (buzzer) o oyuncuya geçer.
        - yellow/green: harf jokeri koşulu (can_use_letter_joker) gerekir.
        Sonuç: {kind, revealed?, buzzer_taken}
        """
        self._require_active()
        r = self.round
        assert r is not None
        if player_id not in self.players:
            raise MatchError("Oyuncu bu maçta değil.")
        if r.turn_player_id is not None and r.turn_player_id != player_id:
            raise MatchError("Sıra başka oyuncuda, joker kullanılamaz.")
        if kind not in ("yellow", "green", "time"):
            raise MatchError("Geçersiz joker.")
        if self.jokers[player_id].get(kind, 0) <= 0:
            raise MatchError("Bu joker hakkın kalmadı.")

        result: dict = {"kind": kind}

        if kind == "time":
            # Süre uzatma: cevap penceresi açıksa ona, değilse tur süresine +10sn.
            if r.turn_player_id == player_id and r.answer_time_left > 0:
                r.answer_time_left += 10
            else:
                r.time_left += 10
            result["extended"] = 10
        else:
            # Harf jokeri — koşul kontrolü.
            if not self.can_use_letter_joker():
                raise MatchError("Harf jokeri bu turda kullanılamaz (yeterli harf biliniyor).")
            # Henüz bilinmeyen (yeşil olmayan) konumları bul.
            known_positions = {0}  # ilk harf zaten açık
            for row in r.rows:
                for i, t in enumerate(row.tiles):
                    if t.state == TileState.CORRECT:
                        known_positions.add(i)
            for i in r.joker_greens:
                known_positions.add(i)
            unknown_positions = [i for i in range(r.length) if i not in known_positions]
            if not unknown_positions:
                raise MatchError("Açılacak harf kalmadı.")

            if kind == "green":
                # Bilinmeyen bir konumu doğru harfiyle aç (yeşil).
                pos = random.choice(unknown_positions)
                r.joker_greens[pos] = r.target[pos]
                result["revealed"] = {"index": pos, "letter": r.target[pos], "state": "correct"}
            else:  # yellow
                # Kelimede olan, henüz bilinmeyen bir harfi, YANLIŞ bir konuma sarı koy.
                # Açılmamış harflerden birini seç.
                unknown_letters = list({r.target[i] for i in unknown_positions})
                if not unknown_letters:
                    raise MatchError("Açılacak harf kalmadı.")
                letter = random.choice(unknown_letters)
                # Bu harfin GERÇEK konumları (oraya koymayacağız).
                real_positions = {i for i in range(r.length) if r.target[i] == letter}
                # Sarı koyulabilecek konumlar: bilinmeyen ve harfin gerçek yeri olmayan.
                slot_candidates = [i for i in unknown_positions if i not in real_positions]
                if not slot_candidates:
                    # Harfin tek yeri var ve o da bilinmiyor — başka harf dene.
                    slot_candidates = [i for i in unknown_positions]
                slot = random.choice(slot_candidates)
                r.joker_yellows.append({"index": slot, "letter": letter})
                result["revealed"] = {"index": slot, "letter": letter, "state": "present"}

        # Hakkı düş ve buzzer'ı bu oyuncuya ver (sıra ona geçer).
        self.jokers[player_id][kind] -= 1
        if r.turn_player_id is None:
            r.turn_player_id = player_id
            from app.game.settings_service import cached_int as _ci
            r.answer_time_left = _ci("buzzer_answer_seconds", BUZZER_ANSWER_SECONDS)
            if r.first_buzzer_id is None:
                r.first_buzzer_id = player_id
        result["buzzer_taken"] = True
        result["jokers_left"] = self.jokers[player_id]
        return result

    def jokers_public(self) -> dict:
        """Oyuncuların kalan joker haklarını istemciye gönderir."""
        from app.game.settings_service import cached_bool
        enabled = cached_bool("jokers_enabled", True)
        out = {pid: {**dict(j), "enabled": enabled} for pid, j in self.jokers.items()}
        return out
        self._require_active()
        r = self.round
        assert r is not None
        if r.turn_player_id != player_id:
            raise MatchError("Sıra sizde değil.")

        g = normalize(guess)

        # Uzunluk kontrolü
        if len(g) != r.length:
            raise MatchError(f"{r.length} harfli bir kelime girin.")
        # İlk harf sabit ipucuna uymalı
        if g[0] != r.target[0]:
            raise MatchError(f"Kelime '{r.target[0]}' harfi ile başlamalı.")
        # Sadece geçerli Türkçe harflerden oluşmalı (havuz üyeliği ŞART DEĞİL —
        # Wordle mantığı: oyuncu herhangi geçerli bir kelime deneyebilir, sistem
        # renk verir. Hedef kelime havuzdan seçilir ama tahmin serbesttir).
        from app.game.word_engine import is_valid_word_shape
        if not is_valid_word_shape(g, r.length):
            raise MatchError("Geçerli bir kelime yaz (sadece harfler).")
        # Bu kelime daha önce denendiyse (kim denerse denesin) tekrar kabul edilmez.
        already_tried = {
            "".join(t.letter for t in row.tiles) for row in r.rows
        }
        if g in already_tried:
            raise MatchError("Bu kelime zaten denendi.")

        # Değerlendir
        letter_results = evaluate_guess(g, r.target)
        tiles = [GuessTile(lr.letter, TileState(lr.state.value)) for lr in letter_results]
        r.rows.append(GuessRow(player_id=player_id, tiles=tiles))
        # Joker ile açılan geçici harfler bu tahminle tükendi — temizle.
        r.joker_greens = {}
        r.joker_yellows = []

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
            r.reveal_word = r.target   # doğru cevabı herkese göster
            round_over = True
            self.phase = MatchPhase.ROUND_OVER
        else:
            # Yanlış: sıra DOĞRUDAN rakibe geçer (boşa bırakılmaz).
            # Rakip cevap penceresi içinde denemezse sıra geri döner (timer yönetir).
            opponent = self.opponent_of(player_id)
            r.turn_player_id = opponent
            from app.game.settings_service import cached_int as _ci; r.answer_time_left = _ci("buzzer_answer_seconds", BUZZER_ANSWER_SECONDS)
            # NOT: Satır sınırı artık turu BİTİRMEZ. Tur yalnızca süre bitince
            # veya kelime bilinince biter. Izgara gerektikçe aşağı genişler.

        return {
            "correct": correct,
            "tiles": [{"letter": t.letter, "state": t.state.value} for t in tiles],
            "points_awarded": points,
            "player_id": player_id,
            "round_over": round_over,
        }

    def on_answer_timeout(self) -> None:
        """
        Buzzer cevap penceresi doldu — sıra rakibe geçer ve ona yeni bir
        cevap penceresi açılır (satır eklenmez). Böylece sıra iki oyuncu
        arasında dönüşümlü ilerler; kimse ard arda deneme yapamaz.
        """
        self._require_active()
        r = self.round
        assert r is not None
        if r.turn_player_id is not None:
            r.turn_player_id = self.opponent_of(r.turn_player_id)
            from app.game.settings_service import cached_int as _ci; r.answer_time_left = _ci("buzzer_answer_seconds", BUZZER_ANSWER_SECONDS)
        else:
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
        r.reveal_word = r.target   # doğru cevabı göster (kimse bilemedi)
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
