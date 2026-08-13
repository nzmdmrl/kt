"""
Maç teklifi uçları.

- POST /challenge/send/{to_user_id}   -> teklif gönder (+ bildirim + push)
- GET  /challenge/incoming            -> bana gelen bekleyen teklif (popup için)
- POST /challenge/{cid}/accept        -> teklifi kabul et (oda kodu döner)
- POST /challenge/{cid}/decline       -> teklifi reddet
- POST /challenge/{cid}/cancel        -> gönderen kendi teklifini geri çeker
- GET  /challenge/outgoing            -> gönderdiğim teklifin durumu (kabul edildi mi?)

Teklifler artık `challenges` tablosunda tutulur (bkz. app/game/challenge_service.py);
yanıt biçimleri DEĞİŞMEDİ. `id` alanı frontend'de yalnızca URL'de kullanılıyor ve
eskiden metindi — tip farkı olmasın diye metin olarak dönmeye devam ediyor.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.game import challenge_service, presence_service

router = APIRouter(prefix="/challenge", tags=["challenge"])

# Teklif bildirimi/push'u kullanıcıyı uygulamaya getirir; popup'ı ChallengeWatcher
# /oyna dışındaki her sayfada gösterdiği için ana sayfa doğru hedef.
CHALLENGE_ROUTE = "/"


def _cid(cid: str) -> int:
    """Yol parametresini id'ye çevirir (eski uçlar metin id kullanıyordu)."""
    try:
        return int(cid)
    except (TypeError, ValueError):
        raise HTTPException(404, "Teklif bulunamadı.")


@router.post("/send/{to_user_id}")
async def send_challenge(to_user_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if to_user_id == user.id:
        raise HTTPException(400, "Kendine teklif gönderemezsin.")
    target = (await db.execute(select(User).where(User.id == to_user_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(404, "Kullanıcı bulunamadı.")
    if not target.allow_challenges:
        raise HTTPException(403, "Bu kullanıcı maç tekliflerine kapalı.")
    # Sadece arkadaşlar maç teklifi gönderebilir.
    from app.api.routes.friends import friend_status as _fstatus
    fs = await _fstatus(db, user.id, to_user_id)
    if fs != "friends":
        raise HTTPException(403, "Sadece arkadaşlarına maç teklifi gönderebilirsin.")
    # Hedef online ve maçta değil mi?
    status = presence_service.get_status(to_user_id)
    if status == "offline":
        raise HTTPException(409, "Kullanıcı şu an çevrimiçi değil.")
    if status == "in_match":
        raise HTTPException(409, "Kullanıcı şu an maçta.")

    await challenge_service.expire_stale(db)
    if await challenge_service.has_pending(db, user.id, to_user_id):
        raise HTTPException(409, "Bu kullanıcıya zaten bekleyen bir teklifin var.")

    # Uygulama içi bildirim (diğer çağrı yerleriyle aynı kalıp) — id'si teklife
    # yazılır ki teklif reddedilince/iptal edilince okundu işaretlenebilsin.
    from app.models.notification import Notification
    challenger = user.display_name or user.username
    n_title = "Maç teklifi"
    n_body = f"{challenger} seni 1v1 düelloya çağırıyor."
    notif = Notification(
        user_id=to_user_id, kind="challenge_offer", type_code="challenge_offer",
        title=n_title, body=n_body, icon="⚔️", link=CHALLENGE_ROUTE,
    )
    db.add(notif)
    await db.flush()

    cid = await challenge_service.create_challenge(db, user.id, to_user_id, notif.id)
    if cid is None:
        # Yarış durumu: araya başka bir istek girip aynı teklifi açmış.
        await db.rollback()
        raise HTTPException(409, "Bu kullanıcıya zaten bekleyen bir teklifin var.")
    await db.commit()

    from app.services.push import send_to_user_bg
    send_to_user_bg(to_user_id, "challenge_offer", n_title, n_body, CHALLENGE_ROUTE,
                    ctx={"challenge_id": cid, "from_user_id": user.id})
    return {"ok": True, "challenge_id": str(cid)}


@router.get("/incoming")
async def incoming(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await challenge_service.expire_stale(db)
    ch = await challenge_service.pending_for(db, user.id)
    if not ch:
        return {"challenge": None}
    # expires_in: popup geri sayımının KAYNAĞI (sunucuda hesaplanır, istemci
    # saatinin sunucudan sapması sayımı bozmasın). expires_at bilgi amaçlıdır.
    return {"challenge": {
        "id": str(ch["id"]), "from_name": ch["from_name"], "from_id": ch["from_id"],
        "expires_at": ch["expires_at"], "expires_in": ch["expires_in"],
    }}


@router.post("/{cid}/accept")
async def accept(cid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ch_id = _cid(cid)
    ch = await challenge_service.get(db, ch_id)
    if not ch or ch["to_id"] != user.id:
        raise HTTPException(404, "Teklif bulunamadı.")
    if ch["status"] != "pending":
        raise HTTPException(409, "Teklif artık geçerli değil.")
    room_code = await challenge_service.accept(db, ch_id, user.id)
    if not room_code:
        raise HTTPException(409, "Teklif artık geçerli değil.")
    return {"ok": True, "room_code": room_code}


@router.post("/{cid}/decline")
async def decline(cid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ch_id = _cid(cid)
    ch = await challenge_service.get(db, ch_id)
    if not ch or ch["to_id"] != user.id:
        raise HTTPException(404, "Teklif bulunamadı.")
    await challenge_service.decline(db, ch_id, user.id)
    # Teklif tüketildi: zilde okunmamış olarak asılı kalmasın (push YOK).
    await challenge_service.mark_notification_read(db, ch["notification_id"])
    return {"ok": True}


@router.post("/{cid}/cancel")
async def cancel(cid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Gönderen kendi bekleyen teklifini geri çeker."""
    ch_id = _cid(cid)
    ch = await challenge_service.get(db, ch_id)
    if not ch or ch["from_id"] != user.id:
        raise HTTPException(404, "Teklif bulunamadı.")
    ok = await challenge_service.cancel(db, ch_id, user.id)
    if ok:
        await challenge_service.mark_notification_read(db, ch["notification_id"])
    return {"ok": True}


@router.get("/outgoing")
async def outgoing(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await challenge_service.expire_stale(db)
    ch = await challenge_service.outgoing_status(db, user.id)
    if not ch:
        return {"challenge": None}
    return {"challenge": {
        "id": str(ch["id"]), "status": ch["status"],
        "room_code": ch["room_code"], "to_id": ch["to_id"],
    }}
