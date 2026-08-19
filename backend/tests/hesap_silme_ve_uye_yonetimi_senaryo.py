"""Hesap silme + üye yönetimi + ortam istatistikleri — senaryo testleri.

CANLI VERİTABANINA DOKUNMAZ: geçici SQLite dosyası, bellekte FastAPI, gerçek
HTTP istekleri. Ortam (mobil uygulama / mobil tarayıcı / masaüstü) ayrımı
gerçek user agent başlıklarıyla sınanır.

Çalıştırma (backend dizininde):
    DATABASE_URL='sqlite+aiosqlite:///./test_silme.db' JWT_SECRET=test GAME_LANG=tr \\
        python tests/hesap_silme_ve_uye_yonetimi_senaryo.py
"""

from __future__ import annotations

import asyncio
import os
import pathlib
import sys

DB_FILE = pathlib.Path(__file__).with_name("test_silme.db")
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{DB_FILE}")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("GAME_LANG", "tr")
os.environ.pop("OPENAI_API_KEY", None)
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

_URL = os.environ["DATABASE_URL"]
assert "sqlite" in _URL or "kt_test" in _URL, "TEST CANLI VERİTABANINDA ÇALIŞTIRILAMAZ."
if "sqlite" in _URL and DB_FILE.exists():
    DB_FILE.unlink()

from datetime import date  # noqa: E402

import httpx  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.main import app, on_startup  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402

OK, FAIL = 0, 0

# Gerçek user agent örnekleri — ortam ayrımı bunlardan çıkarılır.
UA_APP = "Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 KelimeApp/1.0"
UA_MOBILE = "Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 Mobile Safari/537.36"
UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"


def check(label: str, cond: bool, extra: str = "") -> None:
    global OK, FAIL
    if cond:
        OK += 1
        print(f"  ✓ {label}")
    else:
        FAIL += 1
        print(f"  ✗ {label}  {extra}")


def hdr(token: str, ua: str = UA_DESKTOP) -> dict:
    return {"Authorization": f"Bearer {token}", "user-agent": ua}


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
    await set_setting("name_check_enabled", "false")   # isim denetimi bu testin konusu değil

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:

        async def hizli(name: str, ua: str = UA_DESKTOP) -> tuple[int, str]:
            r = await c.post("/api/auth/quick", json={"name": name},
                             headers={"user-agent": ua, "x-forwarded-for": "1.2.3.4"})
            assert r.status_code == 200, r.text
            d = r.json()
            return d["user"]["id"], d["token"]

        # ---------------------------------------------------------------
        print("\n1) Ortam tespiti (user agent'tan)")
        from app.core.platform import platform_from_ua
        check("mobil uygulama tanınıyor", platform_from_ua(UA_APP) == "app")
        check("mobil tarayıcı tanınıyor", platform_from_ua(UA_MOBILE) == "mobile")
        check("masaüstü tanınıyor", platform_from_ua(UA_DESKTOP) == "desktop")
        check("iPhone mobil sayılıyor",
              platform_from_ua("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari") == "mobile")
        check("boş user agent masaüstüne düşüyor", platform_from_ua(None) == "desktop")

        # ---------------------------------------------------------------
        print("\n2) Kayıt sırasında ortam yazılıyor")
        app_id, app_tok = await hizli("Uygulama Kisi", UA_APP)
        mob_id, mob_tok = await hizli("Mobil Kisi", UA_MOBILE)
        desk_id, desk_tok = await hizli("Masaustu Kisi", UA_DESKTOP)
        check("uygulama hesabı 'app'",
              await db_scalar("SELECT signup_platform FROM users WHERE id=:i", i=app_id) == "app")
        check("mobil tarayıcı hesabı 'mobile'",
              await db_scalar("SELECT signup_platform FROM users WHERE id=:i", i=mob_id) == "mobile")
        check("masaüstü hesabı 'desktop'",
              await db_scalar("SELECT signup_platform FROM users WHERE id=:i", i=desk_id) == "desktop")

        print("\n   heartbeat son ortamı güncelliyor")
        await c.post("/api/presence/heartbeat", headers=hdr(desk_tok, UA_APP))
        check("masaüstü hesabı uygulamadan girince 'app' oluyor",
              await db_scalar("SELECT last_platform FROM users WHERE id=:i", i=desk_id) == "app")
        await c.post("/api/presence/heartbeat", headers=hdr(desk_tok, UA_DESKTOP))
        check("geri masaüstüne dönüyor",
              await db_scalar("SELECT last_platform FROM users WHERE id=:i", i=desk_id) == "desktop")

        # ---------------------------------------------------------------
        print("\n3) Ziyaret sayacı")
        r = await c.post("/api/stats/visit", json={"client_key": "abc123"},
                         headers={"user-agent": UA_APP})
        check("girişsiz ziyaret sayıldı", r.json()["counted"] is True, r.text)
        check("ortam uygulama olarak tespit edildi", r.json()["platform"] == "app", r.text)
        r = await c.post("/api/stats/visit", json={"client_key": "abc123"},
                         headers={"user-agent": UA_APP})
        check("aynı ziyaretçi iki kez sayılmıyor", r.json()["counted"] is False, r.text)
        r = await c.post("/api/stats/visit", json={"client_key": "abc123"},
                         headers={"user-agent": UA_DESKTOP})
        check("aynı kişi başka ortamdan ayrı sayılıyor", r.json()["counted"] is True, r.text)
        r = await c.post("/api/stats/visit", json={"client_key": ""},
                         headers={"user-agent": UA_DESKTOP})
        check("anahtarsız istek sayacı kirletmiyor", r.json()["counted"] is False, r.text)
        r = await c.post("/api/stats/visit", json={}, headers=hdr(mob_tok, UA_MOBILE))
        check("girişli kullanıcı kimliğiyle sayılıyor", r.json()["counted"] is True, r.text)

        # ---------------------------------------------------------------
        print("\n4) Admin özet — ortam kırılımı")
        r = await c.post("/api/auth/register",
                         json={"email": "admin@ornek.com", "password": "adminsifre",
                               "display_name": "Yonetim"},
                         headers={"user-agent": UA_DESKTOP, "x-forwarded-for": "9.9.9.1"})
        admin_id, admin_tok = r.json()["user"]["id"], r.json()["token"]
        await db_exec("UPDATE users SET is_admin = :v WHERE id = :i", v=True, i=admin_id)

        r = await c.get("/api/admin/dashboard", headers=hdr(admin_tok))
        check("özet geldi", r.status_code == 200, r.text[:150])
        pf = r.json().get("platforms") or {}
        check("ziyaretçi kırılımı var", set(pf.get("visitors", {})) >= {"app", "mobile", "desktop", "total"},
              str(pf.get("visitors")))
        check("uygulama ziyaretçisi sayıldı", pf["visitors"]["app"] >= 1, str(pf["visitors"]))
        check("masaüstü ziyaretçisi sayıldı", pf["visitors"]["desktop"] >= 1, str(pf["visitors"]))
        check("yeni üye kırılımı var", pf["signups"]["app"] >= 1 and pf["signups"]["mobile"] >= 1,
              str(pf["signups"]))
        check("toplam hesaplanıyor",
              pf["signups"]["total"] == pf["signups"]["app"] + pf["signups"]["mobile"] + pf["signups"]["desktop"],
              str(pf["signups"]))
        check("doğrulama kırılımı var (henüz 0 değil, admin kaydı masaüstünden)",
              pf["verifications"]["desktop"] >= 1, str(pf["verifications"]))

        print("\n   doğrulama ortamı ayrı yazılıyor")
        r = await c.post("/api/auth/verify",
                         json={"email": "uygulama@ornek.com", "password": "gizli123"},
                         headers=hdr(app_tok, UA_APP))
        check("doğrulandı", r.json().get("ok") is True, r.text[:150])
        check("doğrulama ortamı 'app'",
              await db_scalar("SELECT verified_platform FROM users WHERE id=:i", i=app_id) == "app")
        r = await c.get("/api/admin/dashboard", headers=hdr(admin_tok))
        check("özet uygulamadan doğrulamayı gösteriyor",
              r.json()["platforms"]["verifications"]["app"] >= 1,
              str(r.json()["platforms"]["verifications"]))

        print("\n   mevcut özet alanları BOZULMADI")
        j = r.json()
        for k in ("total_users", "total_matches", "total_bots", "active_bots", "top_players", "live"):
            check(f"'{k}' hâlâ var", k in j, str(list(j.keys())))
        check("canlı alanları duruyor",
              {"online", "live_matches", "matches_today", "arena_today"} <= set(j["live"]),
              str(j["live"]))

        # ---------------------------------------------------------------
        print("\n5) Admin üye listesi — cihaz simgesi ve durum")
        r = await c.get("/api/admin/users?limit=100", headers=hdr(admin_tok))
        check("liste geldi", r.status_code == 200, r.text[:150])
        j = r.json()
        row = next(u for u in j["users"] if u["id"] == app_id)
        check("platform alanı var", row["platform"] == "app", str(row.get("platform")))
        for alan in ("disabled", "shadow_banned", "deleted", "verified"):
            check(f"'{alan}' alanı var", alan in row, str(list(row.keys())))
        check("süzgeç sayıları geliyor", set(j["counts"]) >= {"all", "active", "disabled", "banned", "deleted"},
              str(j.get("counts")))
        check("eski alanlar duruyor",
              {"ad_free", "presence", "is_admin", "created_at"} <= set(row.keys()), str(list(row.keys())))

        # ---------------------------------------------------------------
        print("\n6) Üyeyi pasife alma ve geri alma")
        r = await c.put(f"/api/admin/users/{mob_id}/status",
                        json={"disabled": True, "reason": "Test"}, headers=hdr(admin_tok))
        check("pasife alındı", r.status_code == 200 and r.json()["user"]["disabled"] is True, r.text[:150])
        r = await c.get("/api/auth/me", headers=hdr(mob_tok))
        check("pasif üye giriş yapamıyor (403)", r.status_code == 403, r.text[:150])
        r = await c.get("/api/admin/users?status=disabled", headers=hdr(admin_tok))
        check("pasif süzgecinde görünüyor",
              any(u["id"] == mob_id for u in r.json()["users"]), r.text[:200])
        r = await c.get("/api/admin/users?status=active", headers=hdr(admin_tok))
        check("aktif süzgecinde YOK", not any(u["id"] == mob_id for u in r.json()["users"]))

        r = await c.put(f"/api/admin/users/{mob_id}/status",
                        json={"disabled": False}, headers=hdr(admin_tok))
        check("geri alındı", r.json()["user"]["disabled"] is False, r.text[:150])
        r = await c.get("/api/auth/me", headers=hdr(mob_tok))
        check("üye yeniden girebiliyor", r.status_code == 200, r.text[:150])

        print("\n   maç geçmişi ve sıralamalar BOZULMUYOR")
        await db_exec("INSERT INTO daily_scores (user_id, score_date, best_score, matches) "
                      "VALUES (:i, :d, 400, 1)", i=mob_id, d=date.today())
        await c.put(f"/api/admin/users/{mob_id}/status", json={"disabled": True}, headers=hdr(admin_tok))
        check("pasif üyenin lig kaydı duruyor",
              await db_scalar("SELECT COUNT(*) FROM daily_scores WHERE user_id=:i", i=mob_id) == 1)
        r = await c.get("/api/league/leaderboard?scope=all")
        entries = r.json()["entries"]
        check("pasif üye sıralamada HÂLÂ var (silme değil, pasife alma)",
              any(e["user_id"] == mob_id for e in entries), str(entries)[:200])
        await c.put(f"/api/admin/users/{mob_id}/status", json={"disabled": False}, headers=hdr(admin_tok))

        print("\n   gölge ban ayrı çalışıyor")
        r = await c.put(f"/api/admin/users/{mob_id}/status",
                        json={"shadow_banned": True}, headers=hdr(admin_tok))
        check("gölge banlandı", r.json()["user"]["shadow_banned"] is True, r.text[:150])
        r = await c.get("/api/auth/me", headers=hdr(mob_tok))
        check("kullanıcı fark etmiyor (giriş normal)", r.status_code == 200)
        r = await c.get("/api/league/leaderboard?scope=all")
        entries = r.json()["entries"]
        check("sıralamadan gizlendi", not any(e["user_id"] == mob_id for e in entries))
        r = await c.get("/api/admin/users?status=banned", headers=hdr(admin_tok))
        check("banlı süzgecinde görünüyor", any(u["id"] == mob_id for u in r.json()["users"]))
        await c.put(f"/api/admin/users/{mob_id}/status",
                    json={"shadow_banned": False}, headers=hdr(admin_tok))

        print("\n   yönetici hesabına uygulanamıyor")
        r = await c.put(f"/api/admin/users/{admin_id}/status",
                        json={"disabled": True}, headers=hdr(admin_tok))
        check("yönetici pasife alınamıyor (400)", r.status_code == 400, r.text[:150])

        # ---------------------------------------------------------------
        print("\n7) Kullanıcının kendi hesabını silmesi")
        print("   a) DOĞRULANMAMIŞ hesap — ismini yazarak onaylar")
        sil_id, sil_tok = await hizli("Silinecek Kisi", UA_APP)
        r = await c.get("/api/account/delete-info", headers=hdr(sil_tok))
        check("onay biçimi 'name'", r.json()["mode"] == "name", r.text[:150])
        check("hangi adın yazılacağı söyleniyor", "Silinecek Kisi" in r.json()["label"], r.text[:150])
        r = await c.post("/api/account/delete", json={"name": "yanlis ad"}, headers=hdr(sil_tok))
        check("yanlış ad reddediliyor", r.status_code == 400, r.text[:150])
        r = await c.post("/api/account/delete", json={"name": "silinecek kisi"}, headers=hdr(sil_tok))
        check("büyük/küçük harf farkı sorun değil", r.status_code == 200, r.text[:150])

        print("   b) DOĞRULANMIŞ hesap — şifresini yazarak onaylar")
        dog_id, dog_tok = await hizli("Dogrulu Kisi", UA_DESKTOP)
        await c.post("/api/auth/verify",
                     json={"email": "dogrulu@ornek.com", "password": "gizli123"},
                     headers=hdr(dog_tok))
        r = await c.get("/api/account/delete-info", headers=hdr(dog_tok))
        check("onay biçimi 'password'", r.json()["mode"] == "password", r.text[:150])
        r = await c.post("/api/account/delete", json={"password": "yanlis"}, headers=hdr(dog_tok))
        check("yanlış şifre reddediliyor", r.status_code == 400, r.text[:150])
        r = await c.post("/api/account/delete", json={"password": "gizli123"}, headers=hdr(dog_tok))
        check("doğru şifreyle silindi", r.status_code == 200, r.text[:150])
        check("HERKES silebiliyor (doğrulanmış da doğrulanmamış da)", True)

        print("\n   silinen hesap ne oldu?")
        check("görünen ad 'Silinmiş üye'",
              await db_scalar("SELECT display_name FROM users WHERE id=:i", i=sil_id) == "Silinmiş üye")
        u1 = await db_scalar("SELECT username FROM users WHERE id=:i", i=sil_id)
        u2 = await db_scalar("SELECT username FROM users WHERE id=:i", i=dog_id)
        check("kullanıcı adı sıralı", u1 == "silinmisuye001" and u2 == "silinmisuye002", f"{u1} / {u2}")
        check("e-posta silindi",
              await db_scalar("SELECT email FROM users WHERE id=:i", i=dog_id) is None)
        check("şifre silindi",
              await db_scalar("SELECT password_hash FROM users WHERE id=:i", i=dog_id) is None)
        check("avatar silindi",
              await db_scalar("SELECT avatar_url FROM users WHERE id=:i", i=dog_id) is None)
        check("silindi işareti kondu",
              await db_scalar("SELECT deleted FROM users WHERE id=:i", i=sil_id) in (1, True))
        r = await c.get("/api/auth/me", headers=hdr(sil_tok))
        check("eski jeton artık geçersiz", r.status_code == 403, r.text[:150])
        r = await c.post("/api/auth/login", json={"email": "dogrulu@ornek.com", "password": "gizli123"})
        check("eski e-posta ile girilemiyor", r.status_code == 400, r.text[:150])

        print("\n   her yerden çıktı mı?")
        r = await c.get("/api/profile/silinmisuye001")
        check("profil sayfası açılmıyor (404)", r.status_code == 404, r.text[:120])
        r = await c.get("/api/profile/search?q=silinmis")
        check("üye aramasında çıkmıyor", len(r.json()["users"]) == 0, r.text[:200])
        await db_exec("INSERT INTO daily_scores (user_id, score_date, best_score, matches) "
                      "VALUES (:i, :d, 900, 1)", i=sil_id, d=date.today())
        r = await c.get("/api/league/leaderboard?scope=all")
        entries = r.json()["entries"]
        check("lig sıralamasında çıkmıyor", not any(e["user_id"] == sil_id for e in entries),
              str(entries)[:200])

        # ---------------------------------------------------------------
        print("\n8) Maç geçmişi KALIYOR ama 'Silinmiş üye' görünüyor")
        kalan_id, kalan_tok = await hizli("Rakip Kisi", UA_DESKTOP)
        gidecek_id, gidecek_tok = await hizli("Gidecek Kisi", UA_DESKTOP)
        gidecek_uname = await db_scalar("SELECT username FROM users WHERE id=:i", i=gidecek_id)
        kalan_uname = await db_scalar("SELECT username FROM users WHERE id=:i", i=kalan_id)
        await db_exec(
            "INSERT INTO match_history (p1_name, p2_name, p1_username, p2_username, "
            "p1_score, p2_score, winner_name, has_bot) VALUES "
            "('Gidecek Kisi', 'Rakip Kisi', :g, :k, 200, 100, 'Gidecek Kisi', :hb)",
            g=gidecek_uname, k=kalan_uname, hb=False)
        r = await c.post("/api/account/delete", json={"name": "Gidecek Kisi"}, headers=hdr(gidecek_tok))
        check("hesap silindi", r.status_code == 200, r.text[:150])

        check("maç kaydı DURUYOR",
              await db_scalar("SELECT COUNT(*) FROM match_history WHERE p2_username=:k", k=kalan_uname) == 1)
        check("rakip 'Silinmiş üye' olarak görüyor",
              await db_scalar("SELECT p1_name FROM match_history WHERE p2_username=:k", k=kalan_uname)
              == "Silinmiş üye")
        check("profil bağlantısı kaldırıldı",
              await db_scalar("SELECT p1_username FROM match_history WHERE p2_username=:k", k=kalan_uname) == "")
        check("kazanan adı da güncellendi",
              await db_scalar("SELECT winner_name FROM match_history WHERE p2_username=:k", k=kalan_uname)
              == "Silinmiş üye")
        r = await c.get(f"/api/profile/{kalan_uname}/matches")
        check("rakibin maç geçmişi hâlâ açılıyor", r.status_code == 200, r.text[:150])

        print("\n   arkadaşlık bağları siliniyor")
        a_id, a_tok = await hizli("Arkadas A", UA_DESKTOP)
        b_id, b_tok = await hizli("Arkadas B", UA_DESKTOP)
        await c.post(f"/api/friends/request/{b_id}", headers=hdr(a_tok))
        await c.post(f"/api/friends/accept/{a_id}", headers=hdr(b_tok))
        r = await c.get("/api/friends", headers=hdr(b_tok))
        check("arkadaşlık kuruldu", len(r.json()["friends"]) == 1, r.text[:200])
        await c.post("/api/account/delete", json={"name": "Arkadas A"}, headers=hdr(a_tok))
        r = await c.get("/api/friends", headers=hdr(b_tok))
        check("silinen kişi arkadaş listesinden çıktı", len(r.json()["friends"]) == 0, r.text[:200])

        # ---------------------------------------------------------------
        print("\n9) Silme güvenliği")
        r = await c.post("/api/account/delete", json={"name": "x"})
        check("girişsiz silinemiyor (401)", r.status_code == 401, r.text[:120])
        r = await c.post("/api/account/delete", json={"password": "adminsifre"}, headers=hdr(admin_tok))
        check("yönetici hesabı silinemiyor", r.status_code == 400, r.text[:150])
        r = await c.get("/api/admin/users?status=deleted", headers=hdr(admin_tok))
        check("silinmişler süzgeci çalışıyor", len(r.json()["users"]) >= 3, str(len(r.json()["users"])))
        check("silinmiş satırda 'deleted' işareti var",
              all(u["deleted"] for u in r.json()["users"]))
        r = await c.put(f"/api/admin/users/{sil_id}/status",
                        json={"disabled": False}, headers=hdr(admin_tok))
        check("silinmiş hesap admin işlemine kapalı", r.status_code == 400, r.text[:150])

        # ---------------------------------------------------------------
        print("\n10) Uygulama dışı silme talebi (Google Play şartı)")
        r = await c.post("/api/support/tickets", json={
            "name": "Ayse Gul", "email": "ayse@ornek.com",
            "subject": "Hesap silme talebi", "message": "Bu bir HESAP SİLME talebidir.",
        })
        check("girişsiz talep bırakılabiliyor", r.status_code == 200, r.text[:200])
        r = await c.get("/api/admin/support?limit=5", headers=hdr(admin_tok))
        check("talep admin panelinde görünüyor",
              any("silme" in (t.get("subject") or "").lower() for t in r.json().get("tickets", [])),
              r.text[:250])

        # ---------------------------------------------------------------
        print("\n11) Mevcut uçlar bozulmadı")
        for path in ["/api/admin/settings", "/api/admin/moderation/counts",
                     "/api/admin/name-flags/counts", "/api/admin/quick-auth"]:
            r = await c.get(path, headers=hdr(admin_tok))
            check(f"{path} çalışıyor", r.status_code == 200, r.text[:120])
        r = await c.get("/api/admin/users?q=yonetim", headers=hdr(admin_tok))
        check("üye arama çalışıyor", len(r.json()["users"]) >= 1, r.text[:200])
        r = await c.put(f"/api/admin/users/{kalan_id}/ad-free", json={"enabled": True},
                        headers=hdr(admin_tok))
        check("reklamsız anahtarı çalışıyor", r.json()["user"]["ad_free"] is True, r.text[:150])
        r = await c.get("/api/notifications", headers=hdr(admin_tok))
        check("bildirimler çalışıyor", r.status_code == 200, r.text[:120])
        r = await c.post("/api/auth/quick", json={"name": "Son Kontrol"},
                         headers={"user-agent": UA_APP, "x-forwarded-for": "1.2.3.4"})
        check("isimle hesap açma çalışıyor", r.status_code == 200, r.text[:120])

    print(f"\n{'='*52}\nSONUÇ:  {OK} başarılı, {FAIL} başarısız\n{'='*52}")
    if DB_FILE.exists():
        DB_FILE.unlink()
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    asyncio.run(main())
