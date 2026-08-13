"""
Maç sonrası işlemler: istatistik güncelleme, ELO değişimi, bot seçimi.
"""

from __future__ import annotations

import random

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.bot import Bot


def elo_change(player_elo: int, opp_elo: int, result: float, k: int = 32) -> int:
    """
    Standart ELO formülü. result: 1.0 galibiyet, 0.5 beraberlik, 0.0 mağlubiyet.
    Döndürülen: yeni ELO (yuvarlanmış).
    """
    expected = 1.0 / (1.0 + 10 ** ((opp_elo - player_elo) / 400.0))
    return round(player_elo + k * (result - expected))


async def pick_bot(db: AsyncSession, target_elo: int, lang: str = "tr") -> Bot | None:
    """Hedef ELO'ya yakın aktif bir bot seçer."""
    # ±200 aralığındaki aktif botlardan rastgele biri.
    res = await db.execute(
        select(Bot).where(
            Bot.active == True,  # noqa: E712
            Bot.lang == lang,
            Bot.elo >= target_elo - 200,
            Bot.elo <= target_elo + 200,
        )
    )
    bots = res.scalars().all()
    if not bots:
        # Aralıkta yoksa herhangi aktif bir bot.
        res = await db.execute(select(Bot).where(Bot.active == True, Bot.lang == lang))  # noqa: E712
        bots = res.scalars().all()
    return random.choice(bots) if bots else None


async def apply_match_result(
    db: AsyncSession,
    user_id: int,
    opp_elo: int,
    won: bool,
    draw: bool,
    score: int,
    words_solved: int,
) -> User | None:
    """
    Gerçek kullanıcının maç sonucu istatistiklerini ve ELO'sunu günceller.
    (Botların istatistiği tutulmaz.)
    """
    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalar_one_or_none()
    if not user:
        return None

    # Rozet durumu (öncesi) — istatistik değişmeden ÖNCE hesapla
    def _earned_codes(u) -> set:
        from app.game.badges import earned_badges
        stats = {
            "matches_played": u.matches_played, "wins": u.wins, "losses": u.losses,
            "draws": u.draws, "words_solved": u.words_solved, "total_score": u.total_score,
            "elo": u.elo, "custom_arena_played": getattr(u, "custom_arena_played", 0) or 0,
            "arena_played": getattr(u, "arena_played", 0) or 0,
            "arena_first": getattr(u, "arena_first", 0) or 0,
            "arena_second": getattr(u, "arena_second", 0) or 0,
            "arena_third": getattr(u, "arena_third", 0) or 0,
        }
        return {b["code"]: b for b in earned_badges(stats) if b["earned"]}

    badges_before = _earned_codes(user)

    user.matches_played += 1
    user.total_score += score
    user.words_solved += words_solved
    if draw:
        user.draws += 1
        result_val = 0.5
    elif won:
        user.wins += 1
        result_val = 1.0
    else:
        user.losses += 1
        result_val = 0.0

    elo_before = user.elo
    user.elo = max(100, elo_change(user.elo, opp_elo, result_val))
    elo_after = user.elo

    await db.commit()
    await db.refresh(user)

    # XP ver (galibiyet/beraberlik/mağlubiyet). Öncesi/sonrası unvanı karşılaştır.
    xp_gained = 0
    new_title = None
    try:
        from app.game.xp_service import grant_xp, title_for_xp
        xp_before = user.xp or 0
        title_before = title_for_xp(xp_before)["title"]
        event = "match_draw" if draw else ("match_win" if won else "match_loss")
        res = await grant_xp(db, user, event)
        xp_gained = res.get("gained", 0) if isinstance(res, dict) else 0
        title_after_info = title_for_xp(user.xp or 0)
        if title_after_info["title"] != title_before:
            new_title = {
                "name": title_after_info["title"],
                "icon": title_after_info["title_icon"],
            }
            # Bildirim: yeni unvan (profile götürür)
            try:
                from app.models.notification import Notification
                n_title = "Yeni unvan kazandın!"
                n_body = f"{title_after_info['title_icon']} {title_after_info['title']} unvanına yükseldin."
                # username boşsa /profil/me 404 verirdi (backend username='me' arar).
                n_link = f"/profil/{user.username}" if user.username else "/bildirimler"
                db.add(Notification(
                    user_id=user_id, kind="title_up", type_code="title_up",
                    title=n_title,
                    body=n_body,
                    icon=title_after_info["title_icon"],
                    link=n_link,
                ))
                await db.commit()
                # Push: commit'ten sonra, ateşle-unut (maç bitişini bloklamaz).
                from app.services.push import send_to_user_bg
                send_to_user_bg(user_id, "title_up", n_title, n_body, n_link)
            except Exception as e:
                print(f"[unvan bildirim] HATA user={user_id}: {e}")
    except Exception as e:
        print(f"[xp] HATA user={user_id}: {e}")

    # Lig puanı: bu maçın puanını bugünün lig kaydına işle (günün en iyisi tutulur).
    try:
        from app.game.league_service import record_daily_score
        await record_daily_score(db, user_id, score)
    except Exception as e:
        print(f"[lig] HATA user={user_id}: {e}")

    # Yeni açılan rozetler
    badges_after = _earned_codes(user)
    new_badges = [badges_after[c] for c in badges_after.keys() - badges_before.keys()]

    return {
        "user": user,
        "elo_before": elo_before,
        "elo_after": elo_after,
        "elo_delta": elo_after - elo_before,
        "xp_gained": xp_gained,
        "new_badges": new_badges,
        "new_title": new_title,
    }
