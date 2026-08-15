"""
Eski bildirimlerin otomatik temizliği.

Admin ayarı `notification_retention_days` (varsayılan 30) günden eski bildirim
satırları silinir. Kullanıcıya bu bilgi bildirim sayfasında yazılır
(GET /api/notifications yanıtındaki `retention_days`).

Basit in-process döngü — lig scheduler'ıyla aynı yaklaşım (main.py startup'ta
task olarak başlatılır). Ölçek büyürse harici cron'a taşınabilir.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification

CLEANUP_INTERVAL_SECONDS = 6 * 3600
DEFAULT_RETENTION_DAYS = 30


def retention_days() -> int:
    """Saklama süresi (gün). 0 veya negatifse otomatik silme kapalıdır."""
    from app.game.settings_service import cached_int
    return cached_int("notification_retention_days", DEFAULT_RETENTION_DAYS)


async def purge_old_notifications(db: AsyncSession) -> int:
    """Saklama süresini aşan bildirimleri sil; silinen satır sayısını döndür."""
    days = retention_days()
    if days <= 0:
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    res = await db.execute(delete(Notification).where(Notification.created_at < cutoff))
    await db.commit()
    return int(res.rowcount or 0)


async def notification_cleanup_loop():
    """6 saatte bir eski bildirimleri temizler. Startup'ta task olarak başlatılır."""
    from app.core.database import AsyncSessionLocal
    while True:
        try:
            async with AsyncSessionLocal() as db:
                removed = await purge_old_notifications(db)
                if removed:
                    print(f"[bildirim temizlik] {removed} eski bildirim silindi.")
        except Exception as e:
            print(f"[bildirim temizlik] HATA: {e}")
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
