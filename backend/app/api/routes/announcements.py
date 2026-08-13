"""
Duyurular (announcements).

Tablo düz SQL ile kurulur (app_settings.py / notification_prefs.py ile aynı
yaklaşım): CREATE TABLE IF NOT EXISTS. ORM modeli YOKTUR, bu yüzden create_all
bu tabloya dokunmaz, alembic autogenerate kullanılmaz.

Gövde biçimi: DÜZ METİN. HTML kabul edilmez, markdown kütüphanesi kullanılmaz.
Satır sonları ve çıplak URL'ler frontend'de işlenir (app/duyurular).

Public:
- GET /announcements            -> sadece yayındakiler, yeniden eskiye, 20'lik sayfa
- GET /announcements/{slug}     -> sadece yayındaki tek duyuru (yoksa 404)

Admin (get_admin_user):
- GET    /admin/announcements            -> taslaklar dahil hepsi
- POST   /admin/announcements            -> oluştur
- PUT    /admin/announcements/{id}       -> güncelle
- DELETE /admin/announcements/{id}       -> sil
- POST   /admin/announcements/{id}/notify -> uygulama içi bildirim gönder (BİR KEZ)

NOT: notify ucu PUSH GÖNDERMEZ. Yalnızca notifications tablosuna satır yazar
(kind='system_announcement'). Push/FCM sonraki görevin işi.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import engine, get_db
from app.core.deps import get_admin_user
from app.models.notification import Notification
from app.models.user import User

router = APIRouter(tags=["announcements"])

_IS_PG = engine.dialect.name == "postgresql"
_NOW = "now()" if _IS_PG else "CURRENT_TIMESTAMP"
_TS = "TIMESTAMPTZ" if _IS_PG else "TIMESTAMP"
_PK = "SERIAL PRIMARY KEY" if _IS_PG else "INTEGER PRIMARY KEY AUTOINCREMENT"
_BOOL_F = "FALSE" if _IS_PG else "0"

PAGE_SIZE = 20
NOTIFY_BATCH = 500          # tek seferde eklenecek bildirim satırı sayısı
SLUG_MAX = 100              # link = "/duyurular/" + slug, notifications.link VARCHAR(128)
NOTIF_TITLE_MAX = 128       # notifications.title VARCHAR(128)
NOTIFY_KIND = "system_announcement"
NOTIFY_ICON = "📢"

CREATE_TABLE_SQL = f"""
CREATE TABLE IF NOT EXISTS announcements (
    id {_PK},
    slug VARCHAR(120) UNIQUE NOT NULL,
    title VARCHAR(160) NOT NULL,
    summary VARCHAR(300),
    body TEXT NOT NULL,
    is_published BOOLEAN NOT NULL DEFAULT {_BOOL_F},
    published_at {_TS},
    notify_sent_at {_TS},
    notify_recipient_count INTEGER,
    created_at {_TS} DEFAULT {_NOW},
    updated_at {_TS} DEFAULT {_NOW}
)
"""


async def ensure_announcements_table() -> None:
    """Tabloyu oluştur (yoksa) — idempotent."""
    async with engine.begin() as conn:
        await conn.execute(text(CREATE_TABLE_SQL))


# ---------------------------------------------------------------- slug

# Türkçe harfler: unicodedata.normalize 'ı' ve 'ş' gibi harfleri düzgün
# çevirmediği için önce elle eşleniyor.
_TR_MAP = str.maketrans({
    "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ı": "i", "I": "i",
    "İ": "i", "i": "i", "ö": "o", "Ö": "o", "ş": "s", "Ş": "s",
    "ü": "u", "Ü": "u",
})


def slugify(value: str) -> str:
    """Başlıktan URL parçası üretir: 'Yeni Özellik: Şampiyonluk!' -> 'yeni-ozellik-sampiyonluk'."""
    s = (value or "").translate(_TR_MAP).lower()
    # Kalan aksanlı harfleri (é, ñ ...) ASCII'ye indir.
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    s = re.sub(r"-{2,}", "-", s)[:SLUG_MAX].strip("-")
    return s or "duyuru"


async def _unique_slug(db: AsyncSession, title: str, exclude_id: int | None = None) -> str:
    """Çakışmada sonuna sayı ekler: duyuru, duyuru-2, duyuru-3 ..."""
    base = slugify(title)
    candidate = base
    n = 1
    while True:
        sql = "SELECT id FROM announcements WHERE slug = :slug"
        params: dict[str, Any] = {"slug": candidate}
        if exclude_id is not None:
            sql += " AND id <> :id"
            params["id"] = exclude_id
        if (await db.execute(text(sql), params)).first() is None:
            return candidate
        n += 1
        suffix = f"-{n}"
        candidate = f"{base[:SLUG_MAX - len(suffix)]}{suffix}"


# ---------------------------------------------------------------- satır dönüşümü

def _iso(v: Any) -> str | None:
    return v.isoformat() if isinstance(v, datetime) else (str(v) if v else None)


def _public_row(r: Any) -> dict[str, Any]:
    """Liste için özet alanlar (gövde YOK)."""
    return {
        "id": r[0], "slug": r[1], "title": r[2],
        "summary": r[3] or "", "published_at": _iso(r[4]),
    }


def _full_row(r: Any) -> dict[str, Any]:
    return {
        "id": r[0], "slug": r[1], "title": r[2], "summary": r[3] or "",
        "body": r[4] or "", "is_published": bool(r[5]),
        "published_at": _iso(r[6]), "notify_sent_at": _iso(r[7]),
        "notify_recipient_count": r[8],
        "created_at": _iso(r[9]), "updated_at": _iso(r[10]),
    }


_FULL_COLS = (
    "id, slug, title, summary, body, is_published, published_at, "
    "notify_sent_at, notify_recipient_count, created_at, updated_at"
)


# ---------------------------------------------------------------- public uçlar

@router.get("/announcements")
async def list_announcements(page: int = 1, db: AsyncSession = Depends(get_db)):
    """Yayındaki duyurular, yeniden eskiye, sayfa başına 20."""
    page = max(1, int(page or 1))
    offset = (page - 1) * PAGE_SIZE
    try:
        total = (await db.execute(
            text("SELECT count(*) FROM announcements WHERE is_published = TRUE")
        )).scalar() or 0
        res = await db.execute(
            text(
                "SELECT id, slug, title, summary, published_at FROM announcements "
                "WHERE is_published = TRUE "
                "ORDER BY published_at DESC NULLS LAST, id DESC "
                "LIMIT :limit OFFSET :offset"
                if _IS_PG else
                "SELECT id, slug, title, summary, published_at FROM announcements "
                "WHERE is_published = 1 "
                "ORDER BY published_at DESC, id DESC "
                "LIMIT :limit OFFSET :offset"
            ),
            {"limit": PAGE_SIZE, "offset": offset},
        )
    except Exception:
        # Tablo henüz yoksa (ilk deploy) sayfa kırılmasın.
        return {"announcements": [], "page": 1, "pages": 1, "total": 0}

    items = [_public_row(r) for r in res.fetchall()]
    pages = max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE)
    return {"announcements": items, "page": page, "pages": pages, "total": total}


@router.get("/announcements/{slug}")
async def get_announcement(slug: str, db: AsyncSession = Depends(get_db)):
    try:
        res = await db.execute(
            text(
                f"SELECT {_FULL_COLS} FROM announcements "
                "WHERE slug = :slug AND is_published = TRUE"
            ),
            {"slug": slug},
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Duyuru bulunamadı.")
    row = res.first()
    if row is None:
        raise HTTPException(status_code=404, detail="Duyuru bulunamadı.")
    d = _full_row(row)
    # Yayındaki duyuruda yönetim alanları dışarı sızmasın.
    for k in ("notify_sent_at", "notify_recipient_count", "is_published", "created_at", "updated_at"):
        d.pop(k, None)
    return d


# ---------------------------------------------------------------- admin uçlar

async def _recipient_count(db: AsyncSession) -> int:
    """Bildirim gidecek kullanıcı sayısı.

    users tablosunda last_seen/last_login SÜTUNU YOK (online durumu
    presence_service içinde yalnızca BELLEKTE tutuluyor), bu yüzden
    "son 30 gün" filtresi uygulanamıyor -> TÜM kullanıcılar alıcıdır.
    Sütun eklendiğinde tek yapılacak: aşağıdaki WHERE'i eklemek.
    """
    return (await db.execute(text("SELECT count(*) FROM users"))).scalar() or 0


@router.get("/admin/announcements")
async def admin_list(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        text(f"SELECT {_FULL_COLS} FROM announcements ORDER BY id DESC")
    )
    return {
        "announcements": [_full_row(r) for r in res.fetchall()],
        # Onay kutusunda "kaç kişiye gidecek" göstermek için.
        "recipient_estimate": await _recipient_count(db),
    }


class AnnouncementIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    summary: str = ""
    body: str = ""
    is_published: bool = False


class AnnouncementPatch(BaseModel):
    title: str | None = Field(default=None, max_length=160)
    summary: str | None = None
    body: str | None = None
    is_published: bool | None = None


@router.post("/admin/announcements")
async def admin_create(
    body: AnnouncementIn,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Başlık boş olamaz.")
    slug = await _unique_slug(db, title)
    published_at = f"{_NOW}" if body.is_published else "NULL"
    res = await db.execute(
        text(
            "INSERT INTO announcements (slug, title, summary, body, is_published, published_at) "
            f"VALUES (:slug, :title, :summary, :body, :is_published, {published_at}) "
            "RETURNING id"
            if _IS_PG else
            "INSERT INTO announcements (slug, title, summary, body, is_published, published_at) "
            f"VALUES (:slug, :title, :summary, :body, :is_published, {published_at})"
        ),
        {
            "slug": slug, "title": title, "summary": (body.summary or "")[:300],
            "body": body.body or "", "is_published": body.is_published,
        },
    )
    new_id = res.scalar() if _IS_PG else res.lastrowid
    await db.commit()
    return {"ok": True, "id": new_id, "slug": slug}


@router.put("/admin/announcements/{ann_id}")
async def admin_update(
    ann_id: int,
    body: AnnouncementPatch,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    cur = (await db.execute(
        text("SELECT id, title, slug, is_published, published_at, notify_sent_at "
             "FROM announcements WHERE id = :id"),
        {"id": ann_id},
    )).first()
    if cur is None:
        raise HTTPException(status_code=404, detail="Duyuru bulunamadı.")

    provided = body.model_fields_set
    sets: list[str] = []
    params: dict[str, Any] = {"id": ann_id}

    if "title" in provided:
        title = (body.title or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="Başlık boş olamaz.")
        sets.append("title = :title")
        params["title"] = title
        # Başlık değiştiyse slug'ı da tazele — ama SADECE bildirim gönderilmemişse:
        # gönderilmiş bildirimlerin link'i /duyurular/{eski-slug} olarak kalır,
        # slug değişirse o bağlantılar 404 olurdu.
        if title != cur[1] and cur[5] is None:
            sets.append("slug = :slug")
            params["slug"] = await _unique_slug(db, title, exclude_id=ann_id)

    for name in ("summary", "body"):
        if name in provided:
            sets.append(f"{name} = :{name}")
            val = getattr(body, name) or ""
            params[name] = val[:300] if name == "summary" else val

    if "is_published" in provided:
        sets.append("is_published = :is_published")
        params["is_published"] = bool(body.is_published)
        # İlk kez yayına alınıyorsa published_at damgala; yayından kaldırılırsa dokunma.
        if body.is_published and cur[4] is None:
            sets.append(f"published_at = {_NOW}")

    if not sets:
        return {"ok": True, "id": ann_id}

    sets.append(f"updated_at = {_NOW}")
    await db.execute(
        text(f"UPDATE announcements SET {', '.join(sets)} WHERE id = :id"), params
    )
    await db.commit()
    row = (await db.execute(
        text(f"SELECT {_FULL_COLS} FROM announcements WHERE id = :id"), {"id": ann_id}
    )).first()
    return {"ok": True, **_full_row(row)}


@router.delete("/admin/announcements/{ann_id}")
async def admin_delete(
    ann_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(text("DELETE FROM announcements WHERE id = :id"), {"id": ann_id})
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- bildirim gönderimi

async def _send_announcement_notifications(ann_id: int, title: str, slug: str, summary: str) -> None:
    """Arka plan görevi — notifications satırlarını 500'lük gruplar hâlinde yazar.

    İstek session'ı kapandığı için KENDİ session'ını açar.
    """
    from app.core.database import AsyncSessionLocal

    notif_title = title[:NOTIF_TITLE_MAX]
    notif_body = (summary or "").strip()
    link = f"/duyurular/{slug}"
    written = 0
    try:
        async with AsyncSessionLocal() as db:
            ids = [r[0] for r in (await db.execute(text("SELECT id FROM users ORDER BY id"))).fetchall()]
            for i in range(0, len(ids), NOTIFY_BATCH):
                batch = ids[i:i + NOTIFY_BATCH]
                # Mevcut bildirim çağrı yerleriyle aynı kalıp (db.add(Notification(...))).
                for uid in batch:
                    db.add(Notification(
                        user_id=uid, kind=NOTIFY_KIND,
                        title=notif_title,
                        body=notif_body,
                        icon=NOTIFY_ICON,
                        link=link,
                    ))
                await db.commit()
                written += len(batch)
            await db.execute(
                text("UPDATE announcements SET notify_recipient_count = :n WHERE id = :id"),
                {"n": written, "id": ann_id},
            )
            await db.commit()
    except Exception as e:
        # Kısmen gönderilmiş olabilir: notify_sent_at BİLEREK geri alınmaz
        # (aksi hâlde yeniden gönderim çift bildirim yaratır). Yazılan sayı kaydedilir.
        print(f"[announcements] bildirim gönderimi hatası (id={ann_id}, yazılan={written}): {e}")
        try:
            async with AsyncSessionLocal() as db2:
                await db2.execute(
                    text("UPDATE announcements SET notify_recipient_count = :n WHERE id = :id"),
                    {"n": written, "id": ann_id},
                )
                await db2.commit()
        except Exception:
            pass


@router.post("/admin/announcements/{ann_id}/notify")
async def admin_notify(
    ann_id: int,
    background: BackgroundTasks,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Duyuruyu uygulama içi bildirim olarak gönderir. BİR DUYURU, BİR KEZ.

    Push GÖNDERİLMEZ — sadece notifications satırı yazılır.
    """
    row = (await db.execute(
        text("SELECT id, slug, title, summary, is_published, notify_sent_at "
             "FROM announcements WHERE id = :id"),
        {"id": ann_id},
    )).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Duyuru bulunamadı.")
    if not bool(row[4]):
        raise HTTPException(status_code=400, detail="Önce duyuruyu yayına almalısın.")
    if row[5] is not None:
        raise HTTPException(status_code=400, detail="Bu duyuru için bildirim zaten gönderildi.")

    # Damgayı ŞİMDİ ve KOŞULLU at: iki hızlı tıklamada ikinci istek 400 alır.
    # (Arka plan görevi bitene kadar beklemek çift gönderime açık kapı bırakırdı.)
    claimed = await db.execute(
        text(f"UPDATE announcements SET notify_sent_at = {_NOW} "
             "WHERE id = :id AND notify_sent_at IS NULL"),
        {"id": ann_id},
    )
    await db.commit()
    if (claimed.rowcount or 0) == 0:
        raise HTTPException(status_code=400, detail="Bu duyuru için bildirim zaten gönderildi.")

    recipients = await _recipient_count(db)
    background.add_task(
        _send_announcement_notifications, ann_id, row[2], row[1], row[3] or ""
    )
    return {"ok": True, "queued": True, "recipient_count": recipients}
