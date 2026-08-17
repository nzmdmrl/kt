"""
İletişim formu uçları.

Public:
- POST /contact                 -> mesaj gönder (üye veya misafir)

Admin (get_admin_user):
- GET    /admin/contact         -> gelen mesajlar
- POST   /admin/contact/{id}/read -> okundu işaretle
- DELETE /admin/contact/{id}    -> sil

Mesaj HER ZAMAN veritabanına yazılır; SMTP yapılandırılmışsa ayrıca
`CONTACT_EMAIL` (varsayılan destek@kelimetahmin.com) adresine iletilir.
"""

from __future__ import annotations

import re
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_admin_user, get_optional_user
from app.core.mailer import send_mail
from app.models.contact_message import ContactMessage
from app.models.user import User

router = APIRouter(tags=["contact"])
settings = get_settings()

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$")

# Basit taşkın koruması: aynı IP'den 10 dakikada en fazla 3 mesaj.
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


class ContactIn(BaseModel):
    name: str = ""
    email: str = ""
    subject: str = ""
    message: str = ""


@router.post("/contact")
async def send_contact(
    data: ContactIn,
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    name = (data.name or "").strip()[:80]
    email = (data.email or "").strip()[:160]
    subject = (data.subject or "").strip()[:160] or "İletişim formu"
    body = (data.message or "").strip()

    if len(name) < 2:
        raise HTTPException(400, "Adını yaz (en az 2 karakter).")
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Geçerli bir e-posta adresi yaz.")
    if len(body) < 10:
        raise HTTPException(400, "Mesajın çok kısa (en az 10 karakter).")
    if len(body) > 4000:
        raise HTTPException(400, "Mesajın çok uzun (en fazla 4000 karakter).")

    ip = (request.client.host if request.client else "") or "?"
    if not _rate_ok(ip):
        raise HTTPException(429, "Çok fazla mesaj gönderdin. Lütfen biraz sonra tekrar dene.")

    who = f"{name} <{email}>"
    if user:
        who += f" · üye: {user.username} (#{user.id})"
    mail_body = (
        f"Kelime Tahmin — iletişim formu\n\n"
        f"Gönderen: {who}\n"
        f"Konu: {subject}\n"
        f"IP: {ip}\n"
        f"{'-' * 40}\n\n{body}\n"
    )
    mailed = await send_mail(
        settings.CONTACT_EMAIL, f"[Kelime Tahmin] {subject}", mail_body, reply_to=email,
    )

    db.add(ContactMessage(
        user_id=user.id if user else None,
        name=name, email=email, subject=subject, body=body, mailed=mailed,
    ))
    await db.commit()
    return {"ok": True}


@router.get("/admin/contact")
async def admin_contact(
    limit: int = 50,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(ContactMessage).order_by(ContactMessage.id.desc()).limit(min(max(limit, 1), 200))
    )).scalars().all()
    unread = (await db.execute(
        select(func.count()).select_from(ContactMessage).where(ContactMessage.is_read == False)  # noqa: E712
    )).scalar() or 0
    return {
        "messages": [r.to_admin() for r in rows],
        "unread": int(unread),
        "smtp_configured": settings.smtp_configured,
        "recipient": settings.CONTACT_EMAIL,
    }


@router.post("/admin/contact/{mid}/read")
async def admin_contact_read(
    mid: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db),
):
    row = await db.get(ContactMessage, mid)
    if not row:
        raise HTTPException(404, "Mesaj bulunamadı.")
    row.is_read = True
    await db.commit()
    return {"ok": True}


@router.delete("/admin/contact/{mid}")
async def admin_contact_delete(
    mid: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db),
):
    row = await db.get(ContactMessage, mid)
    if not row:
        raise HTTPException(404, "Mesaj bulunamadı.")
    await db.delete(row)
    await db.commit()
    return {"ok": True}
