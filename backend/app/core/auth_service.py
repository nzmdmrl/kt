"""Auth iş mantığı — kayıt, giriş, kullanıcı sorgu/oluşturma."""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.core.security import hash_password, verify_password

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,32}$")


def _now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)


class AuthError(Exception):
    """Kayıt/giriş hatası — istemciye mesajla döner."""


class EmailInUse(AuthError):
    """Doğrulamada girilen e-posta BAŞKA bir hesaba ait.

    Bu bir "hata" değil, bir YOL AYRIMI: kullanıcı büyük ihtimalle siteye daha
    önce kaydolmuş kendi hesabını yazıyor. Bu yüzden çağıran taraf 400 dönmez;
    "o hesaba giriş yap, buradaki ilerlemeni oraya taşıyalım" akışını başlatır
    (bkz. app/core/account_transfer.py). other_id, o hesabın kimliğidir.
    """

    def __init__(self, other_id: int):
        super().__init__("Bu e-posta zaten başka bir hesapta kayıtlı.")
        self.other_id = other_id


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    res = await db.execute(select(User).where(User.email == email.lower()))
    return res.scalar_one_or_none()


async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
    """Kullanıcı adıyla arama — BÜYÜK/KÜÇÜK HARF AYRIMI YAPMAZ.

    "Yasemin" ile "yasemin" AYNI hesaptır. Benzersizlik kontrolü de bu
    fonksiyondan geçtiği için iki kullanıcı adı yalnız harf büyüklüğüyle
    birbirinden ayrılamaz. (Eskiden ayrılabiliyordu; iki test hesabı bu yüzden
    yan yana oluşmuştu.)
    """
    from sqlalchemy import func as _f
    res = await db.execute(
        select(User).where(_f.lower(User.username) == (username or "").strip().lower())
    )
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

    REZERVE ADLAR ATLANIR: "admin" rezerveyse aday olarak seçilmez. Tabanın
    kendisi rezerveyse ne olacağını `safe_base` belirler (tarafsız tabana
    kaydır ya da numara ekle) — bkz. app/game/reserved_names.py.
    """
    from app.game import reserved_names
    base = await reserved_names.safe_base(db, base)
    candidate = base
    i = 1
    while (
        await get_user_by_username(db, candidate)
        or await reserved_names.is_reserved(db, candidate)
    ):
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
    db: AsyncSession, email: str, password: str, display_name: str,
    signup_ip: str | None = None, platform: str | None = None,
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
        # E-posta + şifre var -> hesap kurtarılabilir, doğrulanmış sayılır.
        verified=True,
        verified_at=_now(),
        verified_platform=platform,
        signup_ip=signup_ip,
        signup_platform=platform,
        last_platform=platform,
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
    db: AsyncSession, sub: str, email: str | None, name: str | None, picture: str | None,
    signup_ip: str | None = None, platform: str | None = None,
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
        # Google hesabı bağlı -> kişi cihazını değiştirse bile geri girebilir.
        verified=True,
        verified_at=_now(),
        verified_platform=platform,
        signup_ip=signup_ip,
        signup_platform=platform,
        last_platform=platform,
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
        # E-posta yok ama Play Games kimliği bağlı: kişi cihazını değiştirse bile
        # sessiz girişle aynı hesaba döner -> kurtarılabilir, doğrulanmış sayılır.
        verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


# ---------------------------------------------------------------- Hızlı Giriş
#
# Kullanıcı tek bir isim yazar, hesap ANINDA açılır: e-posta yok, şifre yok.
# Hesabın tek dayanağı cihazda saklanan oturum jetonudur (mobilde Capacitor
# Preferences, webde localStorage). Kişi isterse sonradan e-posta + şifre ekleyip
# hesabını "doğrular" (verify_account) — böylece cihaz kaybolsa da geri girebilir.


async def count_accounts_from_ip(db: AsyncSession, ip: str | None) -> int:
    """Bu IP'den şimdiye kadar açılmış hesap sayısı (her yöntem dahil)."""
    if not ip:
        return 0
    from sqlalchemy import func as sa_func
    res = await db.execute(
        select(sa_func.count()).select_from(User).where(User.signup_ip == ip)
    )
    return int(res.scalar() or 0)


async def quick_signup_limit(db: AsyncSession) -> int:
    """Aynı IP'den açılabilecek en fazla hesap (0 = sınırsız). Admin ayarı."""
    from app.game import settings_service
    return max(0, await settings_service.get_int(db, "quick_signup_ip_limit", 10))


async def create_quick_user(
    db: AsyncSession, display_name: str, signup_ip: str | None = None,
    platform: str | None = None,
) -> User:
    """İsimle hesap açar. IP sınırını AŞMIŞSA AuthError fırlatır.

    Görünen ad kullanıcının yazdığı gibi kalır ("Ayşe Gül"); kullanıcı adı ondan
    türetilir (Türkçe harfler ASCII'ye, boşluklar silinir, küçük harf, doluysa
    2'den başlayan sıra numarası: "aysegul", "aysegul2"...). Bu dönüşüm Play
    Games akışıyla AYNI fonksiyonlardır — iki yol birbirinden ayrışmasın diye.
    """
    from app.game import name_rules
    try:
        display = await name_rules.clean_display_name(db, display_name)
    except name_rules.NameError_ as e:
        raise AuthError(str(e))

    # IP sınırı: ad doğrulandıktan SONRA bakılır ki, sınıra takılan kişi önce
    # "adın çok kısa" gibi gerçek bir düzeltmeyi görmesin diye sıra karışmasın.
    limit = await quick_signup_limit(db)
    if limit and await count_accounts_from_ip(db, signup_ip) >= limit:
        raise AuthError(
            "Bu bağlantıdan açılabilecek hesap sayısına ulaşıldı. "
            "Zaten hesabın varsa e-posta ile giriş yapabilirsin."
        )

    # Kullanıcı adı türetimi: kısa/uygunsuzsa AuthError -> ekranda uyarı çıkar.
    username = await unique_username_from_name(db, display)
    user = User(
        email=None,
        username=username,
        display_name=display,
        name_status=_initial_name_status(),
        # Kurtarılabilir kimlik YOK -> doğrulanmamış.
        verified=False,
        signup_ip=signup_ip,
        signup_platform=platform,
        last_platform=platform,
        # Bu IP admin tarafından GÖLGE banlanmışsa hesap açılır ama işaretlenir.
        # Kullanıcıya hiçbir şey söylenmez — gölge banın anlamı budur.
        shadow_banned=await is_ip_banned(db, signup_ip),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


async def verify_account(
    db: AsyncSession, user: User, email: str, password: str,
    platform: str | None = None,
) -> User:
    """Hızlı hesaba e-posta + şifre ekler ve hesabı 'doğrulanmış' yapar.

    Hatalar:
      AuthError   -> e-posta biçimi / şifre kısa / hesapta zaten e-posta var
      EmailInUse  -> e-posta BAŞKA bir hesapta; çağıran taraf taşıma akışını başlatır
    """
    email = (email or "").strip().lower()
    if not EMAIL_RE.match(email):
        raise AuthError("Geçerli bir e-posta gir.")
    if len(password or "") < 6:
        raise AuthError("Şifre en az 6 karakter olmalı.")
    if user.email:
        raise AuthError("Bu hesapta zaten bir e-posta kayıtlı.")

    other = await get_user_by_email(db, email)
    if other and other.id != user.id:
        raise EmailInUse(other.id)

    user.email = email
    user.password_hash = hash_password(password)
    user.verified = True
    # Admin özet ekranı "bugün hangi ortamdan kaç doğrulama" sayısını buradan okur.
    user.verified_at = _now()
    user.verified_platform = platform
    await db.commit()
    await db.refresh(user)
    return user


async def is_ip_banned(db: AsyncSession, ip: str | None) -> bool:
    """Bu IP admin tarafından gölge banlanmış mı? (app/models/ip_ban.py)"""
    if not ip:
        return False
    from app.models.ip_ban import IpBan
    res = await db.execute(select(IpBan.ip).where(IpBan.ip == ip))
    return res.scalar_one_or_none() is not None
