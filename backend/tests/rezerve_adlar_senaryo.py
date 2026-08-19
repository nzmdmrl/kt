"""Rezerve kullanıcı adları — senaryo testleri (CANLI VERİTABANINA DOKUNMAZ).

Çalıştırma (backend dizininde):
    DATABASE_URL='sqlite+aiosqlite:///./test_rez.db' JWT_SECRET=test GAME_LANG=tr \\
        python tests/rezerve_adlar_senaryo.py
"""

from __future__ import annotations

import asyncio
import os
import pathlib
import sys

DB_FILE = pathlib.Path(__file__).with_name("test_rez.db")
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
from app.game import reserved_names  # noqa: E402

OK, FAIL = 0, 0


def check(label: str, cond: bool, extra: str = "") -> None:
    global OK, FAIL
    if cond:
        OK += 1
        print(f"  ✓ {label}")
    else:
        FAIL += 1
        print(f"  ✗ {label}  {extra}")


def hdr(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def set_setting(key: str, value: str) -> None:
    from app.game import settings_service
    async with AsyncSessionLocal() as db:
        await settings_service.set_setting(db, key, value)


async def db_scalar(sql: str, **params):
    async with AsyncSessionLocal() as db:
        return (await db.execute(text(sql), params)).scalar()


async def db_exec(sql: str, **params) -> None:
    async with AsyncSessionLocal() as db:
        await db.execute(text(sql), params)
        await db.commit()


async def main() -> None:
    await on_startup()
    await set_setting("name_moderation_enabled", "0")
    await set_setting("quick_signup_ip_limit", "0")
    await set_setting("name_check_enabled", "false")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:

        async def hizli(name: str) -> tuple[dict, str]:
            r = await c.post("/api/auth/quick", json={"name": name},
                             headers={"x-forwarded-for": "1.2.3.4"})
            assert r.status_code == 200, r.text
            d = r.json()
            return d["user"], d["token"]

        # ---------------------------------------------------------------
        print("\n1) Başlangıç listesi seed edildi")
        n = await db_scalar("SELECT COUNT(*) FROM reserved_usernames")
        check("liste dolu", n and n >= 30, str(n))
        for ad in ["admin", "yonetici", "mod", "moderator", "destek", "support",
                   "kelimetahmin", "sistem", "system", "bot", "resmi", "official"]:
            var = await db_scalar(
                "SELECT COUNT(*) FROM reserved_usernames WHERE name=:n", n=ad)
            check(f"'{ad}' listede", var == 1, str(var))
        check("yedek taban 'oyuncu' rezerve DEĞİL",
              await db_scalar("SELECT COUNT(*) FROM reserved_usernames WHERE name='oyuncu'") == 0)

        # ---------------------------------------------------------------
        print("\n2) Kontrol harf duyarsız ve çevrilmiş hâle bakıyor")
        async with AsyncSessionLocal() as db:
            for yazim in ["admin", "ADMIN", "Admin", "AdMiN", "admın", "ADMİN",
                          "a d m i n", "a.d.m.i.n", "A-D-M-I-N"]:
                check(f"'{yazim}' rezerve sayılıyor",
                      await reserved_names.is_reserved(db, yazim), yazim)
            for yazim in ["adminx", "admin1", "yasemin", "ali", "adminler"]:
                check(f"'{yazim}' rezerve DEĞİL",
                      not await reserved_names.is_reserved(db, yazim), yazim)
            check("'YÖNETİCİ' rezerve", await reserved_names.is_reserved(db, "YÖNETİCİ"))
            check("'Kelime Tahmin' rezerve", await reserved_names.is_reserved(db, "Kelime Tahmin"))

        # ---------------------------------------------------------------
        print("\n3) İsim popup'ı — kullanıcı DURDURULMUYOR (varsayılan: tarafsız ad)")
        check("varsayılan davranış 'neutral'", reserved_names.fallback_mode() == "neutral",
              reserved_names.fallback_mode())
        u, tok = await hizli("Admin")
        check("hesap açıldı, kullanıcı engellenmedi", u["id"] > 0)
        check("görünen ad yazdığı gibi kaldı", u["display_name"] == "Admin", u["display_name"])
        check("kullanıcı adı 'admin' DEĞİL", u["username"] != "admin", u["username"])
        check("kullanıcı adı 'admin2' DE DEĞİL", u["username"] != "admin2", u["username"])
        check("tarafsız taban kullanıldı", u["username"].startswith("oyuncu"), u["username"])
        r = await c.get("/api/auth/me", headers=hdr(tok))
        check("oyuna girebiliyor", r.status_code == 200, r.text[:120])

        u2, _ = await hizli("YÖNETİCİ")
        check("ikinci rezerve isim de tarafsız ad alıyor",
              u2["username"].startswith("oyuncu") and u2["username"] != u["username"],
              u2["username"])

        u3, _ = await hizli("Destek Ekibi")
        check("'Destek Ekibi' rezerve DEĞİL (tam eşleşme yok) → destekekibi",
              u3["username"] == "destekekibi", u3["username"])

        # ---------------------------------------------------------------
        print("\n4) 'number' seçeneği de çalışıyor")
        await set_setting("reserved_fallback", "number")
        check("mod değişti", reserved_names.fallback_mode() == "number")
        u4, _ = await hizli("ADMIN")
        check("bu kez 'admin2' üretildi", u4["username"] == "admin2", u4["username"])
        check("'admin' yine ALINMADI",
              await db_scalar("SELECT COUNT(*) FROM users WHERE lower(username)='admin'") == 0)
        await set_setting("reserved_fallback", "neutral")

        # ---------------------------------------------------------------
        print("\n5) Kullanıcı adı DEĞİŞTİRİRKEN açık hata")
        deg, deg_tok = await hizli("Normal Kisi")
        for deneme in ["admin", "ADMIN", "Admin", "admın", "yonetici", "Kelime Tahmin"]:
            r = await c.post("/api/account/username", json={"username": deneme},
                             headers=hdr(deg_tok))
            check(f"'{deneme}' reddedildi (400)", r.status_code == 400, r.text[:160])
        r = await c.post("/api/account/username", json={"username": "admin"},
                         headers=hdr(deg_tok))
        check("hata mesajı anlaşılır",
              "ayrılmış" in r.text or "kullanılamaz" in r.text, r.text[:200])
        check("kullanıcı adı değişmedi",
              await db_scalar("SELECT username FROM users WHERE id=:i", i=deg["id"]) == "normalkisi")

        r = await c.post("/api/account/username", json={"username": "adminx"},
                         headers=hdr(deg_tok))
        check("rezerve OLMAYAN ad değiştirilebiliyor", r.status_code == 200, r.text[:160])
        check("kaydedildi", r.json()["username"] == "adminx", r.text[:160])

        # ---------------------------------------------------------------
        print("\n6) E-posta ve Google kaydı da korunuyor")
        r = await c.post("/api/auth/register",
                         json={"email": "sistem@ornek.com", "password": "sifre123",
                               "display_name": "Sistem"},
                         headers={"x-forwarded-for": "3.3.3.1"})
        check("e-posta kaydı çalışıyor", r.status_code == 200, r.text[:160])
        check("kullanıcı adı 'sistem' olmadı",
              r.json()["user"]["username"] != "sistem", r.json()["user"]["username"])
        check("tarafsız taban", r.json()["user"]["username"].startswith("oyuncu"),
              r.json()["user"]["username"])

        from app.core import auth_service
        async with AsyncSessionLocal() as db:
            g = await auth_service.get_or_create_google_user(
                db, sub="g-rez-1", email="grez@ornek.com", name="Moderatör", picture=None)
            check("Google kaydında da 'moderator' alınmadı",
                  g.username != "moderator", g.username)
            check("tarafsız taban", g.username.startswith("oyuncu"), g.username)

        # ---------------------------------------------------------------
        print("\n7) Admin paneli — liste yönetimi")
        r = await c.post("/api/auth/register",
                         json={"email": "admin@ornek.com", "password": "adminsifre",
                               "display_name": "Yonetim Hesabi"},
                         headers={"x-forwarded-for": "9.9.9.1"})
        admin_tok = r.json()["token"]
        await db_exec("UPDATE users SET is_admin=:v WHERE email='admin@ornek.com'", v=True)

        r = await c.get("/api/admin/reserved-names", headers=hdr(admin_tok))
        check("liste ucu çalışıyor", r.status_code == 200, r.text[:150])
        j = r.json()
        check("adlar dönüyor", j["count"] >= 30, str(j["count"]))
        check("davranış ayarı dönüyor", j["fallback"] == "neutral", str(j.get("fallback")))
        check("yedek taban bildiriliyor", j["neutral_base"] == "oyuncu", str(j.get("neutral_base")))
        check("kullanan hesap yok", j["users_using"] == [], str(j["users_using"]))

        print("\n   ekleme")
        r = await c.post("/api/admin/reserved-names",
                         json={"name": "ŞAMPİYON", "note": "Yarışma unvanı"},
                         headers=hdr(admin_tok))
        check("eklendi", r.status_code == 200, r.text[:160])
        check("normalleştirilerek kaydedildi", r.json()["name"] == "sampiyon", r.text[:160])
        async with AsyncSessionLocal() as db:
            check("artık rezerve", await reserved_names.is_reserved(db, "Şampiyon"))
        u5, _ = await hizli("Şampiyon")
        check("yeni rezerve ad da anında etkili",
              not u5["username"].startswith("sampiyon"), u5["username"])

        r = await c.post("/api/admin/reserved-names", json={"name": "sampiyon"},
                         headers=hdr(admin_tok))
        check("aynı ad iki kez eklenemiyor (409)", r.status_code == 409, r.text[:160])
        r = await c.post("/api/admin/reserved-names", json={"name": "!!!"},
                         headers=hdr(admin_tok))
        check("boş/geçersiz ad reddediliyor", r.status_code == 400, r.text[:160])
        r = await c.post("/api/admin/reserved-names", json={"name": "oyuncu"},
                         headers=hdr(admin_tok))
        check("yedek taban rezerve edilemiyor", r.status_code == 400, r.text[:200])

        print("\n   silme")
        r = await c.delete("/api/admin/reserved-names/sampiyon", headers=hdr(admin_tok))
        check("silindi", r.status_code == 200, r.text[:160])
        async with AsyncSessionLocal() as db:
            check("artık rezerve değil", not await reserved_names.is_reserved(db, "sampiyon"))
        u6, _ = await hizli("Sampiyon")
        check("silinince ad alınabiliyor", u6["username"] == "sampiyon", u6["username"])
        r = await c.delete("/api/admin/reserved-names/yokboyle", headers=hdr(admin_tok))
        check("olmayan ad silinince 404", r.status_code == 404, r.text[:160])

        print("\n   davranış ayarı panelden")
        r = await c.put("/api/admin/reserved-names/fallback", json={"mode": "number"},
                        headers=hdr(admin_tok))
        check("ayar kaydedildi", r.status_code == 200, r.text[:160])
        check("etkili oldu", reserved_names.fallback_mode() == "number")
        r = await c.put("/api/admin/reserved-names/fallback", json={"mode": "uydurma"},
                        headers=hdr(admin_tok))
        check("geçersiz seçenek reddediliyor", r.status_code == 400, r.text[:160])
        await c.put("/api/admin/reserved-names/fallback", json={"mode": "neutral"},
                    headers=hdr(admin_tok))

        print("\n   yetki")
        r = await c.get("/api/admin/reserved-names", headers=hdr(deg_tok))
        check("admin olmayan listeyi göremiyor", r.status_code == 403, r.text[:120])
        r = await c.post("/api/admin/reserved-names", json={"name": "x1"}, headers=hdr(deg_tok))
        check("admin olmayan ekleyemiyor", r.status_code == 403, r.text[:120])

        # ---------------------------------------------------------------
        print("\n8) Rezerve adı KULLANAN mevcut hesap listeleniyor (değiştirilmez)")
        # Kural öncesinden kalmış gibi elle bir hesabın adını 'admin' yap.
        await db_exec("UPDATE users SET username='admin' WHERE id=:i", i=deg["id"])
        r = await c.get("/api/admin/reserved-names", headers=hdr(admin_tok))
        using = r.json()["users_using"]
        check("kullanan hesap bulundu", len(using) == 1, str(using))
        check("doğru hesap", using[0]["id"] == deg["id"], str(using))
        check("kayıt DEĞİŞTİRİLMEDİ",
              await db_scalar("SELECT username FROM users WHERE id=:i", i=deg["id"]) == "admin")
        await db_exec("UPDATE users SET username='adminx' WHERE id=:i", i=deg["id"])

        # ---------------------------------------------------------------
        print("\n9) Mevcut akışlar bozulmadı")
        r = await c.post("/api/auth/quick", json={"name": "Ayşe Gül"},
                         headers={"x-forwarded-for": "1.2.3.4"})
        check("normal isimle hesap açma çalışıyor", r.status_code == 200, r.text[:150])
        check("adı doğru", r.json()["user"]["username"] == "aysegul",
              r.json()["user"]["username"])
        son_tok = r.json()["token"]
        r = await c.post("/api/account/username", json={"username": "AyşeGül2"},
                         headers=hdr(son_tok))
        check("ad değiştirme çalışıyor", r.status_code == 200, r.text[:150])
        check("çevrildi", r.json()["username"] == "aysegul2", r.text[:150])
        r = await c.get("/api/profile/aysegul2")
        check("profil açılıyor", r.status_code == 200, r.text[:120])
        r = await c.get("/api/admin/username-audit", headers=hdr(admin_tok))
        check("kullanıcı adı denetimi çalışıyor", r.status_code == 200, r.text[:120])
        r = await c.get("/api/admin/quick-auth", headers=hdr(admin_tok))
        check("hızlı giriş ayarları çalışıyor", r.status_code == 200, r.text[:120])

        print("\n   çakışan iki hesap oluşmuyor")
        check("hiç 'admin' kullanıcı adı yok",
              await db_scalar("SELECT COUNT(*) FROM users WHERE lower(username)='admin'") == 0)
        check("hiç çakışma yok",
              await db_scalar(
                  "SELECT COUNT(*) FROM (SELECT lower(username) k FROM users "
                  "GROUP BY 1 HAVING COUNT(*)>1) x") == 0)

    print(f"\n{'='*52}\nSONUÇ:  {OK} başarılı, {FAIL} başarısız\n{'='*52}")
    if DB_FILE.exists():
        DB_FILE.unlink()
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    asyncio.run(main())
