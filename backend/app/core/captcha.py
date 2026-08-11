"""
reCAPTCHA v2 ("Ben robot değilim") doğrulaması.

Frontend checkbox'tan aldığı token'ı kayıt isteğiyle birlikte gönderir; burada
Google'ın siteverify ucuna sorulur. RECAPTCHA_SITE_KEY/RECAPTCHA_SECRET boşsa
özellik kapalıdır ve doğrulama atlanır (geliştirme/test ortamı bozulmasın).
"""

from __future__ import annotations

import httpx

from app.core.config import get_settings

VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify"


class CaptchaError(Exception):
    pass


async def verify_captcha(token: str | None, remote_ip: str | None = None) -> None:
    """Token geçersizse CaptchaError fırlatır. Özellik kapalıysa hiçbir şey yapmaz."""
    settings = get_settings()
    if not settings.recaptcha_configured:
        return
    if not token:
        raise CaptchaError("Lütfen 'Ben robot değilim' doğrulamasını tamamla.")

    payload = {"secret": settings.RECAPTCHA_SECRET, "response": token}
    if remote_ip:
        payload["remoteip"] = remote_ip
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(VERIFY_URL, data=payload)
        data = resp.json()
    except Exception:
        # Google'a ulaşılamıyorsa kaydı bloklama — kullanıcıyı cezalandırmayalım.
        return

    if not data.get("success"):
        codes = data.get("error-codes") or []
        if "timeout-or-duplicate" in codes:
            raise CaptchaError("Doğrulamanın süresi doldu, tekrar işaretle.")
        raise CaptchaError("Robot doğrulaması başarısız, tekrar dene.")


def client_ip(request) -> str | None:
    """Proxy (Traefik/Coolify) arkasında gerçek istemci IP'si."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else None
