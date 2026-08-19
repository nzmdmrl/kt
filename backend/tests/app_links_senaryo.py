"""App Links (assetlinks.json) — senaryo testleri (CANLI VERİTABANINA DOKUNMAZ).

Çalıştırma (backend dizininde):
    DATABASE_URL='sqlite+aiosqlite:///./test_al.db' JWT_SECRET=test GAME_LANG=tr \\
        python tests/app_links_senaryo.py
"""

from __future__ import annotations

import asyncio
import json
import os
import pathlib
import sys

DB_FILE = pathlib.Path(__file__).with_name("test_al.db")
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{DB_FILE}")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("GAME_LANG", "tr")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

_URL = os.environ["DATABASE_URL"]
assert "sqlite" in _URL or "kt_test" in _URL, "TEST CANLI VERİTABANINDA ÇALIŞTIRILAMAZ."
if "sqlite" in _URL and DB_FILE.exists():
    DB_FILE.unlink()

import httpx  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.main import app, on_startup  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.api.routes.app_links import normalize_fingerprint, RELATION  # noqa: E402

OK, FAIL = 0, 0

# Gerçek biçimde örnek parmak izleri (uydurma değerler).
FP1 = "AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89"
FP2 = "11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF"


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


async def db_exec(sql: str, **params) -> None:
    async with AsyncSessionLocal() as db:
        await db.execute(text(sql), params)
        await db.commit()


async def main() -> None:
    await on_startup()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:

        # ---------------------------------------------------------------
        print("\n1) Parmak izi normalleştirme")
        check("iki noktalı biçim kabul", normalize_fingerprint(FP1) == FP1)
        check("küçük harf düzeltilir", normalize_fingerprint(FP1.lower()) == FP1)
        check("baş/son boşluk atılır", normalize_fingerprint(f"  {FP1}  ") == FP1)
        check("aradaki boşluklar atılır",
              normalize_fingerprint(FP1.replace(":", " : ")) == FP1)
        duz = FP1.replace(":", "")
        check("iki noktasız 64 hane kabul (araya eklenir)",
              normalize_fingerprint(duz) == FP1, str(normalize_fingerprint(duz)))
        check("boş değer reddedilir", normalize_fingerprint("") is None)
        check("kısa değer reddedilir", normalize_fingerprint("AB:CD") is None)
        check("geçersiz karakter reddedilir",
              normalize_fingerprint(FP1[:-1] + "Z") is None)

        # ---------------------------------------------------------------
        print("\n2) Parmak izi YOKKEN adres yine de çalışıyor")
        r = await c.get("/api/app-links/assetlinks.json")
        check("HTTP 200", r.status_code == 200, r.text[:120])
        check("içerik türü application/json",
              r.headers["content-type"].startswith("application/json"),
              r.headers.get("content-type", ""))
        check("boş dizi dönüyor (geçerli JSON)", r.json() == [], r.text[:120])

        r = await c.get("/api/app-links/status")
        check("durum ucu 'hazır değil' diyor", r.json()["ready"] is False, r.text[:150])
        check("paket adı varsayılan",
              r.json()["package"] == "com.kelimetahmin.app", r.text[:150])

        # ---------------------------------------------------------------
        print("\n3) Admin parmak izi giriyor")
        r = await c.post("/api/auth/register",
                         json={"email": "admin@ornek.com", "password": "adminsifre",
                               "display_name": "Yonetim Hesabi"},
                         headers={"x-forwarded-for": "9.9.9.1"})
        admin_tok = r.json()["token"]
        await db_exec("UPDATE users SET is_admin=:v WHERE email='admin@ornek.com'", v=True)

        r = await c.get("/api/admin/app-settings", headers=hdr(admin_tok))
        keys = [x["key"] for x in r.json()["settings"]]
        check("app.applinks ayarı panelde var", "app.applinks" in keys, str(keys))
        etiket = next(x["label"] for x in r.json()["settings"] if x["key"] == "app.applinks")
        check("okunur etiketi var", "App Links" in etiket, etiket)

        r = await c.put("/api/admin/app-settings/app.applinks",
                        json={"value": {"package": "com.kelimetahmin.app",
                                        "sha256": [FP1.lower()]}},
                        headers=hdr(admin_tok))
        check("kaydedildi", r.status_code == 200, r.text[:150])

        r = await c.get("/api/app-links/assetlinks.json")
        body = r.json()
        check("dosya artık dolu", len(body) == 1, r.text[:200])
        check("ilişki doğru", body[0]["relation"] == [RELATION], r.text[:200])
        check("namespace android_app", body[0]["target"]["namespace"] == "android_app")
        check("paket adı doğru",
              body[0]["target"]["package_name"] == "com.kelimetahmin.app", r.text[:200])
        check("parmak izi BÜYÜK HARFE çevrildi",
              body[0]["target"]["sha256_cert_fingerprints"] == [FP1], r.text[:250])

        # ---------------------------------------------------------------
        print("\n4) Birden fazla parmak izi (Play + yükleme anahtarı)")
        r = await c.put("/api/admin/app-settings/app.applinks",
                        json={"value": {"package": "com.kelimetahmin.app",
                                        "sha256": [FP1, FP2, FP1, "  ", "GEÇERSİZ"]}},
                        headers=hdr(admin_tok))
        check("kaydedildi", r.status_code == 200, r.text[:150])
        body = (await c.get("/api/app-links/assetlinks.json")).json()
        fps = body[0]["target"]["sha256_cert_fingerprints"]
        check("iki geçerli parmak izi var", fps == [FP1, FP2], str(fps))
        check("tekrar eden atıldı", len(fps) == 2)
        check("geçersiz olanlar atıldı", "GEÇERSİZ" not in json.dumps(fps))
        r = await c.get("/api/app-links/status")
        check("durum 'hazır'", r.json()["ready"] is True, r.text[:150])
        check("sayı doğru", r.json()["fingerprint_count"] == 2, r.text[:150])
        check("durum ucu tam parmak izini AÇMIYOR",
              FP1 not in r.text and FP2 not in r.text, r.text[:200])

        # ---------------------------------------------------------------
        print("\n5) Paket adı panelden değiştirilebiliyor")
        r = await c.put("/api/admin/app-settings/app.applinks",
                        json={"value": {"package": "com.baska.paket", "sha256": [FP1]}},
                        headers=hdr(admin_tok))
        body = (await c.get("/api/app-links/assetlinks.json")).json()
        check("yeni paket adı yansıdı",
              body[0]["target"]["package_name"] == "com.baska.paket", str(body)[:200])
        # geri al
        await c.put("/api/admin/app-settings/app.applinks",
                    json={"value": {"package": "com.kelimetahmin.app", "sha256": [FP1]}},
                    headers=hdr(admin_tok))

        # ---------------------------------------------------------------
        print("\n6) Erişim ve mevcut akışlar")
        r = await c.get("/api/app-links/assetlinks.json")
        check("dosya GİRİŞSİZ erişilebiliyor (Android'in gerektirdiği)",
              r.status_code == 200, r.text[:120])
        r = await c.get("/api/app-config")
        check("app.applinks public app-config'e SIZMIYOR",
              "applinks" not in r.text, r.text[:200])
        r = await c.get("/api/admin/app-settings")
        check("admin ucu yetkisiz erişime kapalı", r.status_code == 401, r.text[:120])
        for path in ["/api/health", "/api/auth/quick/status", "/api/home/appearance"]:
            r = await c.get(path)
            check(f"{path} çalışıyor", r.status_code == 200, r.text[:100])

    print(f"\n{'='*52}\nSONUÇ:  {OK} başarılı, {FAIL} başarısız\n{'='*52}")
    if DB_FILE.exists():
        DB_FILE.unlink()
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    asyncio.run(main())
