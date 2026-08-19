"""Kullanıcı adı kuralı + harf duyarsız benzersizlik — senaryo testleri.

CANLI VERİTABANINA DOKUNMAZ: geçici SQLite dosyası, bellekte FastAPI,
gerçek HTTP istekleri.

Çalıştırma (backend dizininde):
    DATABASE_URL='sqlite+aiosqlite:///./test_uad.db' JWT_SECRET=test GAME_LANG=tr \\
        python tests/kullanici_adi_senaryo.py
"""

from __future__ import annotations

import asyncio
import os
import pathlib
import sys

DB_FILE = pathlib.Path(__file__).with_name("test_uad.db")
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
from app.game.name_rules import slugify_username, is_valid_username  # noqa: E402

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
        print("\n1) Karakter kuralı — Türkçe harfler çevriliyor")
        for src, beklenen in [
            ("IŞIK", "isik"), ("Işık", "isik"), ("ışık", "isik"), ("IŞIk", "isik"),
            ("Ayşe Gül", "aysegul"), ("Çağrı Öz", "cagrioz"), ("Nazım", "nazim"),
            ("ÖĞÜT", "ogut"), ("şşş", "sss"), ("İSTANBUL", "istanbul"),
            ("Yasemin_123", "yasemin123"), ("a.b-c", "abc"), ("Kartal 1903", "kartal1903"),
        ]:
            got = slugify_username(src)
            check(f"'{src}' → {beklenen}", got == beklenen, got)

        check("büyük harf kalmıyor", slugify_username("ABC") == "abc")
        check("alt çizgi siliniyor", slugify_username("a_b") == "ab")
        check("emoji siliniyor", slugify_username("🙂ali🙂") == "ali")
        check("kuralı doğrulayan yardımcı çalışıyor",
              is_valid_username("abc123") and not is_valid_username("Abc")
              and not is_valid_username("a_b") and not is_valid_username("aş"))

        # ---------------------------------------------------------------
        print("\n2) Hesap açma — kullanıcı adı kurala uygun üretiliyor")
        u, tok_isik = await hizli("IŞIK")
        check("'IŞIK' → isik", u["username"] == "isik", u["username"])
        check("görünen ad Türkçe harfleri KORUYOR", u["display_name"] == "IŞIK", u["display_name"])

        u2, _ = await hizli("Işık")
        check("ikinci 'Işık' çakışıyor, isik2 oluyor", u2["username"] == "isik2", u2["username"])
        u3, _ = await hizli("ışık")
        check("üçüncüsü isik3", u3["username"] == "isik3", u3["username"])
        check("üç ayrı hesap", len({u["id"], u2["id"], u3["id"]}) == 3)

        u4, _ = await hizli("Ayşe Gül")
        check("'Ayşe Gül' → aysegul", u4["username"] == "aysegul", u4["username"])
        check("görünen adı 'Ayşe Gül' kaldı", u4["display_name"] == "Ayşe Gül")

        # ---------------------------------------------------------------
        print("\n3) BENZERSİZLİK harf duyarsız")
        yas, yas_tok = await hizli("Yasemin")
        check("'Yasemin' → yasemin", yas["username"] == "yasemin", yas["username"])
        yas2, _ = await hizli("YASEMİN")
        check("'YASEMİN' aynı adı ALAMIYOR, yasemin2 oluyor",
              yas2["username"] == "yasemin2", yas2["username"])

        from app.core.auth_service import get_user_by_username
        async with AsyncSessionLocal() as db:
            for yazim in ["yasemin", "Yasemin", "YASEMIN", "YaSeMiN"]:
                found = await get_user_by_username(db, yazim)
                check(f"'{yazim}' araması aynı hesabı buluyor",
                      found is not None and found.id == yas["id"],
                      str(found.id if found else None))

        # ---------------------------------------------------------------
        print("\n4) Kullanıcı adı değiştirme")
        deg, deg_tok = await hizli("Degistiren Kisi")
        r = await c.post("/api/account/username", json={"username": "Yeni_Ad"},
                         headers=hdr(deg_tok))
        check("kural dışı yazım REDDEDİLMİYOR, çevriliyor", r.status_code == 200, r.text[:200])
        check("kaydedilen ad 'yeniad'", r.json()["username"] == "yeniad", r.text[:200])
        check("DB'de de öyle",
              await db_scalar("SELECT username FROM users WHERE id=:i", i=deg["id"]) == "yeniad")

        r = await c.post("/api/account/username", json={"username": "ÖZGÜR"},
                         headers=hdr(deg_tok))
        check("Türkçe harfli ad çevriliyor", r.json().get("username") == "ozgur", r.text[:200])

        r = await c.post("/api/account/username", json={"username": "Yasemin"},
                         headers=hdr(deg_tok))
        check("ALINMIŞ ad harf büyüklüğüyle kapılamıyor (409)", r.status_code == 409, r.text[:200])
        r = await c.post("/api/account/username", json={"username": "YASEMIN"},
                         headers=hdr(deg_tok))
        check("büyük harfli hâli de kapılamıyor (409)", r.status_code == 409, r.text[:200])

        r = await c.post("/api/account/username", json={"username": "!!!"},
                         headers=hdr(deg_tok))
        check("geçerli karakter kalmayınca hata", r.status_code == 400, r.text[:200])
        r = await c.post("/api/account/username", json={"username": "aş"},
                         headers=hdr(deg_tok))
        check("çevrilince kısalan ad reddediliyor", r.status_code == 400, r.text[:200])
        check("hata mesajı neye dönüştüğünü söylüyor", "→" in r.text, r.text[:200])

        # ---------------------------------------------------------------
        print("\n5) E-posta ve Google kaydı da aynı kuraldan geçiyor")
        r = await c.post("/api/auth/register",
                         json={"email": "ogut@ornek.com", "password": "sifre123",
                               "display_name": "ÖĞÜT Bey"},
                         headers={"x-forwarded-for": "3.3.3.1"})
        check("e-posta kaydı çalışıyor", r.status_code == 200, r.text[:200])
        check("'ÖĞÜT Bey' → ogutbey", r.json()["user"]["username"] == "ogutbey",
              r.json()["user"]["username"])
        check("görünen ad korundu", r.json()["user"]["display_name"] == "ÖĞÜT Bey")

        from app.core import auth_service
        async with AsyncSessionLocal() as db:
            g = await auth_service.get_or_create_google_user(
                db, sub="g-test-1", email="gtest@ornek.com", name="Şükrü Çelik", picture=None)
            check("Google kaydı 'Şükrü Çelik' → sukrucelik",
                  g.username == "sukrucelik", g.username)
            g2 = await auth_service.get_or_create_google_user(
                db, sub="g-test-2", email="gtest2@ornek.com", name="ŞÜKRÜ ÇELİK", picture=None)
            check("ikincisi çakışmıyor, sukrucelik2", g2.username == "sukrucelik2", g2.username)

        # ---------------------------------------------------------------
        print("\n6) Aramalar harf duyarsız")
        r = await c.get("/api/profile/Yasemin")
        check("profil adresi büyük harfle açılıyor", r.status_code == 200, r.text[:150])
        check("doğru hesabı getiriyor", r.json()["id"] == yas["id"], r.text[:200])
        r = await c.get("/api/profile/YASEMIN")
        check("tamamı büyük harfle de açılıyor", r.status_code == 200, r.text[:150])
        r = await c.get("/api/profile/yasemin")
        check("küçük harfle de açılıyor", r.status_code == 200, r.text[:150])
        r = await c.get("/api/profile/Yasemin/matches")
        check("maç geçmişi de harf duyarsız", r.status_code == 200, r.text[:150])

        r = await c.get("/api/profile/search?q=YASE")
        found = [x["username"] for x in r.json()["users"]]
        check("üye arama büyük harfle çalışıyor", "yasemin" in found, str(found))
        r = await c.get("/api/profile/search?q=yase")
        check("küçük harfle de aynı sonuç",
              "yasemin" in [x["username"] for x in r.json()["users"]], r.text[:200])

        print("\n   giriş (e-posta) harf duyarsız")
        r = await c.post("/api/auth/login",
                         json={"email": "OGUT@Ornek.COM", "password": "sifre123"})
        check("büyük harfli e-posta ile giriş yapılabiliyor", r.status_code == 200, r.text[:150])

        # ---------------------------------------------------------------
        print("\n7) Veritabanı indeksi çakışmayı ENGELLİYOR")
        from app.services import username_audit
        async with AsyncSessionLocal() as db:
            res = await username_audit.ensure_unique_index(db)
            check("indeks kuruldu (çakışma yok)",
                  res["created"] or res["already"], str(res))
            check("indeks var", await username_audit.index_exists(db))

        # Uygulama kodunu ATLAYIP doğrudan DB'ye çakışan ad yazmayı dene.
        patladi = False
        try:
            await db_exec(
                "INSERT INTO users (username, display_name, name_status, elo, "
                " matches_played, wins, losses, draws, words_solved, total_score, xp, "
                " custom_arena_played, arena_played, arena_first, arena_second, "
                " arena_third, solo_matches, solo_best_score, abandons, is_admin, "
                " ad_free, show_online, allow_challenges, verified, shadow_banned, "
                " disabled, deleted) "
                "VALUES ('YASEMIN', 'x', 'approved', 1000, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, "
                " 0,0,1,1,0,0,0,0)")
        except Exception:
            patladi = True
        check("veritabanı 'YASEMIN' eklenmesini reddetti", patladi)

        # ---------------------------------------------------------------
        print("\n8) Denetim listesi — mevcut kayıtları BULUR, değiştirmez")
        # Kural öncesinden kalmış gibi iki kayıt üret (indeksi geçici kaldırıp).
        await db_exec(f"DROP INDEX {username_audit.INDEX_NAME}")
        await db_exec("UPDATE users SET username='Eski_Ad' WHERE id=:i", i=u4["id"])
        await db_exec("UPDATE users SET username='YASEMIN' WHERE id=:i", i=yas2["id"])

        async with AsyncSessionLocal() as db:
            rapor = await username_audit.audit(db)
        check("çakışma bulundu", rapor["conflict_groups"] == 1, str(rapor["conflict_groups"]))
        check("çakışan iki hesap listelendi", rapor["conflict_users"] == 2, str(rapor["conflict_users"]))
        adlar = sorted(x["username"] for x in rapor["conflicts"][0]["users"])
        check("doğru hesaplar", adlar == ["YASEMIN", "yasemin"], str(adlar))
        gecersiz = {x["username"] for x in rapor["invalid"]}
        check("kural dışı adlar listelendi",
              {"Eski_Ad", "YASEMIN"} <= gecersiz, str(gecersiz))
        hedef = next(x["would_become"] for x in rapor["invalid"] if x["username"] == "Eski_Ad")
        check("ne olacağı gösteriliyor (Eski_Ad → eskiad)", hedef == "eskiad", hedef)
        check("indeks kurulmamış olarak raporlanıyor", rapor["index_ready"] is False)

        print("\n   HİÇBİR KAYIT DEĞİŞTİRİLMEDİ")
        check("çakışan adlar yerinde",
              await db_scalar("SELECT username FROM users WHERE id=:i", i=yas2["id"]) == "YASEMIN")
        check("kural dışı ad yerinde",
              await db_scalar("SELECT username FROM users WHERE id=:i", i=u4["id"]) == "Eski_Ad")

        print("\n   çakışma varken indeks kurulmuyor")
        async with AsyncSessionLocal() as db:
            res = await username_audit.ensure_unique_index(db)
        check("kurulum atlandı", res["created"] is False and res["blocked_by"] == 1, str(res))

        print("\n   çakışma çözülünce indeks kendiliğinden kuruluyor")
        await db_exec("UPDATE users SET username='yasemin9' WHERE id=:i", i=yas2["id"])
        async with AsyncSessionLocal() as db:
            res = await username_audit.ensure_unique_index(db)
        check("indeks kuruldu", res["created"] is True, str(res))

        # Admin ucu
        r = await c.post("/api/auth/register",
                         json={"email": "admin@ornek.com", "password": "adminsifre",
                               "display_name": "Yonetim"},
                         headers={"x-forwarded-for": "9.9.9.1"})
        admin_tok = r.json()["token"]
        await db_exec("UPDATE users SET is_admin=:v WHERE email='admin@ornek.com'", v=True)
        r = await c.get("/api/admin/username-audit", headers=hdr(admin_tok))
        check("admin ucu çalışıyor", r.status_code == 200, r.text[:150])
        check("kural dışı adlar dönüyor", r.json()["invalid_count"] >= 1, r.text[:200])
        r = await c.get("/api/admin/username-audit", headers=hdr(yas_tok))
        check("admin olmayan erişemiyor", r.status_code == 403, r.text[:120])

        # ---------------------------------------------------------------
        print("\n9) Akışlar bozulmadı")
        r = await c.post("/api/auth/quick", json={"name": "Son Kontrol"},
                         headers={"x-forwarded-for": "1.2.3.4"})
        check("isimle hesap açma çalışıyor", r.status_code == 200, r.text[:150])
        check("adı doğru", r.json()["user"]["username"] == "sonkontrol",
              r.json()["user"]["username"])
        son_tok = r.json()["token"]
        r = await c.post("/api/account/username", json={"username": "sonkontrol2"},
                         headers=hdr(son_tok))
        check("kullanıcı adı değiştirme çalışıyor", r.status_code == 200, r.text[:150])
        r = await c.get("/api/auth/me", headers=hdr(son_tok))
        check("oturum sürüyor", r.status_code == 200, r.text[:150])
        r = await c.post("/api/auth/verify",
                         json={"email": "sonkontrol@ornek.com", "password": "gizli123"},
                         headers=hdr(son_tok))
        check("doğrulama çalışıyor", r.json().get("ok") is True, r.text[:150])
        r = await c.get("/api/account/me", headers=hdr(son_tok))
        check("hesap ekranı çalışıyor", r.status_code == 200, r.text[:150])
        r = await c.get("/api/league/leaderboard?scope=all")
        check("lig çalışıyor", r.status_code == 200, r.text[:150])

        print("\n   maç geçmişi bağlantısı ad değişince taşınıyor")
        mg, mg_tok = await hizli("Mac Gecmisi")
        await db_exec(
            "INSERT INTO match_history (p1_name, p2_name, p1_username, p2_username, "
            "p1_score, p2_score, winner_name, has_bot) "
            "VALUES ('Mac Gecmisi','Rakip','macgecmisi','rakip',100,50,'Mac Gecmisi',:hb)",
            hb=False)
        r = await c.post("/api/account/username", json={"username": "YeniMaçAdı"},
                         headers=hdr(mg_tok))
        check("ad değişti", r.json().get("username") == "yenimacadi", r.text[:200])
        check("maç geçmişi yeni ada taşındı",
              await db_scalar(
                  "SELECT COUNT(*) FROM match_history WHERE p1_username='yenimacadi'") == 1)
        r = await c.get("/api/profile/yenimacadi/matches")
        check("yeni adresten maçlar görünüyor", len(r.json().get("matches", [])) == 1, r.text[:200])

    print(f"\n{'='*52}\nSONUÇ:  {OK} başarılı, {FAIL} başarısız\n{'='*52}")
    if DB_FILE.exists():
        DB_FILE.unlink()
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    asyncio.run(main())
