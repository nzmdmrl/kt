"""
Düzenlenebilir sayfa içerikleri.

Public:
- GET /pages            -> düzenlenebilir sayfaların listesi (anahtar, başlık, adres)
- GET /pages/{key}      -> sayfa içeriği (başlık + gövde)

Admin (get_admin_user):
- GET /admin/pages      -> tüm sayfalar (düzenleme ekranı için)
- PUT /admin/pages/{key}-> başlık/gövde güncelle

Gövde sade markdown alt kümesidir; ayrıntı için app/models/site_page.py.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_admin_user
from app.models.site_page import SitePage, DEFAULT_PAGES, PAGE_META
from app.models.user import User

router = APIRouter(tags=["pages"])


def _fallback(key: str) -> dict | None:
    meta = PAGE_META.get(key)
    if not meta:
        return None
    return {"key": key, "title": meta["title"], "body": meta["body"]}


async def _row(db: AsyncSession, key: str) -> SitePage | None:
    return (await db.execute(select(SitePage).where(SitePage.key == key))).scalar_one_or_none()


@router.get("/pages")
async def list_pages():
    """Düzenlenebilir sayfaların listesi (içerik olmadan)."""
    return {"pages": [{"key": p["key"], "label": p["label"], "path": p["path"]} for p in DEFAULT_PAGES]}


@router.get("/pages/{key}")
async def get_page(key: str, db: AsyncSession = Depends(get_db)):
    """Sayfa içeriği — DB'de kayıt yoksa koddaki varsayılan döner."""
    row = await _row(db, key)
    if row:
        meta = PAGE_META.get(key, {})
        return {
            "key": row.key,
            "title": row.title or meta.get("title", ""),
            "body": row.body or meta.get("body", ""),
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
    data = _fallback(key)
    if not data:
        raise HTTPException(404, "Sayfa bulunamadı")
    return {**data, "updated_at": None}


@router.get("/admin/pages")
async def admin_pages(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    rows = {r.key: r for r in (await db.execute(select(SitePage))).scalars().all()}
    out = []
    for p in DEFAULT_PAGES:
        r = rows.get(p["key"])
        out.append({
            "key": p["key"],
            "label": p["label"],
            "path": p["path"],
            "title": (r.title if r else p["title"]),
            "body": (r.body if r else p["body"]),
            "default_title": p["title"],
            "default_body": p["body"],
            "updated_at": r.updated_at.isoformat() if (r and r.updated_at) else None,
        })
    return {"pages": out}


class PageIn(BaseModel):
    title: str
    body: str


@router.put("/admin/pages/{key}")
async def update_page(
    key: str,
    data: PageIn,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    if key not in PAGE_META:
        raise HTTPException(404, "Sayfa bulunamadı")
    title = data.title.strip()
    body = data.body.strip()
    if not title:
        raise HTTPException(400, "Başlık boş olamaz.")
    if len(title) > 160:
        raise HTTPException(400, "Başlık en fazla 160 karakter olabilir.")
    if not body:
        raise HTTPException(400, "İçerik boş olamaz.")
    if len(body) > 40000:
        raise HTTPException(400, "İçerik çok uzun (en fazla 40.000 karakter).")

    row = await _row(db, key)
    if row:
        row.title, row.body = title, body
    else:
        db.add(SitePage(key=key, title=title, body=body))
    await db.commit()
    return {"ok": True, "key": key}
