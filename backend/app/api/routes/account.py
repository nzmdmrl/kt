"""
Hesap yönetimi — kendi profilini düzenleme.

- GET  /account/me            -> düzenlenebilir alanlar (email, username, gizlilik)
- POST /account/username      -> kullanıcı adı değiştir
- POST /account/email         -> e-posta değiştir
- POST /account/password      -> şifre değiştir (mevcut şifre doğrulaması ile)
- POST /account/privacy       -> gizlilik ayarları (online göster, teklifler)
"""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import hash_password, verify_password
from app.models.user import User

router = APIRouter(prefix="/account", tags=["account"])

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,20}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@router.get("/me")
async def account_me(user: User = Depends(get_current_user)):
    return {
        "username": user.username,
        "email": user.email,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "show_online": user.show_online,
        "allow_challenges": user.allow_challenges,
        "has_password": bool(user.password_hash),
    }


@router.get("/level")
async def account_level(user: User = Depends(get_current_user)):
    """Seviye + XP ilerlemesi (üst bar için)."""
    from app.game.xp_service import level_progress
    return level_progress(user.xp or 0)


class UsernameIn(BaseModel):
    username: str


@router.post("/username")
async def change_username(data: UsernameIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    uname = data.username.strip()
    if not USERNAME_RE.match(uname):
        raise HTTPException(400, "Kullanıcı adı 3-20 karakter, sadece harf/rakam/alt çizgi olmalı.")
    # Benzersiz mi (kendisi hariç)?
    existing = (await db.execute(select(User).where(User.username == uname))).scalar_one_or_none()
    if existing and existing.id != user.id:
        raise HTTPException(409, "Bu kullanıcı adı alınmış.")
    user.username = uname
    await db.commit()
    return {"ok": True, "username": uname}


class EmailIn(BaseModel):
    email: str


@router.post("/email")
async def change_email(data: EmailIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    email = data.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Geçerli bir e-posta girin.")
    existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing and existing.id != user.id:
        raise HTTPException(409, "Bu e-posta başka bir hesapta kayıtlı.")
    user.email = email
    await db.commit()
    return {"ok": True, "email": email}


class PasswordIn(BaseModel):
    current_password: str | None = None
    new_password: str


@router.post("/password")
async def change_password(data: PasswordIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if len(data.new_password) < 6:
        raise HTTPException(400, "Yeni şifre en az 6 karakter olmalı.")
    # Mevcut şifresi varsa doğrula.
    if user.password_hash:
        if not data.current_password or not verify_password(data.current_password, user.password_hash):
            raise HTTPException(403, "Mevcut şifre yanlış.")
    user.password_hash = hash_password(data.new_password)
    await db.commit()
    return {"ok": True}


class AvatarIn(BaseModel):
    avatar_url: str


@router.post("/avatar")
async def change_avatar(data: AvatarIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    url = data.avatar_url.strip()
    # Güvenlik: yalnızca DiceBear avatar URL'leri kabul edilir (rastgele URL engellenir).
    if not url.startswith("https://api.dicebear.com/"):
        raise HTTPException(400, "Geçersiz avatar.")
    if len(url) > 512:
        raise HTTPException(400, "Avatar adresi çok uzun.")
    user.avatar_url = url
    await db.commit()
    return {"ok": True, "avatar_url": url}


class PrivacyIn(BaseModel):
    show_online: bool | None = None
    allow_challenges: bool | None = None


@router.post("/privacy")
async def change_privacy(data: PrivacyIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if data.show_online is not None:
        user.show_online = data.show_online
    if data.allow_challenges is not None:
        user.allow_challenges = data.allow_challenges
    await db.commit()
    return {"ok": True, "show_online": user.show_online, "allow_challenges": user.allow_challenges}
