"""Bot adları (soyadsız) + admin üye düzenleme — senaryo testleri.

CANLI VERİTABANINA DOKUNMAZ: geçici SQLite dosyası, bellekte FastAPI, gerçek
HTTP istekleri.

Çalıştırma (backend dizininde):
    DATABASE_URL='sqlite+aiosqlite:///./test_bot_uye.db' JWT_SECRET=test GAME_LANG=tr \\
        python tests/bot_adlari_ve_uye_duzenleme_senaryo.py

PostgreSQL için DATABASE_URL'i kt_test içeren bir veritabanına çevir.
"""

from __future__ import annotations

import asyncio
import os
import pathlib
import sys

DB_FILE = pathlib.Path(__file__).with_name("test_bot_uye.db")
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


async def db_all(sql: str, **params):
    async with AsyncSessionLocal() as db:
        return list((await db.execute(text(sql), params)).scalars().all())


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

    from app.game import bot_names
    from app.game.bot_generator import generate_bots
    from app.services.bot_name_cleanup import cleanup_bot_names

    # ------------------------------------------------------------------
    print("\n1) İsim havuzu — soyad yok")
    tr = bot_names.pool_for("tr")
    en = bot_names.pool_for("en")
    check("tr havuzu tek kelimelik adlardan oluşuyor", all(" " not in n for n in tr))
    check("en havuzu tek kelimelik adlardan oluşuyor", all(" " not in n for n in en))
    check("tr havuzunda baş harf/nokta yok", all("." not in n for n in tr))
    check("tr havuzu benzersiz", len(set(tr)) == len(tr))
    check("tr havuzu 100 bota yeter", len(tr) >= 150, str(len(tr)))
    check("bilinmeyen dil tr'ye düşüyor", bot_names.pool_for("de") == tr)
    check("first_name_of soyadı atıyor", bot_names.first_name_of("Sıla Öztürk") == "Sıla")
    check("first_name_of baş harfi atıyor", bot_names.first_name_of("Ceren D.") == "Ceren")
    check("first_name_of tek ada dokunmuyor", bot_names.first_name_of("Murat") == "Murat")
    check("first_name_of boşa dayanıklı", bot_names.first_name_of("") == "")

    # ------------------------------------------------------------------
    print("\n2) random_bot_names")
    names = bot_names.random_bot_names(5)
    check("istenen sayıda ad döndü", len(names) == 5)
    check("hepsi tek kelime", all(" " not in n for n in names), str(names))
    check("hepsi benzersiz", len(set(names)) == 5, str(names))
    check("hepsi havuzdan", all(n in tr for n in names), str(names))
    excl = set(tr[:-1])                       # havuzda tek ad bıraksak?
    only = bot_names.random_bot_names(1, exclude=excl)
    check("exclude edilen adlar seçilmiyor", only[0] == tr[-1], str(only))
    many = bot_names.random_bot_names(400)    # havuzdan fazlası istendi
    check("havuz bitince numarayla tamamlanıyor", len(many) == 400)
    check("tamamlama adları çakışmıyor", len(set(many)) >= len(tr))

    # ------------------------------------------------------------------
    print("\n3) Bot üretimi (startup seed dahil)")
    seeded = await db_all("SELECT name FROM bots")
    check("startup botları üretmiş", len(seeded) > 0, str(len(seeded)))
    check("üretilen adlarda soyad yok", all(" " not in n for n in seeded),
          str([n for n in seeded if " " in n][:5]))
    check("üretilen adlar benzersiz", len(set(seeded)) == len(seeded))
    async with AsyncSessionLocal() as db:
        created = await generate_bots(db, 10, "tr")
    after = await db_all("SELECT name FROM bots")
    check("yeni botlar üretildi", created > 0, str(created))
    check("yeni adlar da tek kelime", all(" " not in n for n in after))
    check("eski adlarla çakışma yok", len(set(after)) == len(after))
    async with AsyncSessionLocal() as db:
        check("bilinmeyen dilde üretim yok", await generate_bots(db, 5, "de") == 0)

    # havuz tükenince istenen sayı tamamlanmaz (sessiz kalmaz, sayı döner)
    async with AsyncSessionLocal() as db:
        await generate_bots(db, 500, "tr")
    async with AsyncSessionLocal() as db:
        check("havuz bitince 0 üretilir", await generate_bots(db, 5, "tr") == 0)
    check("havuz kadar bot var", await db_scalar("SELECT COUNT(*) FROM bots WHERE lang='tr'") == len(tr))
    await db_exec("DELETE FROM bots")

    # ------------------------------------------------------------------
    print("\n4) Eski soyadlı botların temizliği (bir kez çalışır)")
    await db_exec("DELETE FROM applied_migrations WHERE code = '2026_08_bot_names_first_only'")
    eski = [
        ("Sıla Öztürk", "https://api.dicebear.com/7.x/thumbs/svg?seed=x"),
        ("Sıla Kaya", "https://api.dicebear.com/7.x/thumbs/svg?seed=y"),   # çakışacak
        ("Ceren D.", "https://api.dicebear.com/7.x/thumbs/svg?seed=z"),
        ("Murat", "https://ozel.ornek/bot.png"),                            # elle konmuş avatar
    ]
    for n, av in eski:
        await db_exec(
            "INSERT INTO bots (name, avatar_url, lang, elo, active) "
            "VALUES (:n, :a, 'tr', 1000, :t)", n=n, a=av, t=True)
    changed = await cleanup_bot_names()
    adlar = await db_all("SELECT name FROM bots ORDER BY id")
    check("değişen satır sayısı döndü", changed == 3, str(changed))
    check("soyadlar kalktı", all(" " not in n for n in adlar), str(adlar))
    check("adlar benzersiz kaldı", len(set(adlar)) == len(adlar), str(adlar))
    check("çakışan ikinci bota havuzdan yeni ad verildi",
          sorted(adlar)[0] != sorted(adlar)[1] if len(adlar) > 1 else True, str(adlar))
    check("tek adlı bota dokunulmadı", "Murat" in adlar, str(adlar))
    check("elle konmuş avatar korundu",
          await db_scalar("SELECT avatar_url FROM bots WHERE name='Murat'") == "https://ozel.ornek/bot.png")
    check("dicebear avatarı adla tazelendi",
          "dicebear" in (await db_scalar("SELECT avatar_url FROM bots WHERE name=:n", n=adlar[0]) or ""))
    check("ikinci çalıştırma hiçbir şey yapmıyor", await cleanup_bot_names() == 0)
    check("damga yazıldı", await db_scalar(
        "SELECT COUNT(*) FROM applied_migrations WHERE code='2026_08_bot_names_first_only'") == 1)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        # --------------------------------------------------------------
        print("\n5) Admin bot üretme ucu")
        r = await c.post("/api/auth/register",
                         json={"email": "admin@ornek.com", "password": "adminsifre",
                               "display_name": "Yonetim Hesabi"},
                         headers={"user-agent": UA, "x-forwarded-for": "9.9.9.1"})
        admin_id, admin_tok = r.json()["user"]["id"], r.json()["token"]
        await db_exec("UPDATE users SET is_admin = :v WHERE id = :i", v=True, i=admin_id)

        r = await c.post("/api/admin/bots/generate", json={"count": 3, "lang": "tr"},
                         headers=hdr(admin_tok))
        d = r.json()
        check("3 bot üretildi", d["created"] == 3, r.text[:150])
        check("istenen sayı dönüyor", d["requested"] == 3, r.text[:150])
        check("havuzda kalan bildiriliyor", isinstance(d.get("pool_left"), int), r.text[:150])
        r = await c.get("/api/admin/bots", headers=hdr(admin_tok))
        check("panelde adlar soyadsız",
              all(" " not in b["name"] for b in r.json()["bots"]), r.text[:200])

        # --------------------------------------------------------------
        print("\n6) Admin üye düzenleme — görünen ad")
        r = await c.post("/api/auth/quick", json={"name": "Ali Veli"},
                         headers={"user-agent": UA, "x-forwarded-for": "5.5.5.5"})
        uid, utok = r.json()["user"]["id"], r.json()["token"]
        uname0 = r.json()["user"]["username"]

        r = await c.put(f"/api/admin/users/{uid}/profile",
                        json={"display_name": "  Yeni  Ad  "}, headers=hdr(admin_tok))
        check("görünen ad kaydedildi", r.json()["user"]["display_name"] == "Yeni Ad", r.text[:200])
        check("değişiklik listesi dönüyor", "görünen ad" in r.json()["changed"], r.text[:200])
        check("ad moderasyona düşmedi",
              await db_scalar("SELECT name_status FROM users WHERE id=:i", i=uid) == "approved")
        r = await c.put(f"/api/admin/users/{uid}/profile",
                        json={"display_name": "A"}, headers=hdr(admin_tok))
        check("çok kısa ad reddedildi", r.status_code == 400, r.text[:150])
        r = await c.put(f"/api/admin/users/{uid}/profile",
                        json={"display_name": "Yeni Ad"}, headers=hdr(admin_tok))
        check("aynı ad gönderilince değişiklik yok", r.json()["changed"] == [], r.text[:150])

        # --------------------------------------------------------------
        print("\n7) Kullanıcı adı")
        # Maç geçmişi satırı: kullanıcı adı taşınıyor mu?
        await db_exec(
            "INSERT INTO match_history (p1_username, p2_username, p1_name, p2_name, "
            "p1_score, p2_score, winner_name, has_bot) "
            "VALUES (:u, 'rakip', 'Yeni Ad', 'Rakip', 3, 1, 'Yeni Ad', :f)", u=uname0, f=False)
        r = await c.put(f"/api/admin/users/{uid}/profile",
                        json={"username": "Işık_Kaya"}, headers=hdr(admin_tok))
        check("kullanıcı adı a-z0-9'a çevrildi", r.json()["user"]["username"] == "isikkaya", r.text[:200])
        check("maç geçmişi taşındı",
              await db_scalar("SELECT COUNT(*) FROM match_history WHERE p1_username='isikkaya'") == 1)
        check("eski ad geçmişte kalmadı",
              await db_scalar("SELECT COUNT(*) FROM match_history WHERE p1_username=:u", u=uname0) == 0)
        check("kullanıcının 30 günlük kotası yakılmadı",
              await db_scalar("SELECT COUNT(*) FROM username_changes WHERE user_id=:i", i=uid) == 0)

        r = await c.put(f"/api/admin/users/{uid}/profile",
                        json={"username": "!!!"}, headers=hdr(admin_tok))
        check("harfsiz kullanıcı adı reddedildi", r.status_code == 400, r.text[:150])
        r = await c.put(f"/api/admin/users/{uid}/profile",
                        json={"username": "ab"}, headers=hdr(admin_tok))
        check("çok kısa kullanıcı adı reddedildi", r.status_code == 400, r.text[:150])
        r = await c.put(f"/api/admin/users/{uid}/profile",
                        json={"username": "YONETIMHESABI"}, headers=hdr(admin_tok))
        check("başkasının adı (harf duyarsız) 409", r.status_code == 409, r.text[:150])
        r = await c.put(f"/api/admin/users/{uid}/profile",
                        json={"username": "admin"}, headers=hdr(admin_tok))
        check("rezerve ad admin için serbest", r.status_code == 200, r.text[:200])
        check("rezerve ad kaydedildi", r.json()["user"]["username"] == "admin", r.text[:200])

        # kullanıcı kendi hakkını hâlâ kullanabiliyor mu (kota yanmadı)
        r = await c.post("/api/account/username", json={"username": "alivelibey"},
                         headers=hdr(utok))
        check("kullanıcı kendi adını değiştirebiliyor", r.status_code == 200, r.text[:200])
        check("kendi hakkı 1 azaldı", r.json()["username_changes_left"] == 1, r.text[:200])

        # --------------------------------------------------------------
        print("\n8) E-posta ve şifre")
        check("hesap henüz doğrulanmamış",
              await db_scalar("SELECT verified FROM users WHERE id=:i", i=uid) in (False, 0))
        r = await c.put(f"/api/admin/users/{uid}/profile",
                        json={"email": "gecersiz"}, headers=hdr(admin_tok))
        check("bozuk e-posta reddedildi", r.status_code == 400, r.text[:150])
        r = await c.put(f"/api/admin/users/{uid}/profile",
                        json={"email": "admin@ornek.com"}, headers=hdr(admin_tok))
        check("başkasının e-postası 409", r.status_code == 409, r.text[:150])
        r = await c.put(f"/api/admin/users/{uid}/profile",
                        json={"password": "kisa"}, headers=hdr(admin_tok))
        check("kısa şifre reddedildi", r.status_code == 400, r.text[:150])

        r = await c.put(f"/api/admin/users/{uid}/profile",
                        json={"email": "ALI@Ornek.com", "password": "guclusifre"},
                        headers=hdr(admin_tok))
        check("e-posta küçük harfe indi", r.json()["user"]["email"] == "ali@ornek.com", r.text[:200])
        check("e-posta+şifre girilince doğrulandı", r.json()["user"]["verified"] is True, r.text[:200])
        check("doğrulama zamanı yazıldı",
              await db_scalar("SELECT verified_at FROM users WHERE id=:i", i=uid) is not None)

        r = await c.post("/api/auth/login", json={"email": "ali@ornek.com", "password": "guclusifre"},
                         headers={"user-agent": UA})
        check("yeni şifreyle giriş yapılabiliyor", r.status_code == 200, r.text[:200])

        r = await c.put(f"/api/admin/users/{uid}/profile",
                        json={"email": ""}, headers=hdr(admin_tok))
        check("e-posta silinebiliyor", r.json()["user"]["email"] in (None, ""), r.text[:200])
        check("silinince doğrulama düştü", r.json()["user"]["verified"] is False, r.text[:200])
        check("şifre de temizlendi",
              await db_scalar("SELECT password_hash FROM users WHERE id=:i", i=uid) is None)
        r = await c.post("/api/auth/login", json={"email": "ali@ornek.com", "password": "guclusifre"},
                         headers={"user-agent": UA})
        check("eski şifreyle giriş artık olmuyor", r.status_code >= 400, r.text[:150])

        # --------------------------------------------------------------
        print("\n9) Güvenlik ve sınırlar")
        r = await c.put(f"/api/admin/users/{uid}/profile", json={"display_name": "X Y"},
                        headers={"user-agent": UA})
        check("jetonsuz istek reddedildi", r.status_code in (401, 403), r.text[:120])
        r = await c.put(f"/api/admin/users/{uid}/profile", json={"display_name": "X Y"},
                        headers=hdr(utok))
        check("normal kullanıcı düzenleyemiyor", r.status_code in (401, 403), r.text[:120])
        r = await c.put("/api/admin/users/999999/profile", json={"display_name": "X Y"},
                        headers=hdr(admin_tok))
        check("olmayan üye 404", r.status_code == 404, r.text[:120])

        r = await c.post("/api/auth/quick", json={"name": "Silinecek Kisi"},
                         headers={"user-agent": UA, "x-forwarded-for": "5.5.5.6"})
        sid = r.json()["user"]["id"]
        await db_exec("UPDATE users SET deleted = :v WHERE id = :i", v=True, i=sid)
        r = await c.put(f"/api/admin/users/{sid}/profile", json={"display_name": "Yeni Ad"},
                        headers=hdr(admin_tok))
        check("silinmiş hesap düzenlenemiyor", r.status_code == 400, r.text[:150])

        r = await c.put(f"/api/admin/users/{uid}/profile", json={}, headers=hdr(admin_tok))
        check("boş gövde güvenli", r.status_code == 200 and r.json()["changed"] == [], r.text[:150])
        check("yanıt şifre özetini sızdırmıyor", "password" not in r.text, r.text[:200])
        check("yanıt google/token alanı sızdırmıyor",
              "google_sub" not in r.text and "token" not in r.text, r.text[:200])

        r = await c.get("/api/admin/users?q=admin", headers=hdr(admin_tok))
        check("üye listesi bozulmadı", r.status_code == 200 and r.json()["users"], r.text[:150])

    print(f"\n{'='*52}\nSONUÇ:  {OK} başarılı, {FAIL} başarısız\n{'='*52}")
    if DB_FILE.exists():
        DB_FILE.unlink()
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    asyncio.run(main())
