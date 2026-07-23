"""
Matchmaking — "Rakip Bul".

Basit, in-process kuyruk (Faz 4). Oyuncu kuyruğa girer; ELO'su yakın başka
bekleyen varsa hemen eşleşir ve ortak bir oda kodu üretilir. 15 sn içinde
insan bulunamazsa ELO'su yakın bir bot atanır.

Ölçek gerektiğinde kuyruk Redis'e taşınacak; dışarı verilen API (join_queue,
poll) aynı kalacak şekilde tasarlandı.

Not: Bu modül yalnızca "kiminle oynanacağına" karar verir ve bir oda kodu +
(varsa) bot bilgisini döner. Asıl maç WebSocket + Room üzerinden yürür.
"""

from __future__ import annotations

import asyncio
import time
import secrets
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class QueueEntry:
    player_id: str
    name: str
    elo: int
    joined_at: float = field(default_factory=time.time)
    # Eşleşince doldurulur:
    matched: bool = False
    room_code: Optional[str] = None
    opponent_is_bot: bool = False
    bot_elo: Optional[int] = None


class Matchmaker:
    def __init__(self):
        self.waiting: dict[str, QueueEntry] = {}
        self._lock = asyncio.Lock()

    def _new_code(self) -> str:
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        return "".join(secrets.choice(alphabet) for _ in range(6))

    async def join(self, player_id: str, name: str, elo: int) -> QueueEntry:
        """Kuyruğa gir. Uygun bekleyen varsa anında eşleş."""
        async with self._lock:
            # Zaten kuyruktaysa mevcut girişi döndür.
            if player_id in self.waiting:
                return self.waiting[player_id]

            # ELO'ya yakın bekleyen bir insan ara (±200, en yakını).
            best: Optional[QueueEntry] = None
            best_diff = 10 ** 9
            for e in self.waiting.values():
                if e.matched or e.player_id == player_id:
                    continue
                diff = abs(e.elo - elo)
                if diff < best_diff and diff <= 300:
                    best = e
                    best_diff = diff

            entry = QueueEntry(player_id=player_id, name=name, elo=elo)

            if best is not None:
                # Eşleş: ortak oda kodu.
                code = self._new_code()
                best.matched = True
                best.room_code = code
                entry.matched = True
                entry.room_code = code
                # İkisi de kuyrukta kalsın ki poll edince öğrensinler; poll temizler.
                self.waiting[player_id] = entry
                return entry

            # Bekleyen yok — kuyruğa ekle.
            self.waiting[player_id] = entry
            return entry

    async def poll(self, player_id: str) -> Optional[QueueEntry]:
        """
        Oyuncunun eşleşme durumunu sorgular.
        Eşleştiyse girişi döndürür (ve kuyruktan düşürür).
        15 sn geçtiyse bot atar.
        """
        async with self._lock:
            entry = self.waiting.get(player_id)
            if not entry:
                return None

            if entry.matched:
                # Eşleşme tamam — kuyruktan çıkar.
                self.waiting.pop(player_id, None)
                return entry

            # 15 sn doldu mu? Bot ata.
            if time.time() - entry.joined_at >= 15.0:
                entry.matched = True
                entry.room_code = self._new_code()
                entry.opponent_is_bot = True
                # Bot ELO'su: oyuncuya yakın, ±150 rastgele.
                import random
                entry.bot_elo = max(500, entry.elo + random.randint(-150, 150))
                self.waiting.pop(player_id, None)
                return entry

            # Hâlâ bekliyor.
            return entry

    async def leave(self, player_id: str) -> None:
        async with self._lock:
            self.waiting.pop(player_id, None)

    def queue_size(self) -> int:
        return len([e for e in self.waiting.values() if not e.matched])


matchmaker = Matchmaker()
