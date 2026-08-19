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

from app.api.routes.app_settings import (
    DEFAULT_INTERSTITIAL_RULES,
    MIC_NOTICE_TEXT,
)
from app.core.database import engine

_IS_PG = engine.dialect.name == "postgresql"
_NOW = "now()" if _IS_PG else "CURRENT_TIMESTAMP"
_TS = "TIMESTAMPTZ" if _IS_PG else "TIMESTAMP"
_TRUE = "TRUE" if _IS_PG else "1"
_FALSE = "FALSE" if _IS_PG else "0"

# ads.admob satırına sonradan eklenen anahtarlar (bkz. migration 6).
# DİKKAT: yol listesi burada DONDURULMUŞTUR, app_settings.py'den GELMEZ. Migration
# geçmişi sabittir: (6) o gün hangi listeyi yazdıysa onu yazmalı. Bugünkü varsayılan
# boş liste (bkz. migration 12) ve bu ikisi birbirini ezmemeli.
_LEGACY_BANNER_HIDDEN_PATHS = ["/oyna", "/arena", "/solo", "/gunun-kelimesi", "/oda"]

_ADMOB_NEW_KEYS_JSON = json.dumps(
    {
        "banner_enabled": True,
        "interstitial_enabled": True,
        "banner_hidden_paths": _LEGACY_BANNER_HIDDEN_PATHS,
    },
    ensure_ascii=True,   # tek tırnaklı SQL literali içine güvenle gömülsün
)

# Google Web istemci kimliği — sonradan eklenen anahtar (bkz. migration 13).
# BOŞ gelir: admin panelden (⚙️ Mobil & Reklam → Davranış ayarları) girilir.
_FLAGS_GOOGLE_JSON = json.dumps({"google_web_client_id": ""}, ensure_ascii=True)

# Geçici teşhis paneli anahtarı — sonradan eklendi (bkz. migration 14).
# KAPALI gelir; admin panelden açılır, iş bitince anahtar da kaldırılacak.
_FLAGS_DEBUG_JSON = json.dumps({"debug_panel": False}, ensure_ascii=True)

# Oyun ekranı payı — sonradan eklenen anahtar (bkz. migration 12).
_ADMOB_GAME_OFFSET_JSON = json.dumps({"banner_game_offset_extra": 0}, ensure_ascii=True)

# Banner artık oyun ekranlarında GİZLENMİYOR (bkz. migration 12) — liste boşaltılır.
_ADMOB_EMPTY_HIDDEN_JSON = json.dumps({"banner_hidden_paths": []}, ensure_ascii=True)

# Bant konumu ince ayarı — sonradan eklenen anahtarlar (bkz. migration 7).
_ADMOB_MARGIN_KEYS_JSON = json.dumps(
    {"banner_margin_extra": 0, "banner_margin_override": 0},
    ensure_ascii=True,
)

# Geçiş reklamı sıklık kuralları — sonradan eklenen anahtarlar (bkz. migration 8).
_ADMOB_INTERSTITIAL_KEYS_JSON = json.dumps(DEFAULT_INTERSTITIAL_RULES, ensure_ascii=True)

# Mikrofon bilgilendirme balonu — sonradan eklenen anahtarlar (bkz. migration 11).
# ensure_ascii=True: Türkçe karakterler \uXXXX olarak kaçırılır, böylece metin tek
# tırnaklı SQL literaline güvenle gömülür (metinde tırnak da olsa sorun çıkmaz).
_MIC_NOTICE_KEYS_JSON = json.dumps(
    {
        "notice_enabled": True,
        "notice_text": MIC_NOTICE_TEXT,
        "notice_times": 2,
        "notice_seconds": 5,
    },
    ensure_ascii=True,
)

# Mikrofon (sesli tahmin) bayrakları — sonradan eklenen anahtarlar (bkz. migration 9).
# Uygulama tarafı BİLEREK kapalı: gerçek telefonda doğrulanınca panelden açılır.
_MIC_FLAGS_JSON = json.dumps(
    {"mic_web_enabled": True, "mic_app_enabled": False},
    ensure_ascii=True,
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

    # 7) Bant konumu ince ayarı: banner_margin_extra / banner_margin_override.
    #    Gerekçe ve birleştirme yönü (6) ile aynı: varsayılanlar SOLDA, mevcut
    #    değer SAĞDA -> adminin girdiği sayı ezilmez, yalnızca eksik anahtar eklenir.
    ("2026_08_admob_margin_controls", [
        (
            "UPDATE app_settings "
            f"SET value = '{_ADMOB_MARGIN_KEYS_JSON}'::jsonb || value, updated_at = now() "
            "WHERE key = 'ads.admob'"
            if _IS_PG else
            "UPDATE app_settings "
            f"SET value = json_patch('{_ADMOB_MARGIN_KEYS_JSON}', value), "
            "    updated_at = CURRENT_TIMESTAMP "
            "WHERE key = 'ads.admob'"
        ),
    ]),

    # 8) Geçiş (interstitial) reklamı sıklık kuralları:
    #    interstitial_every_n_matches / _min_seconds / _skip_first_n / _modes.
    #    Birleştirme yönü (6) ve (7) ile aynı: varsayılanlar SOLDA, mevcut değer
    #    SAĞDA -> adminin girdiği değerler ezilmez, yalnızca eksik anahtar eklenir.
    #
    #    DİKKAT — interstitial_modes bir NESNE ve iki motor farklı davranır:
    #      PostgreSQL `||`  : SIĞ. Satırda interstitial_modes zaten varsa nesnenin
    #                         TAMAMI mevcut hâliyle kalır; varsayılandaki yeni mod
    #                         anahtarları EKLENMEZ.
    #      SQLite json_patch: DERİN (RFC 7396). Eksik mod anahtarları eklenir,
    #                         mevcut olanlar korunur.
    #    Burada sorun çıkarmaz: canlıdaki satırlarda interstitial_modes HİÇ YOK,
    #    dolayısıyla iki motorda da varsayılan nesnenin tamamı yazılır. Ama ileride
    #    YENİ bir mod anahtarı eklenirse PostgreSQL için onu taşıyan AYRI bir
    #    migration (jsonb_set ya da value->'interstitial_modes' birleştirmesi) şart.
    ("2026_08_admob_interstitial_rules", [
        (
            "UPDATE app_settings "
            f"SET value = '{_ADMOB_INTERSTITIAL_KEYS_JSON}'::jsonb || value, updated_at = now() "
            "WHERE key = 'ads.admob'"
            if _IS_PG else
            "UPDATE app_settings "
            f"SET value = json_patch('{_ADMOB_INTERSTITIAL_KEYS_JSON}', value), "
            "    updated_at = CURRENT_TIMESTAMP "
            "WHERE key = 'ads.admob'"
        ),
    ]),

    # 9) Mikrofon (sesli tahmin) bayrakları: mic_web_enabled / mic_app_enabled.
    #    Gerekçe (6)(7)(8) ile aynı — app_settings seed'i YALNIZCA satır yoksa
    #    yazar, dolayısıyla DEFAULT_APP_SETTINGS'e eklenen bu iki anahtar canlıdaki
    #    'app.flags' satırına asla ulaşmaz. Burada mevcut JSON'a birleştiriliyor.
    #
    #    Birleştirme yönü: varsayılanlar SOLDA, mevcut değer SAĞDA -> çakışmada
    #    MEVCUT değer kazanır. Yani admin daha önce bir şey değiştirdiyse ezilmez;
    #    yalnızca eksik anahtar eklenir. challenge_ttl_seconds de korunur.
    #
    #    Uygulama bayrağı KAPALI geliyor (mic_app_enabled: false) — gerçek telefonda
    #    doğrulandıktan sonra panelden açılacak. Kural: uygulama açıksa web de açık
    #    olmalı; bu değerler kuralı zaten sağlıyor (web açık + uygulama kapalı).
    ("2026_08_mic_flags", [
        (
            "UPDATE app_settings "
            f"SET value = '{_MIC_FLAGS_JSON}'::jsonb || value, updated_at = now() "
            "WHERE key = 'app.flags'"
            if _IS_PG else
            "UPDATE app_settings "
            f"SET value = json_patch('{_MIC_FLAGS_JSON}', value), "
            "    updated_at = CURRENT_TIMESTAMP "
            "WHERE key = 'app.flags'"
        ),
    ]),

    # 10) Mikrofon bayrakları 'app.flags' içinden KENDİ satırına taşındı:
    #     'app.mic' -> {web_enabled, app_enabled}. Gerekçe: panelde her
    #     app_settings satırı ayrı bir kart olarak çizilir; mikrofon ayarı
    #     "Davranış ayarları"nın içinde kaybolmak yerine kendi başlığını alsın.
    #
    #     'app.mic' satırını MIGRATION DEĞİL, startup seed'i oluşturur
    #     (ensure_app_settings_table, main.py'de bu migration'lardan ÖNCE koşar) —
    #     yeni anahtar olduğu için seed ona ulaşır. Buradaki iş yalnızca:
    #       a) (9) ile yazılmış / adminin değiştirmiş olabileceği eski değerleri taşı,
    #       b) eski anahtarları 'app.flags'ten sil (tek doğru kaynak kalsın).
    #
    #     Alt sorgu 'app.flags' yoksa NULL döner -> COALESCE ile seed değeri kalır.
    ("2026_08_mic_own_key", [
        (
            "UPDATE app_settings SET value = value || jsonb_build_object("
            "  'web_enabled', COALESCE("
            "     (SELECT f.value->'mic_web_enabled' FROM app_settings f WHERE f.key='app.flags'),"
            "     value->'web_enabled'),"
            "  'app_enabled', COALESCE("
            "     (SELECT f.value->'mic_app_enabled' FROM app_settings f WHERE f.key='app.flags'),"
            "     value->'app_enabled')"
            "), updated_at = now() WHERE key = 'app.mic'"
            if _IS_PG else
            # SQLite: json_extract mantıksal değeri 1/0 tamsayısına çevirir; CASE +
            # json() ile GERÇEK json true/false yazıyoruz (Python tarafı `is True`
            # karşılaştırması yapıyor, 1 bunu geçmez).
            "UPDATE app_settings SET value = json_set(value,"
            "  '$.web_enabled', json(CASE WHEN COALESCE("
            "     (SELECT json_extract(f.value,'$.mic_web_enabled') FROM app_settings f WHERE f.key='app.flags'),"
            "     json_extract(value,'$.web_enabled')) IN (1,'true')"
            "   THEN 'true' ELSE 'false' END),"
            "  '$.app_enabled', json(CASE WHEN COALESCE("
            "     (SELECT json_extract(f.value,'$.mic_app_enabled') FROM app_settings f WHERE f.key='app.flags'),"
            "     json_extract(value,'$.app_enabled')) IN (1,'true')"
            "   THEN 'true' ELSE 'false' END)"
            "), updated_at = CURRENT_TIMESTAMP WHERE key = 'app.mic'"
        ),
        (
            "UPDATE app_settings "
            "SET value = value - 'mic_web_enabled' - 'mic_app_enabled', updated_at = now() "
            "WHERE key = 'app.flags'"
            if _IS_PG else
            "UPDATE app_settings "
            "SET value = json_remove(value, '$.mic_web_enabled', '$.mic_app_enabled'), "
            "    updated_at = CURRENT_TIMESTAMP "
            "WHERE key = 'app.flags'"
        ),
    ]),

    # 11) Mikrofon bilgilendirme balonu anahtarları: notice_enabled / notice_text /
    #     notice_times / notice_seconds.
    #
    #     'app.mic' satırı YENİ olduğu için normalde startup seed'i onu bu
    #     anahtarlarla birlikte oluşturur ve buraya iş kalmaz. Ama satır ARADA bir
    #     deploy'da (balon eklenmeden önceki sürümle) çoktan oluşmuş olabilir —
    #     o zaman seed ona bir daha dokunmaz. Bu migration o durumu kapatır.
    #
    #     Birleştirme yönü öncekilerle aynı: varsayılanlar SOLDA, mevcut değer
    #     SAĞDA -> adminin yazdığı metin/sayılar ezilmez.
    ("2026_08_mic_notice", [
        (
            "UPDATE app_settings "
            f"SET value = '{_MIC_NOTICE_KEYS_JSON}'::jsonb || value, updated_at = now() "
            "WHERE key = 'app.mic'"
            if _IS_PG else
            "UPDATE app_settings "
            f"SET value = json_patch('{_MIC_NOTICE_KEYS_JSON}', value), "
            "    updated_at = CURRENT_TIMESTAMP "
            "WHERE key = 'app.mic'"
        ),
    ]),

    # 12) Bant oyun ekranlarında ARTIK GİZLENMİYOR (gerçek cihaz denemesi sonrası
    #     yaklaşım değişikliği). İki iş yapılır:
    #       a) banner_game_offset_extra anahtarı eklenir (yoksa) — oyun ekranındaki
    #          dip elemanların bandın üstüne çekilme payına eklenen ince ayar,
    #       b) banner_hidden_paths BOŞALTILIR.
    #
    #     (b) BİLEREK koşulsuzdur ve öncekilerin aksine mevcut değeri EZER: değişikliğin
    #     tamamı zaten "bu liste artık dolu olmasın" demek. Admin isterse panelden
    #     tek tek yol ekleyip yine gizleyebilir; migration bir kez çalışır, bir daha
    #     o listeye dokunmaz.
    #
    #     Sıra: önce yeni anahtar birleştirilir (varsayılan SOLDA -> adminin girdiği
    #     değer korunur), sonra yol listesi üstüne yazılır.
    ("2026_08_admob_game_offset", [
        (
            "UPDATE app_settings "
            f"SET value = ('{_ADMOB_GAME_OFFSET_JSON}'::jsonb || value) "
            f"          || '{_ADMOB_EMPTY_HIDDEN_JSON}'::jsonb, "
            "    updated_at = now() "
            "WHERE key = 'ads.admob'"
            if _IS_PG else
            "UPDATE app_settings "
            f"SET value = json_patch(json_patch('{_ADMOB_GAME_OFFSET_JSON}', value), "
            f"                       '{_ADMOB_EMPTY_HIDDEN_JSON}'), "
            "    updated_at = CURRENT_TIMESTAMP "
            "WHERE key = 'ads.admob'"
        ),
    ]),

    # 13) Uygulama içi (native) Google girişi için Web istemci kimliği:
    #     'app.flags'.google_web_client_id.
    #
    #     Gerekçe (6)(7)(8)(9) ile aynı ve BURADA ÖZELLİKLE ÖNEMLİ: app_settings
    #     seed'i (ensure_app_settings_table) yalnızca SATIR YOKSA yazar —
    #     "key in existing: continue". Canlıda 'app.flags' satırı çoktan var,
    #     dolayısıyla DEFAULT_APP_SETTINGS'e eklediğim yeni anahtar oraya ASLA
    #     ulaşmaz; alan admin panelinde boş bir kutu olarak bile görünmezdi.
    #
    #     Birleştirme yönü öncekilerle aynı: varsayılan SOLDA, mevcut değer SAĞDA
    #     -> anahtar zaten varsa (ör. admin daha önce girdiyse) EZİLMEZ,
    #     challenge_ttl_seconds de olduğu gibi korunur.
    #
    #     Değer BOŞ gelir: kimliği admin panelden Nazım girecek. Boş olduğu sürece
    #     /auth/google/native 503 döner ve uygulamada buton hiç çizilmez.
    ("2026_08_flags_google_web_client_id", [
        (
            "UPDATE app_settings "
            f"SET value = '{_FLAGS_GOOGLE_JSON}'::jsonb || value, updated_at = now() "
            "WHERE key = 'app.flags'"
            if _IS_PG else
            "UPDATE app_settings "
            f"SET value = json_patch('{_FLAGS_GOOGLE_JSON}', value), "
            "    updated_at = CURRENT_TIMESTAMP "
            "WHERE key = 'app.flags'"
        ),
    ]),

    # 14) GEÇİCİ teşhis paneli anahtarı: 'app.flags'.debug_panel.
    #     Gerekçe (13) ile birebir aynı: seed yalnızca satır yoksa yazar, canlıdaki
    #     'app.flags' satırına yeni anahtar ancak buradan ulaşır.
    #     Varsayılan SOLDA -> anahtar zaten varsa ezilmez.
    #     GEÇİCİ: teşhis bitince bu anahtar ve /menu'deki blok kaldırılacak
    #     (migration kaydı kalır, kod değiştirilmez — bkz. dosya başındaki kural).
    ("2026_08_flags_debug_panel", [
        (
            "UPDATE app_settings "
            f"SET value = '{_FLAGS_DEBUG_JSON}'::jsonb || value, updated_at = now() "
            "WHERE key = 'app.flags'"
            if _IS_PG else
            "UPDATE app_settings "
            f"SET value = json_patch('{_FLAGS_DEBUG_JSON}', value), "
            "    updated_at = CURRENT_TIMESTAMP "
            "WHERE key = 'app.flags'"
        ),
    ]),

    # 15) users.play_games_id için BENZERSİZ indeks.
    #     Sütunun kendisini otomatik migration ekler (app/core/database.py) —
    #     ama o YALNIZCA sütun ekler, indeks/kısıt EKLEMEZ. Modelde unique=True
    #     yazması sıfırdan kurulan veritabanını kapsar, canlıdaki tabloyu değil.
    #     Bu indeks olmadan iki farklı hesaba aynı Play Games oyuncu kimliği
    #     yazılabilirdi (uygulama kodu bunu zaten engelliyor, ama tek savunma
    #     hattı olarak bırakılmaz).
    #     IF NOT EXISTS: iki motorda da var, tekrar çalışsa bile zararsız.
    ("2026_08_users_play_games_id_index", [
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_play_games_id "
        "ON users (play_games_id)",
    ]),

    # 16) "Hızlı Giriş" için users tablosuna eklenen alanların hazırlanması.
    #
    #     a) users.verified geriye dönük doldurma. Sütunu otomatik migration
    #        (app/core/database.py) DEFAULT FALSE ile ekler — yani bu değişiklikten
    #        önce kaydolmuş HERKES bir anda "doğrulanmamış" görünürdü. Oysa
    #        e-postası, şifresi ya da Google/Play Games bağlantısı olan hesap
    #        tanım gereği kurtarılabilirdir: cihaz kaybolsa bile kişi geri girer.
    #        Doğrulanmamış kalması gereken tek grup, bundan SONRA isimle açılacak
    #        hızlı hesaplardır.
    #
    #     b) users.signup_ip için indeks. Hızlı kayıtta "bu IP'den kaç hesap
    #        açılmış" sorusu HER istekte sorulur; indekssiz sorgu kullanıcı tablosunu
    #        baştan sona tarardı. Modeldeki index=True yalnızca SIFIRDAN kurulan
    #        veritabanını kapsar, canlıdaki tabloyu değil (bkz. 15).
    ("2026_08_users_verified_backfill", [
        f"UPDATE users SET verified = {_TRUE} WHERE "
        "email IS NOT NULL OR password_hash IS NOT NULL "
        "OR google_sub IS NOT NULL OR play_games_id IS NOT NULL",
        "CREATE INDEX IF NOT EXISTS ix_users_signup_ip ON users (signup_ip)",
    ]),

    # 17) Ziyaret kaydı SAYACA çevrildi.
    #
    #     ESKİ: daily_visits — ZİYARETÇİ BAŞINA bir satır (visit_date, platform,
    #           visitor_key). Tablo ziyaretçi sayısıyla büyüyordu ve "bu ay kaç
    #           ziyaretçi" sorusu on binlerce satır taramak demekti.
    #     YENİ: daily_stats — gün + ortam + ölçü başına TEK satır, içinde sayı.
    #
    #     Mevcut veri KAYBOLMAZ: eski satırlar gün/ortam bazında toplanıp
    #     sayaca yazılır, sonra eski tablo düşürülür.
    #
    #     SIRA VE DAYANIKLILIK:
    #       a) daily_visits YOKSA (sıfırdan kurulan veritabanı) boş olarak
    #          oluşturulur — böylece aşağıdaki SELECT her iki durumda da çalışır,
    #       b) toplama ON CONFLICT DO NOTHING ile yazılır; migration bir şekilde
    #          yarıda kalıp tekrar denenirse sayılar İKİ KEZ eklenmez,
    #       c) eski tablo düşürülür.
    ("2026_08_daily_visits_to_counter", [
        # (a) yoksa oluştur — iki motorda da geçerli en sade tanım.
        "CREATE TABLE IF NOT EXISTS daily_visits ("
        " id INTEGER PRIMARY KEY, visit_date DATE, platform VARCHAR(10),"
        " visitor_key VARCHAR(48))"
        if not _IS_PG else
        "CREATE TABLE IF NOT EXISTS daily_visits ("
        " id SERIAL PRIMARY KEY, visit_date DATE, platform VARCHAR(10),"
        " visitor_key VARCHAR(48))",
        # (b) gün+ortam bazında topla ve sayaca aktar.
        "INSERT INTO daily_stats (stat_date, platform, metric, count) "
        "SELECT visit_date, platform, 'visitors', COUNT(*) "
        "FROM daily_visits GROUP BY visit_date, platform "
        "ON CONFLICT DO NOTHING",
        # (c) eski tabloya artık yazılmıyor.
        "DROP TABLE IF EXISTS daily_visits",
    ]),

    # 18) Avatarı olmayan hesaplara hazır avatar yazılır.
    #
    #     SORUN: isimle (ve e-postayla) açılan hesaplarda users.avatar_url BOŞ
    #     kalıyordu. Arayüz her ekranda kendi yedeğini üretiyordu — ana sayfa
    #     kullanıcı adına, arkadaş listesi görünen ada, maç ekranı maçtaki ada
    #     göre. Sonuç: aynı kişi her yerde BAŞKA bir yüzle, profil sayfasında
    #     ise sadece baş harfiyle görünüyordu.
    #
    #     Yazılan adres, ana sayfanın BUGÜN gösterdiği yedeğin AYNISIDIR
    #     (thumbs stili, tohum = kullanıcı adı) — kimsenin avatarı değişmez,
    #     yalnız diğer ekranlar da aynı yüzü göstermeye başlar.
    #     Silinmiş hesaplara dokunulmaz (avatarları bilerek temizlenmiştir).
    ("2026_08_default_avatars_backfill", [
        "UPDATE users SET avatar_url = "
        "'https://api.dicebear.com/7.x/thumbs/svg?seed=' || username "
        "WHERE (avatar_url IS NULL OR avatar_url = '') "
        f"AND (deleted IS NULL OR deleted = {_FALSE}) "
        "AND username IS NOT NULL AND username <> ''",
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
