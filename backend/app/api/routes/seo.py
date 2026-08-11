"""
Sayfa SEO uçları (başlık / açıklama / anahtar kelime / paylaşım görseli).

Public:
- GET  /seo/meta                -> tüm sayfaların geçerli SEO verisi (frontend build/ISR)
- GET  /seo/meta/{key}          -> tek sayfa
- GET  /seo/image/{key}         -> og:image (o sayfada yoksa "default" görseline düşer)
- GET  /seo/favicon.ico         -> yüklü favicon

Admin (get_admin_user):
- GET    /seo/admin             -> varsayılan + özel değerleri birlikte döner
- PUT    /seo/admin/{key}       -> başlık/açıklama/anahtar kelime kaydet (boş = varsayılana dön)
- POST   /seo/admin/{key}/image -> görsel yükle (multipart)
- DELETE /seo/admin/{key}/image -> görseli sil
"""

from __future__ import annotations

import base64
import os

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_admin_user
from app.models.seo_page import (
    IMAGE_ONLY_KEYS,
    SEO_BY_KEY,
    SEO_PAGES,
    SITE_NAME,
    SeoPage,
)
from app.models.user import User

router = APIRouter(prefix="/seo", tags=["seo"])

MAX_SIZE = 5 * 1024 * 1024  # 5 MB
EXT_MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".svg": "image/svg+xml",
}


def _ver(row: SeoPage | None) -> int:
    """Görsel URL'sine eklenen sürüm — güncelleyince paylaşım cache'i tazelenir."""
    if row is None or row.updated_at is None:
        return 0
    return int(row.updated_at.timestamp())


def _effective(key: str, row: SeoPage | None, default_row: SeoPage | None) -> dict:
    """Koddaki varsayılan + DB override birleşimi."""
    base = SEO_BY_KEY[key]
    title = (row.title if row and row.title else "") or base["title"]
    desc = (row.description if row and row.description else "") or base["description"]
    kw = (row.keywords if row and row.keywords else "") or base["keywords"]

    # Görsel: önce sayfanın kendisi, yoksa "default" görseli.
    if row and row.image_b64:
        image_path = f"/api/seo/image/{key}?v={_ver(row)}"
    elif key not in IMAGE_ONLY_KEYS and default_row and default_row.image_b64:
        image_path = f"/api/seo/image/default?v={_ver(default_row)}"
    else:
        image_path = None

    return {
        "key": key,
        "path": base["path"],
        "label": base["label"],
        "title": title,
        "description": desc,
        "keywords": [k.strip() for k in kw.split(",") if k.strip()],
        "image_path": image_path,
        "indexable": base["indexable"],
        "priority": base["priority"],
        "site_name": SITE_NAME,
    }


async def _rows(db: AsyncSession) -> dict[str, SeoPage]:
    res = await db.execute(select(SeoPage))
    return {r.key: r for r in res.scalars().all()}


@router.get("/meta")
async def meta_all(db: AsyncSession = Depends(get_db)):
    rows = await _rows(db)
    default_row = rows.get("default")
    favicon = rows.get("favicon")
    return {
        "pages": [_effective(p["key"], rows.get(p["key"]), default_row) for p in SEO_PAGES],
        "favicon_path": f"/api/seo/favicon.ico?v={_ver(favicon)}" if favicon and favicon.image_b64 else None,
    }


@router.get("/meta/{key}")
async def meta_one(key: str, db: AsyncSession = Depends(get_db)):
    if key not in SEO_BY_KEY:
        raise HTTPException(status_code=404, detail="Bilinmeyen sayfa")
    rows = await _rows(db)
    return _effective(key, rows.get(key), rows.get("default"))


async def _image_response(key: str, db: AsyncSession, fallback: bool) -> Response:
    res = await db.execute(select(SeoPage).where(SeoPage.key == key))
    row = res.scalar_one_or_none()
    if (not row or not row.image_b64) and fallback and key != "default":
        res = await db.execute(select(SeoPage).where(SeoPage.key == "default"))
        row = res.scalar_one_or_none()
    if not row or not row.image_b64:
        raise HTTPException(status_code=404, detail="Görsel yok")
    try:
        raw = base64.b64decode(row.image_b64)
    except Exception:
        raise HTTPException(status_code=500, detail="Görsel okunamadı")
    return Response(
        content=raw,
        media_type=row.image_mime or "image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/image/{key}")
async def get_image(key: str, db: AsyncSession = Depends(get_db)):
    if key not in SEO_BY_KEY:
        raise HTTPException(status_code=404, detail="Bilinmeyen sayfa")
    return await _image_response(key, db, fallback=True)


@router.get("/favicon.ico")
async def get_favicon(db: AsyncSession = Depends(get_db)):
    return await _image_response("favicon", db, fallback=False)


# ---------------------------------------------------------------- admin

@router.get("/admin")
async def admin_list(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    rows = await _rows(db)
    out = []
    for p in SEO_PAGES:
        row = rows.get(p["key"])
        out.append({
            "key": p["key"],
            "label": p["label"],
            "path": p["path"],
            "image_only": p["key"] in IMAGE_ONLY_KEYS,
            "indexable": p["indexable"],
            # Varsayılanlar (placeholder olarak gösterilir)
            "default_title": p["title"],
            "default_description": p["description"],
            "default_keywords": p["keywords"],
            # Admin'in girdiği özel değerler (boşsa varsayılan geçerli)
            "title": (row.title or "") if row else "",
            "description": (row.description or "") if row else "",
            "keywords": (row.keywords or "") if row else "",
            "has_image": bool(row and row.image_b64),
            "image_name": (row.image_name or "") if row else "",
            "image_path": (f"/api/seo/image/{p['key']}?v={_ver(row)}" if row and row.image_b64 else None),
        })
    return {"pages": out}


class SeoUpdate(BaseModel):
    title: str = ""
    description: str = ""
    keywords: str = ""


@router.put("/admin/{key}")
async def admin_update(
    key: str,
    body: SeoUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    if key not in SEO_BY_KEY:
        raise HTTPException(status_code=400, detail="Bilinmeyen sayfa")
    if key in IMAGE_ONLY_KEYS:
        raise HTTPException(status_code=400, detail="Bu bölümde sadece görsel yüklenir")
    res = await db.execute(select(SeoPage).where(SeoPage.key == key))
    row = res.scalar_one_or_none()
    if not row:
        row = SeoPage(key=key)
        db.add(row)
    row.title = body.title.strip() or None
    row.description = body.description.strip() or None
    row.keywords = body.keywords.strip() or None
    await db.commit()
    return {"ok": True}


@router.post("/admin/{key}/image")
async def admin_upload_image(
    key: str,
    file: UploadFile = File(...),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    if key not in SEO_BY_KEY:
        raise HTTPException(status_code=400, detail="Bilinmeyen sayfa")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in EXT_MIME:
        raise HTTPException(status_code=400, detail="Sadece jpg/png/webp/gif/ico/svg")
    if key == "favicon" and ext not in (".ico", ".png", ".svg"):
        raise HTTPException(status_code=400, detail="Favicon için .ico, .png veya .svg")
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="Dosya 5 MB'tan büyük")

    res = await db.execute(select(SeoPage).where(SeoPage.key == key))
    row = res.scalar_one_or_none()
    if not row:
        row = SeoPage(key=key)
        db.add(row)
    row.image_b64 = base64.b64encode(data).decode("ascii")
    row.image_mime = EXT_MIME[ext]
    row.image_name = file.filename or f"{key}{ext}"
    await db.commit()
    return {"ok": True, "key": key}


@router.delete("/admin/{key}/image")
async def admin_delete_image(
    key: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(SeoPage).where(SeoPage.key == key))
    row = res.scalar_one_or_none()
    if row:
        row.image_b64 = None
        row.image_mime = None
        row.image_name = None
        await db.commit()
    return {"ok": True, "key": key}
