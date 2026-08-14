"""Auth iş mantığı — kayıt, giriş, kullanıcı sorgu/oluşturma."""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.core.security import hash_password, verify_password

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,32}$")


class AuthError(Exception):
    """Kayıt/giriş hatası — istemciye mesajla döner."""


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    res = await db.execute(select(User).where(User.email == email.lower()))
    return res.scalar_one_or_none()


async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
    res = await db.execute(select(User).where(User.username == username))
    return res.scalar_one_or_none()


async def get_user_by_google_sub(db: AsyncSession, sub: str) -> User | None:
    res = await db.execute(select(User).where(User.google_sub == sub))
    return res.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    res = await db.execute(select(User).where(User.id == user_id))
    return res.scalar_one_or_none()


async def _unique_username(db: AsyncSession, base: str) -> str:
    """Verilen tabandan benzersiz bir username üretir (admin limitlerine uyar)."""
    from app.game import name_rules
    lim = await name_rules.limits(db)
    base = re.sub(r"[^a-zA-Z0-9_]", "", base) or "oyuncu"
    # Sonuna sıra numarası eklenebilir; üst sınırı aşmamak için pay bırak.
    base = base[:max(1, lim["username_max_len"] - 2)]
    while len(base) < lim["username_min_len"]:
        base += "0"
    candidate = base
    i = 0
    while await get_user_by_username(db, candidate):
        i += 1
        candidate = f"{base}{i}"
    return candidate


async def register_email(
    db: AsyncSession, email: str, password: str, display_name: str
) -> User:
    email = email.strip().lower()
    if "@" not in email or "." not in email:
        raise AuthError("Geçerli bir e-posta gir.")
    if len(password) < 6:
        raise AuthError("Şifre en az 6 karakter olmalı.")
    # Görünen ad admin panelindeki karakter limitlerine uymalı.
    from app.game import name_rules
    try:
        display_name = await name_rules.clean_display_name(db, display_name)
    except name_rules.NameError_ as e:
        raise AuthError(str(e))
    if await get_user_by_email(db, email):
        raise AuthError("Bu e-posta zaten kayıtlı.")

    username = await _unique_username(db, display_name)
    user = User(
        email=email,
        username=username,
        password_hash=hash_password(password),
        display_name=display_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def login_email(db: AsyncSession, email: str, password: str) -> User:
    user = await get_user_by_email(db, email.strip().lower())
    if not user or not user.password_hash:
        raise AuthError("E-posta veya şifre hatalı.")
    if not verify_password(password, user.password_hash):
        raise AuthError("E-posta veya şifre hatalı.")
    return user


async def get_or_create_google_user(
    db: AsyncSession, sub: str, email: str | None, name: str | None, picture: str | None
) -> User:
    """Google ile giriş: mevcut kullanıcıyı bul veya yeni oluştur."""
    user = await get_user_by_google_sub(db, sub)
    if user:
        return user
    # E-posta eşleşmesiyle mevcut hesaba bağla
    if email:
        existing = await get_user_by_email(db, email.lower())
        if existing:
            existing.google_sub = sub
            if picture and not existing.avatar_url:
                existing.avatar_url = picture
            await db.commit()
            await db.refresh(existing)
            return existing
    # Yeni Google kullanıcısı — Google'dan gelen ad limiti aşabilir; kayıt
    # reddedilmesin diye hata yerine kırpılır (kullanıcı sonra düzenleyebilir).
    from app.game import name_rules
    _lim = await name_rules.limits(db)
    display = " ".join((name or (email.split("@")[0] if email else "Oyuncu")).split())
    display = display[:_lim["display_name_max_len"]] or "Oyuncu"
    username = await _unique_username(db, display)
    user = User(
        email=email.lower() if email else None,
        username=username,
        google_sub=sub,
        display_name=display,
        avatar_url=picture,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
