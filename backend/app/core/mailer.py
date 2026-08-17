"""
Basit SMTP e-posta gönderici (iletişim formu için).

SMTP bilgileri girilmemişse hiçbir şey yapmaz ve False döner — çağıran taraf
mesajı yine veritabanına yazdığı için hiçbir şey kaybolmaz.

Gönderim bloklayıcı olduğu için `asyncio.to_thread` ile ayrı iş parçacığında
çalışır; istek döngüsü beklemez.
"""

from __future__ import annotations

import asyncio
import smtplib
from email.message import EmailMessage

from app.core.config import get_settings


def _send_sync(to: str, subject: str, body: str, reply_to: str = "") -> bool:
    s = get_settings()
    if not s.smtp_configured:
        return False
    sender = s.SMTP_FROM or s.SMTP_USER
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = subject
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.set_content(body)

    try:
        if s.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(s.SMTP_HOST, s.SMTP_PORT, timeout=20) as srv:
                if s.SMTP_USER:
                    srv.login(s.SMTP_USER, s.SMTP_PASSWORD)
                srv.send_message(msg)
        else:
            with smtplib.SMTP(s.SMTP_HOST, s.SMTP_PORT, timeout=20) as srv:
                if s.SMTP_TLS:
                    srv.starttls()
                if s.SMTP_USER:
                    srv.login(s.SMTP_USER, s.SMTP_PASSWORD)
                srv.send_message(msg)
        return True
    except Exception:
        return False


async def send_mail(to: str, subject: str, body: str, reply_to: str = "") -> bool:
    """E-posta gönder. Yapılandırma yoksa/hata olursa False döner (istisna atmaz)."""
    try:
        return await asyncio.to_thread(_send_sync, to, subject, body, reply_to)
    except Exception:
        return False
