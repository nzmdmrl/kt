"""
Arena eşleşme + oda yönetimi (bellekte, tek instance).

Akış:
- Oyuncu "katıl" der -> bekleyen bir odaya eklenir (yoksa yeni oda açılır).
- Oda 5 kişiye ulaşınca hemen başlar; ya da 30sn dolunca botlarla tamamlanıp başlar.
- Başlayan oda ArenaMatch'e dönüşür ve WS oyuncularına yayınlanır.

Not: presence/challenge gibi bellekte; tek instance varsayımı (ölçeklenince Redis).
"""

from __future__ import annotations

import asyncio
import time
import uuid
from typing import Optional

from app.game.arena import ArenaMatch

ARENA_SIZE = 5
WAIT_SECONDS = 30


class ArenaLobby:
    """Eşleşme bekleyen tek bir oda."""

    def __init__(self):
        self.code = "arena-" + uuid.uuid4().hex[:8]
        self.created_at = time.time()
        # pid -> {name, avatar_url}
        self.members: dict[str, dict] = {}
        self.started = False

    def add(self, pid: str, name: str, avatar_url: str):
        self.members[pid] = {"name": name, "avatar_url": avatar_url}

    def is_full(self) -> bool:
        return len(self.members) >= ARENA_SIZE

    def waited_enough(self) -> bool:
        return time.time() - self.created_at >= WAIT_SECONDS


class ArenaManager:
    def __init__(self):
        self._lobby: Optional[ArenaLobby] = None
        self.matches: dict[str, ArenaMatch] = {}   # code -> ArenaMatch
        self._lock = asyncio.Lock()

    async def join(self, pid: str, name: str, avatar_url: str) -> str:
        """Oyuncuyu bekleyen odaya ekle; oda kodunu döndür."""
        async with self._lock:
            if self._lobby is None or self._lobby.started or self._lobby.is_full():
                self._lobby = ArenaLobby()
            self._lobby.add(pid, name, avatar_url)
            return self._lobby.code

    def lobby_for(self, code: str) -> Optional[ArenaLobby]:
        if self._lobby and self._lobby.code == code:
            return self._lobby
        return None

    async def build_match(self, code: str, words: list[str]) -> ArenaMatch:
        """Lobiyi maça çevir; eksik oyuncuları botla tamamla."""
        async with self._lock:
            lobby = self.lobby_for(code)
            if not lobby:
                # zaten kurulmuş olabilir
                if code in self.matches:
                    return self.matches[code]
                raise RuntimeError("Lobi bulunamadı")
            lobby.started = True

            match = ArenaMatch(code, words)
            for pid, info in lobby.members.items():
                match.add_player(pid, info["name"], info.get("avatar_url", ""), is_bot=False)

            # Botlarla tamamla
            need = ARENA_SIZE - len(match.players)
            if need > 0:
                from app.game.bot_names import random_bot_names, avatar_url_for
                names = random_bot_names(need)
                for i, bn in enumerate(names):
                    bpid = f"bot:{uuid.uuid4().hex[:6]}"
                    match.add_player(bpid, bn, avatar_url_for(bn), is_bot=True)

            self.matches[code] = match
            if self._lobby and self._lobby.code == code:
                self._lobby = None
            return match

    def get_match(self, code: str) -> Optional[ArenaMatch]:
        return self.matches.get(code)

    def cleanup(self, code: str):
        self.matches.pop(code, None)


arena_manager = ArenaManager()
