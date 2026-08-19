"""
Doğrulama hatırlatması — "hesabını kaydetmeyi unutma".

NE YAPAR
--------
İsimle hesap açıp henüz e-posta/şifre eklememiş kullanıcıya, biraz oynadıktan
sonra nazik bir bildirim gönderir. Bildirim hem uygulama içi listeye düşer hem
de (izin verdiyse) telefonuna push olarak gider. Tıklayınca /dogrula sayfası açılır.

KİME GİDER
----------
Hepsi birden sağlanmalı:
  1. hesap DOĞRULANMAMIŞ (verified = false),
  2. hesabın kurtarılabilir hiçbir anahtarı yok (e-posta/şifre/Google/Play Games),
     — bu ikinci koşul bir emniyet kemeri: verified bayrağı bir şekilde yanlış
       kalsa bile, gerçekten erişilebilir bir hesaba "hesabın kaybolabilir"
       demeyelim,
  3. en az N oyun oynamış (varsayılan 3; 1v1 + arena + maraton toplamı),
  4. bu hatırlatma kendisine DAHA ÖNCE GÖNDERİLMEMİŞ.

DOĞRULAMIŞ KULLANICIYA ASLA GİTMEZ. Sorgu zaten süzüyor, ayrıca gönderimden
hemen önce kullanıcı bir kez daha kontrol ediliyor.

İKİ AŞAMA
---------
1) Birinci hatırlatma: koşullar sağlanır sağlanmaz.
2) İkinci hatırlatma: birinciden `verify_reminder_2_days` (varsayılan 7) gün
   sonra, kişi HÂLÂ doğrulamamışsa.
   İkinci hatırlatma VARSAYILAN OLARAK KAPALIDIR (`verify_reminder_2_enabled`
   = false). Nazım panelden açana kadar tek satır bile gönderilmez.
   Kişi arada doğrularsa bekleyen ikinci hatırlatma İPTAL edilir
   (verify_reminders.cancelled_at) ve bir daha hiç gönderilmez.

NEDEN DÖNGÜ, NEDEN MAÇ SONUNDA DEĞİL
------------------------------------
İkinci hatırlatma zaten "7 gün sonra" olduğu için bir zamanlayıcı şart. Aynı
zamanlayıcı birinci hatırlatmayı da yapınca oyun kodlarına (maç bitişi, arena
sonucu) hiç dokunmamış oluyoruz — mevcut akışları bozma riski sıfır. Ayrıca
özellik açılmadan ÖNCE 3 maçı tamamlamış kullanıcılar da böylece kapsanıyor.
Döngü saatte bir çalışır; hatırlatmanın 1 saat gecikmesinin zararı yok
(kişiyi maçın tam ortasında rahatsız etmemek yeğdir).

TEK KANAL DEĞİL
---------------
Uygulama içi bildirim satırı HER ZAMAN yazılır ve commit edilir; push ondan
SONRA ateşle-unut olarak denenir. Push izni olmayan, bildirimleri kapatmış ya
da sadece tarayıcıdan giren kullanıcı da hatırlatmayı zil listesinde görür.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.user import User
from app.models.verify_reminder import VerifyReminder

# Döngü sıklığı. Hatırlatma acil bir şey değil; saatte bir yeterli.
LOOP_INTERVAL_SECONDS = 3600

# Bildirim türü kodu (katalog: notification_prefs.py → DEFAULT_TYPES).
TYPE_CODE = "verify_reminder"
ROUTE = "/dogrula"
ICON = "🔒"

# Tek turda en fazla kaç kişiye gönderilir. İlk açılışta binlerce eski hesap
# birikmiş olabilir; hepsini tek seferde göndermek push kuyruğunu boğar.
BATCH_LIMIT = 200

# Varsayılan metinler. Admin panelden değiştirilebilsin diye ÖNCE katalogdaki
# title_template / body_template alanına bakılır (Aşama 4'te oradan düzenlenecek);
# boşsa bunlar kullanılır.
FIRST_TITLE = "Hesabını kaydetmeyi unutma"
FIRST_BODY = (
    "Hesabın şu an sadece bu cihazda duruyor. E-posta ve şifre ekleyip "
    "profilini doğrularsan telefonunu değiştirsen bile ilerlemen kaybolmaz."
)
SECOND_TITLE = "Profilini hâlâ doğrulamadın"
SECOND_BODY = (
    "Puanların, rozetlerin ve seviyen bu cihaza bağlı. Bir dakikanı ayır, "
    "e-posta ve şifre ekleyerek hesabını kalıcı hâle getir."
)


# ---------------------------------------------------------------- ayarlar

def _enabled() -> bool:
    from app.game.settings_service import cached_bool
    return cached_bool("verify_reminder_enabled", True)


def _second_enabled() -> bool:
    from app.game.settings_service import cached_bool
    return cached_bool("verify_reminder_2_enabled", False)


def _min_games() -> int:
    from app.game.settings_service import cached_int
    return max(1, cached_int("verify_reminder_min_games", 3))


def _second_days() -> int:
    from app.game.settings_service import cached_int
    return max(1, cached_int("verify_reminder_2_days", 7))


def _text(key: str, fallback: str) -> str:
    """Panelden girilen metin; boşsa koddaki varsayılan.

    Admin → ⚡ Hızlı Giriş sekmesinden değiştirilir, deploy gerekmez.
    """
    from app.game.settings_service import cached_str
    return (cached_str(key, "") or "").strip() or fallback


def first_texts() -> tuple[str, str]:
    return _text("verify_reminder_title", FIRST_TITLE), \
           _text("verify_reminder_body", FIRST_BODY)


def second_texts() -> tuple[str, str]:
    return _text("verify_reminder_2_title", SECOND_TITLE), \
           _text("verify_reminder_2_body", SECOND_BODY)


# ---------------------------------------------------------------- yardımcılar

def _is_unrecoverable(u: User) -> bool:
    """Hesabın kurtarılabilir hiçbir anahtarı yok mu? (emniyet kemeri)"""
    return not (u.email or u.password_hash or u.google_sub or u.play_games_id)


def _games_played(u: User) -> int:
    """Kişi toplam kaç oyun oynadı — 1v1 + arena + maraton."""
    return (u.matches_played or 0) + (u.arena_played or 0) + (u.solo_matches or 0)


async def _send(db: AsyncSession, user: User, title: str, body: str) -> None:
    """Uygulama içi bildirimi yazar; push'u çağıran taraf commit sonrası atar."""
    db.add(Notification(
        user_id=user.id,
        kind=TYPE_CODE,
        type_code=TYPE_CODE,
        title=title,
        body=body,
        icon=ICON,
        link=ROUTE,
    ))


# ---------------------------------------------------------------- tur

async def run_once(db: AsyncSession) -> dict[str, int]:
    """Bir tur: gönderilecekleri bulur, gönderir, iptal edilecekleri kapatır.

    Dönen sözlük: {"first": n, "second": n, "cancelled": n}
    """
    now = datetime.now(timezone.utc)
    stats = {"first": 0, "second": 0, "cancelled": 0}
    # (user_id, title, body) — commit'ten SONRA push atılacaklar.
    pending_push: list[tuple[int, str, str]] = []

    title_1, body_1 = first_texts()

    # --- 1) Doğrulamış olanların bekleyen ikinci hatırlatması iptal edilir.
    # Kişi birinci hatırlatmadan sonra hesabını doğruladıysa bir daha rahatsız
    # edilmez. Damgayı buraya yazmamızın sebebi: Aşama 4'te "hatırlatma işe
    # yaradı mı" sayısı buradan okunabilsin.
    rows = (await db.execute(
        select(VerifyReminder, User)
        .join(User, User.id == VerifyReminder.user_id)
        .where(
            VerifyReminder.first_sent_at.is_not(None),
            VerifyReminder.second_sent_at.is_(None),
            VerifyReminder.cancelled_at.is_(None),
            User.verified.is_(True),
        )
        .limit(BATCH_LIMIT)
    )).all()
    for rem, _user in rows:
        rem.cancelled_at = now
        stats["cancelled"] += 1

    # --- 2) Birinci hatırlatma
    if _enabled():
        min_games = _min_games()
        # Kaydı OLMAYAN (hiç hatırlatılmamış) doğrulanmamış kullanıcılar.
        candidates = (await db.execute(
            select(User)
            .outerjoin(VerifyReminder, VerifyReminder.user_id == User.id)
            .where(
                VerifyReminder.user_id.is_(None),
                User.verified.is_(False),
                User.email.is_(None),
                User.password_hash.is_(None),
                User.google_sub.is_(None),
                User.play_games_id.is_(None),
                (User.matches_played + User.arena_played + User.solo_matches) >= min_games,
            )
            .limit(BATCH_LIMIT)
        )).scalars().all()

        for u in candidates:
            # Son kontrol — sorgu ile gönderim arasında bir şey değiştiyse.
            if u.verified or not _is_unrecoverable(u) or _games_played(u) < min_games:
                continue
            await _send(db, u, title_1, body_1)
            db.add(VerifyReminder(user_id=u.id, first_sent_at=now))
            pending_push.append((u.id, title_1, body_1))
            stats["first"] += 1

    # --- 3) İkinci hatırlatma (VARSAYILAN KAPALI)
    if _second_enabled():
        cutoff = now - timedelta(days=_second_days())
        rows2 = (await db.execute(
            select(VerifyReminder, User)
            .join(User, User.id == VerifyReminder.user_id)
            .where(
                VerifyReminder.first_sent_at.is_not(None),
                VerifyReminder.first_sent_at <= cutoff,
                VerifyReminder.second_sent_at.is_(None),
                VerifyReminder.cancelled_at.is_(None),
                User.verified.is_(False),
            )
            .limit(BATCH_LIMIT)
        )).all()
        for rem, u in rows2:
            if u.verified or not _is_unrecoverable(u):
                continue
            title_2, body_2 = second_texts()
            await _send(db, u, title_2, body_2)
            rem.second_sent_at = now
            pending_push.append((u.id, title_2, body_2))
            stats["second"] += 1

    await db.commit()

    # --- 4) Push: uygulama içi satırlar COMMIT EDİLDİKTEN SONRA, ateşle-unut.
    # Push başarısız olsa da (izin yok, cihaz yok, sessiz saat) kullanıcı
    # bildirimi zil listesinde görür.
    if pending_push:
        from app.services.push import send_to_user_bg
        for uid, t, b in pending_push:
            send_to_user_bg(uid, TYPE_CODE, t, b, ROUTE)

    return stats


async def verify_reminder_loop():
    """Saatte bir doğrulama hatırlatmalarını gönderir. Startup'ta task olur."""
    from app.core.database import AsyncSessionLocal
    while True:
        try:
            async with AsyncSessionLocal() as db:
                s = await run_once(db)
                if s["first"] or s["second"] or s["cancelled"]:
                    print(f"[doğrulama hatırlatma] 1.: {s['first']} · "
                          f"2.: {s['second']} · iptal: {s['cancelled']}")
        except Exception as e:
            print(f"[doğrulama hatırlatma] HATA: {type(e).__name__}: {e}")
        await asyncio.sleep(LOOP_INTERVAL_SECONDS)
