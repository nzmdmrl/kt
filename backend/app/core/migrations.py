"""Bir kez çalışan veri düzeltmeleri (data migration).

NEDEN
-----
Katalog satırları (notification_types) `ON CONFLICT DO NOTHING` ile seed edilir:
satır BİR KEZ yazılır, sonraki açılışlarda seed'e dokunulmaz. Bu yüzden
DEFAULT_TYPES içindeki bir değeri düzeltmek CANLI satırı ASLA düzeltmez.

KURAL: Katalog düzeltmesi = buraya bir UPDATE migration'ı. Seed listesini
düzenlemek yalnızca SIFIRDAN kurulan veritabanını etkiler.

Neden "bir kez"? Her açılışta koşulsuz UPDATE, adminin `/yonetim` panelinden
yaptığı değişikliği her yeniden başlatmada ezerdi. Uygulanan her migration
`applied_migrations` tablosuna yazılır ve bir daha çalışmaz — sonuç idempotent
ama adminin kontrolü elinden alınmaz.

Yeni migration eklerken: DATA_MIGRATIONS listesine (code, [SQL, ...]) ekle.
Kodu bir daha DEĞİŞTİRME — kod, "uygulandı" kaydının anahtarıdır.
"""

from __future__ import annotations

import json

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.app_settings import DEFAULT_BANNER_HIDDEN_PATHS
from app.core.database import engine

_IS_PG = engine.dialect.name == "postgresql"
_NOW = "now()" if _IS_PG else "CURRENT_TIMESTAMP"
_TS = "TIMESTAMPTZ" if _IS_PG else "TIMESTAMP"
_TRUE = "TRUE" if _IS_PG else "1"
_FALSE = "FALSE" if _IS_PG else "0"

# ads.admob satırına sonradan eklenen anahtarlar (bkz. migration 6).
# Yollar app_settings.py'deki tek kaynaktan gelir; JSON metnine gömülür.
_ADMOB_NEW_KEYS_JSON = json.dumps(
    {
        "banner_enabled": True,
        "interstitial_enabled": True,
        "banner_hidden_paths": DEFAULT_BANNER_HIDDEN_PATHS,
    },
    ensure_ascii=True,   # tek tırnaklı SQL literali içine güvenle gömülsün
)

CREATE_MIGRATIONS_SQL = f"""
CREATE TABLE IF NOT EXISTS applied_migrations (
    code VARCHAR(80) PRIMARY KEY,
    applied_at {_TS} DEFAULT {_NOW}
)
"""


async def ensure_migrations_table() -> None:
    async with engine.begin() as conn:
        await conn.execute(text(CREATE_MIGRATIONS_SQL))


async def run_once(db: AsyncSession, code: str, statements: list[str]) -> bool:
    """SQL'leri yalnızca bu `code` daha önce uygulanmadıysa çalıştırır.

    True  -> bu çağrıda uygulandı
    False -> zaten uygulanmıştı (veya hata; hata yutulmaz, çağıran yakalar)
    """
    await ensure_migrations_table()
    seen = (await db.execute(
        text("SELECT 1 FROM applied_migrations WHERE code = :c"), {"c": code}
    )).first()
    if seen:
        return False
    for sql in statements:
        await db.execute(text(sql))
    await db.execute(
        text("INSERT INTO applied_migrations (code) VALUES (:c)"), {"c": code}
    )
    await db.commit()
    return True


# ---------------------------------------------------------------- migration'lar

# (code, [SQL, ...]) — sıra önemlidir, yukarıdan aşağı uygulanır.
DATA_MIGRATIONS: list[tuple[str, list[str]]] = [

    # 1) Katalogdaki aktiflik bayrakları gerçeği yansıtmıyordu.
    #    - arena_medal / title_up: kod bu bildirimleri ÜRETİYOR ama katalogda
    #      is_active=false olduğu için send_to_user ilk kapıda "type_inactive"
    #      deyip push'u sessizce düşürüyordu (push_log'a satır bile yazılmaz).
    #    - title_up ayrıca default_enabled=false idi; tür aktif olsa bile
    #      kullanıcı açıkça açmadıkça push gitmezdi (DEFAULT_TYPES'ta True).
    #      arena_medal'in default_enabled=false olması BİLİNÇLİ (opt-in) —
    #      dokunulmadı.
    #    - daily_reminder: hiçbir çağrı yeri üretmiyor; ayar sayfasında
    #      görünüp kullanıcıya gelmeyen bildirim vaat ediyordu.
    ("2026_08_catalog_active_flags", [
        f"UPDATE notification_types SET is_active = {_TRUE} "
        "WHERE code IN ('arena_medal', 'title_up')",
        f"UPDATE notification_types SET default_enabled = {_TRUE} "
        "WHERE code = 'title_up'",
        f"UPDATE notification_types SET is_active = {_FALSE} "
        "WHERE code = 'daily_reminder'",
    ]),

    # 2) Aktif türlerin route_template'i boştu; çağrı yerleri gerçekte rota
    #    gönderiyordu. Katalog artık gerçeği anlatıyor.
    #    route_template bugün yalnızca admin ekranında gösterilir (gönderimde
    #    rota çağrı yerinden gelir) — yine de ikisi birbirini tutmalı.
    ("2026_08_catalog_route_templates", [
        "UPDATE notification_types SET route_template = '/bildirimler' "
        "WHERE code = 'friend_request'",
        "UPDATE notification_types SET route_template = '/profil/{username}' "
        "WHERE code IN ('friend_accept', 'friend_reject')",
        "UPDATE notification_types SET route_template = '/lig' "
        "WHERE code IN ('award_daily', 'award_monthly', 'award_yearly')",
        "UPDATE notification_types SET route_template = '/' "
        "WHERE code = 'challenge_offer'",
    ]),

    # 3) Uygulama içi link'i boş kalan eski satırlar: zil'de tıklanamıyorlardı
    #    (app/bildirimler/page.tsx -> clickable = !!n.link), aynı bildirim push
    #    olarak gelince bir sayfaya gidiyordu. Yeni satırlar çağrı yerinde
    #    doğru link'le yazılıyor; burada GEÇMİŞ satırlar dolduruluyor.
    #    DİKKAT: friend_accept/friend_reject push'u karşı tarafın PROFİLİNE
    #    gider, ama notifications satırında o kullanıcının kim olduğu tutulmuyor
    #    (friend_reject'te ilişki satırı da siliniyor) — geçmişe dönük profil
    #    yolu ÜRETİLEMEZ, bu yüzden /bildirimler'e bağlanıyorlar.
    ("2026_08_notifications_link_backfill", [
        "UPDATE notifications SET link = '/bildirimler' "
        "WHERE (link IS NULL OR link = '') "
        "AND kind IN ('friend_request', 'friend_accept', 'friend_reject')",
        "UPDATE notifications SET link = '/lig' "
        "WHERE (link IS NULL OR link = '') AND kind = 'award'",
    ]),

    # 4) notifications.type_code geriye dönük doldurma. kind ile type_code'un
    #    BİREBİR olduğu türler; kind='award' BİLEREK dışarıda — hangi dönemin
    #    (award_daily/monthly/yearly) ödülü olduğu satırdan anlaşılmıyor.
    ("2026_08_notifications_type_code_backfill", [
        "UPDATE notifications SET type_code = kind "
        "WHERE (type_code IS NULL OR type_code = '') "
        "AND kind IN ('room_invite', 'arena_invite', 'friend_request', "
        "             'friend_accept', 'friend_reject', 'arena_medal', "
        "             'title_up', 'challenge_offer', 'system_announcement')",
    ]),

    # 5) Admin test gönderimi gerçek 'system_announcement' kodunu kullanıyordu;
    #    duyuru istatistiği testlerle karışıyordu. Bu satırlar test olarak
    #    işaretlenir ve kendi koduna taşınır. Ayırt edici koşul: gerçek duyuru
    #    push'u HER ZAMAN '/duyurular/{slug}' rotasıyla gider, testin rotası
    #    sabit '/duyurular' idi (devices.py -> send_test_to_user).
    ("2026_08_push_log_mark_admin_tests", [
        f"UPDATE push_log SET is_test = {_TRUE}, type_code = 'admin_test' "
        "WHERE type_code = 'system_announcement' AND route = '/duyurular'",
    ]),

    # 6) ads.admob'a üç yeni anahtar: banner_enabled, interstitial_enabled ve
    #    banner_hidden_paths. app_settings seed'i yalnızca SATIR YOKSA yazar
    #    (ensure_app_settings_table -> "key in existing: continue"), yani canlıdaki
    #    ads.admob satırına DEFAULT_APP_SETTINGS'teki yeni alanlar ASLA ulaşmaz.
    #    Bu yüzden mevcut JSON'a birleştiriliyor.
    #
    #    Birleştirme yönü önemli: varsayılanlar SOLDA, mevcut değer SAĞDA ->
    #    çakışan anahtarda MEVCUT değer kazanır. Böylece admin daha önce bir şey
    #    değiştirdiyse migration onu ezmez, sadece eksik anahtarı ekler.
    ("2026_08_admob_banner_flags", [
        (
            "UPDATE app_settings "
            f"SET value = '{_ADMOB_NEW_KEYS_JSON}'::jsonb || value, updated_at = now() "
            "WHERE key = 'ads.admob'"
            if _IS_PG else
            "UPDATE app_settings "
            f"SET value = json_patch('{_ADMOB_NEW_KEYS_JSON}', value), "
            "    updated_at = CURRENT_TIMESTAMP "
            "WHERE key = 'ads.admob'"
        ),
    ]),
]


async def apply_data_migrations() -> int:
    """Uygulanmamış migration'ları sırayla çalıştırır. Uygulanan sayısını döner.

    Tek bir migration patlarsa diğerleri denenmeye devam eder; başarısız olan
    "uygulandı" olarak İŞARETLENMEZ, sonraki açılışta yeniden denenir.
    """
    from app.core.database import AsyncSessionLocal

    applied = 0
    for code, statements in DATA_MIGRATIONS:
        try:
            async with AsyncSessionLocal() as db:
                if await run_once(db, code, statements):
                    applied += 1
                    print(f"[migration] {code} uygulandı.")
        except Exception as e:
            print(f"[migration] {code} BAŞARISIZ ({type(e).__name__}: {e}) — "
                  "sonraki açılışta yeniden denenecek.")
    return applied
