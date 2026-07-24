"""
Ses uçları (DB tabanlı — disk volume gerekmez).

- GET  /sounds               -> herkes: hangi slotta yüklü dosya var
- POST /sounds/{slot}        -> admin: mp3 yükle (multipart, DB'ye base64)
- DELETE /sounds/{slot}      -> admin: yüklü dosyayı sil (sentetiğe döner)
- GET  /sounds/file/{slot}   -> yüklü sesi servis et (DB'den decode)
"""

from __future__ import annotations

import os
import base64

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_admin_user
from app.models.user import User
from app.models.sound_asset import SoundAsset, SOUND_SLOTS

router = APIRouter(prefix="/sounds", tags=["sounds"])

MAX_SIZE = 3 * 1024 * 1024  # 3 MB
ALLOWED_EXT = {".mp3", ".ogg", ".wav", ".m4a"}
EXT_MIME = {".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4"}


@router.get("")
async def list_sounds(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SoundAsset.slot))
    uploaded = {row[0] for row in res.all()}
    return {
        "slots": [
            {"slot": s, "label": label, "uploaded": s in uploaded}
            for s, label in SOUND_SLOTS.items()
        ]
    }


@router.post("/{slot}")
async def upload_sound(
    slot: str,
    file: UploadFile = File(...),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    if slot not in SOUND_SLOTS:
        raise HTTPException(status_code=400, detail="Geçersiz ses slotu")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Sadece mp3/ogg/wav/m4a")
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="Dosya 3 MB'tan buyuk")

    b64 = base64.b64encode(data).decode("ascii")
    mime = EXT_MIME.get(ext, "audio/mpeg")

    res = await db.execute(select(SoundAsset).where(SoundAsset.slot == slot))
    existing = res.scalar_one_or_none()
    if existing:
        existing.filename = file.filename or f"{slot}{ext}"
        existing.mime = mime
        existing.data_b64 = b64
    else:
        db.add(SoundAsset(slot=slot, filename=file.filename or f"{slot}{ext}", mime=mime, data_b64=b64))
    await db.commit()
    return {"ok": True, "slot": slot}


@router.delete("/{slot}")
async def delete_sound(slot: str, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SoundAsset).where(SoundAsset.slot == slot))
    asset = res.scalar_one_or_none()
    if asset:
        await db.delete(asset)
        await db.commit()
    return {"ok": True, "slot": slot}


@router.get("/file/{slot}")
async def get_sound_file(slot: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SoundAsset).where(SoundAsset.slot == slot))
    asset = res.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Ses yok")
    try:
        raw = base64.b64decode(asset.data_b64)
    except Exception:
        raise HTTPException(status_code=500, detail="Ses okunamadi")
    return Response(content=raw, media_type=asset.mime, headers={"Cache-Control": "public, max-age=3600"})
