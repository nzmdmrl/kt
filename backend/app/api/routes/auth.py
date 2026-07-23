"""Kimlik doğrulama uçları: kayıt, giriş, /me, Google OAuth."""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import get_settings
from app.core.security import create_access_token
from app.core.deps import get_current_user
from app.core import auth_service
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


# ---- şemalar ----
class RegisterIn(BaseModel):
    email: str
    password: str
    display_name: str


class LoginIn(BaseModel):
    email: str
    password: str


class GoogleIn(BaseModel):
    # İstemci Google'dan aldığı id_token'ı gönderir.
    id_token: str


def _auth_response(user: User) -> dict:
    token = create_access_token(user.id)
    return {"token": token, "user": user.to_private()}


# ---- e-posta/şifre ----
@router.post("/register")
async def register(data: RegisterIn, db: AsyncSession = Depends(get_db)):
    try:
        user = await auth_service.register_email(
            db, data.email, data.password, data.display_name
        )
    except auth_service.AuthError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _auth_response(user)


@router.post("/login")
async def login(data: LoginIn, db: AsyncSession = Depends(get_db)):
    try:
        user = await auth_service.login_email(db, data.email, data.password)
    except auth_service.AuthError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _auth_response(user)


# ---- Google OAuth ----
@router.get("/google/status")
def google_status():
    """Frontend Google butonunu gösterip göstermeyeceğini buradan öğrenir."""
    return {
        "configured": settings.google_oauth_configured,
        "client_id": settings.GOOGLE_CLIENT_ID or None,
    }


@router.post("/google")
async def google_login(data: GoogleIn, db: AsyncSession = Depends(get_db)):
    if not settings.google_oauth_configured:
        raise HTTPException(status_code=503, detail="Google girişi yapılandırılmamış.")
    # id_token'ı Google'ın tokeninfo ucuyla doğrula.
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": data.id_token},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Google token doğrulanamadı.")
    info = resp.json()
    # aud (client_id) bizim uygulamamıza mı ait?
    if info.get("aud") != settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=401, detail="Google token bu uygulama için değil.")
    sub = info.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Google kimliği okunamadı.")
    user = await auth_service.get_or_create_google_user(
        db,
        sub=sub,
        email=info.get("email"),
        name=info.get("name"),
        picture=info.get("picture"),
    )
    return _auth_response(user)


# ---- profil ----
@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return {"user": user.to_private()}
