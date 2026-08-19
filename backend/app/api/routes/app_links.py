"""
Android App Links doğrulama dosyası — /.well-known/assetlinks.json

NE İŞE YARAR
------------
WhatsApp'tan gelen bir kelimetahmin.com linkine dokununca sayfanın TARAYICI
yerine UYGULAMADA açılması için Android şunu ister: uygulamanın sahibi olduğun
alan adında, uygulamanın paket adını ve imza parmak izini içeren bu dosya
yayınlanmış olsun. Android kurulumdan sonra dosyayı indirir, manifest'teki
intent-filter ile karşılaştırır ve tutuyorsa linkleri uygulamaya bağlar.

NEDEN STATİK DOSYA DEĞİL
------------------------
Parmak izi Play Console'dan alınır ve zamanla değişebilir (imza anahtarı
yenilenirse ya da yerel test anahtarı eklenmek istenirse). Statik dosya her
seferinde deploy gerektirirdi. Burada değer admin panelinden
(📱 Mobil & Reklam → 🔗 App Links) girilir ve ANINDA yayına girer.

DİKKAT — YÖNLENDİRME OLMAZ
--------------------------
Android bu dosyayı çekerken YÖNLENDİRME İZLEMEZ. intent-filter'da hangi alan
adları yazılıysa HER BİRİ bu dosyayı doğrudan (200 ile) vermek zorundadır.
Bizde apex (kelimetahmin.com) normalde www'ye 301 atıyor; bu yol için Traefik
tarafında ayrı bir kural var (sunucudaki dynamic dosyası).

PARMAK İZİ YOKKEN
-----------------
Boş liste (`[]`) döner. Bu geçerli bir JSON'dur: adres çalışır, doğrulama
yalnızca "eşleşme yok" der. Böylece parmak izi girilmeden önce de yolun
kurulduğu (Traefik + rewrite) sınanabilir.
"""

from __future__ import annotations

import json
import re

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

router = APIRouter(tags=["app-links"])

SETTING_KEY = "app.applinks"
DEFAULT_PACKAGE = "com.kelimetahmin.app"

# Kabul edilen biçim: 32 adet iki haneli onaltılık, aralarında iki nokta.
#   AB:CD:...:EF  (95 karakter)
_FINGERPRINT_RE = re.compile(r"^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$")

# App Links için gereken izin. "delegate_permission/common.handle_all_urls"
# demek: bu uygulama bu alan adının linklerini açabilir.
RELATION = "delegate_permission/common.handle_all_urls"


def normalize_fingerprint(raw: str) -> str | None:
    """Parmak izini standart hâle getirir; geçersizse None.

    Play Console kopyalarken boşluk/küçük harf gelebiliyor; iki nokta olmadan
    yapıştırılan 64 haneli hâli de kabul edilip araya iki nokta konur.
    """
    t = (raw or "").strip().upper().replace(" ", "")
    if not t:
        return None
    if re.fullmatch(r"[0-9A-F]{64}", t):
        t = ":".join(t[i:i + 2] for i in range(0, 64, 2))
    return t if _FINGERPRINT_RE.match(t) else None


async def read_config(db: AsyncSession) -> tuple[str, list[str]]:
    """(paket adı, geçerli parmak izleri) döner."""
    from sqlalchemy import text
    from app.api.routes.app_settings import _as_dict
    try:
        row = (await db.execute(
            text("SELECT value FROM app_settings WHERE key = :k"), {"k": SETTING_KEY}
        )).first()
        cfg = _as_dict(row[0]) if row else {}
    except Exception as e:
        # Tablo/satır henüz yoksa (ilk deploy) boş kabul edilir.
        print(f"[app-links] ayar okunamadı ({type(e).__name__}: {e})")
        cfg = {}
    package = str(cfg.get("package") or DEFAULT_PACKAGE).strip() or DEFAULT_PACKAGE
    raw = cfg.get("sha256") or []
    if isinstance(raw, str):
        raw = [raw]
    prints: list[str] = []
    for item in raw:
        fp = normalize_fingerprint(str(item))
        if fp and fp not in prints:
            prints.append(fp)
    return package, prints


@router.get("/app-links/assetlinks.json")
async def assetlinks(db: AsyncSession = Depends(get_db)):
    """Android'in indirdiği doğrulama dosyası.

    Sitede /.well-known/assetlinks.json adresinden servis edilir
    (frontend/next.config.js içindeki rewrite bu uca yönlendirir).
    """
    package, prints = await read_config(db)
    body: list[dict] = []
    if prints:
        body = [{
            "relation": [RELATION],
            "target": {
                "namespace": "android_app",
                "package_name": package,
                "sha256_cert_fingerprints": prints,
            },
        }]
    # Content-Type application/json OLMAK ZORUNDA — Android başka türü reddeder.
    # Cache: kısa tutuluyor ki panele yapıştırılan parmak izi hemen yayına girsin.
    return Response(
        content=json.dumps(body, indent=2),
        media_type="application/json",
        headers={"Cache-Control": "public, max-age=300"},
    )


@router.get("/app-links/status")
async def status(db: AsyncSession = Depends(get_db)):
    """Admin panelinin "kurulum tamam mı" göstergesi (parmak izini AÇMAZ)."""
    package, prints = await read_config(db)
    return {
        "package": package,
        "fingerprint_count": len(prints),
        "ready": len(prints) > 0,
        # Yalnız son 8 hane — panelde doğru olanı yapıştırdığını görebilsin,
        # ama tam değer gereksiz yere ekranda durmasın.
        "tails": [p[-8:] for p in prints],
    }
