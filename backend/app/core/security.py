"""Güvenlik: şifre hashleme (bcrypt) ve JWT token.

Not: passlib yerine doğrudan `bcrypt` kullanılır — passlib'in güncel bcrypt
sürümleriyle uyumsuzluğu var. bcrypt 72 byte sınırı olduğundan şifre önce
SHA-256 ile sabit uzunluğa indirilir (uzun şifreler için güvenli standart yöntem).
"""

from __future__ import annotations

import base64
import hashlib
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt, JWTError

from app.core.config import get_settings

settings = get_settings()

TOKEN_EXPIRE_DAYS = 30


def _prepare(password: str) -> bytes:
    """SHA-256 + base64 ile şifreyi 44 byte'a indirger (bcrypt 72 byte sınırı için)."""
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    return base64.b64encode(digest)


def hash_password(password: str) -> str:
    hashed = bcrypt.hashpw(_prepare(password), bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_prepare(plain), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        sub = payload.get("sub")
        return int(sub) if sub is not None else None
    except (JWTError, ValueError):
        return None
