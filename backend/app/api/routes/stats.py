"""
Ziyaret sayacı — admin özet ekranındaki "bugün kaç ziyaretçi" sayıları.

TEK UÇ: POST /stats/visit (herkese açık)
Arayüz oturum başına BİR KEZ çağırır. Ortam (mobil uygulama / mobil tarayıcı /
masaüstü) SUNUCUDA user agent'tan çıkarılır — istemcinin söylediğine güvenilmez.

Kişisel veri YAZILMAZ: satırda yalnız gün, ortam ve bir ziyaretçi anahtarı var
(girişliyse "u{id}", değilse tarayıcıda üretilmiş rastgele bir dize). IP ve
user agent saklanmaz.

Aynı kişi gün içinde kaç kez girerse girsin tek satır olur (benzersizlik kısıtı).
"""

from __future__ import annotations

import re
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_optional_user
from app.core.platform import platform_from_request
from app.models.daily_visit import DailyVisit
from app.models.user import User

router = APIRouter(prefix="/stats", tags=["stats"])

_KEY_RE = re.compile(r"[^A-Za-z0-9_-]")


class VisitIn(BaseModel):
    # Girişsiz ziyaretçinin tarayıcısında üretilmiş rastgele anahtar.
    # Girişliyse yok sayılır (kullanıcı kimliği kullanılır).
    client_key: str = ""


@router.post("/visit")
async def record_visit(
    data: VisitIn,
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Bugünün tekil ziyaretçi sayacına bir kayıt ekler (varsa dokunmaz)."""
    platform = platform_from_request(request)

    if user is not None:
        key = f"u{user.id}"
        # Kullanıcının SON kullandığı ortam — admin üye listesindeki cihaz simgesi.
        if user.last_platform != platform:
            user.last_platform = platform
    else:
        cleaned = _KEY_RE.sub("", data.client_key or "")[:40]
        if not cleaned:
            # Anahtar yoksa sayacı kirletmemek için hiçbir şey yazılmaz.
            await db.commit()
            return {"ok": True, "counted": False, "platform": platform}
        key = f"c{cleaned}"

    today = date.today()
    exists = (await db.execute(
        select(DailyVisit.id).where(
            DailyVisit.visit_date == today,
            DailyVisit.platform == platform,
            DailyVisit.visitor_key == key,
        )
    )).scalar_one_or_none()
    if exists is None:
        db.add(DailyVisit(visit_date=today, platform=platform, visitor_key=key))
    try:
        await db.commit()
    except Exception:
        # Aynı anda iki istek gelirse benzersizlik kısıtı patlayabilir — zararsız.
        await db.rollback()
    return {"ok": True, "counted": exists is None, "platform": platform}
