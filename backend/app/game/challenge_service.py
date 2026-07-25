"""
Maç teklifi (challenge) servisi.

Bir kullanıcı diğerine maç teklifi gönderir. Teklif bellekte kısa süre (TTL)
tutulur. Alıcı heartbeat sırasında bekleyen teklifini öğrenir; kabul/reddeder.
Kabul edilince ortak bir oda kodu üretilir ve iki tarafa da verilir.

Durumlar: pending -> accepted / declined / expired.
"""

from __future__ import annotations

import time
import uuid

CHALLENGE_TTL = 30  # saniye — teklif geçerlilik süresi

# challenge_id -> teklif
# {id, from_id, from_name, to_id, created, status, room_code}
_challenges: dict[str, dict] = {}


def _cleanup() -> None:
    now = time.time()
    expired = [cid for cid, c in _challenges.items()
               if c["status"] == "pending" and now - c["created"] > CHALLENGE_TTL]
    for cid in expired:
        _challenges[cid]["status"] = "expired"
    # Çok eski kayıtları tamamen sil (2 dk).
    old = [cid for cid, c in _challenges.items() if now - c["created"] > 120]
    for cid in old:
        _challenges.pop(cid, None)


def create_challenge(from_id: int, from_name: str, to_id: int) -> dict:
    """Yeni teklif oluşturur. Aynı kişiye zaten bekleyen teklif varsa onu döner."""
    _cleanup()
    # Aynı gönderen->alıcı için bekleyen teklif varsa tekrar kullan.
    for c in _challenges.values():
        if c["from_id"] == from_id and c["to_id"] == to_id and c["status"] == "pending":
            return c
    cid = uuid.uuid4().hex[:12]
    ch = {
        "id": cid, "from_id": from_id, "from_name": from_name, "to_id": to_id,
        "created": time.time(), "status": "pending", "room_code": None,
    }
    _challenges[cid] = ch
    return ch


def pending_for(to_id: int) -> dict | None:
    """Bir kullanıcıya gelen ilk bekleyen teklifi döner (varsa)."""
    _cleanup()
    for c in _challenges.values():
        if c["to_id"] == to_id and c["status"] == "pending":
            return c
    return None


def get(cid: str) -> dict | None:
    _cleanup()
    return _challenges.get(cid)


def accept(cid: str) -> dict | None:
    """Teklifi kabul eder, ortak oda kodu üretir. Güncel teklifi döner."""
    _cleanup()
    c = _challenges.get(cid)
    if not c or c["status"] != "pending":
        return None
    c["status"] = "accepted"
    c["room_code"] = "duel-" + uuid.uuid4().hex[:8]
    return c


def decline(cid: str) -> dict | None:
    c = _challenges.get(cid)
    if c and c["status"] == "pending":
        c["status"] = "declined"
    return c


def outgoing_status(from_id: int) -> dict | None:
    """Gönderenin son teklifinin durumunu döner (accepted ise room_code ile)."""
    _cleanup()
    latest = None
    for c in _challenges.values():
        if c["from_id"] == from_id and c["status"] in ("accepted", "declined", "expired", "pending"):
            if latest is None or c["created"] > latest["created"]:
                latest = c
    return latest
