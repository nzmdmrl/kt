"""
Arkadaşlık API'si.

- POST /friends/request/{user_id}   : teklif gönder (karşı tarafa bildirim)
- POST /friends/accept/{user_id}    : gelen teklifi kabul et (gönderene bildirim)
- POST /friends/reject/{user_id}    : gelen teklifi reddet (gönderene bildirim)
- POST /friends/remove/{user_id}    : arkadaşlıktan çıkar
- PUT  /friends/label/{user_id}     : arkadaşı etiketle (aile / is / diger · boş = kaldır)
- GET  /friends                     : arkadaş listesi (etiket + çevrimiçi durumu ile)
- GET  /friends/requests            : bana gelen bekleyen teklifler
- GET  /friends/status/{user_id}    : iki kullanıcı arası durum

status değerleri (status/{user_id} için):
  none | friends | request_sent | request_received
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, or_, and_, delete

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.friendship import Friendship
from app.models.friend_label import FriendLabel, FRIEND_LABELS
from app.models.notification import Notification
from app.models.user import User
from app.services.push import send_to_user_bg

router = APIRouter(prefix="/friends", tags=["friends"])

# Arkadaşlık istekleri bu sayfanın üstünde listelenir (app/bildirimler/page.tsx).
FRIEND_REQUESTS_ROUTE = "/bildirimler"


def _profile_route(u: User) -> str:
    """Kullanıcının profil yolu (arena/match_result ile aynı kalıp).

    username boşsa /profil/me DEĞİL /bildirimler döner: /profil/me isteği
    backend'de `WHERE username = 'me'` sorgusuna düşüp 404 veriyordu.
    """
    return f"/profil/{u.username}" if u.username else "/bildirimler"


async def _friendship_between(db, a: int, b: int):
    """a ve b arasındaki ilişki satırını döndür (yön fark etmez)."""
    res = await db.execute(select(Friendship).where(or_(
        and_(Friendship.requester_id == a, Friendship.addressee_id == b),
        and_(Friendship.requester_id == b, Friendship.addressee_id == a),
    )))
    return res.scalar_one_or_none()


async def friend_status(db, me: int, other: int) -> str:
    if me == other:
        return "self"
    f = await _friendship_between(db, me, other)
    if not f:
        return "none"
    if f.status == "accepted":
        return "friends"
    # pending
    return "request_sent" if f.requester_id == me else "request_received"


async def friend_count(db, user_id: int) -> int:
    res = await db.execute(select(Friendship).where(and_(
        Friendship.status == "accepted",
        or_(Friendship.requester_id == user_id, Friendship.addressee_id == user_id),
    )))
    return len(res.scalars().all())


@router.post("/request/{target_id}")
async def send_request(target_id: int, user: User = Depends(get_current_user), db=Depends(get_db)):
    if target_id == user.id:
        raise HTTPException(400, "Kendine istek gönderemezsin.")
    target = (await db.execute(select(User).where(User.id == target_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(404, "Kullanıcı bulunamadı.")
    existing = await _friendship_between(db, user.id, target_id)
    if existing:
        if existing.status == "accepted":
            raise HTTPException(400, "Zaten arkadaşsınız.")
        raise HTTPException(400, "Zaten bekleyen bir istek var.")

    # Saatlik istek limiti (admin: friend_request_hourly_limit, varsayılan 5)
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import func as _func
    from app.game.settings_service import cached_int
    limit = cached_int("friend_request_hourly_limit", 5)
    if limit > 0:
        since = datetime.now(timezone.utc) - timedelta(hours=1)
        recent = (await db.execute(
            select(_func.count()).select_from(Friendship).where(
                Friendship.requester_id == user.id,
                Friendship.created_at >= since,
            )
        )).scalar() or 0
        if recent >= limit:
            raise HTTPException(429, f"Saatlik istek sınırına ulaştın (en fazla {limit}). Lütfen sonra tekrar dene.")

    db.add(Friendship(requester_id=user.id, addressee_id=target_id, status="pending"))
    # Karşı tarafa bildirim
    n_title = "Yeni arkadaşlık isteği"
    n_body = f"{user.display_name or user.username} sana arkadaşlık isteği gönderdi."
    db.add(Notification(
        user_id=target_id, kind="friend_request", type_code="friend_request",
        title=n_title,
        body=n_body,
        icon="🤝",
        link=FRIEND_REQUESTS_ROUTE,   # push ile AYNI rota
    ))
    await db.commit()
    send_to_user_bg(target_id, "friend_request", n_title, n_body, FRIEND_REQUESTS_ROUTE,
                    ctx={"from_user_id": user.id})
    return {"ok": True, "status": "request_sent"}


@router.post("/accept/{requester_id}")
async def accept_request(requester_id: int, user: User = Depends(get_current_user), db=Depends(get_db)):
    f = await _friendship_between(db, user.id, requester_id)
    if not f or f.status != "pending" or f.addressee_id != user.id:
        raise HTTPException(404, "Bekleyen istek yok.")
    f.status = "accepted"
    n_title = "Arkadaşlık kabul edildi"
    n_body = f"{user.display_name or user.username} arkadaşlık isteğini kabul etti."
    # Kabul EDENİN profiline götürür (bildirimi alan, isteği gönderen taraf).
    n_link = _profile_route(user)
    db.add(Notification(
        user_id=requester_id, kind="friend_accept", type_code="friend_accept",
        title=n_title,
        body=n_body,
        icon="✅",
        link=n_link,                  # push ile AYNI rota
    ))
    await db.commit()
    send_to_user_bg(requester_id, "friend_accept", n_title, n_body, n_link,
                    ctx={"from_user_id": user.id})
    return {"ok": True, "status": "friends"}


@router.post("/reject/{requester_id}")
async def reject_request(requester_id: int, user: User = Depends(get_current_user), db=Depends(get_db)):
    f = await _friendship_between(db, user.id, requester_id)
    if not f or f.status != "pending" or f.addressee_id != user.id:
        raise HTTPException(404, "Bekleyen istek yok.")
    await db.delete(f)
    n_title = "Arkadaşlık reddedildi"
    n_body = f"{user.display_name or user.username} arkadaşlık isteğini reddetti."
    # Reddedenin profiline götürür (bildirimi alan, isteği gönderen taraf).
    n_link = _profile_route(user)
    db.add(Notification(
        user_id=requester_id, kind="friend_reject", type_code="friend_reject",
        title=n_title,
        body=n_body,
        icon="❌",
        link=n_link,                  # push ile AYNI rota
    ))
    await db.commit()
    send_to_user_bg(requester_id, "friend_reject", n_title, n_body, n_link,
                    ctx={"from_user_id": user.id})
    return {"ok": True, "status": "none"}


@router.post("/remove/{other_id}")
async def remove_friend(other_id: int, user: User = Depends(get_current_user), db=Depends(get_db)):
    f = await _friendship_between(db, user.id, other_id)
    if not f:
        raise HTTPException(404, "Arkadaş değilsiniz.")
    await db.delete(f)
    # İki taraftaki etiketler de anlamsız kalır — temizle.
    await db.execute(delete(FriendLabel).where(or_(
        and_(FriendLabel.owner_id == user.id, FriendLabel.friend_id == other_id),
        and_(FriendLabel.owner_id == other_id, FriendLabel.friend_id == user.id),
    )))
    await db.commit()
    return {"ok": True, "status": "none"}


class LabelIn(BaseModel):
    label: str = ""


@router.put("/label/{friend_id}")
async def set_friend_label(friend_id: int, data: LabelIn, user: User = Depends(get_current_user), db=Depends(get_db)):
    """Arkadaşı etiketle: aile / is / diger. Boş gönderilirse etiket kaldırılır.

    Etiket kişiye özeldir (karşı taraf görmez); özel arena davetinde filtre olur.
    """
    label = (data.label or "").strip().lower()
    if label and label not in FRIEND_LABELS:
        raise HTTPException(400, "Geçersiz etiket.")
    f = await _friendship_between(db, user.id, friend_id)
    if not f or f.status != "accepted":
        raise HTTPException(404, "Arkadaş değilsiniz.")
    row = (await db.execute(select(FriendLabel).where(and_(
        FriendLabel.owner_id == user.id, FriendLabel.friend_id == friend_id,
    )))).scalar_one_or_none()
    if not label:
        if row:
            await db.delete(row)
            await db.commit()
        return {"ok": True, "label": ""}
    if row:
        row.label = label
    else:
        db.add(FriendLabel(owner_id=user.id, friend_id=friend_id, label=label))
    await db.commit()
    return {"ok": True, "label": label}


@router.get("")
async def list_friends(user: User = Depends(get_current_user), db=Depends(get_db)):
    res = await db.execute(select(Friendship).where(and_(
        Friendship.status == "accepted",
        or_(Friendship.requester_id == user.id, Friendship.addressee_id == user.id),
    )))
    rows = res.scalars().all()
    friend_ids = [r.addressee_id if r.requester_id == user.id else r.requester_id for r in rows]
    friends = []
    if friend_ids:
        from app.game import presence_service
        labels = {
            r.friend_id: r.label
            for r in (await db.execute(select(FriendLabel).where(and_(
                FriendLabel.owner_id == user.id, FriendLabel.friend_id.in_(friend_ids),
            )))).scalars().all()
        }
        users = (await db.execute(select(User).where(User.id.in_(friend_ids)))).scalars().all()
        friends = [{
            "id": u.id, "username": u.username, "display_name": u.display_name,
            "avatar_url": u.public_avatar,
            "label": labels.get(u.id, ""),
            # Gizlilik: show_online kapalıysa herkese çevrimdışı görünür.
            "status": presence_service.get_status(u.id) if u.show_online else "offline",
        } for u in users]
        friends.sort(key=lambda f: (f["display_name"] or "").lower())
    return {"friends": friends}


@router.get("/requests")
async def list_requests(user: User = Depends(get_current_user), db=Depends(get_db)):
    """Bana gelen bekleyen istekler."""
    res = await db.execute(select(Friendship).where(and_(
        Friendship.status == "pending", Friendship.addressee_id == user.id,
    )))
    rows = res.scalars().all()
    reqs = []
    ids = [r.requester_id for r in rows]
    if ids:
        users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_(ids)))).scalars().all()}
        for r in rows:
            u = users.get(r.requester_id)
            if u:
                reqs.append({"id": u.id, "username": u.username, "display_name": u.display_name, "avatar_url": u.public_avatar})
    return {"requests": reqs}


@router.get("/status/{other_id}")
async def get_status(other_id: int, user: User = Depends(get_current_user), db=Depends(get_db)):
    return {"status": await friend_status(db, user.id, other_id)}
