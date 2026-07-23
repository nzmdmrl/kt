"""
Bot kontrolcüsü (yeniden yazıldı — v6).

Bir maçta bot oyuncu varsa, bu görev botun adına oynar. Kritik ilkeler:
  * Bot ASLA insanla aynı anda tahmin yapmaz. Her hamle öncesi düşünme
    süresi bekler; sıra bota geçtiğinde de bir "yazma" gecikmesi bekler.
  * Bot yanlış yapıp sıra insana geçince, insan oynayana kadar bekler —
    araya girip tekrar denemez.
  * Tek bir asyncio döngüsü; durum makinesi gibi çalışır.

Sıra mantığı Match'te; bot yalnızca "sıra bendeyse oyna, boşsa düşün" yapar.
"""

from __future__ import annotations

import asyncio
import random

from app.game.models import MatchPhase
from app.game import bot_engine


class BotController:
    def __init__(self, room, bot_player_id: str, elo: int, lang: str = "tr"):
        self.room = room
        self.bot_id = bot_player_id
        self.elo = elo
        self.lang = lang
        self._task: asyncio.Task | None = None
        self._busy = False  # bot şu an bir hamle yürütüyor mu (paralel hamleyi önler)

    def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()

    async def _run(self) -> None:
        try:
            while True:
                await asyncio.sleep(0.4)
                match = self.room.match
                if not match:
                    continue
                if match.phase == MatchPhase.FINISHED:
                    return
                if match.phase != MatchPhase.ROUND_ACTIVE or match.round is None:
                    continue

                r = match.round
                if r.finished or self._busy:
                    continue

                turn = r.turn_player_id

                if turn == self.bot_id:
                    # Sıra botta — düşün, sonra tahmin et.
                    await self._take_my_turn(match, r)
                elif turn is None:
                    # Sıra boş — bot ilk buzzer'ı kapmayı düşünür (insana öncelik).
                    await self._consider_open_turn(match, r)
                # turn == insan ise: bekle, hiçbir şey yapma (bot araya girmez).
        except asyncio.CancelledError:
            pass
        except Exception:
            return

    async def _consider_open_turn(self, match, r) -> None:
        """Sıra boşken bot buzzer almayı düşünür — ama insana bol zaman tanır."""
        self._busy = True
        try:
            # İnsana yazma alanı: düşünme + belirgin taban gecikme.
            delay = bot_engine.think_delay(self.elo) + random.uniform(3.0, 6.0)
            waited = 0.0
            while waited < delay:
                await asyncio.sleep(0.3)
                waited += 0.3
                if r.finished or match.phase != MatchPhase.ROUND_ACTIVE:
                    return
                # İnsan bu sırada buzzer'ı kaptıysa bot çekilir.
                if r.turn_player_id is not None:
                    return

            # Hâlâ boşsa ve bot denemeye karar verirse buzzer al.
            if r.turn_player_id is not None or r.finished:
                return
            difficulty = self._difficulty_of(r)
            if not bot_engine.decide_action(self.elo, difficulty, len(r.rows), r.max_rows):
                return
            await self.room.handle_buzzer(self.bot_id)
            # Buzzer aldıktan sonra sıra gerçekten bize geçtiyse tahmin et.
            if r.turn_player_id == self.bot_id:
                await asyncio.sleep(random.uniform(1.5, 2.8))
                await self._guess_now(match, r)
        finally:
            self._busy = False

    async def _take_my_turn(self, match, r) -> None:
        """Sıra bota geçmiş (insan yanlış yaptı) — düşün, sonra tahmin et."""
        self._busy = True
        try:
            # Yazma gecikmesi — insan botun "yazdığını" görsün, ani olmasın.
            await asyncio.sleep(random.uniform(2.0, 3.5))
            if r.turn_player_id != self.bot_id or r.finished:
                return
            await self._guess_now(match, r)
        finally:
            self._busy = False

    async def _guess_now(self, match, r) -> None:
        if r.turn_player_id != self.bot_id or r.finished:
            return
        difficulty = self._difficulty_of(r)
        prob = bot_engine.solve_probability(self.elo, difficulty)
        prev_rows = [[{"letter": t.letter, "state": t.state.value} for t in row.tiles]
                     for row in r.rows]
        if random.random() < prob:
            guess = r.target
        else:
            guess = bot_engine.pick_guess(r.target, self.lang, prev_rows)
            # Zaten denenmiş bir kelimeyse başka bir tane seçmeye çalış.
            tried = {"".join(t.letter for t in row.tiles) for row in r.rows}
            attempts = 0
            while guess in tried and attempts < 8:
                guess = bot_engine.pick_guess(r.target, self.lang, prev_rows)
                attempts += 1
        await self.room.handle_guess(self.bot_id, guess)

    def _difficulty_of(self, r) -> str:
        return {4: "kolay", 5: "orta", 6: "zor"}.get(r.length, "orta")
