"""FastAPI dependency: Authorization: Bearer <token> -> User."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.core.auth_service import get_user_by_id
from app.models.user import User


async def get_current_user(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Giriş gerekli.")
    token = authorization.split(" ", 1)[1].strip()
    user_id = decode_token(token)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Oturum geçersiz.")
    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı.")
    # Pasife alınmış hesap (isim denetimi ya da admin kararı) hiçbir işlem
    # yapamaz. Gölge bandan FARKLI: gölge ban gizlidir, bu açıkça söylenir.
    if getattr(user, "disabled", False):
        raise HTTPException(
            status_code=403,
            detail=(user.disabled_reason or "Hesabın askıya alındı.")
            + " Destek üzerinden bize yazabilirsin.",
        )
    return user


async def get_optional_user(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Giriş zorunlu değil — varsa kullanıcıyı döner, yoksa None."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    user_id = decode_token(token)
    if user_id is None:
        return None
    user = await get_user_by_id(db, user_id)
    # Pasif hesap "giriş yapmamış" sayılır — istisna fırlatılmaz, çünkü bu
    # dependency zorunlu değil (çağıran taraf None'ı zaten karşılıyor).
    if user is not None and getattr(user, "disabled", False):
        return None
    return user


async def get_admin_user(
    user: User = Depends(get_current_user),
) -> User:
    """Sadece admin kullanıcılar. Admin değilse 403."""
    if not getattr(user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Bu işlem için yönetici yetkisi gerekli.")
    return user
