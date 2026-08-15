"""
Sonuç paylaşım metinleri ("Sonuç PM").

Public:
- GET /share-texts            -> {footer, lines: {"match:win": [...], ...}}
  Arayüz sonuç ekranında sabit skor satırının altına buradan RASTGELE bir
  satır ekler, en alta da footer'ı koyar.

Admin (get_admin_user):
- GET    /admin/share-texts        -> gruplar + satırlar + footer
- POST   /admin/share-texts        -> yeni satır {module, variant, text}
- PUT    /admin/share-texts/{id}   -> satırı düzenle {text?, active?}
- DELETE /admin/share-texts/{id}   -> satırı sil
- PUT    /admin/share-texts/footer -> footer metnini kaydet {text}
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_admin_user
from app.models.user import User
from app.models.share_line import (
    ShareLine, SHARE_GROUPS, FOOTER_SETTING_KEY, DEFAULT_FOOTER,
)

router = APIRouter(tags=["share-texts"])

_VALID = {(m, v) for m, v, _ in SHARE_GROUPS}


def _footer() -> str:
    from app.game.settings_service import cached_str
    return cached_str(FOOTER_SETTING_KEY, DEFAULT_FOOTER) or DEFAULT_FOOTER


@router.get("/share-texts")
async def public_share_texts(db: AsyncSession = Depends(get_db)):
    """Public — arayüz sonuç ekranında kullanır (giriş gerekmez)."""
    rows = (await db.execute(
        select(ShareLine).where(ShareLine.active == True).order_by(ShareLine.sort_order, ShareLine.id)  # noqa: E712
    )).scalars().all()
    lines: dict[str, list[str]] = {}
    for r in rows:
        lines.setdefault(f"{r.module}:{r.variant}", []).append(r.text)
    return {"footer": _footer(), "lines": lines}


# ---------------------------------------------------------------- admin

@router.get("/admin/share-texts")
async def admin_list(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(ShareLine).order_by(ShareLine.module, ShareLine.variant, ShareLine.sort_order, ShareLine.id)
    )).scalars().all()
    groups = []
    for module, variant, label in SHARE_GROUPS:
        groups.append({
            "module": module,
            "variant": variant,
            "label": label,
            "lines": [r.to_public() for r in rows if r.module == module and r.variant == variant],
        })
    return {"footer": _footer(), "groups": groups}


class LineIn(BaseModel):
    module: str
    variant: str = ""
    text: str


@router.post("/admin/share-texts")
async def admin_create(data: LineIn, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    if (data.module, data.variant) not in _VALID:
        raise HTTPException(400, "Geçersiz modül/durum.")
    text = (data.text or "").strip()
    if not text:
        raise HTTPException(400, "Metin boş olamaz.")
    last = (await db.execute(
        select(ShareLine.sort_order).where(
            ShareLine.module == data.module, ShareLine.variant == data.variant
        ).order_by(ShareLine.sort_order.desc()).limit(1)
    )).scalar_one_or_none()
    row = ShareLine(module=data.module, variant=data.variant, text=text[:300],
                    sort_order=(last or 0) + 1, active=True)
    db.add(row)
    await db.commit()
    return {"ok": True, "line": row.to_public()}


# DİKKAT: bu rota "{line_id}" rotalarından ÖNCE tanımlanmalı — yoksa "footer"
# yolu id sanılıp 422 döner.
class FooterIn(BaseModel):
    text: str


@router.put("/admin/share-texts/footer")
async def admin_set_footer(data: FooterIn, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Tüm paylaşımların en altındaki tek satır."""
    from app.game.settings_service import set_setting
    text = (data.text or "").strip()[:200]
    await set_setting(db, FOOTER_SETTING_KEY, text)
    return {"ok": True, "footer": text or DEFAULT_FOOTER}


class LineUpdate(BaseModel):
    text: str | None = None
    active: bool | None = None


@router.put("/admin/share-texts/{line_id}")
async def admin_update(line_id: int, data: LineUpdate, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(ShareLine).where(ShareLine.id == line_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Satır bulunamadı.")
    if data.text is not None:
        text = data.text.strip()
        if not text:
            raise HTTPException(400, "Metin boş olamaz.")
        row.text = text[:300]
    if data.active is not None:
        row.active = data.active
    await db.commit()
    return {"ok": True, "line": row.to_public()}


@router.delete("/admin/share-texts/{line_id}")
async def admin_delete(line_id: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(ShareLine).where(ShareLine.id == line_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Satır bulunamadı.")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


