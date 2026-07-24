"""
Ses uçları.

- GET  /sounds               -> herkes: hangi slotta yüklü dosya var (frontend buna göre
                                 mp3 mı sentetik mi çalacağına karar verir)
- POST /sounds/{slot}        -> admin: mp3 yükle (multipart)
- DELETE /sounds/{slot}      -> admin: yüklü dosyayı sil (sentetiğe döner)
- GET  /sounds/file/{slot}   -> yüklü mp3 dosyasını servis et
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_admin_user
from app.core.config import get_settings
from app.models.user import User
from app.models.sound_asset import SoundAsset, SOUND_SLOTS

router = APIRouter(prefix="/sounds", tags=["sounds"])
cfg = get_settings()

MAX_SIZE = 3 * 1024 * 1024  # 3 MB
ALLOWED_EXT = {".mp3", ".ogg", ".wav", ".m4a"}


def _audio_dir() -> Path:
    p = Path(cfg.AUDIO_DIR)
    p.mkdir(parents=True, exist_ok=True)
    return p


@router.get("")
async def list_sounds(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SoundAsset))
    assets = {a.slot: a.filename for a in res.scalars().all()}
    # Her slot için: yüklü mü (uploaded), açıklama.
    return {
        "slots": [
            {"slot": s, "label": label, "uploaded": s in assets}
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
        raise HTTPException(status_code=400, detail="Dosya 3 MB'tan büyük")

    audio_dir = _audio_dir()
    # Eski dosyayı sil.
    res = await db.execute(select(SoundAsset).where(SoundAsset.slot == slot))
    existing = res.scalar_one_or_none()
    if existing:
        old = audio_dir / existing.filename
        if old.exists():
            try:
                old.unlink()
            except Exception:
                pass

    fname = f"{slot}_{uuid.uuid4().hex[:8]}{ext}"
    (audio_dir / fname).write_bytes(data)

    if existing:
        existing.filename = fname
    else:
        db.add(SoundAsset(slot=slot, filename=fname))
    await db.commit()
    return {"ok": True, "slot": slot}


@router.delete("/{slot}")
async def delete_sound(slot: str, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SoundAsset).where(SoundAsset.slot == slot))
    asset = res.scalar_one_or_none()
    if not asset:
        return {"ok": True}  # zaten yok
    f = _audio_dir() / asset.filename
    if f.exists():
        try:
            f.unlink()
        except Exception:
            pass
    await db.delete(asset)
    await db.commit()
    return {"ok": True, "slot": slot}


@router.get("/file/{slot}")
async def get_sound_file(slot: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SoundAsset).where(SoundAsset.slot == slot))
    asset = res.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Ses yok")
    f = _audio_dir() / asset.filename
    if not f.exists():
        raise HTTPException(status_code=404, detail="Dosya bulunamadı")
    return FileResponse(str(f))
