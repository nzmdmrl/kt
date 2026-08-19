"""
Rezerve kullanıcı adı kontrolü.

Liste veritabanındadır (app/models/reserved_username.py) ama her kontrolde
sorgu atılmaz: settings_service ile aynı yaklaşımla süreç içinde cache'lenir,
admin listeyi değiştirince cache temizlenir.

KONTROL HARF DUYARSIZ VE ÇEVRİLMİŞ HÂLE BAKAR
---------------------------------------------
Hem listedeki ad hem de sorulan ad `slugify_username` ile normalleştirilip
karşılaştırılır. Yani "admin" rezerveyse şunların hepsi yakalanır:
    ADMIN · Admin · admın · A-d-m-i-n · ADMİN
Çünkü hepsi aynı çıktıya (admin) iner.

REZERVE AD DENK GELİRSE NE OLUR
-------------------------------
İki yol var ve hangisinin kullanılacağı admin ayarıdır
(`reserved_fallback`, ⚡ Hızlı Giriş / 🔒 Rezerve Adlar sekmesi):

  "neutral" (VARSAYILAN) -> kullanıcı adı tarafsız bir tabana kaydırılır:
      "Admin" yazan kişi   -> oyuncu, oyuncu2, oyuncu3...
      NEDEN VARSAYILAN: "admin2" hâlâ yetkili izlenimi verir; kötü niyetli
      kişinin aradığı tam da budur ("ikinci admin"). Tarafsız taban bu
      izlenimi tamamen ortadan kaldırır ve kullanıcıyı da durdurmaz.

  "number" -> mevcut çakışma kuralı: admin -> admin2

Kullanıcı adı DEĞİŞTİRME yolunda ise ikisi de geçerli değildir: orada kişi
bilerek bir ad seçiyordur, sessizce başka bir ad vermek yanıltıcı olur —
açık bir hata gösterilir (app/game/name_rules.py → clean_username).
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.game.name_rules import slugify_username
from app.models.reserved_username import ReservedUsername

# Rezerve ad denk gelince kullanılan tarafsız taban.
# DİKKAT: bu adın KENDİSİ rezerve listesine eklenmemeli, yoksa yedek yol tıkanır.
NEUTRAL_BASE = "oyuncu"

_cache: set[str] | None = None


def invalidate() -> None:
    """Admin listeyi değiştirince çağrılır."""
    global _cache
    _cache = None


async def load(db: AsyncSession) -> set[str]:
    """Listeyi cache'e yükler (zaten yüklüyse dokunmaz)."""
    global _cache
    if _cache is not None:
        return _cache
    try:
        rows = (await db.execute(select(ReservedUsername.name))).scalars().all()
        _cache = {slugify_username(r) for r in rows if r}
    except Exception as e:
        # Tablo henüz yoksa (ilk açılış) kontrol devre dışı kalır, site çalışır.
        print(f"[rezerve ad] liste okunamadı ({type(e).__name__}: {e})")
        _cache = set()
    return _cache


async def is_reserved(db: AsyncSession, name: str) -> bool:
    """Bu ad rezerve mi? Karşılaştırma normalleştirilmiş hâl üzerinden yapılır."""
    key = slugify_username(name)
    if not key:
        return False
    return key in await load(db)


def fallback_mode() -> str:
    """"neutral" | "number" — admin ayarı."""
    from app.game.settings_service import cached_str
    mode = (cached_str("reserved_fallback", "neutral") or "neutral").strip()
    return mode if mode in ("neutral", "number") else "neutral"


async def safe_base(db: AsyncSession, base: str) -> str:
    """Üretilecek kullanıcı adının tabanını rezerve listesine göre düzeltir.

    Rezerve DEĞİLSE taban olduğu gibi döner. Rezerveyse seçilen davranışa göre
    ya tarafsız tabana kaydırılır ya da olduğu gibi bırakılır (o zaman sıra
    numarası eklenerek "admin2" üretilir — bkz. _first_free).
    """
    if not await is_reserved(db, base):
        return base
    return NEUTRAL_BASE if fallback_mode() == "neutral" else base


async def seed_if_empty(db: AsyncSession) -> int:
    """Tablo BOŞSA başlangıç listesini yazar. Admin sildiyse geri getirmez."""
    from app.models.reserved_username import DEFAULT_RESERVED
    existing = (await db.execute(select(ReservedUsername.name).limit(1))).first()
    if existing:
        return 0
    added = 0
    for name, note in DEFAULT_RESERVED:
        key = slugify_username(name)
        if not key:
            continue
        db.add(ReservedUsername(name=key, note=note))
        added += 1
    if added:
        await db.commit()
        invalidate()
    return added
