"""
Ana sayfa buton görünümü (ikon + arka plan ikonu + renk).

Public:
- GET /home/buttons          -> {buttons: {key: {icon, deco_icon, bg}}}
  Ana sayfa SUNUCUDA çekip HomeModes'a verir (ISR 60 sn) — ekranda titreme olmaz.

Admin (get_admin_user):
- GET /admin/home-buttons        -> etiketleriyle birlikte tüm butonlar + varsayılanlar
- PUT /admin/home-buttons/{key}  -> {icon?, deco_icon?, bg?}
- POST /admin/home-buttons/{key}/reset -> koddaki varsayılana döndür
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_admin_user
from app.models.user import User
from app.models.home_button import (
    HomeButton, DEFAULT_HOME_BUTTONS, HOME_BUTTON_KEYS, HOME_BUTTON_LABELS,
)

router = APIRouter(tags=["home-buttons"])

_DEFAULTS = {b["key"]: b for b in DEFAULT_HOME_BUTTONS}


async def _rows(db: AsyncSession) -> dict[str, HomeButton]:
    rows = (await db.execute(select(HomeButton))).scalars().all()
    return {r.key: r for r in rows}


@router.get("/home/buttons")
async def public_home_buttons(db: AsyncSession = Depends(get_db)):
    """Public — giriş gerekmez. Kayıt yoksa koddaki varsayılan döner."""
    try:
        rows = await _rows(db)
    except Exception:
        rows = {}
    out = {}
    for key in HOME_BUTTON_KEYS:
        d = _DEFAULTS[key]
        r = rows.get(key)
        out[key] = r.to_public() if r else {
            "key": key, "icon": d["icon"], "deco_icon": d["deco_icon"], "bg": d["bg"],
        }
    return {"buttons": out}


# ---------------------------------------------------------------- admin

@router.get("/admin/home-buttons")
async def admin_list(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    rows = await _rows(db)
    items = []
    for key in HOME_BUTTON_KEYS:
        d = _DEFAULTS[key]
        r = rows.get(key)
        items.append({
            "key": key,
            "label": HOME_BUTTON_LABELS[key],
            "icon": (r.icon if r else d["icon"]) or "",
            "deco_icon": (r.deco_icon if r else d["deco_icon"]) or "",
            "bg": (r.bg if r else d["bg"]) or "",
            "default": {"icon": d["icon"], "deco_icon": d["deco_icon"], "bg": d["bg"]},
        })
    return {"buttons": items}


class ButtonIn(BaseModel):
    icon: str | None = None
    deco_icon: str | None = None
    bg: str | None = None


@router.put("/admin/home-buttons/{key}")
async def admin_update(key: str, data: ButtonIn, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    if key not in _DEFAULTS:
        raise HTTPException(404, "Bilinmeyen buton.")
    d = _DEFAULTS[key]
    row = (await db.execute(select(HomeButton).where(HomeButton.key == key))).scalar_one_or_none()
    if not row:
        row = HomeButton(key=key, icon=d["icon"], deco_icon=d["deco_icon"], bg=d["bg"])
        db.add(row)
    if data.icon is not None:
        row.icon = data.icon.strip()[:16]
    if data.deco_icon is not None:
        row.deco_icon = data.deco_icon.strip()[:16]
    if data.bg is not None:
        # Serbest CSS değeri; sadece uzunluk ve satır sonu temizliği yapılır.
        row.bg = data.bg.replace("\n", " ").strip()[:255]
    await db.commit()
    return {"ok": True, "button": row.to_public()}


@router.post("/admin/home-buttons/{key}/reset")
async def admin_reset(key: str, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Koddaki varsayılan tasarıma döndür."""
    if key not in _DEFAULTS:
        raise HTTPException(404, "Bilinmeyen buton.")
    d = _DEFAULTS[key]
    row = (await db.execute(select(HomeButton).where(HomeButton.key == key))).scalar_one_or_none()
    if row:
        row.icon, row.deco_icon, row.bg = d["icon"], d["deco_icon"], d["bg"]
    else:
        db.add(HomeButton(key=key, icon=d["icon"], deco_icon=d["deco_icon"], bg=d["bg"]))
    await db.commit()
    return {"ok": True, "button": {"key": key, "icon": d["icon"], "deco_icon": d["deco_icon"], "bg": d["bg"]}}
