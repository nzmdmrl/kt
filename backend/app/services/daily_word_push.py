"""
Günün Kelimesi — günlük hatırlatma bildirimi.

NE YAPAR
--------
Her gün Türkiye saatiyle belirlenen saatte (varsayılan 10:00), son N gün
(varsayılan 30) içinde aktif olmuş kullanıcılara push gönderir:

    "Günün Kelimesi K⬜⬜⬜M — bulabildin mi?"

İlk ve son harf açık, aradakiler kutu. Metin admin panelden yönetilen
listeden RASTGELE seçilir (app/models/daily_push_message.py).

NEDEN SADECE PUSH
-----------------
Uygulama içi bildirim satırı YAZILMAZ. Günlük tekrar eden bir hatırlatma zil
listesini şişirir; kişi bildirimi telefonunda görür, listede birikmiş 30 satır
görmek istemez. (Diğer hatırlatmalar tek seferliktir, onlar satır yazar.)

NASIL TETİKLENİR
----------------
Startup'ta başlayan döngü LOOP_INTERVAL_SECONDS'ta bir uyanır ve "saat geldi
mi, bugün gönderildi mi" diye bakar. Gönderim damgası game_settings'teki
`daily_word_push_last_date` satırıdır (Türkiye takvimine göre gün) — sunucu
yeniden başlasa da aynı gün ikinci kez gönderilmez.

KİME GİTMEZ
-----------
Silinmiş, pasife alınmış hesaplar ve son N gündür görünmeyenler. Push tercihi
kapalı olanları zaten send_to_user süzüyor (sessiz saat kuralı dahil: gece
gönderim yapılmaz — saat 10 varsayılanı bu yüzden güvenli).
"""

from __future__ import annotations

import asyncio
import random
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily_push_message import DEFAULT_DAILY_PUSH_MESSAGES, DailyPushMessage
from app.models.user import User

TZ = ZoneInfo("Europe/Istanbul")

# Döngü sıklığı: 5 dakika. Bildirim 10:00–10:05 arasında çıkar; saniye
# hassasiyetine gerek yok, buna karşılık sunucu boşuna dönmez.
LOOP_INTERVAL_SECONDS = 300

# Bildirim türü kodu (katalog: notification_prefs.py → DEFAULT_TYPES).
TYPE_CODE = "daily_reminder"
ROUTE = "/gunun-kelimesi"

# "Bugün gönderildi" damgası.
LAST_DATE_KEY = "daily_word_push_last_date"

# Tek turda en fazla kaç kişiye gönderilir (emniyet freni).
MAX_RECIPIENTS = 20000


# ---------------------------------------------------------------- ayarlar

def enabled() -> bool:
    from app.game.settings_service import cached_bool
    return cached_bool("daily_word_push_enabled", False)


def send_hour() -> int:
    from app.game.settings_service import cached_int
    return max(0, min(23, cached_int("daily_word_push_hour", 10)))


def active_days() -> int:
    from app.game.settings_service import cached_int
    return max(1, cached_int("daily_word_push_active_days", 30))


def push_title() -> str:
    from app.game.settings_service import cached_str
    return (cached_str("daily_word_push_title", "") or "").strip() or "Günün Kelimesi"


def word_length() -> int:
    from app.game.settings_service import cached_int
    return max(4, min(6, cached_int("daily_word_push_length", 5)))


def box_char() -> str:
    from app.game.settings_service import cached_str
    return (cached_str("daily_word_push_box", "") or "").strip() or "⬜"


# ---------------------------------------------------------------- metin

def hint_for(word: str, box: str | None = None) -> str:
    """"KALEM" -> "K⬜⬜⬜M". Kelime kısaysa elden geldiğince gösterir."""
    box = box or box_char()
    w = (word or "").strip()
    if len(w) <= 2:
        return w
    return w[0] + (box * (len(w) - 2)) + w[-1]


def render(template: str, word: str, box: str | None = None) -> str:
    """Yer tutucuları doldurur. Bilinmeyen yer tutucu metni BOZMAZ."""
    hint = hint_for(word, box)
    out = (template or "").strip()
    out = out.replace("{kelime}", hint)
    out = out.replace("{ilk}", word[0] if word else "")
    out = out.replace("{son}", word[-1] if word else "")
    out = out.replace("{uzunluk}", str(len(word or "")))
    return out


def today_word(when: date | None = None) -> str:
    """Bugünün kelimesi (ayardaki uzunlukta) — /gunun-kelimesi ile AYNI kaynak."""
    from app.api.routes.daily import word_of_day
    from app.core.config import get_settings
    try:
        return word_of_day(d=when, length=word_length(), lang=get_settings().GAME_LANG)
    except Exception:
        return ""


async def pick_message(db: AsyncSession) -> str:
    """Aktif metinlerden rastgele biri; hiç yoksa koddaki ilk varsayılan."""
    rows = (await db.execute(
        select(DailyPushMessage.text)
        .where(DailyPushMessage.active.is_(True))
        .order_by(DailyPushMessage.sort_order, DailyPushMessage.id)
    )).scalars().all()
    if not rows:
        return DEFAULT_DAILY_PUSH_MESSAGES[0]
    return random.choice(list(rows))


async def preview_body(db: AsyncSession) -> str:
    """Panelde gösterilen örnek — bugünün kelimesiyle ilk aktif metin."""
    rows = (await db.execute(
        select(DailyPushMessage.text)
        .where(DailyPushMessage.active.is_(True))
        .order_by(DailyPushMessage.sort_order, DailyPushMessage.id)
        .limit(1)
    )).scalars().all()
    template = rows[0] if rows else DEFAULT_DAILY_PUSH_MESSAGES[0]
    return render(template, today_word())


# ---------------------------------------------------------------- alıcılar

async def recipients(db: AsyncSession, limit: int = MAX_RECIPIENTS) -> list[int]:
    """Son N gün içinde aktif olmuş, açık hesapların kimlikleri."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=active_days())
    rows = (await db.execute(
        select(User.id).where(
            User.deleted.isnot(True),
            User.disabled.isnot(True),
            User.last_active_at.is_not(None),
            User.last_active_at >= cutoff,
        ).order_by(User.id).limit(limit)
    )).scalars().all()
    return list(rows)


async def recipient_count(db: AsyncSession) -> int:
    return len(await recipients(db))


# ---------------------------------------------------------------- gönderim

async def send_now(db: AsyncSession, only_user_id: int | None = None) -> dict:
    """Bildirimi gönderir. `only_user_id` verilirse yalnız o kişiye (panel testi).

    Dönen: {"sent": n, "recipients": n, "body": "...", "word": "..."}
    Metin KİŞİ BAŞINA seçilir — herkes aynı cümleyi görmesin.
    """
    from app.services.push import send_to_user

    word = today_word()
    title = push_title()
    ids = [only_user_id] if only_user_id else await recipients(db)

    sent = 0
    for i, uid in enumerate(ids):
        body = render(await pick_message(db), word)
        try:
            res = await send_to_user(db, uid, TYPE_CODE, title, body, ROUTE)
            if not res.get("skipped"):
                sent += 1
        except Exception as e:      # send_to_user zaten yutar; yine de tur durmasın
            print(f"[günün kelimesi bildirimi] {uid}: {type(e).__name__}: {e}")
        # FCM'i ve veritabanını nefeslendirmek için ara ara sırayı bırak.
        if i % 20 == 19:
            await asyncio.sleep(0.05)

    return {
        "sent": sent,
        "recipients": len(ids),
        "body": render(await pick_message(db), word),
        "word_hint": hint_for(word),
    }


async def run_once(db: AsyncSession, now: datetime | None = None) -> dict:
    """Bir tur: saat geldiyse ve bugün gönderilmediyse gönderir."""
    from app.game.settings_service import cached_str, set_setting

    if not enabled():
        return {"skipped": "disabled"}

    local = (now or datetime.now(timezone.utc)).astimezone(TZ)
    hour = send_hour()
    # Gönderim penceresi: saat X ile X+2 arası. Pencere neden var? Sunucu akşam
    # yeniden başlarsa "bugün gönderilmemiş" diye gece yarısına yakın bildirim
    # atmasın — o gün atlanır, ertesi gün saatinde gider.
    if local.hour < hour or local.hour > hour + 2:
        return {"skipped": "outside_window"}
    today = local.date().isoformat()
    if (cached_str(LAST_DATE_KEY, "") or "") == today:
        return {"skipped": "already_sent"}

    # Damga ÖNCE yazılır: gönderim yarıda kalsa bile aynı gün ikinci kez
    # bildirim yağmuru olmaz (eksik gönderim, çift gönderimden iyidir).
    await set_setting(db, LAST_DATE_KEY, today)

    res = await send_now(db)
    print(f"[günün kelimesi bildirimi] {res['sent']}/{res['recipients']} gönderildi "
          f"({res['word_hint']}).")
    return res


async def daily_word_push_loop():
    """Startup'ta task olur; 5 dakikada bir saat kontrolü yapar."""
    from app.core.database import AsyncSessionLocal
    while True:
        try:
            async with AsyncSessionLocal() as db:
                await run_once(db)
        except Exception as e:
            print(f"[günün kelimesi bildirimi] HATA: {type(e).__name__}: {e}")
        await asyncio.sleep(LOOP_INTERVAL_SECONDS)
