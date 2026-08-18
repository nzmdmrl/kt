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


async def get_user_by_play_games_id(db: AsyncSession, player_id: str) -> User | None:
    res = await db.execute(select(User).where(User.play_games_id == player_id))
    return res.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    res = await db.execute(select(User).where(User.id == user_id))
    return res.scalar_one_or_none()


async def _unique_username(db: AsyncSession, base: str) -> str:
    """Verilen tabandan benzersiz bir username üretir (admin limitlerine uyar).

    Kısalık burada HATA DEĞİLDİR, sonuna 0 eklenerek doldurulur: bu yol otomatik
    hesap açan akışlar içindir (Google, Play Games) — kullanıcı orada bir isim
    yazmadığı için ona hata gösterilecek bir ekran da yoktur. Kullanıcının kendi
    yazdığı isim ise `unique_username_from_name` ile geçer; orası kısalığı
    reddeder ve ekranda uyarı çıkar.
    """
    from app.game import name_rules
    lim = await name_rules.limits(db)
    base = name_rules.slugify_username(base) or "oyuncu"
    # Sonuna sıra numarası eklenebilir; üst sınırı aşmamak için pay bırak.
    base = base[:max(1, lim["username_max_len"] - 2)]
    while len(base) < lim["username_min_len"]:
        base += "0"
    return await _first_free(db, base)


async def _first_free(db: AsyncSession, base: str) -> str:
    """base, base2, base3... sırasıyla dener; boşta olan ilkini döner.

    Numara 2'den başlar: "nazim" doluysa sıradaki "nazim2" olur ("nazim1" değil).
    """
    candidate = base
    i = 1
    while await get_user_by_username(db, candidate):
        i += 1
        candidate = f"{base}{i}"
    return candidate


async def unique_username_from_name(db: AsyncSession, display_name: str) -> str:
    """Kullanıcının YAZDIĞI isimden kullanıcı adı üretir (ilk isim ekranı).

    _unique_username'den farkı: kısa/boş sonucu doldurmaz, NameError_ fırlatır —
    kullanıcı ekranda uyarıyı görüp daha uzun bir isim yazsın diye.
    """
    from app.game import name_rules
    lim = await name_rules.limits(db)
    base = name_rules.slugify_username(display_name)
    lo, hi = lim["username_min_len"], lim["username_max_len"]
    if len(base) < lo:
        raise AuthError(
            f"Adın en az {lo} harf/rakam içermeli. "
            "(Boşluk ve noktalama kullanıcı adına girmez.)"
        )
    # Sıra numarası eklenebilsin diye üst sınırdan pay bırak.
    base = base[:max(lo, hi - 2)]
    return await _first_free(db, base)


def _initial_name_status() -> str:
    """Yeni kullanıcının ad durumu — moderasyon kapalıysa doğrudan onaylı."""
    from app.game.settings_service import cached_bool
    return "pending" if cached_bool("name_moderation_enabled", True) else "approved"


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
        # Ad moderasyonu kapalıysa yeni kayıt doğrudan onaylı sayılır.
        name_status=_initial_name_status(),
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
        name_status=_initial_name_status(),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def link_play_games_id(
    db: AsyncSession, user: User, player_id: str, picture: str | None = None
) -> User:
    """Play Games oyuncu kimliğini MEVCUT hesaba bağlar.

    Kişi zaten giriş yapmışken kullanılır — "Zaten hesabım var" yolu buradan geçer.
    Kimlik başka bir hesaba bağlıysa taşınmaz: iki hesabın istatistikleri
    karışmasın diye hata verilir.
    """
    existing = await get_user_by_play_games_id(db, player_id)
    if existing and existing.id != user.id:
        raise AuthError("Bu Play Games hesabı başka bir kullanıcıya bağlı.")
    if not existing:
        user.play_games_id = player_id
        if picture and not user.avatar_url:
            user.avatar_url = picture
        await db.commit()
        await db.refresh(user)
    return user


async def create_play_games_user(
    db: AsyncSession, player_id: str, display_name: str, picture: str | None = None
) -> User:
    """Play Games kimliğiyle YENİ hesap açar — kullanıcının yazdığı isimle.

    NEDEN İSİM PARAMETRE: hesap, sessiz giriş anında DEĞİL, kullanıcı "isim
    belirle" ekranında adını yazdıktan sonra açılır. Böylece kimsenin istemediği
    hayalet hesaplar oluşmaz (bkz. app/api/routes/auth.py'deki uzun not).

    Kullanıcı adı yazılan isimden türetilir; kısa/uygunsuzsa AuthError fırlar ve
    kullanıcı ekranda uyarıyı görür. E-posta YOKTUR (Play Games e-posta vermez).
    """
    from app.game import name_rules
    try:
        display = await name_rules.clean_display_name(db, display_name)
    except name_rules.NameError_ as e:
        raise AuthError(str(e))
    if await get_user_by_play_games_id(db, player_id):
        raise AuthError("Bu Play Games hesabı zaten kayıtlı.")
    username = await unique_username_from_name(db, display)
    user = User(
        email=None,
        username=username,
        play_games_id=player_id,
        display_name=display,
        avatar_url=picture,
        name_status=_initial_name_status(),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
