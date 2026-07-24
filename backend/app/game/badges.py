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
]


def earned_badges(stats: dict) -> list[dict]:
    """Kullanıcının kazandığı rozetleri döner (kazanılmamışlar da 'locked' olarak)."""
    out = []
    for b in BADGES:
        earned = False
        try:
            earned = b.check(stats)
        except Exception:
            earned = False
        out.append({
            "code": b.code,
            "name": b.name,
            "desc": b.desc,
            "icon": b.icon,
            "tier": b.tier,
            "earned": earned,
        })
    return out
