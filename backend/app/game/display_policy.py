"""
Listelerde gösterilecek ad politikası.

Ana sayfa "Son Maçlar" / "Bugünün Ligi", lig tabloları ve önceki dönem kazananları
aynı kuralı kullansın diye tek yerde toplandı. Daha önce her uç kendi alanını
döndürdüğü için bir yerde görünen ad, başka yerde kullanıcı adı çıkıyordu.

Admin ayarları (⚙️ Ayarlar → Adlar & Listeler):
  list_name_source   -> "display_name" (varsayılan) veya "username"
  list_name_max_len  -> bu uzunluğu aşan ad "…" ile kesilir (0 = kesme yok)

Kesme SUNUCUDA yapılır: dar ekranlarda uzun adın skorun üstüne binmesini önler.
"""

from __future__ import annotations

from app.game.settings_service import cached_int, cached_str

DEFAULT_SOURCE = "display_name"
DEFAULT_MAX_LEN = 14


def source() -> str:
    val = cached_str("list_name_source", DEFAULT_SOURCE)
    return val if val in ("display_name", "username") else DEFAULT_SOURCE


def max_len() -> int:
    n = cached_int("list_name_max_len", DEFAULT_MAX_LEN)
    return n if n > 0 else 0


def shorten(name: str) -> str:
    """Adı ayardaki uzunluğa kısaltır (son karakter yerine '…' gelir)."""
    n = max_len()
    name = (name or "").strip()
    if n <= 0 or len(name) <= n:
        return name
    return name[: max(1, n - 1)].rstrip() + "…"


def public_name(display_name: str | None, username: str | None) -> str:
    """Ayara göre gösterilecek adı seçer ve kısaltır.

    Seçilen kaynak boşsa (misafir/bot kaydında username yoktur) diğerine düşer;
    ikisi de yoksa "Oyuncu" döner.
    """
    display_name = (display_name or "").strip()
    username = (username or "").strip()
    if source() == "username":
        chosen = username or display_name
    else:
        chosen = display_name or username
    return shorten(chosen or "Oyuncu")
