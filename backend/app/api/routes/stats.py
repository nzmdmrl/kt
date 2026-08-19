"""
Ziyaret sayacı — admin özet ekranındaki "kaç ziyaretçi" sayıları.

TEK UÇ: POST /stats/visit (herkese açık)
Arayüz GÜNDE BİR KEZ çağırır (cihazda tarih damgası tutulur —
frontend/components/VisitPing.tsx). Sunucu yalnızca sayacı bir artırır.

Ortam (mobil uygulama / mobil tarayıcı / masaüstü) SUNUCUDA user agent'tan
çıkarılır; istemcinin söylediğine güvenilmez.

KİŞİSEL VERİ TUTULMAZ: satırda yalnız gün, ortam ve sayı var. IP, user agent,
kullanıcı kimliği ya da tarayıcı anahtarı SAKLANMAZ. Eski sürüm ziyaretçi
başına satır yazıyordu; sayaca geçildi (bkz. app/models/daily_stat.py).
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import engine, get_db
from app.core.deps import get_optional_user
from app.core.platform import platform_from_request
from app.models.daily_stat import METRIC_VISITORS
from app.models.user import User

router = APIRouter(prefix="/stats", tags=["stats"])

_IS_PG = engine.dialect.name == "postgresql"

# Sayacı artıran TEK ifade: satır yoksa 1 ile açar, varsa bir artırır.
# Tek cümle olması önemli — satır kilidi mümkün olan en kısa süre tutulur
# (ayrıntı: app/models/daily_stat.py ve admin panelindeki açıklama).
_BUMP_SQL = (
    "INSERT INTO daily_stats (stat_date, platform, metric, count, updated_at) "
    f"VALUES (:d, :p, :m, 1, {'now()' if _IS_PG else 'CURRENT_TIMESTAMP'}) "
    "ON CONFLICT (stat_date, platform, metric) DO UPDATE "
    f"SET count = daily_stats.count + 1, updated_at = {'now()' if _IS_PG else 'CURRENT_TIMESTAMP'}"
)


class VisitIn(BaseModel):
    # Geriye dönük uyumluluk için duruyor; ARTIK KULLANILMIYOR.
    # Tekilleştirme cihaza taşındı, sunucu kimlik tutmuyor.
    client_key: str = ""


async def bump_visit(db: AsyncSession, platform: str, day: date | None = None) -> None:
    """Bir ortamın günlük ziyaretçi sayacını bir artırır."""
    await db.execute(text(_BUMP_SQL), {
        "d": day or date.today(), "p": platform, "m": METRIC_VISITORS,
    })


@router.post("/visit")
async def record_visit(
    data: VisitIn,
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Bugünün ziyaretçi sayacını bir artırır (istemci günde bir kez çağırır)."""
    platform = platform_from_request(request)

    # Girişli kullanıcının SON kullandığı ortam — admin üye listesindeki simge.
    if user is not None and user.last_platform != platform:
        user.last_platform = platform

    try:
        await bump_visit(db, platform)
        await db.commit()
    except Exception as e:
        await db.rollback()
        print(f"[ziyaret sayacı] artırılamadı ({type(e).__name__}: {e})")
        return {"ok": True, "counted": False, "platform": platform}

    return {"ok": True, "counted": True, "platform": platform}
