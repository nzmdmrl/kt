"""
XP ve seviye sistemi.

- Her oyun türü belirli XP kazandırır (admin ayarlı):
    xp_match_win / xp_match_loss / xp_arena_played / xp_arena_win /
    xp_solo_level / xp_daily_solved
- Toplam XP kullanıcıda saklanır (User.xp). Seviye XP'den hesaplanır.

Seviye eğrisi: level L'ye ulaşmak için gereken toplam XP artan.
  level 1: 0 XP
  her seviye için gereken artışı LEVEL_BASE + (L-1)*LEVEL_STEP.
"""

from __future__ import annotations

from app.game.settings_service import cached_int

LEVEL_BASE = 100    # 1->2 için gereken XP
LEVEL_STEP = 50     # her seviyede artış


def xp_for_level(level: int) -> int:
    """level'e ulaşmak için gereken TOPLAM XP (kümülatif)."""
    if level <= 1:
        return 0
    total = 0
    for L in range(1, level):
        total += LEVEL_BASE + (L - 1) * LEVEL_STEP
    return total


def level_from_xp(xp: int) -> int:
    """Toplam XP'den seviye hesapla."""
    level = 1
    while xp >= xp_for_level(level + 1):
        level += 1
        if level > 999:
            break
    return level


def level_progress(xp: int) -> dict:
    """Seviye + o seviyedeki ilerleme (bar için)."""
    level = level_from_xp(xp)
    cur_floor = xp_for_level(level)
    next_floor = xp_for_level(level + 1)
    span = max(1, next_floor - cur_floor)
    into = xp - cur_floor
    return {
        "level": level,
        "xp": xp,
        "level_xp": into,           # bu seviyede kazanılan
        "level_need": span,         # bu seviyeyi bitirmek için gereken
        "next_level_xp": next_floor,
    }


# Oyun türüne göre XP miktarı (admin ayarı anahtarları + varsayılan).
XP_EVENTS = {
    "match_win": ("xp_match_win", 50),
    "match_loss": ("xp_match_loss", 15),
    "match_draw": ("xp_match_draw", 25),
    "arena_played": ("xp_arena_played", 20),
    "arena_win": ("xp_arena_win", 60),
    "solo_level": ("xp_solo_level", 30),
    "daily_solved": ("xp_daily_solved", 40),
}


def xp_amount(event: str) -> int:
    key, default = XP_EVENTS.get(event, (None, 0))
    if not key:
        return 0
    return cached_int(key, default)


# Unvan cache — (isim, xp, ikon) tuple listesi, xp'ye göre sıralı.
# DB'den yüklenir (models.title.Title). Fallback: DEFAULT_TITLES.
_titles_cache: list[tuple] = []


def _fallback_titles() -> list[tuple]:
    from app.models.title import DEFAULT_TITLES
    return [(name, xp, icon) for (name, icon, xp) in DEFAULT_TITLES]


def set_titles_cache(rows: list[tuple]) -> None:
    """rows: [(name, xp, icon), ...] — admin/startup çağırır."""
    global _titles_cache
    _titles_cache = sorted(rows, key=lambda t: t[1]) if rows else []


def _titles() -> list[tuple]:
    return _titles_cache if _titles_cache else _fallback_titles()


def title_for_xp(xp: int) -> dict:
    """XP'ye göre mevcut unvan + sonraki unvan bilgisi (bar/etiket için)."""
    titles = _titles()
    current = titles[0]
    nxt = None
    for i, item in enumerate(titles):
        if xp >= item[1]:
            current = item
            nxt = titles[i + 1] if i + 1 < len(titles) else None
        else:
            break
    result = {
        "title": current[0],
        "title_xp": current[1],
        "title_icon": current[2],
        "next_title": nxt[0] if nxt else None,
        "next_title_xp": nxt[1] if nxt else None,
        "next_title_icon": nxt[2] if nxt else None,
        "xp": xp,
    }
    if nxt:
        span = max(1, nxt[1] - current[1])
        result["title_progress"] = min(100, int((xp - current[1]) / span * 100))
        result["xp_to_next"] = max(0, nxt[1] - xp)
    else:
        result["title_progress"] = 100
        result["xp_to_next"] = 0
    return result


async def grant_xp(db, user, event: str) -> dict:
    """Kullanıcıya bir olay için XP ver. {gained, level, leveled_up, ...} döner."""
    amount = xp_amount(event)
    if amount <= 0 or user is None:
        return {"gained": 0, "level": level_from_xp(user.xp if user else 0), "leveled_up": False}
    before = level_from_xp(user.xp or 0)
    user.xp = (user.xp or 0) + amount
    after = level_from_xp(user.xp)
    await db.commit()
    prog = level_progress(user.xp)
    prog.update({"gained": amount, "leveled_up": after > before})
    return prog
