"""
Ortam kırılımlı özet sayıları — admin → 📊 Özet.

Üç ortam (mobil uygulama / mobil tarayıcı / masaüstü) × üç ölçü
(ziyaretçi / yeni üye / doğrulama), seçilen tarih aralığı için.

VERİ NEREDEN GELİYOR
--------------------
ziyaretçi  : `daily_stats` SAYACI. Aralık, o aralıktaki GÜNLÜK satırların
             TOPLAMIDIR — yeni veri yazılmaz, mevcut satırlar toplanır.
             Anlamı "günlük tekil toplamı": pazartesi ve salı giren bir kişi
             2 sayılır (analitikte standart, arayüzde de böyle yazıyor).
yeni üye   : `users.created_at` + `signup_platform` — aralıkla doğrudan,
doğrulama  : `users.verified_at` + `verified_platform` — aralıkla doğrudan.

Son ikisi sayaç tutmaz çünkü `users` tablosundan her aralık için KESİN
hesaplanabiliyorlar. Ziyaretçide bu mümkün değil: geçmişe dönük ziyaret
bilgisi başka hiçbir yerde durmuyor.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily_stat import DailyStat, METRIC_VISITORS
from app.models.user import User

# Arayüzdeki aralık seçici — anahtar, etiket ve kaç günü kapsadığı.
RANGES = ("today", "yesterday", "week", "month")
RANGE_LABELS = {
    "today": "Bugün",
    "yesterday": "Dün",
    "week": "Bu hafta",
    "month": "Bu ay",
}

EMPTY = {"app": 0, "mobile": 0, "desktop": 0, "total": 0}


def range_bounds(range_key: str, today: date | None = None) -> tuple[date, date]:
    """Aralığın (ilk gün, son gün) sınırları — ikisi de DAHİL.

    "Bu hafta" pazartesiden bugüne, "bu ay" ayın 1'inden bugüne kadardır
    (ileriye dönük boş günler sayılmaz).
    """
    d = today or date.today()
    if range_key == "yesterday":
        y = d - timedelta(days=1)
        return y, y
    if range_key == "week":
        return d - timedelta(days=d.weekday()), d      # pazartesi -> bugün
    if range_key == "month":
        return d.replace(day=1), d                      # ayın 1'i -> bugün
    return d, d                                         # today (varsayılan)


def _with_total(counts: dict) -> dict:
    out = {k: int(counts.get(k, 0) or 0) for k in ("app", "mobile", "desktop")}
    out["total"] = out["app"] + out["mobile"] + out["desktop"]
    return out


async def platform_stats(db: AsyncSession, range_key: str = "today") -> dict:
    """Seçilen aralık için üç ölçünün ortam kırılımı."""
    if range_key not in RANGES:
        range_key = "today"
    start_d, end_d = range_bounds(range_key)

    # --- ziyaretçi: günlük sayaç satırlarının TOPLAMI
    visitors: dict = {}
    try:
        rows = (await db.execute(
            select(DailyStat.platform, func.sum(DailyStat.count))
            .where(
                DailyStat.metric == METRIC_VISITORS,
                DailyStat.stat_date >= start_d,
                DailyStat.stat_date <= end_d,
            )
            .group_by(DailyStat.platform)
        )).all()
        visitors = {p: n for p, n in rows}
    except Exception as e:
        print(f"[özet] ziyaretçi sayımı atlandı: {type(e).__name__}: {e}")

    # --- yeni üye / doğrulama: users tablosundan, aralıkla
    # Tarih sınırları güne çevrilir: [ilk gün 00:00, son gün+1 00:00)
    start_ts = datetime.combine(start_d, time.min, tzinfo=timezone.utc)
    end_ts = datetime.combine(end_d + timedelta(days=1), time.min, tzinfo=timezone.utc)

    async def _users_by_platform(date_col, platform_col) -> dict:
        try:
            rows = (await db.execute(
                select(platform_col, func.count(User.id))
                .where(date_col >= start_ts, date_col < end_ts)
                .group_by(platform_col)
            )).all()
            return {p: n for p, n in rows}
        except Exception as e:
            print(f"[özet] üye sayımı atlandı: {type(e).__name__}: {e}")
            return {}

    signups = await _users_by_platform(User.created_at, User.signup_platform)
    verifications = await _users_by_platform(User.verified_at, User.verified_platform)

    return {
        "range": range_key,
        "label": RANGE_LABELS[range_key],
        "start": start_d.isoformat(),
        "end": end_d.isoformat(),
        "visitors": _with_total(visitors),
        "signups": _with_total(signups),
        "verifications": _with_total(verifications),
    }
