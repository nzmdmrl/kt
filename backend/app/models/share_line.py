"""
Sonuç paylaşım metinleri ("Sonuç PM").

Paylaşılan metnin yapısı:

    <sabit skor satırı>      -> koddan üretilir ("🏆 Nazım, Ahmet'i 200-0 yendi!")
    <yorum satırı>           -> BU TABLODAN rastgele seçilir (admin düzenler)
    <alt bilgi / footer>     -> tek alan (game_settings.share_footer)

module : match | arena | daily | solo
variant: modüle göre sonuç ayrımı (kazandı/kaybetti vb.)
    match -> win | loss | draw
    arena -> win (1.) | podium (2-3.) | loss (4+)
    daily -> win | loss
    solo  -> win
Admin panelde her modül/variant için istediği kadar satır tutabilir (varsayılan 5).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, String, Text, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Alt bilgi (footer) tek alan olduğu için ayar tablosunda tutulur.
FOOTER_SETTING_KEY = "share_footer"
DEFAULT_FOOTER = "🎯 Kelime Tahmin — Türkçe kelime oyunu"

# (module, variant, panel etiketi)
SHARE_GROUPS: list[tuple[str, str, str]] = [
    ("match", "win", "⚔️ 1v1 Düello — Kazandı"),
    ("match", "loss", "⚔️ 1v1 Düello — Kaybetti"),
    ("match", "draw", "⚔️ 1v1 Düello — Berabere"),
    ("arena", "win", "🏟️ Arena — 1. oldu"),
    ("arena", "podium", "🏟️ Arena — 2./3. oldu"),
    ("arena", "loss", "🏟️ Arena — Podyum dışı"),
    ("daily", "win", "📅 Günün Kelimesi — Bildi"),
    ("daily", "loss", "📅 Günün Kelimesi — Bilemedi"),
    ("solo", "win", "🏃 Maraton — Bölüm geçildi"),
]

# İlk açılışta seed edilen varsayılan metinler (her grup için 5 tane).
DEFAULT_SHARE_LINES: dict[tuple[str, str], list[str]] = {
    ("match", "win"): [
        "⚔️ 1v1 Düello — kelimeler konuştu, kazanan belli oldu!",
        "🔥 Klavye kızıştı, galibiyet geldi!",
        "🧠 Harfler yerine oturdu, maç bitti.",
        "💪 Rakip sağlam ama sonuç net!",
        "🎯 Doğru kelime, doğru zaman.",
    ],
    ("match", "loss"): [
        "⚔️ 1v1 Düello — bugün olmadı, rövanş yakın!",
        "😤 Az kaldı… bir dahaki sefere.",
        "🔁 Kaybetmek de oyunun parçası, rövanşı bekliyorum.",
        "📚 Kelime dağarcığını tazeleyip geri döneceğim.",
        "🥊 İyi maçtı, sırada rövanş var.",
    ],
    ("match", "draw"): [
        "⚔️ 1v1 Düello — nefes nefese, kazanan yok!",
        "🤝 Tam denk rakipler.",
        "⚖️ Terazi dengede kaldı.",
        "😅 Bir kelime daha olsa değişirdi!",
        "🔁 Beraberlik bozulmadı, rövanş şart.",
    ],
    ("arena", "win"): [
        "🏟️ Arena — 5 kişilik hız yarışının kazananı!",
        "⚡ Hız da bende, kelime de bende.",
        "👑 Arenanın tepesi güzel manzara.",
        "🔥 Parmaklar klavyede yandı!",
        "🥇 Zirve boş kalmadı.",
    ],
    ("arena", "podium"): [
        "🏟️ Arena — podyuma çıktım!",
        "🥈 Zirveye çok az kaldı.",
        "⚡ Hız yarışında ilk üçteyim.",
        "😎 Podyum fena değil, gerisi gelir.",
        "🎯 Bir sonraki arenada zirve benim.",
    ],
    ("arena", "loss"): [
        "🏟️ Arena — 5 kişilik hız yarışı, sen de dene!",
        "⚡ Kelimeler çok hızlı aktı!",
        "🎮 Katılmak bile ayrı keyif.",
        "🔁 Bir sonraki arenada görüşürüz.",
        "😅 Bu sefer hız yetmedi.",
    ],
    ("daily", "win"): [
        "📅 Günün kelimesi bugün de çözüldü!",
        "🧠 Günlük kelime jimnastiği tamam.",
        "☕ Günün ilk zaferi.",
        "✅ Bugünkü kelime bende.",
        "🔤 Harfler yerini buldu.",
    ],
    ("daily", "loss"): [
        "📅 Günün kelimesi bugün beni yendi!",
        "😔 Bu kelime çok zordu.",
        "🤔 Dilimin ucundaydı…",
        "🔁 Yarın yeni kelime, yeni şans.",
        "📚 Kelime dağarcığına bir tik daha.",
    ],
    ("solo", "win"): [
        "🏃 Maraton devam ediyor!",
        "🧗 Bir bölüm daha geride kaldı.",
        "⭐ Yıldızlar toplanıyor.",
        "🔥 Seri bozulmadı.",
        "🎯 Sıradaki bölüm hazır olsun.",
    ],
}


class ShareLine(Base):
    __tablename__ = "share_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    module: Mapped[str] = mapped_column(String(16), index=True)
    variant: Mapped[str] = mapped_column(String(16), default="", index=True)
    text: Mapped[str] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def to_public(self) -> dict:
        return {
            "id": self.id,
            "module": self.module,
            "variant": self.variant,
            "text": self.text,
            "sort_order": self.sort_order,
            "active": bool(self.active),
        }
