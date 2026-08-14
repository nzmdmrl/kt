"""
Ad kuralları — kullanıcı adı ve görünen ad için karakter limitleri.

Limitler admin panelinden (⚙️ Ayarlar) değiştirilebilir:
  username_min_len / username_max_len / display_name_min_len / display_name_max_len

Tek yerde toplanmasının sebebi: aynı kural hem kayıtta (auth_service), hem profil
düzenlemede (account.py), hem de arayüze bildirilen limitlerde (GET /account/limits)
kullanılıyor — biri değişirse hepsi değişsin.

DB sütun sınırları AŞILAMAZ: username String(32), display_name String(48).
"""

from __future__ import annotations

import re

from sqlalchemy.ext.asyncio import AsyncSession

from app.game import settings_service

USERNAME_CHARS_RE = re.compile(r"^[a-zA-Z0-9_]+$")

# Sütun sınırları (DB'yi aşan ayar girilirse buraya kırpılır).
USERNAME_HARD_MAX = 32
DISPLAY_HARD_MAX = 48


class NameError_(ValueError):
    """Kullanıcıya gösterilecek Türkçe hata mesajı taşır."""


async def limits(db: AsyncSession) -> dict:
    """Geçerli limitler — ayarlardan okunur, mantıksız değerler düzeltilir."""
    u_min = await settings_service.get_int(db, "username_min_len", 3)
    u_max = await settings_service.get_int(db, "username_max_len", 20)
    d_min = await settings_service.get_int(db, "display_name_min_len", 2)
    d_max = await settings_service.get_int(db, "display_name_max_len", 24)
    u_min = max(1, min(u_min, USERNAME_HARD_MAX))
    u_max = max(u_min, min(u_max, USERNAME_HARD_MAX))
    d_min = max(1, min(d_min, DISPLAY_HARD_MAX))
    d_max = max(d_min, min(d_max, DISPLAY_HARD_MAX))
    return {
        "username_min_len": u_min,
        "username_max_len": u_max,
        "display_name_min_len": d_min,
        "display_name_max_len": d_max,
    }


async def clean_username(db: AsyncSession, raw: str) -> str:
    """Kullanıcı adını doğrular ve temizlenmiş halini döner. Hatada NameError_."""
    name = (raw or "").strip()
    lim = await limits(db)
    lo, hi = lim["username_min_len"], lim["username_max_len"]
    if not name:
        raise NameError_("Kullanıcı adı boş olamaz.")
    if not USERNAME_CHARS_RE.match(name):
        raise NameError_("Kullanıcı adı sadece harf, rakam ve alt çizgi (_) içerebilir.")
    if len(name) < lo:
        raise NameError_(f"Kullanıcı adı en az {lo} karakter olmalı (girilen: {len(name)}).")
    if len(name) > hi:
        raise NameError_(f"Kullanıcı adı en fazla {hi} karakter olabilir (girilen: {len(name)}).")
    return name


async def clean_display_name(db: AsyncSession, raw: str) -> str:
    """Görünen adı doğrular ve temizlenmiş halini döner. Hatada NameError_."""
    name = " ".join((raw or "").split())   # baş/son boşluk + çoklu boşluk temizliği
    lim = await limits(db)
    lo, hi = lim["display_name_min_len"], lim["display_name_max_len"]
    if not name:
        raise NameError_("Görünen ad boş olamaz.")
    if len(name) < lo:
        raise NameError_(f"Görünen ad en az {lo} karakter olmalı (girilen: {len(name)}).")
    if len(name) > hi:
        raise NameError_(f"Görünen ad en fazla {hi} karakter olabilir (girilen: {len(name)}).")
    return name
