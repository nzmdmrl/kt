"""
İsim denetimi — iki katmanı birleştirip kararı veren yer.

AKIŞ
----
1. Kullanıcı ismini yazar, hesabı AÇILIR ve oyununa başlar. Denetim bu işi
   HİÇ BEKLETMEZ: `review_name_bg()` ateşle-unut bir arka plan görevi başlatır.
2. Görev önce yerel kara listeye bakar (anında, bedava).
3. Kara liste kesin bir şey bulmadıysa OpenAI'ye sorulur (yaratıcı yazımlar).
4. İki puandan YÜKSEK olanı alınır — biri yakalarsa yeter.
5. Karar:
     puan <  flag eşiği            -> hiçbir şey olmaz (temiz)
     puan >= flag eşiği            -> "İsim Kontrol" listesine düşer,
                                      kullanıcı oynamaya DEVAM EDER
     puan >= pasife alma eşiği     -> hesap otomatik pasife alınır
                                      + admine bildirim gider

Eşikler admin ayarıdır. `name_auto_disable_threshold` değerini
`name_flag_threshold` ile aynı yaparsan işaretlenen HER isim otomatik pasife
alınır; 100 yaparsan hiçbiri alınmaz (hepsi elle incelenir).

HİÇBİR KOŞULDA İSTİSNA FIRLATMAZ — kayıt/isim değiştirme akışını bozamaz.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.name_flag import NameFlag
from app.models.notification import Notification
from app.models.user import User

# Admine bildirim: mevcut sistem duyurusu türü kullanılır (katalogda zaten
# aktif). Yeni bir tür açmak yerine bunu kullanmak, admin bildirim
# tercihlerini olduğu gibi bırakır.
ADMIN_NOTIF_TYPE = "system_announcement"


# ---------------------------------------------------------------- ayarlar

def _enabled() -> bool:
    from app.game.settings_service import cached_bool
    return cached_bool("name_check_enabled", True)


def _ai_enabled() -> bool:
    from app.game.settings_service import cached_bool
    return cached_bool("name_check_ai_enabled", True)


def _flag_threshold() -> int:
    from app.game.settings_service import cached_int
    return max(1, min(100, cached_int("name_flag_threshold", 40)))


def _auto_disable_threshold() -> int:
    from app.game.settings_service import cached_int
    return max(1, min(100, cached_int("name_auto_disable_threshold", 85)))


# ---------------------------------------------------------------- karar

async def review_name(db: AsyncSession, user: User, source: str = "signup") -> dict:
    """Tek bir kullanıcının ismini denetler ve gereken işlemi yapar.

    Dönen sözlük teşhis içindir: {"score", "layer", "flagged", "disabled"}.
    """
    result = {"score": 0, "layer": "", "flagged": False, "disabled": False}
    if not _enabled():
        return result

    display_name = user.display_name or ""
    username = user.username or ""

    # --- 1. katman: yerel kara liste
    from app.game.name_filter import check_name
    local_score, local_reasons = check_name(display_name, username)

    # --- 2. katman: OpenAI
    # Kara liste zaten pasife alma eşiğini geçtiyse modele sormaya gerek yok
    # (karar değişmeyecek, boşuna para harcanmaz).
    ai_score, ai_reason = 0, ""
    ai_used = False
    if _ai_enabled() and local_score < _auto_disable_threshold():
        from app.services import name_ai
        if name_ai.configured():
            got = await name_ai.check_name_ai(display_name, username)
            if got is not None:
                ai_used = True
                ai_score, ai_reason = got

    score = max(local_score, ai_score)
    result["score"] = score

    if local_score and ai_score:
        layer = "both"
    elif ai_score:
        layer = "ai"
    elif local_score:
        layer = "blacklist"
    else:
        layer = ""
    result["layer"] = layer

    flag_at = _flag_threshold()
    if score < flag_at:
        return result   # temiz — hiçbir kayıt tutulmaz

    # --- gerekçe metni
    parts: list[str] = []
    if local_reasons:
        parts.append("Kara liste → " + ", ".join(local_reasons[:6]))
    if ai_score:
        parts.append(f"Yapay zekâ (%{ai_score}) → {ai_reason}")
    elif ai_used:
        parts.append("Yapay zekâ: temiz buldu")
    reason = " | ".join(parts) or "eşik aşıldı"

    # --- kayıt + gerekirse pasife alma
    disable_at = _auto_disable_threshold()
    do_disable = score >= disable_at
    now = datetime.now(timezone.utc)

    flag = NameFlag(
        user_id=user.id,
        display_name=display_name[:48],
        username=username[:32],
        layer=layer or "blacklist",
        score=score,
        reason=reason[:1000],
        source=source if source in ("signup", "rename") else "signup",
        signup_ip=user.signup_ip,
        action="auto_disabled" if do_disable else "none",
        status="pending",
    )
    db.add(flag)
    result["flagged"] = True

    if do_disable:
        user.disabled = True
        user.disabled_reason = "Kullanıcı adı incelemesi"
        user.disabled_at = now
        result["disabled"] = True

    # --- adminlere bildirim (yalnız otomatik pasife alınanlarda)
    admin_ids: list[int] = []
    if do_disable:
        admin_ids = list((await db.execute(
            select(User.id).where(User.is_admin.is_(True))
        )).scalars().all())
        for aid in admin_ids:
            db.add(Notification(
                user_id=aid,
                kind="name_flag",
                type_code=ADMIN_NOTIF_TYPE,
                title="Uygunsuz isim: hesap pasife alındı",
                body=f"“{display_name}” (@{username}) %{score} güvenle uygunsuz "
                     f"bulundu ve hesap pasife alındı. İsim Kontrol panelinden "
                     f"inceleyebilirsin.",
                icon="🚫",
                link="/yonetim",
            ))

    await db.commit()

    # Push: uygulama içi satırlar commit EDİLDİKTEN sonra, ateşle-unut.
    if admin_ids:
        from app.services.push import send_to_user_bg
        for aid in admin_ids:
            send_to_user_bg(
                aid, ADMIN_NOTIF_TYPE, "Uygunsuz isim: hesap pasife alındı",
                f"“{display_name}” pasife alındı — İsim Kontrol panelinde.",
                "/yonetim",
            )

    return result


# ---------------------------------------------------------------- arka plan

# Görevlere güçlü referans — GC yarıda toplamasın (push.py ile aynı kalıp).
_bg_tasks: set[asyncio.Task] = set()


def review_name_bg(user_id: int, source: str = "signup") -> None:
    """Denetimi ARKA PLANDA başlatır. Çağıranı bloklamaz, hata fırlatmaz.

    Kullanıcı bu sırada oyununa çoktan başlamıştır — istenen davranış budur.
    Görev kendi DB oturumunu açar; çağıranın oturumu yanıt sonrası kapanabilir.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return   # event loop yok (senkron bağlam) — sessizce atla

    async def _run() -> None:
        try:
            from app.core.database import AsyncSessionLocal
            async with AsyncSessionLocal() as db:
                u = (await db.execute(
                    select(User).where(User.id == int(user_id))
                )).scalar_one_or_none()
                if u:
                    await review_name(db, u, source)
        except Exception as e:
            print(f"[isim denetimi] arka plan hatası ({type(e).__name__}: {e})")

    try:
        task = loop.create_task(_run())
        _bg_tasks.add(task)
        task.add_done_callback(_bg_tasks.discard)
    except Exception as e:
        print(f"[isim denetimi] görev başlatılamadı ({type(e).__name__}: {e})")
