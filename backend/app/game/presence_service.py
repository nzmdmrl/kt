"""
Online durumu (presence) servisi.

Kullanıcı siteyi kullanırken düzenli heartbeat gönderir. Son heartbeat'ten
ONLINE_WINDOW saniye içindeyse "online" sayılır. Maçtaysa ayrıca işaretlenir.

Bellekte tutulur (tek instance için yeterli; ölçeklenince Redis'e taşınır).
Durum: online / in_match / offline.

Gizlilik: show_online=False olan kullanıcı başkalarına "offline" görünür
(bu kontrol çağıran tarafta yapılır).
"""

from __future__ import annotations

import time

ONLINE_WINDOW = 60  # saniye — son heartbeat bu süre içindeyse online

# user_id -> {"last_seen": epoch, "in_match": bool}
_presence: dict[int, dict] = {}


def heartbeat(user_id: int, in_match: bool = False) -> None:
    _presence[user_id] = {"last_seen": time.time(), "in_match": in_match}


def set_in_match(user_id: int, in_match: bool) -> None:
    p = _presence.get(user_id)
    if p:
        p["in_match"] = in_match
        p["last_seen"] = time.time()
    else:
        _presence[user_id] = {"last_seen": time.time(), "in_match": in_match}


def get_status(user_id: int) -> str:
    """'online' | 'in_match' | 'offline'."""
    p = _presence.get(user_id)
    if not p:
        return "offline"
    if time.time() - p["last_seen"] > ONLINE_WINDOW:
        return "offline"
    return "in_match" if p.get("in_match") else "online"


def is_online(user_id: int) -> bool:
    return get_status(user_id) in ("online", "in_match")
