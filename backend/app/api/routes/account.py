"""
Hesap yönetimi — kendi profilini düzenleme.

- GET  /account/me            -> düzenlenebilir alanlar (email, username, gizlilik)
- POST /account/display-name  -> görünen ad değiştir (serbest)
- POST /account/username      -> kullanıcı adı değiştir (30 günde en fazla 2 kez)
- POST /account/email         -> e-posta değiştir
- POST /account/password      -> şifre değiştir (mevcut şifre doğrulaması ile)
- POST /account/privacy       -> gizlilik ayarları (online göster, teklifler)
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.models.username_change import UsernameChange
from app.game import name_rules

router = APIRouter(prefix="/account", tags=["account"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Kullanıcı adı kotası: WINDOW_DAYS gün içinde en fazla USERNAME_LIMIT değişiklik.
USERNAME_LIMIT = 2
WINDOW_DAYS = 30


def _flag(key: str, default: bool = True) -> bool:
    from app.game.settings_service import cached_bool
    return cached_bool(key, default)


async def _username_quota(db: AsyncSession, user_id: int) -> tuple[int, datetime | None]:
    """(kalan hak, yeni hak kazanma zamanı) döner.

    Son WINDOW_DAYS gün içindeki değişikliklere bakar. Hak dolduysa, en eski
    değişikliğin üzerinden 30 gün geçtiğinde bir hak açılır.
    """
    since = datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)
    rows = (await db.execute(
        select(UsernameChange)
        .where(UsernameChange.user_id == user_id, UsernameChange.created_at >= since)
        .order_by(UsernameChange.created_at.asc())
    )).scalars().all()
    left = max(0, USERNAME_LIMIT - len(rows))
    next_at = None
    if left == 0 and rows:
        oldest = rows[0].created_at
        if oldest.tzinfo is None:          # SQLite naive datetime döner
            oldest = oldest.replace(tzinfo=timezone.utc)
        next_at = oldest + timedelta(days=WINDOW_DAYS)
    return left, next_at


@router.get("/limits")
async def name_limits(db: AsyncSession = Depends(get_db)):
    """Ad karakter limitleri — kayıt ekranı gibi girişsiz yerler için (public)."""
    return await name_rules.limits(db)


@router.get("/me")
async def account_me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    left, next_at = await _username_quota(db, user.id)
    return {
        **(await name_rules.limits(db)),
        "username": user.username,
        "email": user.email,
        "display_name": user.display_name,
        # Sahibi bekleyen fotoğrafını da görür.
        "avatar_url": user.avatar_pending or user.avatar_photo or user.avatar_url,
        "dicebear_url": user.avatar_url,
        "photo_pending": bool(user.avatar_pending),
        "has_photo": bool(user.avatar_photo or user.avatar_pending),
        "name_status": user.name_status or "pending",
        # Arayüz yükleme bölümünü buna göre gösterir/gizler (admin ayarı).
        "photo_upload_enabled": _flag("photo_upload_enabled"),
        "photo_moderation_enabled": _flag("photo_moderation_enabled"),
        "show_online": user.show_online,
        "allow_challenges": user.allow_challenges,
        "has_password": bool(user.password_hash),
        "username_changes_left": left,
        "username_limit": USERNAME_LIMIT,
        "username_window_days": WINDOW_DAYS,
        "username_next_change_at": next_at.isoformat() if next_at else None,
    }


class DisplayNameIn(BaseModel):
    display_name: str


@router.post("/display-name")
async def change_display_name(data: DisplayNameIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Görünen ad — oyun içinde herkesin gördüğü isim. Sınırsız değiştirilebilir."""
    try:
        name = await name_rules.clean_display_name(db, data.display_name)
    except name_rules.NameError_ as e:
        raise HTTPException(400, str(e))
    user.display_name = name
    # Ad değişti — moderasyon açıksa yeniden onaya düşer (admin → 🏷️ Ad Mod).
    user.name_status = "pending" if _flag("name_moderation_enabled") else "approved"
    await db.commit()
    # Otomatik isim denetimi de yeniden çalışır (arka planda, kullanıcı beklemez).
    from app.services.name_review import review_name_bg
    review_name_bg(user.id, "rename")
    return {"ok": True, "display_name": name}


@router.get("/level")
async def account_level(user: User = Depends(get_current_user)):
    """Seviye + XP ilerlemesi (üst bar için)."""
    from app.game.xp_service import level_progress
    return level_progress(user.xp or 0)


class UsernameIn(BaseModel):
    username: str


@router.post("/username")
async def change_username(data: UsernameIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        uname = await name_rules.clean_username(db, data.username)
    except name_rules.NameError_ as e:
        raise HTTPException(400, str(e))
    old = user.username
    # Yalnız harf büyüklüğü değiştiyse (ör. "Yasemin" -> "yasemin") bu bir
    # değişiklik sayılır ve kaydedilir; aynı metinse kotadan hak yakılmaz.
    if uname == old:
        # Aynı ad — kotadan hak yakmaya gerek yok.
        left, next_at = await _username_quota(db, user.id)
        return {"ok": True, "username": uname, "username_changes_left": left,
                "username_next_change_at": next_at.isoformat() if next_at else None}
    # Benzersiz mi (kendisi hariç)? Kontrol HARF DUYARSIZ — "Yasemin" varken
    # "yasemin" alınamaz (auth_service.get_user_by_username).
    from app.core.auth_service import get_user_by_username
    existing = await get_user_by_username(db, uname)
    if existing and existing.id != user.id:
        raise HTTPException(409, "Bu kullanıcı adı alınmış.")
    # Kota: 30 günde en fazla 2 değişiklik.
    left, next_at = await _username_quota(db, user.id)
    if left <= 0:
        when = next_at.strftime("%d.%m.%Y") if next_at else ""
        raise HTTPException(
            429,
            f"Kullanıcı adını {WINDOW_DAYS} günde en fazla {USERNAME_LIMIT} kez değiştirebilirsin."
            + (f" Yeni hakkın: {when}." if when else ""),
        )

    user.username = uname
    user.name_status = "pending" if _flag("name_moderation_enabled") else "approved"
    db.add(UsernameChange(user_id=user.id, old_username=old, new_username=uname))
    # Maç geçmişindeki bağlantı alanları username tutuyor — eski ad kalırsa
    # geçmiş maçlar profilden ve karşılıklı skordan düşerdi; birlikte taşı.
    from app.models.match_history import MatchHistory
    from sqlalchemy import update as sa_update
    await db.execute(sa_update(MatchHistory).where(MatchHistory.p1_username == old).values(p1_username=uname))
    await db.execute(sa_update(MatchHistory).where(MatchHistory.p2_username == old).values(p2_username=uname))
    await db.commit()

    left, next_at = await _username_quota(db, user.id)
    from app.services.name_review import review_name_bg
    review_name_bg(user.id, "rename")
    return {"ok": True, "username": uname, "username_changes_left": left,
            "username_next_change_at": next_at.isoformat() if next_at else None}


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


class PhotoIn(BaseModel):
    # 200x200 JPEG data URI ("data:image/jpeg;base64,...") — küçültme İSTEMCİDE
    # yapılır, orijinal dosya sunucuya hiç gelmez (dolayısıyla saklanmaz).
    photo: str


# 200x200 orta kaliteli JPEG ~10-25 KB; base64 ile ~1.35x. Güvenli üst sınır.
MAX_PHOTO_CHARS = 400_000


@router.post("/photo")
async def upload_photo(data: PhotoIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Profil fotoğrafı yükle — ADMİN ONAYINA düşer.

    Onaylanana kadar fotoğrafı yalnızca sahibi görür (to_private), diğerlerine
    eski/onaylı avatar gösterilir (to_public).
    """
    from app.game.settings_service import cached_bool
    if not cached_bool("photo_upload_enabled", True):
        raise HTTPException(403, "Fotoğraf yükleme şu an kapalı.")
    photo = (data.photo or "").strip()
    if not photo.startswith("data:image/jpeg;base64,"):
        raise HTTPException(400, "Fotoğraf JPEG olmalı.")
    if len(photo) > MAX_PHOTO_CHARS:
        raise HTTPException(400, "Fotoğraf çok büyük.")
    from datetime import datetime as _dt, timezone as _tz
    if cached_bool("photo_moderation_enabled", True):
        # Onaya düşer: yalnız sahibi görür.
        user.avatar_pending = photo
        user.avatar_pending_at = _dt.now(_tz.utc)
        pending = True
    else:
        # Moderasyon kapalı: doğrudan yayında.
        user.avatar_photo = photo
        user.avatar_pending = None
        user.avatar_pending_at = None
        pending = False
    await db.commit()
    return {"ok": True, "avatar_url": photo, "pending": pending}


@router.delete("/photo")
async def delete_photo(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Yüklenen fotoğrafı kaldır (bekleyen + onaylı) — DiceBear avatarına döner."""
    user.avatar_pending = None
    user.avatar_pending_at = None
    user.avatar_photo = None
    await db.commit()
    return {"ok": True, "avatar_url": user.public_avatar}


# ---------------------------------------------------------------- hesap silme
#
# Google Play / App Store zorunluluğu: kullanıcı hesabını uygulama İÇİNDEN
# silebilmeli. Hak HERKESE açıktır (doğrulanmış da doğrulanmamış da).
# Silme, satırı yok etmez; anonimleştirir — ayrıntı ve gerekçe:
# app/services/account_delete.py.


@router.get("/delete-info")
async def delete_info(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Silme ekranı: hangi onay isteniyor + ne kaybedilecek."""
    from app.services.account_delete import confirmation_hint
    return {
        **confirmation_hint(user),
        "display_name": user.display_name,
        "username": user.username,
        "xp": user.xp or 0,
        "matches_played": user.matches_played or 0,
        "verified": bool(user.verified),
    }


class DeleteAccountIn(BaseModel):
    # Şifresi olan kullanıcı şifresini, olmayan görünen adını yazar.
    password: str = ""
    name: str = ""


@router.post("/delete")
async def delete_account(
    data: DeleteAccountIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.account_delete import delete_own_account, DeleteError
    try:
        await delete_own_account(db, user, data.password, data.name)
    except DeleteError as e:
        raise HTTPException(400, str(e))
    # Jeton artık işe yaramaz (hesap disabled) — istemci de kendi tarafını temizler.
    return {"ok": True}


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
