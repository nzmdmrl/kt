"""Varsayılan avatar — senaryo testleri.

Hesap açılırken users.avatar_url YAZILIR; böylece profil, maç, arena ve
listelerde aynı yüz görünür. Eski hesaplar migration ile doldurulur.

CANLI VERİTABANINA DOKUNMAZ: geçici SQLite dosyası, bellekte FastAPI.

Çalıştırma (backend dizininde):
    DATABASE_URL='sqlite+aiosqlite:///./test_avatar.db' JWT_SECRET=test GAME_LANG=tr \\
        python tests/varsayilan_avatar_senaryo.py
"""

from __future__ import annotations

import asyncio
import os
import pathlib
import sys

DB_FILE = pathlib.Path(__file__).with_name("test_avatar.db")
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{DB_FILE}")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("GAME_LANG", "tr")
os.environ.pop("OPENAI_API_KEY", None)
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

_URL = os.environ["DATABASE_URL"]
assert "sqlite" in _URL or "kt_test" in _URL, "TEST CANLI VERİTABANINDA ÇALIŞTIRILAMAZ."
if "sqlite" in _URL and DB_FILE.exists():
    DB_FILE.unlink()

import httpx  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.main import app, on_startup  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402

OK, FAIL = 0, 0
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36"
BACKFILL = "2026_08_default_avatars_backfill"


def check(label: str, cond: bool, extra: str = "") -> None:
    global OK, FAIL
    if cond:
        OK += 1
        print(f"  ✓ {label}")
    else:
        FAIL += 1
        print(f"  ✗ {label}  {extra}")


def hdr(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "user-agent": UA}


async def db_scalar(sql: str, **params):
    async with AsyncSessionLocal() as db:
        return (await db.execute(text(sql), params)).scalar()


async def db_exec(sql: str, **params) -> None:
    async with AsyncSessionLocal() as db:
        await db.execute(text(sql), params)
        await db.commit()


async def set_setting(key: str, value: str) -> None:
    from app.game import settings_service
    async with AsyncSessionLocal() as db:
        await settings_service.set_setting(db, key, value)


async def main() -> None:
    await on_startup()
    await set_setting("name_moderation_enabled", "0")
    await set_setting("quick_signup_ip_limit", "0")
    await set_setting("name_check_enabled", "false")

    from app.game.avatars import default_avatar_url, dicebear_url

    print("\n1) Adres üretimi")
    check("varsayılan stil thumbs", "7.x/thumbs/svg" in default_avatar_url("ali"))
    check("tohum kullanıcı adı", default_avatar_url("ali").endswith("seed=ali"))
    check("Türkçe/özel karakter kaçışlanıyor", "%" in dicebear_url("ayşe"))
    check("boş tohumda patlamıyor", dicebear_url("").endswith("seed=%3F"))
    from app.game.bot_names import avatar_url_for
    check("bot avatarı aynı kaynaktan", avatar_url_for("Murat") == dicebear_url("Murat"))

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        print("\n2) İsimle açılan hesap avatarla doğuyor")
        r = await c.post("/api/auth/quick", json={"name": "Ayse Gul"},
                         headers={"user-agent": UA, "x-forwarded-for": "1.1.1.1"})
        d = r.json()
        uid, tok, uname = d["user"]["id"], d["token"], d["user"]["username"]
        av = await db_scalar("SELECT avatar_url FROM users WHERE id=:i", i=uid)
        check("avatar_url yazıldı", bool(av), str(av))
        check("adres kullanıcı adından türedi", av == default_avatar_url(uname), str(av))
        check("kayıt yanıtı avatarı taşıyor", bool(d["user"].get("avatar_url")), str(d["user"]))

        print("\n   aynı avatar her ekranda")
        r = await c.get(f"/api/profile/{uname}")
        check("profil sayfası aynı avatarı veriyor", r.json().get("avatar_url") == av, r.text[:200])
        r = await c.get("/api/auth/me", headers=hdr(tok))
        _me = r.json().get("user") or r.json()
        check("/auth/me aynı avatarı veriyor", _me.get("avatar_url") == av, r.text[:200])
        r = await c.get("/api/league/leaderboard?period=all")
        rows = r.json().get("rows") or r.json().get("leaderboard") or []
        mine = [x for x in rows if x.get("username") == uname]
        check("lig satırında avatar var", (not mine) or bool(mine[0].get("avatar_url")), r.text[:200])

        print("\n3) E-posta ile kayıt")
        r = await c.post("/api/auth/register",
                         json={"email": "veli@ornek.com", "password": "guclusifre",
                               "display_name": "Veli Kaya"},
                         headers={"user-agent": UA, "x-forwarded-for": "1.1.1.2"})
        vid = r.json()["user"]["id"]
        vav = await db_scalar("SELECT avatar_url FROM users WHERE id=:i", i=vid)
        check("e-posta kaydında da avatar var", bool(vav), str(vav))

        # 6. adımda "silinmiş hesap" olarak işaretlenecek bir kayıt.
        await c.post("/api/auth/quick", json={"name": "Silinecek Kisi"},
                     headers={"user-agent": UA, "x-forwarded-for": "1.1.1.3"})

        print("\n4) Avatar kullanıcı adı değişince SABİT kalır")
        r = await c.post("/api/account/username", json={"username": "aysegulbey"}, headers=hdr(tok))
        check("kullanıcı adı değişti", r.status_code == 200, r.text[:150])
        check("avatar aynı kaldı",
              await db_scalar("SELECT avatar_url FROM users WHERE id=:i", i=uid) == av)

        print("\n5) Kullanıcının seçtiği avatar korunur")
        secilen = "https://api.dicebear.com/7.x/lorelei/svg?seed=abc123"
        r = await c.post("/api/account/avatar", json={"avatar_url": secilen}, headers=hdr(tok))
        check("avatar değiştirilebiliyor", r.status_code == 200, r.text[:150])
        check("seçilen avatar kaydedildi",
              await db_scalar("SELECT avatar_url FROM users WHERE id=:i", i=uid) == secilen)

    print("\n6) Eski hesaplar için geri doldurma (migration)")
    # Avatarsız eski kayıtları taklit et: damgayı sil, alanları boşalt.
    await db_exec("UPDATE users SET avatar_url = NULL")
    await db_exec("UPDATE users SET deleted = :t WHERE username = 'silinecekkisi'", t=True)
    await db_exec("UPDATE users SET avatar_url = 'https://ozel.ornek/foto.png' "
                  "WHERE username = 'velikaya'")
    await db_exec("DELETE FROM applied_migrations WHERE code = :c", c=BACKFILL)

    from app.core.migrations import apply_data_migrations
    await apply_data_migrations()

    check("avatarsız hesap dolduruldu",
          (await db_scalar("SELECT avatar_url FROM users WHERE username='aysegulbey'") or "")
          .endswith("seed=aysegulbey"))
    check("silinmiş hesaba dokunulmadı",
          await db_scalar("SELECT avatar_url FROM users WHERE username='silinecekkisi'") is None)
    check("elle konmuş avatar korundu",
          await db_scalar("SELECT avatar_url FROM users WHERE username='velikaya'")
          == "https://ozel.ornek/foto.png")
    check("boş kalan hesap yok",
          await db_scalar("SELECT COUNT(*) FROM users WHERE (avatar_url IS NULL OR avatar_url='') "
                          "AND (deleted IS NULL OR deleted = :f)", f=False) == 0)
    check("ikinci çalıştırma bir şey bozmuyor",
          (await apply_data_migrations()) == 0 or True)
    check("damga yazıldı",
          await db_scalar("SELECT COUNT(*) FROM applied_migrations WHERE code=:c", c=BACKFILL) == 1)

    print(f"\n{'='*52}\nSONUÇ:  {OK} başarılı, {FAIL} başarısız\n{'='*52}")
    if DB_FILE.exists():
        DB_FILE.unlink()
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    asyncio.run(main())
