"""Günün Kelimesi günlük bildirimi — senaryo testleri.

Metin üretimi (ipucu kutuları), alıcı süzgeci (son N gün aktif), saat penceresi,
günde tek gönderim damgası ve admin uçları.

CANLI VERİTABANINA DOKUNMAZ: geçici SQLite dosyası, bellekte FastAPI.
Push gönderimi TAKLİT EDİLİR (gerçek FCM çağrısı yapılmaz).

Çalıştırma (backend dizininde):
    DATABASE_URL='sqlite+aiosqlite:///./test_gunluk.db' JWT_SECRET=test GAME_LANG=tr \\
        python tests/gunun_kelimesi_bildirimi_senaryo.py
"""

from __future__ import annotations

import asyncio
import os
import pathlib
import sys

DB_FILE = pathlib.Path(__file__).with_name("test_gunluk.db")
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{DB_FILE}")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("GAME_LANG", "tr")
os.environ.pop("OPENAI_API_KEY", None)
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

_URL = os.environ["DATABASE_URL"]
assert "sqlite" in _URL or "kt_test" in _URL, "TEST CANLI VERİTABANINDA ÇALIŞTIRILAMAZ."
if "sqlite" in _URL and DB_FILE.exists():
    DB_FILE.unlink()

from datetime import datetime, timedelta, timezone  # noqa: E402

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

    from app.services import daily_word_push as svc

    # Push GÖNDERİMİ taklit edilir: gerçek FCM yok, kime gidildiği kaydedilir.
    gonderilenler: list[tuple[int, str, str]] = []

    async def sahte_send(db, user_id, type_code, title, body, route, ctx=None):
        gonderilenler.append((user_id, title, body))
        return {"sent": 1}

    import app.services.push as push_mod
    push_mod.send_to_user = sahte_send   # svc içeride bu modülden alıyor

    print("\n1) İpucu metni")
    check("ilk ve son harf açık, arası kutu", svc.hint_for("KALEM", "⬜") == "K⬜⬜⬜M")
    check("4 harfli kelime", svc.hint_for("MASA", "⬜") == "M⬜⬜A")
    check("2 harfli kelimede kutu yok", svc.hint_for("AL", "⬜") == "AL")
    check("boş kelime patlatmıyor", svc.hint_for("", "⬜") == "")
    check("kutu simgesi değiştirilebiliyor", svc.hint_for("KALEM", "▫") == "K▫▫▫M")

    print("\n2) Yer tutucular")
    r = svc.render("Günün Kelimesi {kelime} bulabildin mi?", "KALEM", "⬜")
    check("{kelime} dolduruldu", r == "Günün Kelimesi K⬜⬜⬜M bulabildin mi?", r)
    check("{ilk} ve {son}", svc.render("{ilk}-{son}", "KALEM", "⬜") == "K-M")
    check("{uzunluk}", svc.render("{uzunluk} harf", "KALEM", "⬜") == "5 harf")
    check("yer tutucusuz metin aynen kalır",
          svc.render("Bugün de bir kelime var!", "KALEM", "⬜") == "Bugün de bir kelime var!")
    check("bilinmeyen yer tutucu bozmuyor",
          svc.render("{yok} {kelime}", "KALEM", "⬜") == "{yok} K⬜⬜⬜M")

    print("\n3) Varsayılan metinler seed edildi")
    n = await db_scalar("SELECT COUNT(*) FROM daily_push_messages")
    check("5 metin seed edildi", n == 5, str(n))
    async with AsyncSessionLocal() as db:
        secim = await svc.pick_message(db)
    check("rastgele metin seçiliyor", isinstance(secim, str) and len(secim) > 5, secim)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        # Aktif kullanıcı + eski kullanıcı + pasif kullanıcı
        async def hesap(ad: str, ip: str) -> tuple[int, str]:
            r = await c.post("/api/auth/quick", json={"name": ad},
                             headers={"user-agent": UA, "x-forwarded-for": ip})
            return r.json()["user"]["id"], r.json()["token"]

        aktif_id, aktif_tok = await hesap("Aktif Kisi", "4.4.4.1")
        eski_id, _ = await hesap("Eski Kisi", "4.4.4.2")
        pasif_id, _ = await hesap("Pasif Kisi", "4.4.4.3")
        admin_id, admin_tok = await hesap("Yonetici Kisi", "4.4.4.4")
        await db_exec("UPDATE users SET is_admin = :v WHERE id = :i", v=True, i=admin_id)

        print("\n4) Aktiflik damgası")
        r = await c.post("/api/presence/heartbeat", headers=hdr(aktif_tok))
        check("heartbeat son aktifliği yazıyor",
              await db_scalar("SELECT last_active_at FROM users WHERE id=:i", i=aktif_id) is not None)

        now = datetime.now(timezone.utc)
        await db_exec("UPDATE users SET last_active_at = :t WHERE id = :i",
                      t=now - timedelta(days=45), i=eski_id)
        await db_exec("UPDATE users SET last_active_at = :t, disabled = :d WHERE id = :i",
                      t=now, d=True, i=pasif_id)
        await db_exec("UPDATE users SET last_active_at = :t WHERE id = :i", t=now, i=admin_id)

        async with AsyncSessionLocal() as db:
            alicilar = await svc.recipients(db)
        check("aktif kullanıcı listede", aktif_id in alicilar, str(alicilar))
        check("45 gün önce görülen listede DEĞİL", eski_id not in alicilar, str(alicilar))
        check("pasife alınan listede DEĞİL", pasif_id not in alicilar, str(alicilar))

        print("\n5) Saat penceresi ve günde tek gönderim")
        await set_setting("daily_word_push_enabled", "0")
        async with AsyncSessionLocal() as db:
            res = await svc.run_once(db)
        check("ayar kapalıyken gönderim yok", res.get("skipped") == "disabled", str(res))

        await set_setting("daily_word_push_enabled", "1")
        await set_setting("daily_word_push_hour", "10")
        sabah = datetime(2026, 8, 20, 5, 0, tzinfo=timezone.utc)      # TR 08:00
        async with AsyncSessionLocal() as db:
            res = await svc.run_once(db, now=sabah)
        check("saat gelmeden gönderilmiyor", res.get("skipped") == "outside_window", str(res))

        gece = datetime(2026, 8, 20, 20, 0, tzinfo=timezone.utc)      # TR 23:00
        async with AsyncSessionLocal() as db:
            res = await svc.run_once(db, now=gece)
        check("pencere geçtiyse gönderilmiyor", res.get("skipped") == "outside_window", str(res))

        gonderilenler.clear()
        onda = datetime(2026, 8, 20, 7, 5, tzinfo=timezone.utc)       # TR 10:05
        async with AsyncSessionLocal() as db:
            res = await svc.run_once(db, now=onda)
        check("saatinde gönderildi", res.get("sent", 0) >= 1, str(res))
        gidenler = {u for u, _, _ in gonderilenler}
        check("aktif kullanıcıya gitti", aktif_id in gidenler, str(gidenler))
        check("eski kullanıcıya gitmedi", eski_id not in gidenler, str(gidenler))
        check("pasif kullanıcıya gitmedi", pasif_id not in gidenler, str(gidenler))
        check("metinde kutu var", any("⬜" in b for _, _, b in gonderilenler),
              str(gonderilenler[:2]))
        check("başlık ayardan geliyor", all(t == "Günün Kelimesi" for _, t, _ in gonderilenler))

        gonderilenler.clear()
        async with AsyncSessionLocal() as db:
            res = await svc.run_once(db, now=onda)
        check("aynı gün ikinci kez gönderilmiyor", res.get("skipped") == "already_sent", str(res))
        check("hiç push atılmadı", not gonderilenler, str(gonderilenler))

        ertesi = datetime(2026, 8, 21, 7, 5, tzinfo=timezone.utc)
        async with AsyncSessionLocal() as db:
            res = await svc.run_once(db, now=ertesi)
        check("ertesi gün yeniden gönderiliyor", res.get("sent", 0) >= 1, str(res))

        print("\n6) Admin uçları")
        r = await c.get("/api/admin/daily-push", headers=hdr(admin_tok))
        d = r.json()
        check("panel verisi geliyor", r.status_code == 200, r.text[:150])
        check("metinler listeleniyor", len(d["messages"]) == 5, str(len(d.get("messages", []))))
        check("önizleme ipucu içeriyor", "⬜" in d["preview"] or "⬜" in d["hint"], str(d)[:200])
        check("alıcı sayısı dönüyor", isinstance(d["recipients"], int), str(d)[:200])

        r = await c.put("/api/admin/daily-push", json={"key": "daily_word_push_hour", "value": "9"},
                        headers=hdr(admin_tok))
        check("saat değiştirilebiliyor", r.json()["hour"] == 9, r.text[:150])
        r = await c.put("/api/admin/daily-push", json={"key": "daily_word_push_hour", "value": "99"},
                        headers=hdr(admin_tok))
        check("geçersiz saat kırpılıyor", r.json()["hour"] == 23, r.text[:150])
        r = await c.put("/api/admin/daily-push", json={"key": "yok", "value": "1"},
                        headers=hdr(admin_tok))
        check("bilinmeyen ayar reddediliyor", r.status_code == 400, r.text[:150])

        r = await c.post("/api/admin/daily-push/messages",
                         json={"text": "Yeni metin {kelime} ne dersin?"}, headers=hdr(admin_tok))
        yeni_id = r.json()["message"]["id"]
        check("yeni metin eklendi", r.status_code == 200, r.text[:150])
        r = await c.post("/api/admin/daily-push/messages", json={"text": "   "}, headers=hdr(admin_tok))
        check("boş metin reddedildi", r.status_code == 400, r.text[:150])

        r = await c.put(f"/api/admin/daily-push/messages/{yeni_id}", json={"active": False},
                        headers=hdr(admin_tok))
        check("metin pasifleştirildi", r.json()["message"]["active"] is False, r.text[:150])
        async with AsyncSessionLocal() as db:
            for _ in range(15):
                check_text = await svc.pick_message(db)
                if "Yeni metin" in check_text:
                    break
            else:
                check_text = ""
        check("pasif metin seçilmiyor", "Yeni metin" not in check_text, check_text)

        r = await c.delete(f"/api/admin/daily-push/messages/{yeni_id}", headers=hdr(admin_tok))
        check("metin silindi", r.status_code == 200, r.text[:150])
        r = await c.delete(f"/api/admin/daily-push/messages/{yeni_id}", headers=hdr(admin_tok))
        check("olmayan metin 404", r.status_code == 404, r.text[:150])

        gonderilenler.clear()
        r = await c.post("/api/admin/daily-push/test", headers=hdr(admin_tok))
        check("deneme gönderimi çalışıyor", r.status_code == 200, r.text[:150])
        check("deneme YALNIZ admine gitti",
              [u for u, _, _ in gonderilenler] == [admin_id], str(gonderilenler))

        r = await c.get("/api/admin/daily-push", headers=hdr(aktif_tok))
        check("normal kullanıcı panele giremiyor", r.status_code in (401, 403), r.text[:120])

        print("\n7) Katalog satırı hazır")
        row = await db_scalar("SELECT is_active FROM notification_types WHERE code='daily_reminder'")
        check("daily_reminder türü aktif", bool(row), str(row))
        row = await db_scalar("SELECT default_enabled FROM notification_types WHERE code='daily_reminder'")
        check("varsayılan açık", bool(row), str(row))
        row = await db_scalar("SELECT route_template FROM notification_types WHERE code='daily_reminder'")
        check("rota günün kelimesine gidiyor", row == "/gunun-kelimesi", str(row))

    print(f"\n{'='*52}\nSONUÇ:  {OK} başarılı, {FAIL} başarısız\n{'='*52}")
    if DB_FILE.exists():
        DB_FILE.unlink()
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    asyncio.run(main())
