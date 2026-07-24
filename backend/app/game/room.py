"""
Maç odası yöneticisi (in-process).

Faz 2 kapsamı: oda kodu ile iki oyuncuyu eşleştirip gerçek zamanlı maç
oynatmak. Matchmaking (rakip bul) ve botlar Faz 4'te gelecek.

Sorumluluklar:
  * Oda oluşturma / katılma (iki oyuncu dolunca maç başlar).
  * Her odaya bir saniyelik zamanlayıcı (asyncio task): tur/cevap geri sayımı,
    süre bitince sıra devri veya tur kapanışı, ardından state yayını.
  * Buzzer yarışını atomik çözme (aynı process içinde asyncio.Lock; çok-process
    ölçeğinde Redis SET NX'e geçilebilir — arayüz aynı kalır).
  * Bağlı tüm oyunculara maç durumunu yayınlamak.

NOT: Faz 2 tek backend replikası varsayar (Coolify'da tek instance). Ölçek
gerektiğinde oda state'i Redis'e taşınacak; bu modülün dışarı verdiği
arayüz (join/handle_message/broadcast) korunacak şekilde tasarlandı.
"""

from __future__ import annotations

import asyncio
import secrets
from typing import Optional

from fastapi import WebSocket

from app.game.match import Match, MatchError
from app.game.models import Player, MatchPhase


class Room:
    def __init__(self, code: str):
        self.code = code
        self.match: Optional[Match] = None
        self.sockets: dict[str, WebSocket] = {}   # player_id -> ws
        self.players: dict[str, Player] = {}
        self.buzzer_lock = asyncio.Lock()
        self._timer_task: Optional[asyncio.Task] = None
        self._round_gap_task: Optional[asyncio.Task] = None
        self._bot_controllers: list = []   # BotController listesi
        self.on_match_over = None          # sonuç callback (istatistik/ELO — match_ws bağlar)

    def add_bot(self, bot_id: str, name: str, elo: int, avatar_url: str | None = None,
                lang: str = "tr") -> None:
        """Odaya bot oyuncu ekler ve kontrolcüsünü hazırlar (maç başlayınca çalışır)."""
        from app.game.bot_controller import BotController
        p = Player(id=bot_id, name=name, is_bot=True)
        p.avatar_url = avatar_url  # Player'da alan yoksa yoksayılır; to_public'e eklenecek
        self.players[bot_id] = p
        self._bot_controllers.append(BotController(self, bot_id, elo, lang))

    @property
    def is_full(self) -> bool:
        return len(self.players) >= 2

    async def broadcast(self, message: dict) -> None:
        """Odadaki tüm bağlı oyunculara mesaj gönderir."""
        dead = []
        for pid, ws in self.sockets.items():
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(pid)
        for pid in dead:
            self.sockets.pop(pid, None)

    async def broadcast_state(self, extra: Optional[dict] = None) -> None:
        if not self.match:
            return
        msg = {"type": "state", "state": self.match.to_public()}
        if extra:
            msg.update(extra)
        await self.broadcast(msg)

    async def send_to_others(self, sender_id: str, message: dict) -> None:
        """Mesajı gönderen HARİÇ diğer oyunculara iletir (rövanş isteği vb.)."""
        for pid, ws in list(self.sockets.items()):
            if pid == sender_id:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                self.sockets.pop(pid, None)

    async def restart_match(self) -> None:
        """Aynı odada, aynı oyuncularla yeni bir maç başlatır (rövanş)."""
        # Eski maç durumunu ve skorları temizle.
        for p in self.players.values():
            p.score = 0
        if self._timer_task and not self._timer_task.done():
            self._timer_task.cancel()
        if self._round_gap_task and not self._round_gap_task.done():
            self._round_gap_task.cancel()
        self.match = None
        await self.start_match()

    async def start_match(self) -> None:
        players = list(self.players.values())
        self.match = Match(self.code, players)
        await self.broadcast({"type": "match_start", "state_players": [p.to_public() for p in players]})
        # Bot kontrolcülerini başlat (varsa).
        for bc in self._bot_controllers:
            bc.start()
        await self._begin_round()

    async def _begin_round(self) -> None:
        assert self.match is not None
        rnd = self.match.start_next_round()
        if self.match.phase == MatchPhase.FINISHED:
            await self._end_match()
            return
        await self.broadcast({"type": "round_start", "round_index": self.match.round_index})
        await self.broadcast_state()
        self._start_timer()

    def _start_timer(self) -> None:
        if self._timer_task and not self._timer_task.done():
            self._timer_task.cancel()
        self._timer_task = asyncio.create_task(self._run_timer())

    async def _run_timer(self) -> None:
        """Saniyelik geri sayım. Tur/cevap sürelerini işler, süre bitişlerini yönetir."""
        try:
            while self.match and self.match.phase == MatchPhase.ROUND_ACTIVE:
                await asyncio.sleep(1)
                m = self.match
                if not m or m.phase != MatchPhase.ROUND_ACTIVE or m.round is None:
                    break
                r = m.round
                prev_turn = r.turn_player_id
                m.tick()

                # Cevap penceresi doldu mu? (buzzer sahibi vardı ama süre bitti)
                if prev_turn is not None and r.answer_time_left == 0 and not r.finished:
                    m.on_answer_timeout()
                    await self.broadcast({"type": "turn_timeout", "player_id": prev_turn})

                # Tur toplam süresi bitti mi?
                if r.time_left <= 0 and not r.finished:
                    m.on_round_timeout()
                    await self.broadcast_state()
                    await self._after_round()
                    return

                await self.broadcast_state()
        except asyncio.CancelledError:
            pass

    async def _after_round(self) -> None:
        """Tur bitti — doğru cevabı görme arası, sonra sonraki tur veya maç sonu."""
        assert self.match is not None
        from app.game.models import REVEAL_SECONDS
        await self.broadcast({
            "type": "round_over",
            "round_index": self.match.round_index,
            "scores": {pid: p.score for pid, p in self.match.players.items()},
            "reveal_word": self.match.round.reveal_word if self.match.round else None,
        })
        # Doğru cevabı görme arası (bilinemediyse kelime ekranda kalır).
        await asyncio.sleep(REVEAL_SECONDS)
        if self.match:
            await self._begin_round()

    async def _end_match(self) -> None:
        assert self.match is not None
        result = self.match.result()
        # Bot kontrolcülerini durdur.
        for bc in self._bot_controllers:
            bc.stop()
        await self.broadcast({"type": "match_over", "result": result,
                              "players": [p.to_public() for p in self.match.players.values()]})
        # İstatistik/ELO güncelleme callback'i (match_ws bağlar).
        if self.on_match_over:
            try:
                await self.on_match_over(self.match, result)
            except Exception:
                pass

    async def handle_opponent_left(self, left_player_id: str) -> None:
        """
        Bir oyuncu maç sırasında ayrıldı. Kalan oyuncu(lar) kazanır, maç biter.
        Kalan oyuncuya "rakip ayrıldı" bildirilir; ayrılan için terk kaydı işlenir.
        """
        if not self.match:
            return
        from app.game.models import MatchPhase
        if self.match.phase == MatchPhase.FINISHED:
            return

        # Zamanlayıcıları durdur.
        if self._timer_task and not self._timer_task.done():
            self._timer_task.cancel()
        if self._round_gap_task and not self._round_gap_task.done():
            self._round_gap_task.cancel()
        for bc in self._bot_controllers:
            bc.stop()

        # Kalan (hâlâ bağlı) oyuncuyu kazanan ilan et.
        remaining = [pid for pid in self.sockets.keys() if pid in self.match.players]
        winner = remaining[0] if remaining else None

        self.match.phase = MatchPhase.FINISHED
        result = self.match.result()
        # Kazananı ayrılmaya göre ez (skor eşit olsa bile kalan kazanır).
        if winner:
            result["winner"] = winner
            result["opponent_left"] = True

        await self.broadcast({
            "type": "match_over",
            "result": result,
            "opponent_left": True,
            "players": [p.to_public() for p in self.match.players.values()],
        })

        # İstatistik/lig callback'i — kalan kazanan, ayrılan kaybeden olarak işlenir.
        if self.on_match_over:
            try:
                await self.on_match_over(self.match, result)
            except Exception:
                pass

        # Ayrılan oyuncu için terk kaydı (ceza sistemi).
        try:
            from app.game.abandon_service import record_abandon
            from app.core.database import AsyncSessionLocal
            if left_player_id.startswith("u"):
                uid = int(left_player_id[1:])
                async with AsyncSessionLocal() as db:
                    await record_abandon(db, uid)
        except Exception:
            pass

    # ---- oyuncu olayları ----
    async def handle_buzzer(self, player_id: str) -> None:
        if not self.match:
            return
        async with self.buzzer_lock:
            try:
                self.match.take_buzzer(player_id)
            except MatchError as e:
                await self._send_error(player_id, str(e))
                return
        await self.broadcast({"type": "buzzer_taken", "player_id": player_id})
        await self.broadcast_state()

    async def handle_guess(self, player_id: str, guess: str) -> None:
        if not self.match:
            return
        try:
            result = self.match.submit_guess(player_id, guess)
        except MatchError as e:
            await self._send_error(player_id, str(e))
            return
        await self.broadcast({"type": "guess_result", **result})
        await self.broadcast_state()
        # Harflerin sırayla belirmesi ve sonucun görülmesi için kısa duraklama.
        await asyncio.sleep(1.6)
        await self.broadcast_state()
        if result["round_over"]:
            if self._timer_task and not self._timer_task.done():
                self._timer_task.cancel()
            await self._after_round()

    async def _send_error(self, player_id: str, message: str) -> None:
        ws = self.sockets.get(player_id)
        if ws:
            try:
                await ws.send_json({"type": "error", "message": message})
            except Exception:
                pass


class RoomManager:
    def __init__(self):
        self.rooms: dict[str, Room] = {}

    def get_or_create(self, code: str) -> Room:
        room = self.rooms.get(code)
        if not room:
            room = Room(code)
            self.rooms[code] = room
        return room

    def new_code(self) -> str:
        # 5 haneli okunur oda kodu
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        while True:
            code = "".join(secrets.choice(alphabet) for _ in range(5))
            if code not in self.rooms:
                return code

    def remove(self, code: str) -> None:
        self.rooms.pop(code, None)


room_manager = RoomManager()
