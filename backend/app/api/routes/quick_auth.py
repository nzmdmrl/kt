"""
Admin uçları — "🔎 İsim Kontrol" ve "⚡ Hızlı Giriş" sekmeleri.

İSİM KONTROL
------------
İsim denetimi (app/services/name_review.py) şüpheli bulduğu her ismi
`name_flags` tablosuna yazar. Buradaki uçlar o listeyi gösterir ve adminin
üç kararından birini uygulamasını sağlar:

  onayla (clean)  -> yanlış alarm. Hesap pasife alınmışsa YENİDEN AÇILIR.
  pasife al       -> hesap kapanır; kullanıcı girişte nedenini görür.
  IP'yi banla     -> GÖLGE BAN. Kullanıcıya hiçbir şey söylenmez; o IP'den
                     açılmış ve açılacak tüm hesaplar işaretlenir, listelerde
                     görünmez olur ve yalnız botla eşleşir.

HIZLI GİRİŞ
-----------
Aşama 1-3'te eklenen tüm ayarlar tek ekranda: IP başına hesap sınırı, hızlı
giriş anahtarı, doğrulama şeridi süresi, hatırlatma eşiği ve anahtarları,
hatırlatma metinleri, isim denetimi eşikleri.

Bu ayarlar ⚙️ Ayarlar sekmesinde de görünür (aynı `game_settings` kayıtları);
burası onları anlamlı bir sırada, açıklamalarıyla ve tek kaydet düğmesiyle
toplar. İki ekran aynı veriyi yazar, biri diğerini bozmaz.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_admin_user
from app.models.ip_ban import IpBan
from app.models.name_flag import NameFlag
from app.models.user import User

router = APIRouter(prefix="/admin", tags=["quick-auth-admin"])


# ---------------------------------------------------------------- İsim Kontrol

def _flag_row(f: NameFlag, u: User | None) -> dict:
    return {
        "id": f.id,
        "user_id": f.user_id,
        # Kayıttaki ad, işaretlendiği ANDAKİ hâliyle; kullanıcının GÜNCEL adı ayrı.
        "flagged_display_name": f.display_name,
        "flagged_username": f.username,
        "current_display_name": u.display_name if u else None,
        "current_username": u.username if u else None,
        "avatar_url": (u.avatar_photo or u.avatar_url) if u else None,
        "layer": f.layer,
        "score": f.score,
        "reason": f.reason,
        "source": f.source,
        "signup_ip": f.signup_ip,
        "action": f.action,
        "status": f.status,
        "created_at": f.created_at.isoformat() if f.created_at else None,
        "reviewed_at": f.reviewed_at.isoformat() if f.reviewed_at else None,
        # Hesabın ŞU ANKİ durumu — admin ne olduğunu tek bakışta görsün.
        "account": None if u is None else {
            "disabled": bool(u.disabled),
            "disabled_reason": u.disabled_reason,
            "shadow_banned": bool(u.shadow_banned),
            "verified": bool(u.verified),
            "matches_played": u.matches_played or 0,
        },
    }


@router.get("/name-flags")
async def list_name_flags(
    status: str = Query("pending"),
    limit: int = Query(100, ge=1, le=300),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """İşaretlenen isimler. status=all ile hepsi."""
    q = select(NameFlag)
    if status in ("pending", "clean", "blocked"):
        q = q.where(NameFlag.status == status)
    q = q.order_by(NameFlag.score.desc(), NameFlag.id.desc()).limit(limit)
    flags = (await db.execute(q)).scalars().all()

    uids = {f.user_id for f in flags}
    users: dict[int, User] = {}
    if uids:
        rows = (await db.execute(select(User).where(User.id.in_(uids)))).scalars().all()
        users = {u.id: u for u in rows}

    pending = int((await db.execute(
        select(func.count(NameFlag.id)).where(NameFlag.status == "pending")
    )).scalar() or 0)

    return {
        "flags": [_flag_row(f, users.get(f.user_id)) for f in flags],
        "status": status,
        "pending": pending,
        # Arayüz eşikleri göstersin (hangi puandan sonra ne olur).
        "flag_threshold": _int_setting("name_flag_threshold", 40),
        "auto_disable_threshold": _int_setting("name_auto_disable_threshold", 85),
        # OpenAI yapılandırılmadıysa panelde uyarı çıksın.
        "ai_configured": _ai_configured(),
    }


@router.get("/name-flags/counts")
async def name_flag_counts(
    admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db),
):
    """Sekme rozeti — bekleyen işaret sayısı."""
    n = int((await db.execute(
        select(func.count(NameFlag.id)).where(NameFlag.status == "pending")
    )).scalar() or 0)
    return {"pending": n}


async def _get_flag(db: AsyncSession, flag_id: int) -> NameFlag:
    f = (await db.execute(select(NameFlag).where(NameFlag.id == flag_id))).scalar_one_or_none()
    if not f:
        raise HTTPException(404, "Kayıt bulunamadı.")
    return f


async def _get_user(db: AsyncSession, uid: int) -> User | None:
    return (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()


@router.post("/name-flags/{flag_id}/clean")
async def mark_clean(
    flag_id: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db),
):
    """Yanlış alarm — isim temiz. Hesap otomatik kapatıldıysa yeniden açılır."""
    f = await _get_flag(db, flag_id)
    f.status = "clean"
    f.reviewed_at = datetime.now(timezone.utc)
    f.reviewed_by = admin.id
    u = await _get_user(db, f.user_id)
    reopened = False
    if u and u.disabled:
        u.disabled = False
        u.disabled_reason = None
        u.disabled_at = None
        reopened = True
    await db.commit()
    return {"ok": True, "reopened": reopened}


@router.post("/name-flags/{flag_id}/disable")
async def disable_account(
    flag_id: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db),
):
    """Hesabı pasife al — kullanıcı giriş yapamaz, nedenini görür."""
    f = await _get_flag(db, flag_id)
    u = await _get_user(db, f.user_id)
    if not u:
        raise HTTPException(404, "Kullanıcı bulunamadı (silinmiş olabilir).")
    if u.is_admin:
        raise HTTPException(400, "Yönetici hesabı pasife alınamaz.")
    u.disabled = True
    u.disabled_reason = "Kullanıcı adı kurallara uymuyor"
    u.disabled_at = datetime.now(timezone.utc)
    f.status = "blocked"
    f.reviewed_at = datetime.now(timezone.utc)
    f.reviewed_by = admin.id
    await db.commit()
    return {"ok": True}


class BanIpIn(BaseModel):
    reason: str = ""


@router.post("/name-flags/{flag_id}/ban-ip")
async def ban_ip_from_flag(
    flag_id: int,
    data: BanIpIn,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Kayıt IP'sine GÖLGE BAN.

    Kullanıcıya hiçbir şey söylenmez; hesabı kapanmaz, hata görmez. O IP'den
    açılmış TÜM hesaplara `shadow_banned` işlenir ve bundan sonra o IP'den
    açılacak hesaplar da doğrudan işaretli doğar (auth_service.create_quick_user).
    """
    f = await _get_flag(db, flag_id)
    ip = (f.signup_ip or "").strip()
    if not ip:
        raise HTTPException(400, "Bu kayıtta IP bilgisi yok (eski kayıt olabilir).")

    exists = (await db.execute(select(IpBan).where(IpBan.ip == ip))).scalar_one_or_none()
    if not exists:
        db.add(IpBan(ip=ip, reason=(data.reason or "İsim ihlali")[:200], created_by=admin.id))

    # O IP'den açılmış mevcut hesaplar (yöneticiler hariç) işaretlenir.
    users = (await db.execute(
        select(User).where(User.signup_ip == ip, User.is_admin.isnot(True))
    )).scalars().all()
    for u in users:
        u.shadow_banned = True

    f.status = "blocked"
    f.reviewed_at = datetime.now(timezone.utc)
    f.reviewed_by = admin.id
    await db.commit()
    return {"ok": True, "ip": ip, "affected_users": len(users)}


@router.get("/ip-bans")
async def list_ip_bans(
    admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(IpBan).order_by(IpBan.created_at.desc()))).scalars().all()
    out = []
    for b in rows:
        n = int((await db.execute(
            select(func.count(User.id)).where(User.signup_ip == b.ip)
        )).scalar() or 0)
        out.append({
            "ip": b.ip, "reason": b.reason, "accounts": n,
            "created_at": b.created_at.isoformat() if b.created_at else None,
        })
    return {"bans": out}


@router.delete("/ip-bans/{ip}")
async def remove_ip_ban(
    ip: str, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db),
):
    """Banı kaldır — o IP'den açılmış hesapların gölge banı da kalkar."""
    await db.execute(delete(IpBan).where(IpBan.ip == ip))
    users = (await db.execute(select(User).where(User.signup_ip == ip))).scalars().all()
    for u in users:
        u.shadow_banned = False
    await db.commit()
    return {"ok": True, "affected_users": len(users)}


# ---------------------------------------------------------------- Rezerve adlar
#
# Kimsenin alamayacağı kullanıcı adları. Liste KODDA DEĞİL veritabanındadır;
# buradan eklenir/silinir. Kontrol harf duyarsızdır ve adın çevrilmiş hâline
# bakar ("ADMIN", "Admin", "admın" hepsi aynı kayda düşer).


@router.get("/reserved-names")
async def list_reserved(
    admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db),
):
    """Rezerve adlar + davranış ayarı + listeyi ŞU AN kullanan hesaplar."""
    from sqlalchemy import select as _sel
    from app.game import reserved_names
    from app.models.reserved_username import ReservedUsername

    rows = (await db.execute(
        _sel(ReservedUsername).order_by(ReservedUsername.name)
    )).scalars().all()
    names = [r.name for r in rows]

    # Listedeki bir adı KULLANAN mevcut hesaplar (harf duyarsız).
    # SADECE LİSTELENİR — hiçbir kayıt değiştirilmez.
    users_using: list[dict] = []
    if names:
        found = (await db.execute(
            _sel(User).where(func.lower(User.username).in_(names)).order_by(User.id)
        )).scalars().all()
        users_using = [{
            "id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "email": u.email,
            "matches_played": u.matches_played or 0,
            "xp": u.xp or 0,
            "deleted": bool(u.deleted),
        } for u in found]

    return {
        "names": [{"name": r.name, "note": r.note or "",
                   "created_at": r.created_at.isoformat() if r.created_at else None}
                  for r in rows],
        "count": len(rows),
        "fallback": reserved_names.fallback_mode(),
        "neutral_base": reserved_names.NEUTRAL_BASE,
        "users_using": users_using,
    }


class ReservedIn(BaseModel):
    name: str
    note: str = ""


@router.post("/reserved-names")
async def add_reserved(
    data: ReservedIn,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Yeni rezerve ad ekler. Girilen ad normalleştirilerek kaydedilir."""
    from sqlalchemy import select as _sel
    from app.game import reserved_names
    from app.game.name_rules import slugify_username
    from app.models.reserved_username import ReservedUsername

    key = slugify_username(data.name)
    if not key:
        raise HTTPException(400, "Ad en az bir harf ya da rakam içermeli.")
    if len(key) > 32:
        raise HTTPException(400, "Ad en fazla 32 karakter olabilir.")
    if key == reserved_names.NEUTRAL_BASE:
        # Yedek taban rezerve edilirse "tarafsız ada kaydırma" yolu tıkanır.
        raise HTTPException(
            400,
            f"“{key}” rezerve edilemez — rezerve ada denk gelen hesaplara "
            "yedek kullanıcı adı bu tabandan üretiliyor.",
        )

    exists = (await db.execute(
        _sel(ReservedUsername).where(ReservedUsername.name == key)
    )).scalar_one_or_none()
    if exists:
        raise HTTPException(409, f"“{key}” zaten listede.")

    db.add(ReservedUsername(name=key, note=(data.note or "")[:120]))
    await db.commit()
    reserved_names.invalidate()

    # Bu adı kullanan hesap var mı? (bilgi amaçlı — değiştirilmez)
    using = (await db.execute(
        _sel(User).where(func.lower(User.username) == key)
    )).scalars().all()
    return {
        "ok": True, "name": key,
        "users_using": [{"id": u.id, "username": u.username} for u in using],
    }


@router.delete("/reserved-names/{name}")
async def remove_reserved(
    name: str, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db),
):
    """Rezerve adı listeden çıkarır (ad yeniden alınabilir hâle gelir)."""
    from sqlalchemy import delete as _del
    from app.game import reserved_names
    from app.game.name_rules import slugify_username
    from app.models.reserved_username import ReservedUsername

    key = slugify_username(name)
    res = await db.execute(_del(ReservedUsername).where(ReservedUsername.name == key))
    await db.commit()
    reserved_names.invalidate()
    if not res.rowcount:
        raise HTTPException(404, "Bu ad listede yok.")
    return {"ok": True, "name": key}


class ReservedFallbackIn(BaseModel):
    mode: str


@router.put("/reserved-names/fallback")
async def set_reserved_fallback(
    data: ReservedFallbackIn,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Rezerve ada denk gelince ne yapılacağı: neutral | number."""
    if data.mode not in ("neutral", "number"):
        raise HTTPException(400, "Geçersiz seçenek.")
    from app.game.settings_service import set_setting
    await set_setting(db, "reserved_fallback", data.mode)
    return {"ok": True, "mode": data.mode}


# ---------------------------------------------------------------- Hızlı Giriş

def _int_setting(key: str, default: int) -> int:
    from app.game.settings_service import cached_int
    return cached_int(key, default)


def _ai_configured() -> bool:
    from app.core.config import get_settings
    return get_settings().openai_configured


# Panelde gösterilecek ayarlar — sıra ve tip burada tanımlı.
# (key, tip, etiket, yardım metni)
QUICK_FIELDS: list[tuple[str, str, str, str]] = [
    ("quick_signup_enabled", "bool", "İsimle hesap açma açık",
     "Kapatırsan isim popup'ı hiç çıkmaz; ziyaretçi normal giriş sayfasına yönlenir."),
    ("quick_signup_ip_limit", "int", "Aynı IP'den en fazla hesap",
     "0 = sınırsız. Sınıra ulaşan kişi 'e-posta ile giriş yap' uyarısı görür."),
    ("verify_banner_days", "int", "Doğrulama şeridi kaç gün gizlensin",
     "Ana sayfadaki şeridi kapatan kullanıcıya kaç gün sonra tekrar gösterilsin. 0 = bir daha çıkmasın."),
    ("verify_reminder_enabled", "bool", "1. hatırlatma bildirimi gönderilsin",
     "Doğrulamamış kullanıcıya, yeterince oynadıktan sonra tek seferlik hatırlatma."),
    ("verify_reminder_min_games", "int", "Hatırlatma için en az oyun sayısı",
     "1v1 + arena + maraton toplamı. Bu sayıya ulaşmadan hatırlatma gitmez."),
    ("verify_reminder_title", "str", "1. hatırlatma başlığı",
     "Boş bırakırsan koddaki varsayılan kullanılır."),
    ("verify_reminder_body", "text", "1. hatırlatma metni",
     "Boş bırakırsan koddaki varsayılan kullanılır. En fazla 250 karakter."),
    ("verify_reminder_2_enabled", "bool", "2. hatırlatma gönderilsin",
     "KAPALI gelir. Açarsan 1. hatırlatmadan belirlenen gün sonra, hâlâ doğrulamamış olanlara gider."),
    ("verify_reminder_2_days", "int", "2. hatırlatma kaç gün sonra",
     "1. hatırlatmanın üzerinden geçmesi gereken gün sayısı."),
    ("verify_reminder_2_title", "str", "2. hatırlatma başlığı",
     "Boş bırakırsan koddaki varsayılan kullanılır."),
    ("verify_reminder_2_body", "text", "2. hatırlatma metni",
     "Boş bırakırsan koddaki varsayılan kullanılır. En fazla 250 karakter."),
    ("name_check_enabled", "bool", "İsim denetimi açık",
     "Kapatırsan hiçbir isim kontrol edilmez, İsim Kontrol listesine kayıt düşmez."),
    ("name_check_ai_enabled", "bool", "2. katman (OpenAI) kullanılsın",
     "Kara listenin yakalayamadığı yaratıcı yazımlar için. Kapatırsan sadece yerel liste çalışır ve hiç ücret oluşmaz."),
    ("name_ai_model", "str", "OpenAI modeli",
     "Varsayılan gpt-4o-mini. Model değişikliği deploy gerektirmez."),
    ("name_flag_threshold", "int", "İsim Kontrol listesine düşme eşiği (0-100)",
     "Bu puanın altındaki isimler temiz sayılır, hiç kaydedilmez."),
    ("name_auto_disable_threshold", "int", "Otomatik pasife alma eşiği (0-100)",
     "Bu puan ve üstü hesaplar kendiliğinden kapanır ve sana bildirim gelir. "
     "Listeye düşme eşiğiyle AYNI yaparsan işaretlenen her isim otomatik kapanır; "
     "100 yaparsan hiçbiri kapanmaz, hepsini elle incelersin."),
]

# Serbest metin alanlarının sınırı — game_settings.value sütunu 256 karakter.
TEXT_MAX = 250


@router.get("/quick-auth")
async def get_quick_auth(
    admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db),
):
    """⚡ Hızlı Giriş sekmesinin tüm ayarları + durum bilgileri."""
    from app.game import settings_service
    from app.models.game_setting import DEFAULT_SETTINGS

    fields = []
    for key, kind, label, help_text in QUICK_FIELDS:
        default = (DEFAULT_SETTINGS.get(key) or {}).get("value", "")
        value = await settings_service.get_str(db, key, default)
        fields.append({
            "key": key, "type": kind, "label": label, "help": help_text,
            "value": value, "default": default,
        })

    # Durum kutusu için sayılar.
    unverified = int((await db.execute(
        select(func.count(User.id)).where(User.verified.isnot(True))
    )).scalar() or 0)
    disabled = int((await db.execute(
        select(func.count(User.id)).where(User.disabled.is_(True))
    )).scalar() or 0)
    shadowed = int((await db.execute(
        select(func.count(User.id)).where(User.shadow_banned.is_(True))
    )).scalar() or 0)
    pending_flags = int((await db.execute(
        select(func.count(NameFlag.id)).where(NameFlag.status == "pending")
    )).scalar() or 0)

    return {
        "fields": fields,
        "text_max": TEXT_MAX,
        "ai_configured": _ai_configured(),
        "stats": {
            "unverified": unverified,
            "disabled": disabled,
            "shadow_banned": shadowed,
            "pending_flags": pending_flags,
        },
    }


class QuickSettingIn(BaseModel):
    key: str
    value: str


@router.put("/quick-auth")
async def set_quick_auth(
    data: QuickSettingIn,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Tek bir ayarı kaydeder (⚙️ Ayarlar ile aynı `game_settings` kaydı)."""
    known = {k: t for k, t, _l, _h in QUICK_FIELDS}
    kind = known.get(data.key)
    if kind is None:
        raise HTTPException(400, "Bilinmeyen ayar.")

    value = (data.value or "").strip()
    if kind == "bool":
        value = "true" if value in ("1", "true", "True", "yes", "on") else "false"
    elif kind == "int":
        try:
            n = int(value)
        except ValueError:
            raise HTTPException(400, "Sayı girmelisin.")
        if n < 0:
            raise HTTPException(400, "Negatif olamaz.")
        if data.key.endswith("_threshold") and n > 100:
            raise HTTPException(400, "Eşik en fazla 100 olabilir.")
        value = str(n)
    else:
        if len(value) > TEXT_MAX:
            raise HTTPException(400, f"En fazla {TEXT_MAX} karakter olabilir.")

    from app.game.settings_service import set_setting
    await set_setting(db, data.key, value)
    return {"ok": True, "key": data.key, "value": value}
