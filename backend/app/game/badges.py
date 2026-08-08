"""
Rozet sistemi.

Rozetler kullanıcının istatistiklerinden TÜRETİLİR (ayrı tablo yok — basit,
esnek, geriye dönük çalışır). Her rozetin bir koşulu var; kullanıcı o koşulu
sağlıyorsa rozet "kazanılmış" sayılır.

Admin panel (Faz 10) ileride yeni rozet ekleyebilir; şimdilik kod içinde tanımlı.

Rozet alanları:
  code: benzersiz kimlik
  name: görünen ad
  desc: açıklama (nasıl kazanılır)
  icon: emoji (frontend gösterir)
  tier: bronze | silver | gold (görsel önem)
  check: (stats) -> bool  koşul fonksiyonu
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable


@dataclass
class Badge:
    code: str
    name: str
    desc: str
    icon: str
    tier: str
    check: Callable[[dict], bool]


# Rozet kataloğu. stats sözlüğü: matches_played, wins, losses, draws,
# words_solved, total_score, elo, awards (kupa/madalya sayısı).
BADGES: list[Badge] = [
    Badge("first_match", "İlk Adım", "İlk maçını oyna", "🎮", "bronze",
          lambda s: s["matches_played"] >= 1),
    Badge("first_win", "İlk Zafer", "İlk maçını kazan", "✨", "bronze",
          lambda s: s["wins"] >= 1),
    Badge("wins_10", "Yükselen", "10 maç kazan", "🔥", "silver",
          lambda s: s["wins"] >= 10),
    Badge("wins_50", "Usta", "50 maç kazan", "💎", "gold",
          lambda s: s["wins"] >= 50),
    Badge("matches_10", "Düzenli", "10 maç oyna", "🎯", "bronze",
          lambda s: s["matches_played"] >= 10),
    Badge("matches_100", "Bağımlı", "100 maç oyna", "🏅", "gold",
          lambda s: s["matches_played"] >= 100),
    Badge("words_100", "Kelime Avcısı", "Toplam 100 kelime bil", "📚", "silver",
          lambda s: s["words_solved"] >= 100),
    Badge("elo_1200", "Rekabetçi", "1200 ELO'ya ulaş", "⚔️", "silver",
          lambda s: s["elo"] >= 1200),
    Badge("elo_1500", "Şampiyon", "1500 ELO'ya ulaş", "👑", "gold",
          lambda s: s["elo"] >= 1500),
    Badge("trophy_1", "Kupa Sahibi", "Bir lig kupası kazan", "🏆", "gold",
          lambda s: s.get("trophies", 0) >= 1),
    Badge("score_1000", "Puan Canavarı", "Toplam 1000 puan topla", "⭐", "silver",
          lambda s: s["total_score"] >= 1000),
    Badge("custom_arena", "Arena Kurucusu", "Bir özel arena tamamla", "🎪", "gold",
          lambda s: s.get("custom_arena_played", 0) >= 1),
    # Arena katılım rozetleri
    Badge("arena_1", "Arena Acemisi", "İlk arena maçını oyna", "🎫", "bronze",
          lambda s: s.get("arena_played", 0) >= 1),
    Badge("arena_5", "Arena Sever", "5 arena maçı oyna", "🎟️", "bronze",
          lambda s: s.get("arena_played", 0) >= 5),
    Badge("arena_10", "Arena Savaşçısı", "10 arena maçı oyna", "🛡️", "silver",
          lambda s: s.get("arena_played", 0) >= 10),
    Badge("arena_50", "Arena Veteranı", "50 arena maçı oyna", "⚔️", "gold",
          lambda s: s.get("arena_played", 0) >= 50),
    Badge("arena_100", "Arena Efsanesi", "100 arena maçı oyna", "🔱", "gold",
          lambda s: s.get("arena_played", 0) >= 100),
    # Arena şampiyonluk rozetleri
    Badge("arena_champ_10", "Gladyatör", "10 arena şampiyonluğu kazan", "🦁", "gold",
          lambda s: s.get("arena_first", 0) >= 10),
    Badge("arena_champ_50", "Spartaküs", "50 arena şampiyonluğu kazan", "🏛️", "gold",
          lambda s: s.get("arena_first", 0) >= 50),
]


# DB rozet cache — [(code, name, desc, icon, tier, stat_key, threshold, sort_order), ...]
_badges_cache: list[tuple] = []


def _fallback_badges() -> list[tuple]:
    from app.models.badge_def import DEFAULT_BADGES
    return [(c, n, d, i, t, sk, th, idx) for idx, (c, n, d, i, t, sk, th) in enumerate(DEFAULT_BADGES)]


def set_badges_cache(rows: list[tuple]) -> None:
    """rows: [(code,name,desc,icon,tier,stat_key,threshold,sort_order), ...]"""
    global _badges_cache
    _badges_cache = sorted(rows, key=lambda b: b[7]) if rows else []


def _badge_defs() -> list[tuple]:
    return _badges_cache if _badges_cache else _fallback_badges()


def earned_badges(stats: dict) -> list[dict]:
    """Kullanıcının kazandığı rozetleri döner (kazanılmamışlar 'locked' olarak)."""
    out = []
    for (code, name, desc, icon, tier, stat_key, threshold, _order) in _badge_defs():
        try:
            earned = (stats.get(stat_key, 0) or 0) >= threshold
        except Exception:
            earned = False
        out.append({
            "code": code, "name": name, "desc": desc, "icon": icon,
            "tier": tier, "earned": earned,
        })
    return out
