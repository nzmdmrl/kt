"""
Destek biletleri uçları.

Kullanıcı:
- POST   /support/tickets        -> yeni bilet aç (üye veya misafir)
- GET    /support/my             -> kendi biletlerim
- GET    /support/my/{id}        -> bilet yazışması (açınca okundu sayılır)
- POST   /support/my/{id}/reply  -> yanıt yaz

Admin (get_admin_user):
- GET    /admin/support          -> tüm biletler + bekleyen sayısı
- GET    /admin/support/{id}     -> yazışma (açınca admin tarafı okundu)
- POST   /admin/support/{id}/reply  -> yanıtla (üyeye BİLDİRİM gider)
- POST   /admin/support/{id}/status -> durum değiştir (open/closed)
- DELETE /admin/support/{id}     -> sil

E-posta gönderimi yoktur; tüm yazışma uygulama içinde kalır.
"""

from __future__ import annotations

import re
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_admin_user, get_current_user, get_optional_user
from app.models.support import (
    SupportTicket, SupportMessage, STATUS_OPEN, STATUS_ANSWERED, STATUS_CLOSED,
    new_ticket_code,
)
from app.models.user import User

router = APIRouter(tags=["support"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$")

# Taşkın koruması: aynı IP'den 10 dakikada en fazla 3 yeni bilet.
_RATE_WINDOW = 600
_RATE_MAX = 3
_recent: dict[str, list[float]] = {}


def _rate_ok(ip: str) -> bool:
    now = time.time()
    hits = [t for t in _recent.get(ip, []) if now - t < _RATE_WINDOW]
    if len(hits) >= _RATE_MAX:
        _recent[ip] = hits
        return False
    hits.append(now)
    _recent[ip] = hits
    return True


async def _find(db: AsyncSession, key: str) -> SupportTicket | None:
    """Bileti 5 haneli KOD ile bulur; eski sayısal id'li linkler de çalışsın diye
    rakamdan ibaret anahtar id olarak da denenir."""
    k = (key or "").strip()
    if not k:
        return None
    t = (await db.execute(
        select(SupportTicket).where(SupportTicket.code == k.upper())
    )).scalar_one_or_none()
    if t is None and k.isdigit():
        t = await db.get(SupportTicket, int(k))
    return t


async def _unique_code(db: AsyncSession) -> str:
    for _ in range(20):
        c = new_ticket_code()
        exists = (await db.execute(
            select(SupportTicket.id).where(SupportTicket.code == c)
        )).first()
        if not exists:
            return c
    return new_ticket_code()


async def _messages(db: AsyncSession, ticket_id: int) -> list[SupportMessage]:
    return list((await db.execute(
        select(SupportMessage).where(SupportMessage.ticket_id == ticket_id)
        .order_by(SupportMessage.id.asc())
    )).scalars().all())


async def _summary(db: AsyncSession, tickets: list[SupportTicket]) -> dict[int, tuple[str, int]]:
    """Bilet başına (son mesajın kısa hâli, mesaj sayısı)."""
    out: dict[int, tuple[str, int]] = {}
    if not tickets:
        return out
    ids = [t.id for t in tickets]
    rows = (await db.execute(
        select(SupportMessage).where(SupportMessage.ticket_id.in_(ids))
        .order_by(SupportMessage.id.asc())
    )).scalars().all()
    for m in rows:
        prev = out.get(m.ticket_id, ("", 0))
        out[m.ticket_id] = (m.body[:140], prev[1] + 1)
    return out


# ------------------------------------------------------------------ kullanıcı

class TicketIn(BaseModel):
    name: str = ""
    email: str = ""
    subject: str = ""
    message: str = ""


@router.post("/support/tickets")
async def create_ticket(
    data: TicketIn,
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    subject = (data.subject or "").strip()[:160]
    body = (data.message or "").strip()
    name = (data.name or "").strip()[:80]
    email = (data.email or "").strip()[:160]
    if user:
        name = name or (user.display_name or user.username)
        email = email or (user.email or "")

    if len(subject) < 3:
        raise HTTPException(400, "Konu en az 3 karakter olmalı.")
    if len(body) < 10:
        raise HTTPException(400, "Mesajın çok kısa (en az 10 karakter).")
    if len(body) > 4000:
        raise HTTPException(400, "Mesajın çok uzun (en fazla 4000 karakter).")
    if len(name) < 2:
        raise HTTPException(400, "Adını yaz (en az 2 karakter).")
    # Misafirde e-posta zorunlu (yanıt için tek bağlantı odur).
    if not user and not EMAIL_RE.match(email):
        raise HTTPException(400, "Geçerli bir e-posta adresi yaz.")
    if email and not EMAIL_RE.match(email):
        raise HTTPException(400, "Geçerli bir e-posta adresi yaz.")

    ip = (request.client.host if request.client else "") or "?"
    if not _rate_ok(ip):
        raise HTTPException(429, "Çok fazla destek talebi açtın. Lütfen biraz sonra tekrar dene.")

    ticket = SupportTicket(
        code=await _unique_code(db),
        user_id=user.id if user else None,
        name=name, email=email, subject=subject,
        status=STATUS_OPEN, user_unread=False, admin_unread=True,
    )
    db.add(ticket)
    await db.flush()
    db.add(SupportMessage(ticket_id=ticket.id, sender="user", body=body))
    await db.commit()
    return {"ok": True, "id": ticket.id, "code": ticket.code, "linked": bool(user)}


@router.get("/support/my")
async def my_tickets(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = list((await db.execute(
        select(SupportTicket)
        .where(SupportTicket.user_id == user.id, SupportTicket.user_deleted == False)  # noqa: E712
        .order_by(SupportTicket.id.desc()).limit(100)
    )).scalars().all())
    summ = await _summary(db, rows)
    return {
        "tickets": [t.to_public(*summ.get(t.id, ("", 0))) for t in rows],
        "unread": sum(1 for t in rows if t.user_unread),
    }


@router.get("/support/my/{key}")
async def my_ticket(key: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    t = await _find(db, key)
    if not t:
        raise HTTPException(404, "Destek talebi bulunamadı.")
    if t.user_id != user.id:
        # Sahiplik hatası ile "yok" birbirinden ayrılır — kullanıcı hangi
        # hesapla açtığını hemen anlasın (aynı bilet başka hesapta olabilir).
        raise HTTPException(403, "Bu destek talebi başka bir hesaba ait.")
    if t.user_deleted:
        raise HTTPException(404, "Bu destek talebini silmiştin.")
    msgs = await _messages(db, t.id)
    if t.user_unread:
        t.user_unread = False
        await db.commit()
    return {"ticket": t.to_public(), "messages": [m.to_public() for m in msgs]}


class ReplyIn(BaseModel):
    message: str = ""


@router.post("/support/my/{key}/reply")
async def my_reply(
    key: str, data: ReplyIn,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    t = await _find(db, key)
    if not t:
        raise HTTPException(404, "Destek talebi bulunamadı.")
    if t.user_id != user.id:
        raise HTTPException(403, "Bu destek talebi başka bir hesaba ait.")
    if t.user_deleted:
        raise HTTPException(404, "Bu destek talebini silmiştin.")
    body = (data.message or "").strip()
    if len(body) < 2:
        raise HTTPException(400, "Mesaj boş olamaz.")
    if len(body) > 4000:
        raise HTTPException(400, "Mesajın çok uzun (en fazla 4000 karakter).")
    db.add(SupportMessage(ticket_id=t.id, sender="user", body=body))
    t.status = STATUS_OPEN
    t.admin_unread = True
    t.user_unread = False
    await db.commit()
    return {"ok": True}


@router.delete("/support/my/{key}")
async def my_delete(key: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Üye bileti kendi listesinden kaldırır.

    Kayıt SİLİNMEZ: yalnız `user_deleted` işaretlenir. Admin panelde bilet
    "üye sildi" rozetiyle durmaya devam eder; kalıcı silme kararı adminindir.
    """
    t = await _find(db, key)
    if not t or t.user_id != user.id:
        raise HTTPException(404, "Destek talebi bulunamadı.")
    t.user_deleted = True
    t.user_unread = False
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------- admin

@router.get("/admin/support")
async def admin_list(
    limit: int = 100,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    rows = list((await db.execute(
        select(SupportTicket).order_by(SupportTicket.admin_unread.desc(), SupportTicket.id.desc())
        .limit(min(max(limit, 1), 300))
    )).scalars().all())
    summ = await _summary(db, rows)
    waiting = (await db.execute(
        select(func.count()).select_from(SupportTicket).where(SupportTicket.admin_unread == True)  # noqa: E712
    )).scalar() or 0
    return {
        "tickets": [t.to_admin(*summ.get(t.id, ("", 0))) for t in rows],
        "waiting": int(waiting),
    }


@router.get("/admin/support/{key}")
async def admin_ticket(key: str, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    t = await _find(db, key)
    if not t:
        raise HTTPException(404, "Destek talebi bulunamadı.")
    msgs = await _messages(db, t.id)
    if t.admin_unread:
        t.admin_unread = False
        await db.commit()
    return {"ticket": t.to_admin(), "messages": [m.to_public() for m in msgs]}


@router.post("/admin/support/{key}/reply")
async def admin_reply(
    key: str, data: ReplyIn,
    admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db),
):
    """Admin yanıtı — üyeye uygulama içi bildirim + push gider."""
    from app.models.notification import Notification
    from app.services.push import send_to_user_bg

    t = await _find(db, key)
    if not t:
        raise HTTPException(404, "Destek talebi bulunamadı.")
    body = (data.message or "").strip()
    if len(body) < 2:
        raise HTTPException(400, "Yanıt boş olamaz.")
    if len(body) > 4000:
        raise HTTPException(400, "Yanıt çok uzun (en fazla 4000 karakter).")

    db.add(SupportMessage(ticket_id=t.id, sender="admin", body=body))
    t.status = STATUS_ANSWERED
    t.admin_unread = False

    link = f"/destek/{t.code or t.id}"
    title = "Destek talebin yanıtlandı"
    n_body = f"“{t.subject}” için yanıt geldi. Okumak için dokun."
    # Üye bileti kendi tarafında sildiyse bildirim gönderilmez (göremez).
    notify = bool(t.user_id) and not t.user_deleted
    t.user_unread = notify
    if notify:
        db.add(Notification(
            user_id=t.user_id, kind="support", type_code="support_reply",
            title=title, body=n_body, icon="🎫", link=link,
        ))
    await db.commit()
    if notify:
        send_to_user_bg(t.user_id, "support_reply", title, n_body, link, ctx={"ticket": t.code or str(t.id)})
    return {"ok": True, "notified": notify}


class StatusIn(BaseModel):
    status: str = STATUS_OPEN


@router.post("/admin/support/{key}/status")
async def admin_status(
    key: str, data: StatusIn,
    admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db),
):
    if data.status not in (STATUS_OPEN, STATUS_ANSWERED, STATUS_CLOSED):
        raise HTTPException(400, "Geçersiz durum.")
    t = await _find(db, key)
    if not t:
        raise HTTPException(404, "Destek talebi bulunamadı.")
    t.status = data.status
    if data.status == STATUS_CLOSED:
        t.admin_unread = False
    await db.commit()
    return {"ok": True}


@router.delete("/admin/support/{key}")
async def admin_delete(key: str, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    t = await _find(db, key)
    if not t:
        raise HTTPException(404, "Destek talebi bulunamadı.")
    for m in await _messages(db, t.id):
        await db.delete(m)
    await db.delete(t)
    await db.commit()
    return {"ok": True}
