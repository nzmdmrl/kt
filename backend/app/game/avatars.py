"""
Varsayılan avatar adresi — TEK KAYNAK.

Hesap açılırken kullanıcıya hazır bir avatar VERİLİR (users.avatar_url).
Eskiden bu alan boş kalıyordu; arayüz her ekranda kendi yedeğini üretiyordu
(kimi yerde kullanıcı adına, kimi yerde görünen ada göre) — sonuçta ana
sayfada bir yüz, profilde başka bir şey, maçta bambaşka bir yüz çıkıyordu.
Adres kayıtta bir kez yazılır ve DEĞİŞMEZ: kullanıcı adını değiştirse de
avatarı aynı kalır.

Servis DiceBear'dır: görsel kullanıcının tarayıcısı tarafından çekilir, bizim
sunucumuza yük binmez. Bir gün kendi üretimimize geçilecekse burayı
değiştirmek yeter (frontend tarafındaki eşi: frontend/lib/avatar.ts).
"""

from __future__ import annotations

from urllib.parse import quote

# Yedek adreslerde bugün de kullanılan stil — mevcut kullanıcıların gördüğü
# yüz DEĞİŞMESİN diye aynısı seçildi.
DEFAULT_STYLE = "thumbs"


def dicebear_url(seed: str, style: str = DEFAULT_STYLE) -> str:
    return f"https://api.dicebear.com/7.x/{style}/svg?seed={quote(seed or '?')}"


def default_avatar_url(username: str) -> str:
    """Yeni hesabın hazır avatarı. Tohum = kullanıcı adı (benzersiz)."""
    return dicebear_url(username)
