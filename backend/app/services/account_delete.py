"""
Kullanıcının KENDİ hesabını silmesi.

NEDEN VAR
---------
Google Play ve App Store, uygulama içinden hesap silmeyi ZORUNLU tutuyor —
ayrıca uygulama dışından (web'den) erişilebilen bir talep adresi de istiyor
(o sayfa: frontend/app/hesap-silme). Bu hak HERKESE açıktır: doğrulanmış da
doğrulanmamış da silebilir. "Sadece e-postası olanlar silebilir" demek
politikaya aykırı olurdu.

SATIR NEDEN SİLİNMİYOR
----------------------
Kullanıcı satırını gerçekten silmek, RAKİPLERİN geçmişini de bozardı: maç
geçmişi kayıtları, arena sonuçları ve lig kayıtları o kişiye bağlı. Bu yüzden
satır ANONİMLEŞTİRİLİR:

  görünen ad     -> "Silinmiş üye"
  kullanıcı adı  -> "silinmisuye001" (sıralı, benzersiz)
  e-posta/şifre  -> silinir (bir daha giriş yapılamaz)
  Google/Play    -> bağlantılar koparılır (aynı hesapla yeniden girilemez)
  avatar/foto    -> silinir
  deleted        -> true, disabled -> true (oturum jetonları da işe yaramaz)

Sonuç: kişi sistemden görünmez olur (sıralama, arama, arkadaş listesi, profil
sayfası) ama rakiplerinin maç geçmişinde "Silinmiş üye" olarak durur.

CİHAZ KAYITLARI SİLİNİR: push cihazları ve arkadaşlıklar gerçekten silinir —
bunlar kişisel bağlardır, anonim satırda kalmalarının anlamı yok.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from sqlalchemy import select, func, text, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User

DELETED_NAME = "Silinmiş üye"
DELETED_PREFIX = "silinmisuye"


class DeleteError(Exception):
    """Silme reddedildi — istemciye Türkçe mesajla döner."""


async def _next_deleted_username(db: AsyncSession) -> str:
    """silinmisuye001, silinmisuye002 ... sıradaki boş numarayı bulur."""
    rows = (await db.execute(
        select(User.username).where(User.username.like(f"{DELETED_PREFIX}%"))
    )).scalars().all()
    used = set()
    for u in rows:
        m = re.fullmatch(rf"{DELETED_PREFIX}(\d+)", u or "")
        if m:
            used.add(int(m.group(1)))
    n = 1
    while n in used:
        n += 1
    return f"{DELETED_PREFIX}{n:03d}"


def confirmation_hint(user: User) -> dict:
    """Arayüz hangi onayı isteyeceğini buradan öğrenir."""
    if user.password_hash:
        return {"mode": "password", "label": "Şifreni yaz"}
    return {"mode": "name", "label": f"Onaylamak için “{user.display_name}” yaz"}


async def delete_own_account(
    db: AsyncSession, user: User, password: str = "", name: str = ""
) -> str:
    """Hesabı anonimleştirir. Yeni (anonim) kullanıcı adını döner.

    Onay: şifresi olan kullanıcı ŞİFRESİNİ, olmayan GÖRÜNEN ADINI yazar.
    Yanlışlıkla silme olmasın diye ikisi de zorunludur.
    """
    if user.is_admin:
        raise DeleteError("Yönetici hesabı buradan silinemez.")
    if user.deleted:
        raise DeleteError("Bu hesap zaten silinmiş.")

    if user.password_hash:
        from app.core.security import verify_password
        if not password or not verify_password(password, user.password_hash):
            raise DeleteError("Şifre yanlış.")
    else:
        typed = " ".join((name or "").split()).casefold()
        expected = " ".join((user.display_name or "").split()).casefold()
        if not typed or typed != expected:
            raise DeleteError(f"Onaylamak için adını tam olarak yaz: {user.display_name}")

    now = datetime.now(timezone.utc)
    old_username = user.username
    old_display = user.display_name
    new_username = await _next_deleted_username(db)

    # --- kişisel bağlar gerçekten silinir
    from app.models.friendship import Friendship
    from app.models.friend_label import FriendLabel
    await db.execute(sa_delete(Friendship).where(
        (Friendship.requester_id == user.id) | (Friendship.addressee_id == user.id)
    ))
    await db.execute(sa_delete(FriendLabel).where(
        (FriendLabel.owner_id == user.id) | (FriendLabel.friend_id == user.id)
    ))
    for tbl in ("device_tokens", "user_push_prefs", "user_push_settings"):
        try:
            await db.execute(text(f"DELETE FROM {tbl} WHERE user_id = :i"), {"i": user.id})
        except Exception:
            pass   # tablo yoksa (test ortamı) sorun değil

    # --- maç geçmişinde adı "Silinmiş üye"ye çevrilir, link kaldırılır
    # (rakiplerin geçmişi bozulmasın diye satırlar KALIR).
    names = {"ou": old_username, "on": old_display, "dn": DELETED_NAME}
    await db.execute(text(
        "UPDATE match_history SET p1_name = :dn, p1_username = '' WHERE p1_username = :ou"
    ), names)
    await db.execute(text(
        "UPDATE match_history SET p2_name = :dn, p2_username = '' WHERE p2_username = :ou"
    ), names)
    await db.execute(text(
        "UPDATE match_history SET winner_name = :dn WHERE winner_name = :on"
    ), names)

    # --- anonimleştir
    user.deleted = True
    user.deleted_at = now
    user.disabled = True
    user.disabled_reason = "Hesap kullanıcı tarafından silindi"
    user.disabled_at = now
    user.display_name = DELETED_NAME
    user.username = new_username
    user.email = None
    user.password_hash = None
    user.google_sub = None
    user.play_games_id = None
    user.avatar_url = None
    user.avatar_photo = None
    user.avatar_pending = None
    user.avatar_pending_at = None
    user.verified = False
    user.show_online = False
    user.allow_challenges = False

    await db.commit()
    return new_username


async def deleted_count(db: AsyncSession) -> int:
    return int((await db.execute(
        select(func.count(User.id)).where(User.deleted.is_(True))
    )).scalar() or 0)
