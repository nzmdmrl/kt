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
WAIT_SECONDS = 15   # varsayılan; admin ayarı arena_wait_seconds ile değişir


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
        from app.game.settings_service import cached_int
        wait = cached_int("arena_wait_seconds", WAIT_SECONDS)
        return time.time() - self.created_at >= wait


class CustomArenaLobby:
    """Özel (davet bazlı) arena lobisi. Sahibi ayarları belirler; kod/link ile katılım."""

    def __init__(self, owner_pid: str, name: str, size: int, wait_seconds: int,
                 bots_enabled: bool, word_plan: list[int]):
        self.code = "ca-" + uuid.uuid4().hex[:8]
        self.owner_pid = owner_pid
        self.name = name
        self.size = max(2, min(5, size))
        self.wait_seconds = max(10, min(120, wait_seconds))
        self.bots_enabled = bots_enabled
        self.word_plan = word_plan[:6] if word_plan else [4, 4, 5, 5, 6, 6]
        self.created_at = time.time()
        self.members: dict[str, dict] = {}   # pid -> {name, avatar_url}
        self.started = False

    def add(self, pid: str, name: str, avatar_url: str):
        if len(self.members) < self.size:
            self.members[pid] = {"name": name, "avatar_url": avatar_url}

    def is_full(self) -> bool:
        return len(self.members) >= self.size

    def waited_enough(self) -> bool:
        return time.time() - self.created_at >= self.wait_seconds

    def seconds_left(self) -> int:
        return max(0, int(self.wait_seconds - (time.time() - self.created_at)))


class ArenaManager:
    def __init__(self):
        self._lobby: Optional[ArenaLobby] = None
        self.matches: dict[str, ArenaMatch] = {}   # code -> ArenaMatch
        self.custom_lobbies: dict[str, CustomArenaLobby] = {}  # code -> CustomArenaLobby
        self._lock = asyncio.Lock()

    # ---- özel arena ----
    def create_custom(self, owner_pid: str, name: str, size: int, wait_seconds: int,
                      bots_enabled: bool, word_plan: list[int]) -> CustomArenaLobby:
        lobby = CustomArenaLobby(owner_pid, name, size, wait_seconds, bots_enabled, word_plan)
        self.custom_lobbies[lobby.code] = lobby
        return lobby

    def custom_lobby(self, code: str) -> Optional[CustomArenaLobby]:
        return self.custom_lobbies.get(code)

    async def join_custom(self, code: str, pid: str, name: str, avatar_url: str) -> bool:
        """Oyuncuyu özel lobiye ekle. Lobi yoksa/başladıysa/doluysa False."""
        async with self._lock:
            lobby = self.custom_lobbies.get(code)
            if not lobby or lobby.started:
                return False
            if pid not in lobby.members and lobby.is_full():
                return False
            lobby.add(pid, name, avatar_url)
            return True

    async def build_custom_match(self, code: str, words: list[str]) -> Optional[ArenaMatch]:
        """Özel lobiyi maça çevir (word_plan lobiden). Sadece gerçek oyuncular."""
        async with self._lock:
            lobby = self.custom_lobbies.get(code)
            if not lobby:
                return self.matches.get(code)
            if code in self.matches:
                return self.matches[code]
            lobby.started = True
            match = ArenaMatch(code, words, word_plan=lobby.word_plan)
            for pid, info in lobby.members.items():
                match.add_player(pid, info["name"], info.get("avatar_url", ""), is_bot=False)
            self.matches[code] = match
            return match

    def add_one_bot_custom(self, code: str, max_size: int) -> Optional[dict]:
        """Özel maça bir bot ekler (max_size'a kadar)."""
        match = self.matches.get(code)
        if not match or len(match.players) >= max_size:
            return None
        import uuid as _uuid
        from app.game.bot_names import random_bot_names, avatar_url_for
        bn = random_bot_names(1)[0]
        bpid = f"bot:{_uuid.uuid4().hex[:6]}"
        match.add_player(bpid, bn, avatar_url_for(bn), is_bot=True)
        return {"pid": bpid, "name": bn, "avatar_url": avatar_url_for(bn), "is_bot": True}

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

    async def build_match(self, code: str, words: list[str], word_plan: list[int] | None = None) -> ArenaMatch:
        """Lobiyi maça çevir (SADECE gerçek oyuncular). Botlar sonra kademeli eklenir."""
        async with self._lock:
            lobby = self.lobby_for(code)
            if not lobby:
                if code in self.matches:
                    return self.matches[code]
                raise RuntimeError("Lobi bulunamadı")
            lobby.started = True

            match = ArenaMatch(code, words, word_plan=word_plan)
            for pid, info in lobby.members.items():
                match.add_player(pid, info["name"], info.get("avatar_url", ""), is_bot=False)

            self.matches[code] = match
            if self._lobby and self._lobby.code == code:
                self._lobby = None
            return match

    def add_one_bot(self, code: str) -> Optional[dict]:
        """Maça bir bot ekler; eklenen botun bilgisini döndürür (yoksa None)."""
        match = self.matches.get(code)
        if not match or len(match.players) >= ARENA_SIZE:
            return None
        import uuid as _uuid
        from app.game.bot_names import random_bot_names, avatar_url_for
        bn = random_bot_names(1)[0]
        bpid = f"bot:{_uuid.uuid4().hex[:6]}"
        match.add_player(bpid, bn, avatar_url_for(bn), is_bot=True)
        return {"pid": bpid, "name": bn, "avatar_url": avatar_url_for(bn), "is_bot": True}

    def get_match(self, code: str) -> Optional[ArenaMatch]:
        return self.matches.get(code)

    def cleanup(self, code: str):
        self.matches.pop(code, None)


arena_manager = ArenaManager()
