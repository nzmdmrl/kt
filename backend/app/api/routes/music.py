"""
Müzik havuzu API.

Public:
  GET  /music/{section}          -> bölümdeki parça listesi (meta) + ses seviyesi
  GET  /music/file/{track_id}    -> mp3 dosyasını servis et

Admin:
  POST   /music/{section}        -> mp3 yükle (multipart)
  DELETE /music/{track_id}       -> parçayı sil
  POST   /music/volume/{section} -> bölüm ses seviyesi (0-100) kaydet
"""

from __future__ import annotations

import base64

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.music_track import MusicTrack, MUSIC_SECTIONS

router = APIRouter(prefix="/music", tags=["music"])


async def _require_admin(user: User) -> None:
    if not user.is_admin:
        raise HTTPException(403, "Yetki yok.")


def _vol_key(section: str) -> str:
    return f"music_volume_{section}"


@router.get("/sections")
async def list_sections():
    """Bölüm anahtarları + etiketleri (admin arayüzü için)."""
    return {"sections": [{"key": k, "label": v} for k, v in MUSIC_SECTIONS.items()]}


@router.get("/{section}")
async def list_tracks(section: str, db: AsyncSession = Depends(get_db)):
    """Bölümdeki parçalar (meta) + ses seviyesi. Public (oynatıcı için)."""
    if section not in MUSIC_SECTIONS:
        raise HTTPException(404, "Bölüm yok.")
    rows = (await db.execute(
        select(MusicTrack).where(MusicTrack.section == section).order_by(MusicTrack.id)
    )).scalars().all()
    from app.game.settings_service import cached_int
    volume = cached_int(_vol_key(section), 50)
    return {"section": section, "tracks": [t.to_meta() for t in rows], "volume": volume}


@router.get("/file/{track_id}")
async def get_file(track_id: int, db: AsyncSession = Depends(get_db)):
    """mp3 dosyasını servis et."""
    t = (await db.execute(select(MusicTrack).where(MusicTrack.id == track_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Parça yok.")
    try:
        raw = base64.b64decode(t.data_b64)
    except Exception:
        raise HTTPException(500, "Dosya çözülemedi.")
    return Response(content=raw, media_type=t.mime or "audio/mpeg",
                    headers={"Cache-Control": "public, max-age=86400"})


@router.post("/{section}")
async def upload_track(section: str, file: UploadFile = File(...),
                       user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _require_admin(user)
    if section not in MUSIC_SECTIONS:
        raise HTTPException(404, "Bölüm yok.")
    raw = await file.read()
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(413, "Dosya çok büyük (max 8MB).")
    b64 = base64.b64encode(raw).decode("ascii")
    t = MusicTrack(section=section, name=(file.filename or "parça")[:80],
                   mime=file.content_type or "audio/mpeg", data_b64=b64)
    db.add(t)
    await db.commit()
    return {"ok": True, "id": t.id, "name": t.name}


@router.delete("/{track_id}")
async def delete_track(track_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _require_admin(user)
    t = (await db.execute(select(MusicTrack).where(MusicTrack.id == track_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Parça yok.")
    await db.delete(t)
    await db.commit()
    return {"ok": True}


@router.post("/volume/{section}")
async def set_volume(section: str, value: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _require_admin(user)
    if section not in MUSIC_SECTIONS:
        raise HTTPException(404, "Bölüm yok.")
    from app.game.settings_service import set_setting
    v = max(0, min(100, value))
    await set_setting(db, _vol_key(section), str(v))
    return {"ok": True, "volume": v}
