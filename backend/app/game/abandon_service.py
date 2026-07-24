"""
Terk (maç bırakma) ceza servisi.

Amaç: maçı sürekli yarıda bırakan oyuncuları caydırmak, ama bağlantı sorunu
yaşayan dürüst oyuncuları haksız cezalandırmamak. Bu yüzden ceza KADEMELİ ve
 affedici:

  - Her terk `abandons` sayacını artırır.
  - İlk birkaç terk (eşik altı) CEZASIZ (bağlantı kopması olabilir).
  - Eşiği aşınca artan süreli geçici eşleştirme engeli uygulanır.
  - Engel sadece MATCHMAKING'i (rakip bul) etkiler; bota karşı / özel oda serbest.

Ayarlar admin panelden değiştirilebilir (game_setting):
  abandon_free_limit (varsayılan 2) — bu sayıya kadar ceza yok
  abandon_ban_minutes (varsayılan 10) — eşik sonrası temel engel süresi (kademeli çarpan)
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def record_abandon(db: AsyncSession, user_id: int) -> None:
    """Bir terk kaydeder ve gerekiyorsa geçici engel uygular."""
    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalar_one_or_none()
    if not user:
        return

    user.abandons = (user.abandons or 0) + 1

    # Ayarları oku (yoksa varsayılan).
    from app.game.settings_service import cached_int
    free_limit = cached_int("abandon_free_limit", 2)
    base_minutes = cached_int("abandon_ban_minutes", 10)

    if user.abandons > free_limit:
        # Eşik üstü her terk için artan engel: (terk - limit) * temel süre.
        over = user.abandons - free_limit
        minutes = base_minutes * over
        user.matchmaking_banned_until = datetime.now(timezone.utc) + timedelta(minutes=minutes)

    await db.commit()


async def is_matchmaking_banned(db: AsyncSession, user_id: int) -> tuple[bool, int]:
    """
    Kullanıcı şu an eşleştirmeden engelli mi? (banned, kalan_saniye) döner.
    """
    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalar_one_or_none()
    if not user or not user.matchmaking_banned_until:
        return False, 0
    now = datetime.now(timezone.utc)
    until = user.matchmaking_banned_until
    # timezone-naive gelirse UTC varsay.
    if until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    if until <= now:
        return False, 0
    remaining = int((until - now).total_seconds())
    return True, remaining
