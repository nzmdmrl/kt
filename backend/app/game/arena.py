"""
Arena — 5 oyunculu senkron kelime yarışması.

Kurallar (Nazım spec):
- 5 oyuncu (gerçek + bot ile tamamlanır), herkes AYNI 6 kelimeyi çözer.
- Soru dağılımı: 2x4harf, 2x5harf, 2x6harf.
- Süreler: 4h=10sn, 5h=15sn, 6h=20sn.
- Her soru için her oyuncunun 1 tahmin hakkı.
- Puan: süre + hız bazlı (erken doğru = çok puan).
- Senkron: herkes aynı anda, sunucu süreyi yönetir, süre bitince sonraki soru.
- Sonunda sıralama; 1. kupa, 2-3 madalya.

Bu motor tek başına (state machine) — WebSocket katmanı arena_ws bunu sürer.
Zamanlayıcı arena_ws'te (asyncio) döner; motor sadece durum + puan hesaplar.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional

from app.game.settings_service import cached_int
from app.game.word_engine import evaluate_guess, is_correct, normalize


# Varsayılan süreler (admin ayarıyla değişebilir).
DURATION_BY_LEN = {4: 10, 5: 15, 6: 20}
QUESTION_PLAN = [4, 4, 5, 5, 6, 6]   # 6 soru: 2x4, 2x5, 2x6
MAX_POINTS = 1000                     # bir soruda erken doğru cevabın taban puanı
FLASH_SECONDS = 5                     # bu süre içinde cevaplayana flash ikonu


@dataclass
class ArenaPlayer:
    pid: str                 # "u{id}" veya "bot:{name}"
    name: str
    avatar_url: str = ""
    is_bot: bool = False
    score: int = 0
    # o anki sorudaki durum:
    answered: bool = False
    correct: bool = False
    answer_time: float = 0.0  # cevap verdiği an (epoch)
    flash: bool = False       # 5sn içinde cevapladı mı (son soru)
    # Soru-soru geçmiş: her eleman {"correct": bool, "flash": bool, "answered": bool}
    history: list = field(default_factory=list)
    correct_count: int = 0    # toplam doğru sayısı


@dataclass
class ArenaQuestion:
    length: int
    word: str                 # hedef kelime (BÜYÜK)
    scrambled: list[str]      # karışık harfler
    duration: int             # saniye
    started_at: float = 0.0   # sunucu başlangıç anı


class ArenaMatch:
    """Tek bir Arena maçının durumu."""

    def __init__(self, code: str, words: list[str], word_plan: list[int] | None = None):
        self.code = code
        self.players: dict[str, ArenaPlayer] = {}
        self.word_plan = word_plan or QUESTION_PLAN
        self.questions: list[ArenaQuestion] = self._build_questions(words)
        self.current_index: int = -1     # aktif soru (henüz başlamadı)
        self.state: str = "waiting"      # waiting | countdown | question | reveal | finished
        self.started: bool = False

    def _build_questions(self, words: list[str]) -> list[ArenaQuestion]:
        import random
        qs = []
        for i, length in enumerate(self.word_plan):
            if i >= len(words):
                break
            w = normalize(words[i])
            letters = list(w)
            random.shuffle(letters)
            # İlk harf ipucu olduğu için karışıkta da yer alır ama sıra karışık.
            dur = cached_int(f"arena_seconds_{length}", DURATION_BY_LEN[length])
            qs.append(ArenaQuestion(length=length, word=w, scrambled=letters, duration=dur))
        return qs

    # ---- oyuncu yönetimi ----
    def add_player(self, pid: str, name: str, avatar_url: str = "", is_bot: bool = False) -> None:
        if pid not in self.players:
            self.players[pid] = ArenaPlayer(pid=pid, name=name, avatar_url=avatar_url, is_bot=is_bot)

    def player_list(self) -> list[dict]:
        return [
            {"pid": p.pid, "name": p.name, "avatar_url": p.avatar_url, "is_bot": p.is_bot, "score": p.score}
            for p in self.players.values()
        ]

    # ---- soru akışı ----
    def current_question(self) -> Optional[ArenaQuestion]:
        if 0 <= self.current_index < len(self.questions):
            return self.questions[self.current_index]
        return None

    def start_question(self, index: int) -> ArenaQuestion:
        self.current_index = index
        q = self.questions[index]
        q.started_at = time.time()
        self.state = "question"
        # oyuncu tur durumunu sıfırla
        for p in self.players.values():
            p.answered = False
            p.correct = False
            p.answer_time = 0.0
            p.flash = False
        return q

    def submit(self, pid: str, guess: str) -> dict:
        """Bir oyuncunun tahmini. Tek hak; puan süreye göre."""
        q = self.current_question()
        p = self.players.get(pid)
        if not q or not p or self.state != "question":
            return {"ok": False, "reason": "not_active"}
        if p.answered:
            return {"ok": False, "reason": "already"}

        now = time.time()
        elapsed = now - q.started_at
        p.answered = True
        p.answer_time = now
        g = normalize(guess)
        p.correct = is_correct(g, q.word)
        # Flash: SADECE doğru cevabı 5sn içinde verene (yanlış hızlı cevaba yok).
        if p.correct and elapsed <= FLASH_SECONDS:
            p.flash = True

        gained = 0
        if p.correct:
            # Hız bazlı puan: erken = çok. Kalan süre oranı * MAX_POINTS + taban.
            remaining = max(0.0, q.duration - elapsed)
            ratio = remaining / q.duration if q.duration else 0
            gained = int(300 + ratio * (MAX_POINTS - 300))  # 300 taban, hızla 1000'e
            p.score += gained

        return {
            "ok": True,
            "correct": p.correct,
            "gained": gained,
            "flash": p.flash,
            "answer": q.word,
            "tiles": [{"letter": r.letter, "state": r.state.value} for r in evaluate_guess(g, q.word)] if len(g) == q.length else [],
        }

    def all_answered(self) -> bool:
        return all(p.answered for p in self.players.values())

    def reveal(self) -> dict:
        """Soru bitti — doğru cevap + herkesin durumu + tüm soru geçmişi (tablo için)."""
        self.state = "reveal"
        q = self.current_question()
        # Bu sorunun sonucunu her oyuncunun geçmişine ekle
        for p in self.players.values():
            p.history.append({"correct": p.correct, "flash": p.flash, "answered": p.answered})
            if p.correct:
                p.correct_count += 1
        total_q = len(self.questions)
        return {
            "answer": q.word if q else "",
            "index": self.current_index,
            "total": total_q,
            "players": [
                {
                    "pid": p.pid, "name": p.name, "avatar_url": p.avatar_url, "is_bot": p.is_bot,
                    "answered": p.answered, "correct": p.correct, "flash": p.flash, "score": p.score,
                    "correct_count": p.correct_count,
                    "history": list(p.history),   # [{correct,flash,answered}, ...] soru sırasıyla
                }
                for p in self.players.values()
            ],
        }

    def is_last_question(self) -> bool:
        return self.current_index >= len(self.questions) - 1

    def final_ranking(self) -> list[dict]:
        """Puana göre sıralı sonuç. 1=kupa, 2-3=madalya."""
        ranked = sorted(self.players.values(), key=lambda p: p.score, reverse=True)
        out = []
        rank = 0
        prev_score = None
        for i, p in enumerate(ranked):
            # eşit puan aynı sıra
            if p.score != prev_score:
                rank = i + 1
                prev_score = p.score
            flash_count = sum(1 for h in p.history if h.get("flash"))
            out.append({
                "pid": p.pid, "name": p.name, "avatar_url": p.avatar_url,
                "is_bot": p.is_bot, "score": p.score, "rank": rank,
                "correct_count": p.correct_count, "flash_count": flash_count,
            })
        return out
