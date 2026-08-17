"""
"Arenaya davet" anlık çağrısı (popup) — bildirim DEĞİL.

Biri arenaya girdiğinde o an ONLINE olan ve maçta olmayan en fazla
`MAX_TARGETS` kullanıcıya kısa ömürlü bir çağrı açılır. Hedefler bu çağrıyı
`GET /api/arena/call` ile öğrenir ve ekranda popup görür; kabul ederse doğrudan
arenaya gider. Çağrı süresi dolunca kendiliğinden kaybolur — hiçbir yere
kaydedilmez (veritabanında iz bırakmaz).

Bellekte tutulur (tek instance varsayımı; presence servisi de öyle).
"""

from __future__ import annotations

import time
from typing import Optional

# Aynı anda kaç kişiye davet gider.
MAX_TARGETS = 4
# Popup'ın ekranda kalma süresi (sn) — lobinin bekleme süresinden kısa olmasın.
MIN_TTL = 25
# Bir çağrı bittikten sonra yenisi açılabilmesi için geçmesi gereken süre (sn).
# Arka arkaya arenaya girenler herkesi popup'a boğmasın.
COOLDOWN = 45


class _Call:
    def __init__(self, from_id: int, from_name: str, targets: list[int], ttl: int):
        self.id = f"ac{int(time.time())}-{from_id}"
        self.from_id = from_id
        self.from_name = from_name
        self.targets = set(targets)
        self.created_at = time.time()
        self.ttl = ttl
        self.dismissed: set[int] = set()

    def seconds_left(self) -> int:
        return max(0, int(self.ttl - (time.time() - self.created_at)))

    def alive(self) -> bool:
        return self.seconds_left() > 0


_current: Optional[_Call] = None
_last_ended_at: float = 0.0


def open_call(from_id: int, from_name: str, ttl: int) -> Optional[_Call]:
    """Yeni çağrı aç. Aktif çağrı ya da bekleme süresi varsa hiçbir şey yapmaz."""
    global _current, _last_ended_at
    now = time.time()
    if _current is not None:
        if _current.alive():
            return None
        _last_ended_at = _current.created_at + _current.ttl
        _current = None
    if now - _last_ended_at < COOLDOWN:
        return None

    from app.game import presence_service
    targets = presence_service.idle_user_ids(exclude={from_id}, limit=MAX_TARGETS)
    if not targets:
        return None
    _current = _Call(from_id, from_name, targets, max(MIN_TTL, int(ttl)))
    return _current


def call_for(user_id: int) -> Optional[dict]:
    """Bu kullanıcıya gösterilecek aktif çağrı (yoksa None)."""
    global _current
    c = _current
    if c is None:
        return None
    if not c.alive():
        return None
    if user_id not in c.targets or user_id in c.dismissed:
        return None
    return {"id": c.id, "from_name": c.from_name, "expires_in": c.seconds_left()}


def dismiss(user_id: int, call_id: str = "") -> None:
    """Kullanıcı popup'ı kapattı/kabul etti — ona bir daha gösterilmez."""
    c = _current
    if c is None:
        return
    if call_id and call_id != c.id:
        return
    c.dismissed.add(user_id)
