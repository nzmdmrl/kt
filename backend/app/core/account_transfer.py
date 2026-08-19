"""Hesap taşıma — hızlı (doğrulanmamış) hesabın ilerlemesini gerçek hesaba aktarır.

NE ZAMAN ÇALIŞIR
----------------
Kişi mobilde isimle hızlı hesap açtı, bir süre oynadı, sonra "hesabımı doğrula"
deyip e-posta yazdı — ama o e-posta siteye daha önce açtığı hesaba ait. Bu bir
hata değil, çok muhtemel bir durum. O yüzden /auth/verify hata dönmez; kişiye
"o hesaba giriş yap, buradaki ilerlemeyi oraya taşıyalım" der ve kısa ömürlü bir
taşıma jetonu verir. Kişi e-posta ile giriş yapınca /auth/transfer bu jetonla
çağrılır ve BU dosyadaki mantık işler.

GÜVENLİK — en kritik kısım
--------------------------
Taşıma, KAYNAK hesabı siler. Bu yüzden kaynak yalnızca "kurtarılamaz hızlı hesap"
olabilir: e-postası, şifresi, Google/Play Games bağlantısı OLMAYAN ve yönetici
olmayan bir hesap. Aksi halde eline taşıma jetonu geçen biri başkasının gerçek
hesabını yutabilirdi. Jetonun kendisi zaten sunucu anahtarıyla imzalıdır ve
yalnızca o hesabın oturumu açıkken üretilir.

BİRLEŞTİRME KURALLARI
---------------------
- Sayaçlar (maç, galibiyet, XP, arena katılımı...) TOPLANIR.
- ELO ve "en iyi" alanlar (solo_best_score) YÜKSEK olanı alır — toplamak
  anlamsız olurdu (1000 + 1000 = 2000 puanlık sahte bir reyting çıkardı).
- Benzersizlik kısıtı olan tablolarda (aynı gün lig puanı, aynı kelime, aynı
  bölüm) çakışan satırlar BİRLEŞTİRİLİR, kalanlar taşınır.
- Kaynağın bekleyen işleri (maç teklifi, push tercihi) taşınmaz; kaynak hesap
  silinince veritabanı ON DELETE CASCADE ile temizler.

Not: bu iş TEK transaction'dır. Bir adım patlarsa hiçbir şey taşınmaz ve kaynak
hesap yerinde kalır — kullanıcı ilerlemesini kaybetmez, tekrar deneyebilir.
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User

# Toplanacak sayaçlar.
_SUM_FIELDS = (
    "matches_played", "wins", "losses", "draws", "words_solved", "total_score",
    "xp", "custom_arena_played", "arena_played", "arena_first", "arena_second",
    "arena_third", "solo_matches", "abandons",
)

# Yüksek olanın alınacağı alanlar.
_MAX_FIELDS = ("elo", "solo_best_score")


class TransferError(Exception):
    """Taşıma reddedildi — istemciye mesajla döner."""


def can_absorb(source: User) -> str | None:
    """Kaynak hesap yutulabilir mi? Uygunsa None, değilse Türkçe gerekçe döner."""
    if source.email:
        return "Taşınacak hesapta zaten bir e-posta kayıtlı."
    if source.password_hash:
        return "Taşınacak hesapta zaten bir şifre kayıtlı."
    if source.google_sub or source.play_games_id:
        return "Taşınacak hesap bir Google/Play Games hesabına bağlı."
    if source.verified:
        return "Taşınacak hesap zaten doğrulanmış."
    if source.is_admin:
        return "Yönetici hesabı taşınamaz."
    return None


async def transfer_progress(
    db: AsyncSession, source: User, target: User
) -> dict:
    """Kaynak hesabın her şeyini hedefe taşır ve kaynağı siler. Özet döner."""
    if source.id == target.id:
        raise TransferError("Kaynak ve hedef hesap aynı.")
    reason = can_absorb(source)
    if reason:
        raise TransferError(reason)

    src, dst = source.id, target.id
    p = {"src": src, "dst": dst}

    # Taşımadan ÖNCEKİ hedef değerleri — özet için (arayüz "şu kadar XP eklendi"
    # diyebilsin).
    before = {"xp": target.xp or 0, "matches_played": target.matches_played or 0}

    # ---- 1) Basit taşımalar: benzersizlik kısıtı yok, doğrudan sahip değişir.
    for tbl in ("arena_history", "notifications", "username_changes",
                "support_tickets"):
        await db.execute(
            text(f"UPDATE {tbl} SET user_id = :dst WHERE user_id = :src"), p
        )
    await db.execute(
        text("UPDATE custom_arenas SET owner_id = :dst WHERE owner_id = :src"), p
    )
    # Push cihazları kişiyle birlikte gider: kullanıcı aynı telefonda artık hedef
    # hesapla oturumda. (token UNIQUE, user_id'de benzersizlik yok -> çakışmaz.)
    await db.execute(
        text("UPDATE device_tokens SET user_id = :dst WHERE user_id = :src"), p
    )

    # ---- 2) Benzersizlik kısıtlı tablolar: önce çakışanları birleştir/sil,
    #         sonra kalanları taşı.

    # collected_words (user_id, word): hedefte zaten olan kelimeyi ikinci kez
    # eklemeyiz — "kaç FARKLI kelime bildin" sayacı bozulmasın.
    await db.execute(text(
        "DELETE FROM collected_words WHERE user_id = :src AND word IN "
        "(SELECT word FROM collected_words WHERE user_id = :dst)"
    ), p)
    await db.execute(
        text("UPDATE collected_words SET user_id = :dst WHERE user_id = :src"), p
    )

    # daily_scores (user_id, score_date): lig puanı GÜNÜN EN İYİSİdir, toplanmaz.
    # Aynı güne iki satır düşerse büyük puan kalır, maç sayısı toplanır.
    await db.execute(text(
        "UPDATE daily_scores SET "
        "  best_score = (SELECT MAX(x.best_score) FROM daily_scores x "
        "                WHERE x.user_id IN (:src, :dst) "
        "                  AND x.score_date = daily_scores.score_date), "
        "  matches = (SELECT SUM(x.matches) FROM daily_scores x "
        "             WHERE x.user_id IN (:src, :dst) "
        "               AND x.score_date = daily_scores.score_date) "
        "WHERE user_id = :dst AND score_date IN "
        "  (SELECT score_date FROM daily_scores WHERE user_id = :src)"
    ), p)
    await db.execute(text(
        "DELETE FROM daily_scores WHERE user_id = :src AND score_date IN "
        "(SELECT score_date FROM daily_scores WHERE user_id = :dst)"
    ), p)
    await db.execute(
        text("UPDATE daily_scores SET user_id = :dst WHERE user_id = :src"), p
    )

    # daily_solves: çözen anahtarı "u{id}" biçiminde metin tutulur.
    # (solve_date, length, solver) benzersiz -> çakışanı at, kalanı taşı.
    keys = {"srckey": f"u{src}", "dstkey": f"u{dst}"}
    await db.execute(text(
        "DELETE FROM daily_solves WHERE solver = :srckey AND (solve_date, length) IN "
        "(SELECT solve_date, length FROM daily_solves WHERE solver = :dstkey)"
    ), keys)
    await db.execute(
        text("UPDATE daily_solves SET solver = :dstkey WHERE solver = :srckey"), keys
    )

    # league_awards (user_id, period_type, period_key): aynı dönemin ödülü iki kez
    # olamaz; çakışırsa hedefinki kalır.
    await db.execute(text(
        "DELETE FROM league_awards WHERE user_id = :src AND (period_type, period_key) IN "
        "(SELECT period_type, period_key FROM league_awards WHERE user_id = :dst)"
    ), p)
    await db.execute(
        text("UPDATE league_awards SET user_id = :dst WHERE user_id = :src"), p
    )

    # solo_level_results (user_id, level): aynı bölümde en iyi yıldız kalır,
    # deneme sayıları toplanır.
    await db.execute(text(
        "UPDATE solo_level_results SET "
        "  best_stars = (SELECT MAX(x.best_stars) FROM solo_level_results x "
        "                WHERE x.user_id IN (:src, :dst) AND x.level = solo_level_results.level), "
        "  attempts = (SELECT SUM(x.attempts) FROM solo_level_results x "
        "              WHERE x.user_id IN (:src, :dst) AND x.level = solo_level_results.level) "
        "WHERE user_id = :dst AND level IN "
        "  (SELECT level FROM solo_level_results WHERE user_id = :src)"
    ), p)
    await db.execute(text(
        "DELETE FROM solo_level_results WHERE user_id = :src AND level IN "
        "(SELECT level FROM solo_level_results WHERE user_id = :dst)"
    ), p)
    await db.execute(
        text("UPDATE solo_level_results SET user_id = :dst WHERE user_id = :src"), p
    )

    # solo_progress: user_id birincil anahtar, kişi başı TEK satır.
    # İkisinde de varsa ileri olan bölüm ve yüksek yıldız kalır.
    await db.execute(text(
        "UPDATE solo_progress SET "
        "  current_level = (SELECT MAX(x.current_level) FROM solo_progress x "
        "                   WHERE x.user_id IN (:src, :dst)), "
        "  total_stars = (SELECT MAX(x.total_stars) FROM solo_progress x "
        "                 WHERE x.user_id IN (:src, :dst)) "
        "WHERE user_id = :dst AND EXISTS "
        "  (SELECT 1 FROM solo_progress WHERE user_id = :src)"
    ), p)
    await db.execute(text(
        "DELETE FROM solo_progress WHERE user_id = :src AND EXISTS "
        "(SELECT 1 FROM solo_progress WHERE user_id = :dst)"
    ), p)
    await db.execute(
        text("UPDATE solo_progress SET user_id = :dst WHERE user_id = :src"), p
    )

    # ---- 3) Arkadaşlıklar. Kaynağın arkadaşları hedefe geçer; ama iki tuzak var:
    #   a) hedef ile kaynak birbirinin arkadaşıysa "kendi kendine arkadaşlık"
    #      satırı oluşurdu -> silinir,
    #   b) aynı kişiyle hedefin zaten arkadaşlığı varsa ikinci satır benzersizlik
    #      kısıtına takılırdı -> silinir.
    await db.execute(text(
        "DELETE FROM friendships WHERE (requester_id = :src AND addressee_id = :dst) "
        "                           OR (requester_id = :dst AND addressee_id = :src)"
    ), p)
    await db.execute(text(
        "DELETE FROM friendships WHERE requester_id = :src AND addressee_id IN "
        "(SELECT addressee_id FROM friendships WHERE requester_id = :dst)"
    ), p)
    await db.execute(text(
        "DELETE FROM friendships WHERE addressee_id = :src AND requester_id IN "
        "(SELECT requester_id FROM friendships WHERE addressee_id = :dst)"
    ), p)
    # Ters yönlü kopyalar (A->B ve B->A aynı arkadaşlıktır) de elenmeli.
    await db.execute(text(
        "DELETE FROM friendships WHERE requester_id = :src AND addressee_id IN "
        "(SELECT requester_id FROM friendships WHERE addressee_id = :dst)"
    ), p)
    await db.execute(text(
        "DELETE FROM friendships WHERE addressee_id = :src AND requester_id IN "
        "(SELECT addressee_id FROM friendships WHERE requester_id = :dst)"
    ), p)
    await db.execute(
        text("UPDATE friendships SET requester_id = :dst WHERE requester_id = :src"), p
    )
    await db.execute(
        text("UPDATE friendships SET addressee_id = :dst WHERE addressee_id = :src"), p
    )

    # Arkadaş etiketleri (owner_id, friend_id benzersiz) — aynı temizlik.
    await db.execute(text(
        "DELETE FROM friend_labels WHERE (owner_id = :src AND friend_id = :dst) "
        "                            OR (owner_id = :dst AND friend_id = :src)"
    ), p)
    await db.execute(text(
        "DELETE FROM friend_labels WHERE owner_id = :src AND friend_id IN "
        "(SELECT friend_id FROM friend_labels WHERE owner_id = :dst)"
    ), p)
    await db.execute(text(
        "DELETE FROM friend_labels WHERE friend_id = :src AND owner_id IN "
        "(SELECT owner_id FROM friend_labels WHERE friend_id = :dst)"
    ), p)
    await db.execute(
        text("UPDATE friend_labels SET owner_id = :dst WHERE owner_id = :src"), p
    )
    await db.execute(
        text("UPDATE friend_labels SET friend_id = :dst WHERE friend_id = :src"), p
    )

    # ---- 4) Maç geçmişi kullanıcı KİMLİĞİ değil, kullanıcı ADI tutar (profil
    # linki username üzerinden kurulur). Kaynak silinince linkler kırılmasın diye
    # adlar hedefinkiyle değiştirilir.
    names = {
        "srcu": source.username, "dstu": target.username,
        "srcn": source.display_name, "dstn": target.display_name,
    }
    await db.execute(text(
        "UPDATE match_history SET p1_username = :dstu, p1_name = :dstn "
        "WHERE p1_username = :srcu"
    ), names)
    await db.execute(text(
        "UPDATE match_history SET p2_username = :dstu, p2_name = :dstn "
        "WHERE p2_username = :srcu"
    ), names)
    await db.execute(text(
        "UPDATE match_history SET winner_name = :dstn WHERE winner_name = :srcn"
    ), names)

    # ---- 5) Sayaçları birleştir.
    for f in _SUM_FIELDS:
        setattr(target, f, (getattr(target, f) or 0) + (getattr(source, f) or 0))
    for f in _MAX_FIELDS:
        setattr(target, f, max(getattr(target, f) or 0, getattr(source, f) or 0))
    # Profil fotoğrafı: hedefinki yoksa kaynağınki devralınır.
    if not target.avatar_photo and source.avatar_photo:
        target.avatar_photo = source.avatar_photo
    if not target.avatar_url and source.avatar_url:
        target.avatar_url = source.avatar_url

    # ---- 6) Kaynak hesabı sil. Kalan bağlı satırlar (maç teklifi, push tercihi)
    # ON DELETE CASCADE ile gider.
    await db.delete(source)
    await db.commit()
    await db.refresh(target)

    return {
        "xp_added": (target.xp or 0) - before["xp"],
        "matches_added": (target.matches_played or 0) - before["matches_played"],
        "from_username": names["srcu"],
        "to_username": target.username,
    }
