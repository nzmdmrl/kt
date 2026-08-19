"""Maraton jokeri — senaryo testleri.

Ayar açıkken joker hakkı geliyor mu, harf gerçekten hedeften mi açılıyor,
hak bitince duruyor mu, kapalıyken tamamen kapalı mı?

CANLI VERİTABANINA DOKUNMAZ: geçici SQLite dosyası, bellekte FastAPI.

Çalıştırma (backend dizininde):
    DATABASE_URL='sqlite+aiosqlite:///./test_maraton.db' JWT_SECRET=test GAME_LANG=tr \\
        python tests/maraton_joker_senaryo.py
"""

from __future__ import annotations

import asyncio
import os
import pathlib
import sys

DB_FILE = pathlib.Path(__file__).with_name("test_maraton.db")
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


async def set_setting(key: str, value: str) -> None:
    from app.game import settings_service
    async with AsyncSessionLocal() as db:
        await settings_service.set_setting(db, key, value)


async def main() -> None:
    await on_startup()
    await set_setting("name_moderation_enabled", "0")
    await set_setting("quick_signup_ip_limit", "0")
    await set_setting("name_check_enabled", "false")

    from app.game import solo_service
    from app.api.routes.solo import _joker_used

    print("\n1) Açılma sırası deterministik")
    o1 = solo_service.joker_reveal_order(7, 3, 0, 5)
    o2 = solo_service.joker_reveal_order(7, 3, 0, 5)
    check("aynı tohum aynı sırayı verir", o1 == o2, f"{o1} / {o2}")
    check("ilk harf (0) sırada yok", 0 not in o1, str(o1))
    check("tüm diğer konumlar var", sorted(o1) == [1, 2, 3, 4], str(o1))
    check("tek harflik kelimede patlamıyor", solo_service.joker_reveal_order(1, 1, 0, 1) == [])

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/api/auth/quick", json={"name": "Maraton Kisi"},
                         headers={"user-agent": UA, "x-forwarded-for": "3.3.3.3"})
        uid, tok = r.json()["user"]["id"], r.json()["token"]

        print("\n2) Ayar KAPALIYKEN (varsayılan) joker yok")
        await set_setting("solo_jokers_enabled", "0")
        r = await c.post("/api/solo/level/1/start", headers=hdr(tok))
        check("start çalışıyor", r.status_code == 200, r.text[:150])
        check("joker hakkı 0 dönüyor", r.json()["joker_count"] == 0, r.text[:200])
        r = await c.post("/api/solo/level/1/joker", headers=hdr(tok))
        check("joker ucu kapalı", r.status_code == 400, r.text[:150])

        print("\n3) Ayar AÇIKKEN joker geliyor")
        await set_setting("solo_jokers_enabled", "1")
        await set_setting("solo_joker_per_level", "2")
        r = await c.post("/api/solo/level/1/start", headers=hdr(tok))
        check("joker hakkı ayardan geliyor", r.json()["joker_count"] == 2, r.text[:200])

        hedef = solo_service.solo_word(uid, 1, 0, "tr")
        r = await c.post("/api/solo/level/1/joker", headers=hdr(tok))
        d1 = r.json()
        check("birinci joker çalıştı", r.status_code == 200, r.text[:200])
        check("harf gerçekten hedeften", d1["letter"] == hedef[d1["index"]], f"{d1} / {hedef}")
        check("ilk harf açılmıyor (zaten ipucu)", d1["index"] != 0, str(d1))
        check("kalan hak 1", d1["left"] == 1, str(d1))

        r = await c.post("/api/solo/level/1/joker", headers=hdr(tok))
        d2 = r.json()
        check("ikinci joker çalıştı", r.status_code == 200, r.text[:200])
        check("farklı bir harf açıldı", d2["index"] != d1["index"], f"{d1} / {d2}")
        check("harf yine hedeften", d2["letter"] == hedef[d2["index"]], f"{d2} / {hedef}")
        check("kalan hak 0", d2["left"] == 0, str(d2))

        r = await c.post("/api/solo/level/1/joker", headers=hdr(tok))
        check("hak bitince reddediliyor", r.status_code == 400, r.text[:150])

        print("\n4) Sayfa yenilense de ipuçları tutarlı")
        _joker_used.clear()                      # sunucu yeniden başladı gibi
        r = await c.post("/api/solo/level/1/joker", headers=hdr(tok))
        check("aynı harf yeniden açılıyor", r.json()["index"] == d1["index"], r.text[:200])

        print("\n5) Sınırlar")
        r = await c.post("/api/solo/level/5/joker", headers=hdr(tok))
        check("kilitli bölümde joker yok", r.status_code == 403, r.text[:150])
        r = await c.post("/api/solo/level/1/joker", headers={"user-agent": UA})
        check("jetonsuz istek reddedildi", r.status_code in (401, 403), r.text[:150])
        await set_setting("solo_joker_per_level", "0")
        r = await c.post("/api/solo/level/1/joker", headers=hdr(tok))
        check("hak 0 ayarlanırsa kapalı", r.status_code == 400, r.text[:150])
        r = await c.post("/api/solo/level/1/start", headers=hdr(tok))
        check("start da 0 dönüyor", r.json()["joker_count"] == 0, r.text[:200])

        print("\n6) Bölüm oynanışı bozulmadı")
        await set_setting("solo_joker_per_level", "1")
        r = await c.post("/api/solo/level/1/start", headers=hdr(tok))
        check("start yine çalışıyor", r.status_code == 200, r.text[:150])
        r = await c.post("/api/solo/level/1/guess", json={"guess": hedef}, headers=hdr(tok))
        check("doğru tahmin kabul edildi", r.json().get("correct") is True, r.text[:200])
        r = await c.post("/api/solo/level/1/finish", json={"seconds_left": 100}, headers=hdr(tok))
        check("bölüm bitirilebiliyor", r.status_code == 200 and r.json()["stars"] >= 1, r.text[:200])
        check("bitişte joker sayacı temizlendi",
              all(k[1] != 1 for k in _joker_used), str(list(_joker_used)))

        print("\n7) Tekrar oynayışta yeni kelime + yeni joker hakkı")
        r = await c.post("/api/solo/level/1/start", headers=hdr(tok))
        check("tekrar oynanıyor", r.json()["replay"] is True, r.text[:200])
        check("joker hakkı yenilendi", r.json()["joker_count"] == 1, r.text[:200])
        # Tekrar oynayışta deneme numarası 2 olur (start/guess/joker aynı hesabı
        # kullanır: kayıtlı attempts + 1).
        yeni_hedef = solo_service.solo_word(uid, 1, 2, "tr")
        r = await c.post("/api/solo/level/1/joker", headers=hdr(tok))
        check("joker yeni kelimeye göre açıyor",
              r.json()["letter"] == yeni_hedef[r.json()["index"]], f"{r.text[:150]} / {yeni_hedef}")

    print(f"\n{'='*52}\nSONUÇ:  {OK} başarılı, {FAIL} başarısız\n{'='*52}")
    if DB_FILE.exists():
        DB_FILE.unlink()
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    asyncio.run(main())
