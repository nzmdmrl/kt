"""
Moderasyon uçları — admin panelindeki 🖼️ Foto Mod ve 🏷️ Ad Mod sekmeleri.

Foto: kullanıcı profil fotoğrafı yükler (200x200 JPEG), `avatar_pending`e düşer.
      Onaylanana kadar SADECE sahibi görür (User.to_private). Onaylanınca
      `avatar_photo`a taşınır ve herkese görünür (User.to_public).

Ad:   yeni kullanıcıların görünen adı/kullanıcı adı `name_status="pending"` ile
      gelir. Admin reddederse ad `user{id}{rastgele}` biçimine döner ve
      kullanıcıya bildirim gider.

Uçlar (hepsi get_admin_user):
- GET  /admin/moderation/counts            -> sekme rozetleri {avatars, names}
- GET  /admin/moderation/avatars           -> bekleyen fotoğraflar
- POST /admin/moderation/avatars/{id}/approve | /reject
- GET  /admin/moderation/names?status=     -> kullanıcı adları (varsayılan: pending)
- POST /admin/moderation/names/{id}/approve | /reject
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_admin_user
from app.models.notification import Notification
from app.models.user import User

router = APIRouter(prefix="/admin/moderation", tags=["moderation"])


def _row(u: User) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "display_name": u.display_name,
        "avatar_url": u.avatar_photo or u.avatar_url,
        "name_status": u.name_status or "pending",
        "created_at": u.created_at.isoformat() if getattr(u, "created_at", None) else None,
    }


@router.get("/counts")
async def counts(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Sekme rozetleri: bekleyen fotoğraf ve bekleyen ad sayısı."""
    photos = (await db.execute(
        select(func.count(User.id)).where(User.avatar_pending.isnot(None))
    )).scalar_one()
    names = (await db.execute(
        select(func.count(User.id)).where(User.name_status == "pending")
    )).scalar_one()
    return {"avatars": int(photos or 0), "names": int(names or 0)}


# ---------------------------------------------------------------- fotoğraf

@router.get("/avatars")
async def pending_avatars(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(User).where(User.avatar_pending.isnot(None)).order_by(User.avatar_pending_at.asc())
    )).scalars().all()
    return {"users": [{
        **_row(u),
        "pending_photo": u.avatar_pending,
        "pending_at": u.avatar_pending_at.isoformat() if u.avatar_pending_at else None,
    } for u in rows]}


async def _get_user(db: AsyncSession, uid: int) -> User:
    u = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "Kullanıcı bulunamadı.")
    return u


@router.post("/avatars/{user_id}/approve")
async def approve_avatar(user_id: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Fotoğrafı yayına al — artık herkes görür."""
    u = await _get_user(db, user_id)
    if not u.avatar_pending:
        raise HTTPException(400, "Bekleyen fotoğraf yok.")
    u.avatar_photo = u.avatar_pending
    u.avatar_pending = None
    u.avatar_pending_at = None
    db.add(Notification(
        user_id=u.id, kind="photo_approved", type_code="photo_approved",
        title="Profil fotoğrafın onaylandı",
        body="Yüklediğin profil fotoğrafı onaylandı, artık herkes görebiliyor.",
        icon="🖼️", link=f"/profil/{u.username}" if u.username else "/bildirimler",
    ))
    await db.commit()
    return {"ok": True}


@router.post("/avatars/{user_id}/reject")
async def reject_avatar(user_id: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Fotoğrafı reddet — yükleme silinir, eski/onaylı avatar kalır."""
    u = await _get_user(db, user_id)
    if not u.avatar_pending:
        raise HTTPException(400, "Bekleyen fotoğraf yok.")
    u.avatar_pending = None
    u.avatar_pending_at = None
    db.add(Notification(
        user_id=u.id, kind="photo_rejected", type_code="photo_rejected",
        title="Profil fotoğrafın onaylanmadı",
        body="Yüklediğin profil fotoğrafı kurallara uymadığı için yayınlanmadı. Farklı bir fotoğraf yükleyebilirsin.",
        icon="🚫", link="/bildirimler",
    ))
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- ad / kullanıcı adı

@router.get("/names")
async def name_list(
    status: str = Query("pending"),
    limit: int = Query(100, ge=1, le=300),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(User)
    if status in ("pending", "approved", "rejected"):
        q = q.where(User.name_status == status)
    q = q.order_by(User.id.desc()).limit(limit)
    rows = (await db.execute(q)).scalars().all()
    return {"users": [_row(u) for u in rows], "status": status}


@router.post("/names/{user_id}/approve")
async def approve_name(user_id: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    u = await _get_user(db, user_id)
    u.name_status = "approved"
    u.name_reviewed_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True, "user": _row(u)}


async def _safe_generic_name(db: AsyncSession, uid: int) -> str:
    """Benzersiz 'user123456' biçimi üret (çakışırsa yeniden dener)."""
    for _ in range(20):
        candidate = f"user{uid}{secrets.randbelow(900) + 100}"
        exists = (await db.execute(select(User.id).where(User.username == candidate))).scalar_one_or_none()
        if not exists:
            return candidate
    return f"user{uid}{secrets.randbelow(900000) + 100000}"


@router.post("/names/{user_id}/reject")
async def reject_name(user_id: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Adı reddet: görünen ad + kullanıcı adı 'user123456' biçimine döner, bildirim gider."""
    from app.models.username_change import UsernameChange
    u = await _get_user(db, user_id)
    old_username = u.username
    generic = await _safe_generic_name(db, u.id)
    u.username = generic
    u.display_name = generic
    u.name_status = "rejected"
    u.name_reviewed_at = datetime.now(timezone.utc)
    if old_username and old_username != generic:
        db.add(UsernameChange(user_id=u.id, old_username=old_username, new_username=generic))
    db.add(Notification(
        user_id=u.id, kind="name_rejected", type_code="name_rejected",
        title="Görünen adın onaylanmadı",
        body=f"Yönetici görünen adını onaylamadı; adın {generic} olarak değiştirildi. "
             f"Ayarlardan yeni bir ad seçebilirsin.",
        icon="🚫", link="/menu",
    ))
    await db.commit()
    return {"ok": True, "user": _row(u)}
