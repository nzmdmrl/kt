"""
Maç teklifi (challenge) servisi — KAYNAK: VERİTABANI.

Eskiden teklifler yalnızca bellekte (dict) ve 30 sn TTL ile tutuluyordu; sunucu
yeniden başlayınca kayboluyor ve hiçbir bildirim satırı üretmediği için push
gönderilemiyordu. Artık her teklif `challenges` tablosunda bir satır.

Durumlar: pending -> accepted | declined | cancelled | expired

TASARIM NOTLARI
---------------
- TTL, app_settings'teki "app.flags" -> challenge_ttl_seconds anahtarından okunur
  (varsayılan 120 sn). Admin panelinden değiştirilebilir; 60 sn cache'lenir.
- SÜRE DOLMASI: süresi geçmiş pending satırlar OKUMA SIRASINDA 'expired' olarak
  işaretlenir (tembel süpürme); yeni bir arka plan zamanlayıcı EKLENMEDİ.
  Doğruluk buna bağlı değildir: her okuma ayrıca `expires_at > now()` süzgecini
  uygular, yani süpürme hiç çalışmasa da süresi geçen teklif kimseye görünmez ve
  kabul edilemez. Süpürme sorgusu kısmi indeksi (status='pending') kullanır ve
  normalde sıfır satır eşleştiği için maliyeti ihmal edilebilir.
- delivered_at: teklif ilk kez /challenge/incoming ile İSTEMCİYE VERİLDİĞİNDE
  damgalanır. YALNIZCA TEŞHİS AMAÇLIDIR; hiçbir süzgeçte kullanılmaz.
  Eskiden popup 30 sn sabit sayıp kapandığı için, damgadan 30 sn sonra teklif
  artık döndürülmüyordu (yoksa kapanan popup 3 sn'de bir yeniden açılırdı).
  Popup artık gerçek expires_at'e kadar açık kaldığından o süzgeç KALDIRILDI:
  teklif geçerli olduğu SÜRECE döner. Aksi hâlde 40. saniyede push'a dokunup
  uygulamayı açan kullanıcıya "teklif yok" denirdi — hâlbuki teklif 80 sn daha
  geçerli.
- pending_for, popup'ın geri sayımı için expires_at ile birlikte SUNUCUDA
  hesaplanan expires_in (kalan saniye) döner. İstemci saati sunucudan sapmış
  olabileceği için geri sayım expires_in üzerinden kurulur.
- notification_id: teklif oluşturulurken yazılan uygulama içi bildirim satırının
  id'si. Teklif reddedilince/iptal edilince o satır okundu işaretlenir.
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import engine

_IS_PG = engine.dialect.name == "postgresql"
_NOW = "now()" if _IS_PG else "CURRENT_TIMESTAMP"
_TS = "TIMESTAMPTZ" if _IS_PG else "TIMESTAMP"
_PK = "SERIAL PRIMARY KEY" if _IS_PG else "INTEGER PRIMARY KEY AUTOINCREMENT"

# app_settings -> "app.flags" içindeki anahtar.
TTL_SETTING_KEY = "app.flags"
TTL_FIELD = "challenge_ttl_seconds"
DEFAULT_TTL = 120
MIN_TTL, MAX_TTL = 10, 900

# Gönderenin /challenge/outgoing ile son teklifini görebileceği pencere.
# Eski bellek sürümünde kayıtlar 120 sn sonra tamamen siliniyordu; burada da
# eski bir "accepted" teklifin sayfa yenilendiğinde kullanıcıyı ölü bir odaya
# yönlendirmemesi için pencere sınırlı tutulur.
OUTGOING_GRACE = 60


# ---------------------------------------------------------------- DDL

CREATE_TABLE_SQL = f"""
CREATE TABLE IF NOT EXISTS challenges (
    id {_PK},
    from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    room_code VARCHAR(32),
    created_at {_TS} DEFAULT {_NOW},
    expires_at {_TS} NOT NULL,
    responded_at {_TS},
    delivered_at {_TS},
    notification_id INTEGER
)
"""

CREATE_INDEX_TO_STATUS_SQL = (
    "CREATE INDEX IF NOT EXISTS ix_challenges_to_status ON challenges (to_user_id, status)"
)
# Tembel süpürme ve "bekleyen var mı" sorguları için kısmi indeks.
CREATE_INDEX_PENDING_SQL = (
    "CREATE INDEX IF NOT EXISTS ix_challenges_pending_expires "
    "ON challenges (expires_at) WHERE status = 'pending'"
)
CREATE_INDEX_FROM_SQL = (
    "CREATE INDEX IF NOT EXISTS ix_challenges_from ON challenges (from_user_id, id)"
)


async def ensure_challenge_table() -> None:
    """Tabloyu + indeksleri oluştur (yoksa) — idempotent, startup'ta çağrılır."""
    async with engine.begin() as conn:
        await conn.execute(text(CREATE_TABLE_SQL))
        for ddl in (CREATE_INDEX_TO_STATUS_SQL, CREATE_INDEX_PENDING_SQL, CREATE_INDEX_FROM_SQL):
            try:
                await conn.execute(text(ddl))
            except Exception as e:
                # SQLite kısmi indeksi destekler ama eski sürümler için sessiz geç.
                print(f"[challenge] indeks atlandı: {type(e).__name__}: {e}")


# ---------------------------------------------------------------- dialekt yardımcıları

def _minus(bind: str) -> str:
    """SQL: şu andan `bind` saniye önce."""
    if _IS_PG:
        return f"(now() - ({bind} * interval '1 second'))"
    return f"datetime('now', '-' || {bind} || ' seconds')"


def _plus(bind: str) -> str:
    """SQL: şu andan `bind` saniye sonra."""
    if _IS_PG:
        return f"(now() + ({bind} * interval '1 second'))"
    return f"datetime('now', '+' || {bind} || ' seconds')"


def _secs_left(col: str) -> str:
    """SQL: `col` zaman damgasına kalan saniye (negatif olabilir)."""
    if _IS_PG:
        return f"EXTRACT(EPOCH FROM ({col} - now()))"
    return f"((julianday({col}) - julianday('now')) * 86400)"


def _iso(value: Any) -> str:
    """expires_at'i istemciye ISO 8601 olarak ver (PG datetime / SQLite metin)."""
    if value is None:
        return ""
    iso = getattr(value, "isoformat", None)
    return iso() if callable(iso) else str(value)


# ---------------------------------------------------------------- TTL ayarı

_ttl_cache: tuple[float, int] | None = None
TTL_CACHE_TTL = 60.0


def clear_ttl_cache() -> None:
    global _ttl_cache
    _ttl_cache = None


async def ttl_seconds(db: AsyncSession) -> int:
    """app_settings 'app.flags'.challenge_ttl_seconds — 60 sn cache'li, hata yutar."""
    global _ttl_cache
    now = time.monotonic()
    if _ttl_cache and now - _ttl_cache[0] < TTL_CACHE_TTL:
        return _ttl_cache[1]

    value = DEFAULT_TTL
    try:
        raw = (await db.execute(
            text("SELECT value FROM app_settings WHERE key = :k"), {"k": TTL_SETTING_KEY},
        )).scalar()
        if isinstance(raw, (str, bytes)):
            raw = json.loads(raw if isinstance(raw, str) else raw.decode("utf-8", "ignore"))
        if isinstance(raw, dict):
            value = int(raw.get(TTL_FIELD) or DEFAULT_TTL)
    except Exception:
        value = DEFAULT_TTL
    value = max(MIN_TTL, min(MAX_TTL, value))
    _ttl_cache = (now, value)
    return value


# ---------------------------------------------------------------- tembel süpürme

async def expire_stale(db: AsyncSession) -> int:
    """Süresi geçmiş pending satırları 'expired' yapar. Okuma sırasında çağrılır.

    Doğruluk buna BAĞLI DEĞİLDİR — tüm okumalar ayrıca `expires_at > now()`
    süzgecini uygular; bu yalnızca tablonun durumunu güncel tutar. Kısmi indeks
    sayesinde normalde sıfır satır eşleşir.
    """
    try:
        res = await db.execute(text(
            f"UPDATE challenges SET status = 'expired' "
            f"WHERE status = 'pending' AND expires_at <= {_NOW}"
        ))
        await db.commit()
        return res.rowcount or 0
    except Exception as e:
        print(f"[challenge] süpürme hatası: {type(e).__name__}: {e}")
        try:
            await db.rollback()
        except Exception:
            pass
        return 0


# ---------------------------------------------------------------- okuma

async def has_pending(db: AsyncSession, from_id: int, to_id: int) -> bool:
    """Bu gönderen->alıcı için hâlâ geçerli bekleyen bir teklif var mı?"""
    row = (await db.execute(
        text(
            f"SELECT id FROM challenges "
            f"WHERE from_user_id = :f AND to_user_id = :t AND status = 'pending' "
            f"  AND expires_at > {_NOW} LIMIT 1"
        ),
        {"f": from_id, "t": to_id},
    )).first()
    return row is not None


async def pending_for(db: AsyncSession, to_id: int) -> dict[str, Any] | None:
    """Kullanıcıya gelen, popup'ta gösterilecek ilk bekleyen teklif.

    Teklif GEÇERLİ OLDUĞU SÜRECE döner (bkz. modül başı: delivered_at süzgeci
    kaldırıldı). Popup'ın geri sayımı için expires_at + expires_in eklenir.
    İlk kez döndürülen teklife delivered_at damgası basılır (yalnızca teşhis).
    """
    row = (await db.execute(
        text(
            f"SELECT c.id, c.from_user_id, c.to_user_id, u.display_name, u.username, "
            f"       c.expires_at, {_secs_left('c.expires_at')} AS secs_left "
            f"FROM challenges c JOIN users u ON u.id = c.from_user_id "
            f"WHERE c.to_user_id = :t AND c.status = 'pending' AND c.expires_at > {_NOW} "
            f"ORDER BY c.id LIMIT 1"
        ),
        {"t": to_id},
    )).first()
    if row is None:
        return None
    cid, from_id, to_user_id, display_name, username, expires_at, secs_left = row
    try:
        await db.execute(
            text(f"UPDATE challenges SET delivered_at = {_NOW} "
                 "WHERE id = :id AND delivered_at IS NULL"),
            {"id": cid},
        )
        await db.commit()
    except Exception as e:
        print(f"[challenge] delivered_at damgası yazılamadı: {type(e).__name__}: {e}")
    return {
        "id": cid, "from_id": from_id, "to_id": to_user_id,
        "from_name": display_name or username,
        "expires_at": _iso(expires_at),
        # Aşağı yuvarlanmaz: 0.4 sn kalmışsa popup 1 sn gösterip kapanır,
        # erken kapanmaktansa milisaniyelik geç kapanmak yeğdir.
        "expires_in": max(0, int(round(float(secs_left or 0)))),
    }


async def get(db: AsyncSession, cid: int) -> dict[str, Any] | None:
    """Tek teklif. Süresi geçmiş pending satır 'expired' olarak raporlanır."""
    row = (await db.execute(
        text(
            f"SELECT id, from_user_id, to_user_id, status, room_code, notification_id, "
            f"       (expires_at <= {_NOW}) AS is_stale "
            f"FROM challenges WHERE id = :id"
        ),
        {"id": cid},
    )).first()
    if row is None:
        return None
    status = row[3]
    if status == "pending" and bool(row[6]):
        status = "expired"
    return {
        "id": row[0], "from_id": row[1], "to_id": row[2], "status": status,
        "room_code": row[4], "notification_id": row[5],
    }


async def outgoing_status(db: AsyncSession, from_id: int) -> dict[str, Any] | None:
    """Gönderenin son teklifi (accepted ise room_code ile).

    Yalnızca SON dönemdeki teklifler döner; aksi hâlde kullanıcı sayfayı
    yenilediğinde eski bir 'accepted' teklif onu ölü bir odaya yönlendirirdi.
    """
    ttl = await ttl_seconds(db)
    row = (await db.execute(
        text(
            f"SELECT id, from_user_id, to_user_id, status, room_code, "
            f"       (expires_at <= {_NOW}) AS is_stale "
            f"FROM challenges "
            f"WHERE from_user_id = :f AND created_at > {_minus(':win')} "
            f"ORDER BY id DESC LIMIT 1"
        ),
        {"f": from_id, "win": ttl + OUTGOING_GRACE},
    )).first()
    if row is None:
        return None
    status = row[3]
    if status == "pending" and bool(row[5]):
        status = "expired"
    return {
        "id": row[0], "from_id": row[1], "to_id": row[2],
        "status": status, "room_code": row[4],
    }


# ---------------------------------------------------------------- yazma

async def create_challenge(db: AsyncSession, from_id: int, to_id: int,
                           notification_id: int | None = None) -> int | None:
    """Yeni bekleyen teklif satırı açar. Aynısı zaten bekliyorsa None döner."""
    if await has_pending(db, from_id, to_id):
        return None
    ttl = await ttl_seconds(db)
    row = (await db.execute(
        text(
            f"INSERT INTO challenges (from_user_id, to_user_id, status, expires_at, notification_id) "
            f"VALUES (:f, :t, 'pending', {_plus(':ttl')}, :nid) RETURNING id"
        ),
        {"f": from_id, "t": to_id, "ttl": ttl, "nid": notification_id},
    )).first()
    return int(row[0]) if row else None


async def _respond(db: AsyncSession, cid: int, uid: int, owner_col: str,
                   new_status: str, room_code: str | None = None) -> bool:
    """pending -> new_status geçişi. Sadece süresi dolmamış satırda çalışır."""
    sets = ["status = :st", f"responded_at = {_NOW}"]
    params: dict[str, Any] = {"id": cid, "uid": uid, "st": new_status}
    if room_code is not None:
        sets.append("room_code = :code")
        params["code"] = room_code
    res = await db.execute(
        text(
            f"UPDATE challenges SET {', '.join(sets)} "
            f"WHERE id = :id AND {owner_col} = :uid AND status = 'pending' "
            f"  AND expires_at > {_NOW}"
        ),
        params,
    )
    await db.commit()
    return (res.rowcount or 0) > 0


async def accept(db: AsyncSession, cid: int, to_id: int) -> str | None:
    """Alıcı teklifi kabul eder; ortak oda kodunu döner (başarısızsa None)."""
    room_code = "duel-" + uuid.uuid4().hex[:8]
    ok = await _respond(db, cid, to_id, "to_user_id", "accepted", room_code)
    return room_code if ok else None


async def decline(db: AsyncSession, cid: int, to_id: int) -> bool:
    """Alıcı teklifi reddeder."""
    return await _respond(db, cid, to_id, "to_user_id", "declined")


async def cancel(db: AsyncSession, cid: int, from_id: int) -> bool:
    """Gönderen kendi teklifini geri çeker."""
    return await _respond(db, cid, from_id, "from_user_id", "cancelled")


async def mark_notification_read(db: AsyncSession, notification_id: int | None) -> None:
    """Teklif bildirimi tüketildi — zil sayacında asılı kalmasın. Hata yutar."""
    if not notification_id:
        return
    try:
        await db.execute(
            text("UPDATE notifications SET read = TRUE WHERE id = :id"
                 if _IS_PG else
                 "UPDATE notifications SET read = 1 WHERE id = :id"),
            {"id": notification_id},
        )
        await db.commit()
    except Exception as e:
        print(f"[challenge] bildirim okundu işaretlenemedi: {type(e).__name__}: {e}")
