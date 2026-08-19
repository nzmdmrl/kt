"""
Ortam (platform) tespiti — istek hangi cihazdan geldi?

Üç değer üretilir:
  "app"     -> mobil UYGULAMA. Capacitor kabuğu user agent'a "KelimeApp/"
               ekliyor (mobile/capacitor.config.ts → appendUserAgent), tek
               güvenilir işaret budur.
  "mobile"  -> mobil TARAYICI (telefondan siteye girmiş)
  "desktop" -> masaüstü tarayıcı

Neden sunucuda: admin özet sayıları ve üye listesindeki cihaz simgesi için
istemciye güvenmek gerekmesin diye. Frontend'deki lib/platform.tsx aynı
"KelimeApp/" işaretine bakar — iki taraf aynı kuralı kullanır.
"""

from __future__ import annotations

APP_MARKER = "KelimeApp/"

# Mobil tarayıcı işaretleri (yaygın olanlar; kesinlik gerekmiyor, sayım için).
_MOBILE_HINTS = (
    "Mobi", "Android", "iPhone", "iPad", "iPod", "Windows Phone", "Opera Mini",
)


def platform_from_ua(user_agent: str | None) -> str:
    ua = user_agent or ""
    if APP_MARKER in ua:
        return "app"
    if any(h in ua for h in _MOBILE_HINTS):
        return "mobile"
    return "desktop"


def platform_from_request(request) -> str:
    """FastAPI Request'ten ortamı çıkarır."""
    try:
        return platform_from_ua(request.headers.get("user-agent"))
    except Exception:
        return "desktop"
