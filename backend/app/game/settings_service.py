"""
Ayar servisi.

Oyun ayarlarını DB'den okur, bellekte cache'ler. Admin ayarı değiştirince
cache temizlenir. DB'de yoksa DEFAULT_SETTINGS'teki varsayılan kullanılır.

Oyun kodu get_int("round_total_seconds", 90) gibi çağırır — DB'de değer varsa
onu, yoksa fallback'i döner. Böylece tablo hiç kurulmasa bile oyun çalışır.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game_setting import GameSetting, DEFAULT_SETTINGS

# Basit in-memory cache (process içi). Ayar değişince invalidate edilir.
_cache: dict[str, str] = {}
_loaded = False


def cached_int(key: str, default: int) -> int:
    """Senkron erişim — yüklenmiş cache'ten okur (oyun kodu için). Yoksa default."""
    val = _cache.get(key)
    if val is None:
        from app.models.game_setting import DEFAULT_SETTINGS
        d = DEFAULT_SETTINGS.get(key)
        val = d["value"] if d else None
    try:
        return int(val) if val is not None else default
    except (ValueError, TypeError):
        return default


def cached_bool(key: str, default: bool = False) -> bool:
    val = _cache.get(key)
    if val is None:
        from app.models.game_setting import DEFAULT_SETTINGS
        d = DEFAULT_SETTINGS.get(key)
        val = d["value"] if d else ("1" if default else "0")
    return val in ("1", "true", "True", "yes")


async def load_settings(db: AsyncSession) -> None:
    global _cache, _loaded
    res = await db.execute(select(GameSetting))
    _cache = {row.key: row.value for row in res.scalars().all()}
    _loaded = True


def invalidate() -> None:
    global _loaded
    _loaded = False


async def _ensure_loaded(db: AsyncSession) -> None:
    if not _loaded:
        await load_settings(db)


async def get_str(db: AsyncSession, key: str, default: str | None = None) -> str:
    await _ensure_loaded(db)
    if key in _cache:
        return _cache[key]
    if default is not None:
        return default
    d = DEFAULT_SETTINGS.get(key)
    return d["value"] if d else ""


async def get_int(db: AsyncSession, key: str, default: int) -> int:
    val = await get_str(db, key, str(default))
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


async def get_bool(db: AsyncSession, key: str, default: bool = False) -> bool:
    val = await get_str(db, key, "1" if default else "0")
    return val in ("1", "true", "True", "yes")


async def set_setting(db: AsyncSession, key: str, value: str) -> None:
    res = await db.execute(select(GameSetting).where(GameSetting.key == key))
    row = res.scalar_one_or_none()
    if row:
        row.value = value
    else:
        db.add(GameSetting(key=key, value=value))
    await db.commit()
    # Cache'i hemen güncelle (senkron okuyucular için).
    _cache[key] = value


async def all_settings(db: AsyncSession) -> list[dict]:
    """Panel için: tüm ayarlar (varsayılan + DB değeri) birleşik liste."""
    await _ensure_loaded(db)
    out = []
    for key, meta in DEFAULT_SETTINGS.items():
        out.append({
            "key": key,
            "label": meta["label"],
            "type": meta["type"],
            "value": _cache.get(key, meta["value"]),
            "default": meta["value"],
        })
    return out
