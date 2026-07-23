"""
Bot kontrolcüsü.

Bir maçta bot oyuncu varsa, bu görev botun adına oynar: her turda botun
ELO'suna göre düşünme süresi bekler, buzzer'a basar, tahmin yapar. Gerçek
oyuncuyla aynı Room API'sini (handle_buzzer/handle_guess) kullanır — yani
bot da "dışarıdan gelen bir oyuncu" gibi davranır, maç mantığı onu ayırt etmez.

Botun kararları bot_engine'deki olasılıklara dayanır.
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
        self._acted_this_round: set[int] = set()  # hangi turlarda oynadı

    def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()

    async def _run(self) -> None:
        """Bot ana döngüsü — maç bitene kadar turları izler ve oynar."""
        try:
            while True:
                await asyncio.sleep(0.5)
                match = self.room.match
                if not match:
                    continue
                if match.phase == MatchPhase.FINISHED:
                    return
                if match.phase != MatchPhase.ROUND_ACTIVE or match.round is None:
                    continue

                r = match.round
                # Bu turu daha önce denedik mi, tur bitti mi?
                if r.finished or r.index in self._acted_this_round:
                    continue
                # Sıra doluysa (birinde buzzer var) bekle.
                if r.turn_player_id is not None:
                    # Eğer sıra bottaysa (nadiren buraya düşer) tahmini yap.
                    if r.turn_player_id == self.bot_id:
                        await self._make_guess(match, r)
                    continue

                # Sıra boş — bot devreye girmeyi düşünsün.
                await self._consider_turn(match, r)
        except asyncio.CancelledError:
            pass
        except Exception:
            # Bot hatası maçı düşürmesin.
            return

    async def _consider_turn(self, match, r) -> None:
        """Sıra boşken bot buzzer'a basmalı mı, ne zaman?"""
        # Düşünme süresi kadar bekle (bu sırada rakip önce basabilir).
        delay = bot_engine.think_delay(self.elo)
        waited = 0.0
        step = 0.3
        while waited < delay:
            await asyncio.sleep(step)
            waited += step
            # Rakip bu sırada buzzer'ı kaptıysa veya tur bittiyse vazgeç.
            if r.finished or r.turn_player_id is not None:
                return
            if match.phase != MatchPhase.ROUND_ACTIVE:
                return

        # Hâlâ sıra boşsa: bot bu turu denemeye karar veriyor mu?
        if r.turn_player_id is not None or r.finished:
            return

        difficulty = self._difficulty_of(r)
        if not bot_engine.decide_action(self.elo, difficulty, len(r.rows), r.max_rows):
            # Bu sefer pas — biraz bekleyip belki sonra dener (rakip basmazsa).
            return

        # Buzzer'a bas.
        await self.room.handle_buzzer(self.bot_id)
        # Kısa bir "yazma" gecikmesi, sonra tahmin.
        await asyncio.sleep(random.uniform(0.8, 1.8))
        await self._make_guess(match, r)

    async def _make_guess(self, match, r) -> None:
        if r.turn_player_id != self.bot_id or r.finished:
            return
        self._acted_this_round.add(r.index)
        difficulty = self._difficulty_of(r)
        prob = bot_engine.solve_probability(self.elo, difficulty)

        prev_rows = [[{"letter": t.letter, "state": t.state.value} for t in row.tiles]
                     for row in r.rows]

        if random.random() < prob:
            # Doğru bil.
            guess = r.target
        else:
            # İnandırıcı yanlış tahmin (ipuçlarını kısmen kullanır).
            guess = bot_engine.pick_guess(r.target, self.lang, prev_rows)

        await self.room.handle_guess(self.bot_id, guess)
        # Yanlışsa bu tur tekrar deneyebilmek için işareti kaldır
        # (sıra geri gelirse). Doğruysa tur zaten bitti.
        if not r.finished and r.index in self._acted_this_round:
            self._acted_this_round.discard(r.index)

    def _difficulty_of(self, r) -> str:
        """Turdaki hedef kelimenin zorluğunu havuzdan bulur (yaklaşık)."""
        # Basit yaklaşım: kelime uzunluğu arttıkça zorluk artar varsayımı yerine
        # havuzdaki etikete bakmak daha doğru; ama hızlı olması için uzunluk bazlı.
        # (Faz 10'da admin gerçek zorluk etiketini bağlayacak.)
        return {4: "kolay", 5: "orta", 6: "zor"}.get(r.length, "orta")
