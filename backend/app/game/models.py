"""
Maç veri modelleri — WebSocket'ten bağımsız saf yapı.

Maç akışı: 3 tur. Her tur bir hedef kelime + paylaşımlı ızgara.
Buzzer: bir oyuncu sıra kilidini alır, 10 sn cevap penceresi. Doğru bilirse
kalan tur süresi kadar puan; yanlışsa/süre biterse sıra rakibe geçer.

Bu modüldeki hiçbir yapı hedef kelimeyi istemciye SERIALIZE ETMEZ;
istemciye gider hale getirirken (serialization) hedef ayıklanır.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


# Tur yapılandırması: (kelime uzunluğu, satır sayısı). Admin panelde değişebilir (Faz 10).
# Not: rows = başlangıçta görünen kutu satırı sayısı. Daha fazla tahmin yapılırsa
# ızgara aşağı doğru genişler (frontend kaydırmalı frame).
ROUND_CONFIG = [
    {"length": 4, "rows": 5},
    {"length": 5, "rows": 5},
    {"length": 6, "rows": 5},
]

# Süreler (saniye). Admin panelde değişebilir.
ROUND_TOTAL_SECONDS = 90      # tur başına toplam geri sayım
BUZZER_ANSWER_SECONDS = 20    # buzzer alındıktan sonra cevap penceresi

# Kelime kimse bilemeden tur bitince doğru cevabın gösterileceği süre (saniye).
REVEAL_SECONDS = 5

# Puanlama katsayıları (admin ayarlanabilir).
SPEED_BONUS = 10              # ilk buzzer'a basıp doğru bilene ek bonus


class MatchPhase(str, Enum):
    WAITING = "waiting"          # oyuncular bekleniyor
    ROUND_ACTIVE = "round_active"  # tur oynanıyor
    ROUND_OVER = "round_over"    # tur bitti, sonraki bekleniyor
    FINISHED = "finished"        # maç bitti


class TileState(str, Enum):
    CORRECT = "correct"
    PRESENT = "present"
    ABSENT = "absent"


@dataclass
class GuessTile:
    letter: str
    state: TileState


@dataclass
class GuessRow:
    """Izgaraya düşen bir tahmin satırı — kim yaptı, hangi harfler, renkleri."""
    player_id: str
    tiles: list[GuessTile]

    def to_public(self) -> dict:
        return {
            "player_id": self.player_id,
            "tiles": [{"letter": t.letter, "state": t.state.value} for t in self.tiles],
        }


@dataclass
class Player:
    id: str
    name: str
    score: int = 0
    connected: bool = True
    is_bot: bool = False
    avatar_url: Optional[str] = None
    # Başarı özeti (username altında gösterilir): kupa, madalya, rozet sayısı.
    trophies: int = 0
    medals: int = 0
    badges: int = 0

    def to_public(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "score": self.score,
            "connected": self.connected,
            "is_bot": self.is_bot,
            "avatar_url": self.avatar_url,
            "trophies": self.trophies,
            "medals": self.medals,
            "badges": self.badges,
        }


@dataclass
class RoundState:
    index: int                    # 0,1,2
    length: int
    max_rows: int
    target: str                   # GIZLI — istemciye gönderilmez
    rows: list[GuessRow] = field(default_factory=list)
    turn_player_id: Optional[str] = None   # şu an sırası olan (buzzer sahibi)
    first_buzzer_id: Optional[str] = None  # tur boyunca ilk basan (hız bonusu için)
    solved_by: Optional[str] = None        # kelimeyi bilen oyuncu
    time_left: int = ROUND_TOTAL_SECONDS   # tur geri sayımı
    answer_time_left: int = 0              # buzzer cevap penceresi
    finished: bool = False
    reveal_word: Optional[str] = None      # tur bitince gösterilecek doğru kelime (bilinemezse)
    # Joker ile bu tur açılan harfler (geçici ipucu — sadece o tahminde gösterilir).
    # {konum: harf} yeşil için; sarı için ayrı liste (konum, harf) — yanlış yerde.
    joker_greens: dict = field(default_factory=dict)   # {index: letter}
    joker_yellows: list = field(default_factory=list)  # [{"index": i, "letter": c}]
    joker_used_by: list = field(default_factory=list)  # turda joker kullananlar (oyuncu başına 1 hak)

    @property
    def first_letter(self) -> str:
        """Açık başlayan ilk harf (ipucu)."""
        return self.target[0] if self.target else ""

    def known_extra_letters(self) -> int:
        """
        İlk harf HARİÇ, kesin bilinen (doğru yerde) harf sayısı.
        Hem tahminlerden gelen yeşiller hem joker yeşilleri sayılır.
        Joker kullanım koşulu bunu kullanır.
        """
        known_positions = set()
        for row in self.rows:
            for i, t in enumerate(row.tiles):
                if i != 0 and t.state == TileState.CORRECT:
                    known_positions.add(i)
        # Joker ile açılan yeşiller de "bilinen" sayılır.
        for i in self.joker_greens:
            if i != 0:
                known_positions.add(i)
        return len(known_positions)

    def to_public(self) -> dict:
        """
        İstemciye giden güvenli görünüm — hedef kelime YALNIZCA tur bitince
        (reveal_word) gönderilir; oyun sürerken gizli kalır.
        """
        return {
            "index": self.index,
            "length": self.length,
            "max_rows": self.max_rows,
            "first_letter": self.first_letter,
            "rows": [r.to_public() for r in self.rows],
            "turn_player_id": self.turn_player_id,
            "time_left": self.time_left,
            "answer_time_left": self.answer_time_left,
            "solved_by": self.solved_by,
            "finished": self.finished,
            "reveal_word": self.reveal_word,
            "joker_greens": self.joker_greens,
            "joker_yellows": self.joker_yellows,
            "joker_used_by": self.joker_used_by,
        }
