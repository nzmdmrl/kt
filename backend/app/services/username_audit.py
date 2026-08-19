"""
Kullanıcı adı denetimi — mevcut kayıtlarda kuraldan sapanları BULUR, DEĞİŞTİRMEZ.

NEDEN VAR
---------
Kural sonradan sıkılaştırıldı:
  - kullanıcı adı yalnız a-z ve 0-9 içerir,
  - benzersizlik BÜYÜK/KÜÇÜK HARF AYRIMI YAPMAZ ("Yasemin" = "yasemin").

Kural değişmeden önce açılmış hesaplarda iki tür sapma olabilir:
  1. ÇAKIŞMA  : yalnız harf büyüklüğüyle ayrılan iki hesap ("Yasemin"/"yasemin"),
  2. GEÇERSİZ : içinde Türkçe harf, büyük harf, alt çizgi vb. olan adlar.

Bu modül ikisini de listeler ama HİÇBİRİNİ KENDİLİĞİNDEN DÜZELTMEZ. Karar
Nazım'ın: hangi hesabın kalacağı, hangisinin adının değişeceği ya da
birleştirileceği yalnız veriye bakarak anlaşılmaz.

HARF DUYARSIZ BENZERSİZ İNDEKS
------------------------------
`ensure_unique_index` veritabanına `lower(username)` üzerinde benzersiz indeks
kurar — böylece çakışma bir daha ASLA oluşamaz (uygulama kodu atlansa bile).
Ama ÇAKIŞMA VARKEN indeks kurulamaz; o durumda kurulum atlanır ve log'a
uyarı yazılır. Nazım çakışmaları çözünce ilk açılışta indeks kendiliğinden
oluşur — ayrıca bir iş yapmak gerekmez.
"""

from __future__ import annotations

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.game.name_rules import is_valid_username, slugify_username
from app.models.user import User

INDEX_NAME = "ux_users_username_lower"


def _row(u: User) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "display_name": u.display_name,
        "email": u.email,
        "created_at": u.created_at.isoformat() if getattr(u, "created_at", None) else None,
        "matches_played": u.matches_played or 0,
        "xp": u.xp or 0,
        "verified": bool(getattr(u, "verified", False)),
        "deleted": bool(getattr(u, "deleted", False)),
        # Kural uygulansaydı adı ne olurdu — kararı kolaylaştırsın diye.
        "would_become": slugify_username(u.username or ""),
    }


async def find_case_conflicts(db: AsyncSession) -> list[dict]:
    """Yalnız harf büyüklüğüyle ayrılan hesap grupları.

    Dönen: [{"key": "yasemin", "users": [ {...}, {...} ]}, ...]
    """
    # Önce çakışan küçük-harf anahtarları bul (grup sayısı > 1).
    keys = (await db.execute(
        select(func.lower(User.username))
        .group_by(func.lower(User.username))
        .having(func.count(User.id) > 1)
    )).scalars().all()
    if not keys:
        return []

    rows = (await db.execute(
        select(User).where(func.lower(User.username).in_(keys)).order_by(User.id)
    )).scalars().all()

    groups: dict[str, list[dict]] = {}
    for u in rows:
        groups.setdefault((u.username or "").lower(), []).append(_row(u))
    return [{"key": k, "users": v} for k, v in sorted(groups.items())]


async def find_invalid_usernames(db: AsyncSession, limit: int = 500) -> list[dict]:
    """Bugünkü karakter kuralına (a-z, 0-9) uymayan kullanıcı adları."""
    rows = (await db.execute(select(User).order_by(User.id))).scalars().all()
    out = []
    for u in rows:
        if not is_valid_username(u.username or ""):
            out.append(_row(u))
            if len(out) >= limit:
                break
    return out


async def index_exists(db: AsyncSession) -> bool:
    from app.core.database import engine
    if engine.dialect.name == "postgresql":
        sql = "SELECT COUNT(*) FROM pg_indexes WHERE indexname = :n"
    else:
        sql = "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name = :n"
    return int((await db.execute(text(sql), {"n": INDEX_NAME})).scalar() or 0) > 0


async def ensure_unique_index(db: AsyncSession) -> dict:
    """Harf duyarsız benzersiz indeksi kurar (çakışma yoksa).

    Dönen: {"created": bool, "already": bool, "blocked_by": int}
    blocked_by > 0 ise çakışma var demektir; indeks kurulmadı.
    """
    if await index_exists(db):
        return {"created": False, "already": True, "blocked_by": 0}

    conflicts = await find_case_conflicts(db)
    if conflicts:
        return {"created": False, "already": False, "blocked_by": len(conflicts)}

    await db.execute(text(
        f"CREATE UNIQUE INDEX IF NOT EXISTS {INDEX_NAME} ON users (lower(username))"
    ))
    await db.commit()
    return {"created": True, "already": False, "blocked_by": 0}


async def audit(db: AsyncSession) -> dict:
    """Panel/başlangıç raporu için tek çağrı."""
    conflicts = await find_case_conflicts(db)
    invalid = await find_invalid_usernames(db)
    return {
        "conflicts": conflicts,
        "conflict_groups": len(conflicts),
        "conflict_users": sum(len(g["users"]) for g in conflicts),
        "invalid": invalid,
        "invalid_count": len(invalid),
        "index_ready": await index_exists(db),
    }


async def startup_report() -> None:
    """Açılışta: indeksi kurmayı dene, kurulamıyorsa nedenini log'a yaz.

    HİÇBİR KAYDI DEĞİŞTİRMEZ.
    """
    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        res = await ensure_unique_index(db)
        if res["created"]:
            print("[kullanıcı adı] harf duyarsız benzersiz indeks kuruldu.")
            return
        if res["already"]:
            return
        conflicts = await find_case_conflicts(db)
        print(
            f"[kullanıcı adı] UYARI: {len(conflicts)} çakışma yüzünden benzersiz "
            "indeks kurulamadı. Çakışan adlar:"
        )
        for g in conflicts[:20]:
            who = ", ".join(f"#{u['id']} {u['username']}" for u in g["users"])
            print(f"  - {g['key']}: {who}")
        print(
            "  Çözülünce indeks bir sonraki açılışta kendiliğinden kurulur. "
            "Liste: admin → 👥 Üyeler."
        )
