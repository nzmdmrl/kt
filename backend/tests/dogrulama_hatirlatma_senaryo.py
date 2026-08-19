"""Doğrulama hatırlatması — senaryo testleri (CANLI VERİTABANINA DOKUNMAZ).

hizli_giris_senaryo.py ile aynı kurulum: geçici bir SQLite dosyası, bellekte
FastAPI uygulaması, gerçek HTTP istekleri. Zaman geçişi (7 gün sonra) gerçekten
beklenmez; `verify_reminders.first_sent_at` damgası geriye çekilerek taklit edilir.

Çalıştırma (backend dizininde):
    DATABASE_URL='sqlite+aiosqlite:///./test_hatirlatma.db' JWT_SECRET=test GAME_LANG=tr \\
        python tests/dogrulama_hatirlatma_senaryo.py
"""

from __future__ import annotations

import asyncio
import os
import pathlib
import sys

DB_FILE = pathlib.Path(__file__).with_name("test_hatirlatma.db")
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{DB_FILE}")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("GAME_LANG", "tr")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

_URL = os.environ["DATABASE_URL"]
assert "sqlite" in _URL or "kt_test" in _URL, (
    "TEST CANLI VERİTABANINDA ÇALIŞTIRILAMAZ."
)
if "sqlite" in _URL and DB_FILE.exists():
    DB_FILE.unlink()

import httpx  # noqa: E402
from datetime import datetime, timezone  # noqa: E402

from sqlalchemy import text  # noqa: E402

from app.main import app, on_startup  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.services import verify_reminder as vr  # noqa: E402

OK, FAIL = 0, 0

# "7 gün geçti" durumunu taklit etmek için kullanılan eski tarih.
# PostgreSQL metin kabul etmiyor -> gerçek datetime nesnesi verilir.
ESKI_TARIH = datetime(2020, 1, 1, tzinfo=timezone.utc)


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


async def tur() -> dict:
    """Hatırlatma döngüsünün BİR turunu elle çalıştırır."""
    async with AsyncSessionLocal() as db:
        return await vr.run_once(db)


async def oyun_say(uid: int, n: int) -> None:
    """Kullanıcının oynadığı 1v1 maç sayısını ayarlar."""
    await db_exec("UPDATE users SET matches_played = :n WHERE id = :i", n=n, i=uid)


async def bildirimler(uid: int) -> list[dict]:
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(text(
            "SELECT type_code, title, body, link, icon FROM notifications "
            "WHERE user_id = :i ORDER BY id"), {"i": uid})).all()
    return [{"type_code": r[0], "title": r[1], "body": r[2], "link": r[3], "icon": r[4]}
            for r in rows]


async def main() -> None:
    await on_startup()
    await set_setting("name_moderation_enabled", "0")
    # Test hesapları hep aynı IP'den açılıyor; kayıt sınırına takılmasın.
    await set_setting("quick_signup_ip_limit", "0")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:

        async def hizli(name: str) -> tuple[int, str]:
            r = await c.post("/api/auth/quick", json={"name": name})
            d = r.json()
            return d["user"]["id"], d["token"]

        # ---------------------------------------------------------------
        print("\n1) Bildirim türü kataloğa eklendi")
        row = await db_scalar(
            "SELECT COUNT(*) FROM notification_types WHERE code = 'verify_reminder'")
        check("tür katalogda var", row == 1, str(row))
        act = await db_scalar(
            "SELECT is_active FROM notification_types WHERE code = 'verify_reminder'")
        check("tür aktif (push gidebilir)", act in (1, True), str(act))
        grp = await db_scalar(
            "SELECT group_code FROM notification_types WHERE code = 'verify_reminder'")
        check("sistem/duyuru grubunda", grp == "system", str(grp))
        rt = await db_scalar(
            "SELECT route_template FROM notification_types WHERE code = 'verify_reminder'")
        check("rota /dogrula", rt == "/dogrula", str(rt))

        # Mevcut türler bozulmadı mı?
        eski = await db_scalar(
            "SELECT COUNT(*) FROM notification_types WHERE code IN "
            "('room_invite','arena_invite','friend_request','friend_accept',"
            " 'friend_reject','award_daily','award_monthly','award_yearly',"
            " 'arena_medal','title_up','challenge_offer','support_reply',"
            " 'system_announcement')")
        check("mevcut 13 tür yerinde duruyor", eski == 13, str(eski))

        # ---------------------------------------------------------------
        print("\n2) 3 maçtan az oynayana gitmiyor")
        az_id, az_tok = await hizli("Az Oynayan")
        await oyun_say(az_id, 2)
        s = await tur()
        check("hiç gönderilmedi", s["first"] == 0, str(s))
        check("bildirim listesi boş", len(await bildirimler(az_id)) == 0)

        # ---------------------------------------------------------------
        print("\n3) 3 maça ulaşınca hatırlatma düşüyor")
        await oyun_say(az_id, 3)
        s = await tur()
        check("bir hatırlatma gönderildi", s["first"] == 1, str(s))
        ns = await bildirimler(az_id)
        check("bildirim listesine düştü", len(ns) == 1, str(len(ns)))
        check("doğru tür kodu", ns[0]["type_code"] == "verify_reminder", ns[0]["type_code"])
        check("tıklayınca /dogrula açılır", ns[0]["link"] == "/dogrula", ns[0]["link"])
        check("metin doğrulamadan bahsediyor",
              "doğrular" in ns[0]["body"] or "doğrula" in ns[0]["title"].lower(),
              ns[0]["title"] + " / " + ns[0]["body"])

        # Kullanıcı zil listesinde görüyor mu? (push'tan bağımsız kanal)
        r = await c.get("/api/notifications", headers=hdr(az_tok))
        j = r.json()
        check("kullanıcı bildirimi kendi listesinde görüyor",
              any(n["type_code"] == "verify_reminder" for n in j["notifications"]), r.text)
        check("okunmamış sayacına yansıdı", j["unread"] >= 1, str(j["unread"]))

        # ---------------------------------------------------------------
        print("\n4) Aynı hatırlatma iki kez gitmiyor")
        s = await tur()
        check("ikinci turda gönderilmedi", s["first"] == 0, str(s))
        check("hâlâ tek bildirim", len(await bildirimler(az_id)) == 1)
        # Kullanıcı bildirimi silse bile tekrar gönderilmemeli — "gönderildi"
        # damgası ayrı tabloda (bildirimler 30 günde bir temizleniyor).
        await db_exec("DELETE FROM notifications WHERE user_id = :i", i=az_id)
        s = await tur()
        check("bildirim silinse de tekrar gönderilmiyor", s["first"] == 0, str(s))
        check("kalıcı damga duruyor",
              await db_scalar("SELECT COUNT(*) FROM verify_reminders WHERE user_id = :i",
                              i=az_id) == 1)

        # ---------------------------------------------------------------
        print("\n5) Doğrulamış kullanıcıya ASLA gitmiyor")
        dog_id, dog_tok = await hizli("Dogrulayan Kisi")
        await oyun_say(dog_id, 10)
        r = await c.post("/api/auth/verify",
                         json={"email": "dogrulayan@ornek.com", "password": "gizli123"},
                         headers=hdr(dog_tok))
        check("hesap doğrulandı", r.json().get("ok") is True, r.text)
        s = await tur()
        check("doğrulanmış hesaba gönderilmedi",
              len(await bildirimler(dog_id)) == 0, str(s))
        check("damga bile atılmadı",
              await db_scalar("SELECT COUNT(*) FROM verify_reminders WHERE user_id = :i",
                              i=dog_id) == 0)

        # E-postası olduğu hâlde bayrağı yanlış kalmış hesap (emniyet kemeri).
        await db_exec("UPDATE users SET verified = :v WHERE id = :i", v=False, i=dog_id)
        s = await tur()
        check("e-postası olan hesaba yine gitmiyor (emniyet kemeri)",
              len(await bildirimler(dog_id)) == 0, str(s))
        await db_exec("UPDATE users SET verified = :v WHERE id = :i", v=True, i=dog_id)

        # ---------------------------------------------------------------
        print("\n6) Ana anahtar kapalıyken gönderilmiyor")
        await set_setting("verify_reminder_enabled", "false")
        kapali_id, _ = await hizli("Kapali Test")
        await oyun_say(kapali_id, 5)
        s = await tur()
        check("kapalıyken gönderilmedi", s["first"] == 0, str(s))
        check("bildirim yok", len(await bildirimler(kapali_id)) == 0)
        await set_setting("verify_reminder_enabled", "true")
        s = await tur()
        check("tekrar açılınca gönderiliyor", s["first"] == 1, str(s))

        # ---------------------------------------------------------------
        print("\n7) Eşik admin ayarından okunuyor")
        await set_setting("verify_reminder_min_games", "10")
        esik_id, _ = await hizli("Esik Test")
        await oyun_say(esik_id, 5)
        s = await tur()
        check("5 maç 10 eşiğini geçmiyor", s["first"] == 0, str(s))
        await oyun_say(esik_id, 10)
        s = await tur()
        check("10 maçta gönderiliyor", s["first"] == 1, str(s))
        await set_setting("verify_reminder_min_games", "3")

        # Arena ve maraton da sayılıyor mu?
        karma_id, _ = await hizli("Karma Oyuncu")
        await db_exec("UPDATE users SET matches_played = 1, arena_played = 1, "
                      "solo_matches = 1 WHERE id = :i", i=karma_id)
        s = await tur()
        check("1v1 + arena + maraton toplamı sayılıyor", s["first"] == 1, str(s))

        # ---------------------------------------------------------------
        print("\n8) İkinci hatırlatma — admin açana kadar PASİF")
        # az_id 7 günden eski bir birinci hatırlatmaya sahipmiş gibi yapalım.
        await db_exec(
            "UPDATE verify_reminders SET first_sent_at = :d WHERE user_id = :i",
            d=ESKI_TARIH, i=az_id)
        s = await tur()
        check("kapalıyken 7 gün geçse de gönderilmiyor", s["second"] == 0, str(s))
        check("bildirim yok", len(await bildirimler(az_id)) == 0)

        await set_setting("verify_reminder_2_enabled", "true")
        s = await tur()
        check("admin açınca gönderiliyor", s["second"] == 1, str(s))
        ns = await bildirimler(az_id)
        check("ikinci hatırlatma listeye düştü", len(ns) == 1, str(len(ns)))
        check("ikinci metin farklı", "hâlâ" in ns[0]["title"].lower(), ns[0]["title"])
        check("yine /dogrula'ya gidiyor", ns[0]["link"] == "/dogrula")
        s = await tur()
        check("ikinci de iki kez gitmiyor", s["second"] == 0, str(s))

        # ---------------------------------------------------------------
        print("\n9) Süre dolmadan ikinci hatırlatma gitmiyor")
        yeni_id, _ = await hizli("Yeni Hatirlatma")
        await oyun_say(yeni_id, 3)
        s = await tur()
        check("birinci gönderildi", s["first"] == 1, str(s))
        s = await tur()
        check("hemen ardından ikinci gitmiyor (7 gün dolmadı)", s["second"] == 0, str(s))

        # ---------------------------------------------------------------
        print("\n10) Arada doğrulayanın ikinci hatırlatması iptal oluyor")
        ipt_id, ipt_tok = await hizli("Iptal Testi")
        await oyun_say(ipt_id, 3)
        s = await tur()
        check("birinci hatırlatma gitti", s["first"] == 1, str(s))
        # Kullanıcı hesabını doğruluyor.
        r = await c.post("/api/auth/verify",
                         json={"email": "iptal@ornek.com", "password": "gizli123"},
                         headers=hdr(ipt_tok))
        check("kullanıcı doğruladı", r.json().get("ok") is True, r.text)
        # Süre dolmuş gibi yapalım — yine de gitmemeli.
        await db_exec(
            "UPDATE verify_reminders SET first_sent_at = :d WHERE user_id = :i",
            d=ESKI_TARIH, i=ipt_id)
        s = await tur()
        check("bekleyen ikinci hatırlatma iptal edildi", s["cancelled"] == 1, str(s))
        check("ikinci hatırlatma gönderilmedi", s["second"] == 0, str(s))
        check("iptal damgası atıldı",
              await db_scalar("SELECT cancelled_at IS NOT NULL FROM verify_reminders "
                              "WHERE user_id = :i", i=ipt_id) in (1, True))
        before = len(await bildirimler(ipt_id))
        s = await tur()
        check("sonraki turlarda da gönderilmiyor",
              s["second"] == 0 and len(await bildirimler(ipt_id)) == before, str(s))

        # ---------------------------------------------------------------
        print("\n11) Push kapalı olsa da iç bildirim düşüyor")
        pk_id, pk_tok = await hizli("Push Kapali")
        await oyun_say(pk_id, 3)
        # Kullanıcı tüm push'u kapatıyor.
        r = await c.put("/api/me/push-preferences",
                        json={"push_master": False}, headers=hdr(pk_tok))
        check("push ana anahtarı kapatıldı", r.status_code == 200, r.text)
        s = await tur()
        check("hatırlatma yine oluşturuldu", s["first"] == 1, str(s))
        r = await c.get("/api/notifications", headers=hdr(pk_tok))
        check("push kapalı kullanıcı bildirimi listede görüyor",
              any(n["type_code"] == "verify_reminder" for n in r.json()["notifications"]),
              r.text)

        # Tür bazlı tercihini kapatan kullanıcı da iç bildirimi görür.
        tk_id, tk_tok = await hizli("Tur Kapali")
        await oyun_say(tk_id, 3)
        r = await c.put("/api/me/push-preferences",
                        json={"prefs": {"verify_reminder": False}}, headers=hdr(tk_tok))
        check("tür bazlı push kapatıldı", r.status_code == 200, r.text)
        await tur()
        r = await c.get("/api/notifications", headers=hdr(tk_tok))
        check("tür kapalı olsa da iç bildirim var",
              any(n["type_code"] == "verify_reminder" for n in r.json()["notifications"]),
              r.text)

        # ---------------------------------------------------------------
        print("\n12) Kullanıcı ayar sayfasında türü görüyor (kapatabilsin)")
        r = await c.get("/api/notification-types", headers=hdr(pk_tok))
        j = r.json()
        codes = [t["code"] for g in j.get("groups", []) for t in g.get("types", [])]
        if not codes:   # yanıt biçimi düz liste ise
            codes = [t.get("code") for t in j.get("types", [])]
        check("verify_reminder ayar sayfasında listeleniyor",
              "verify_reminder" in codes, str(codes)[:200])

        # ---------------------------------------------------------------
        print("\n13) Mevcut bildirim akışı bozulmadı")
        # Örnek bir mevcut tür (arkadaşlık isteği) hâlâ bildirim üretiyor mu?
        a_id, a_tok = await hizli("Arkadas Bir")
        b_id, b_tok = await hizli("Arkadas Iki")
        r = await c.post(f"/api/friends/request/{b_id}", headers=hdr(a_tok))
        check("arkadaşlık isteği gönderildi", r.status_code == 200, r.text)
        r = await c.get("/api/notifications", headers=hdr(b_tok))
        check("karşı tarafa bildirim düştü",
              any(n["type_code"] == "friend_request" for n in r.json()["notifications"]),
              r.text)

    print(f"\n{'='*52}\nSONUÇ:  {OK} başarılı, {FAIL} başarısız\n{'='*52}")
    if DB_FILE.exists():
        DB_FILE.unlink()
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    asyncio.run(main())
