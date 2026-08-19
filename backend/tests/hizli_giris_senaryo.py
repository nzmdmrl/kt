"""Hızlı Giriş — senaryo testleri (CANLI VERİTABANINA DOKUNMAZ).

Nasıl çalışır: geçici bir SQLite dosyası açar, FastAPI uygulamasını bellekte
ayağa kaldırır ve gerçek HTTP istekleri gönderir (ağa çıkmaz, istekler doğrudan
uygulamaya girer). Sonunda dosyayı siler.

Çalıştırma (backend dizininde, bağımlılıkların kurulu olduğu ortamda):
    DATABASE_URL='sqlite+aiosqlite:///./test_hizli.db' JWT_SECRET=test GAME_LANG=tr \\
        python tests/hizli_giris_senaryo.py

Aynı senaryolar canlıdaki motorda (PostgreSQL) da koşturulabilir — taşıma SQL'i
iki motorda da geçerli olmalı. Bunun için TEK KULLANIMLIK bir veritabanı gerekir;
adında "kt_test" geçmeyen hiçbir veritabanına bağlanmaz (aşağıdaki kilit).
"""

from __future__ import annotations

import asyncio
import os
import pathlib
import sys

# Uygulama içe aktarılmadan ÖNCE ayarlanır — yoksa canlı veritabanına bağlanırdı.
DB_FILE = pathlib.Path(__file__).with_name("test_hizli.db")
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{DB_FILE}")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("GAME_LANG", "tr")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

# GÜVENLİK KİLİDİ: test yalnızca SQLite dosyasında ya da adında "kt_test" geçen
# tek kullanımlık bir veritabanında koşar. Canlı veritabanı adı ("kelimetahmin")
# bu kalıba UYMAZ; yanlış DATABASE_URL ile çalıştırılırsa test hemen durur.
_URL = os.environ["DATABASE_URL"]
assert "sqlite" in _URL or "kt_test" in _URL, (
    "TEST CANLI VERİTABANINDA ÇALIŞTIRILAMAZ. DATABASE_URL sqlite olmalı "
    "ya da veritabanı adı 'kt_test' içermeli."
)
if "sqlite" in _URL and DB_FILE.exists():
    DB_FILE.unlink()

import httpx  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.main import app, on_startup  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402

OK, FAIL = 0, 0


def check(label: str, cond: bool, extra: str = "") -> None:
    global OK, FAIL
    if cond:
        OK += 1
        print(f"  ✓ {label}")
    else:
        FAIL += 1
        print(f"  ✗ {label}  {extra}")


def hdr(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def create_pending_token_helper(user_id: int) -> str:
    """/auth/verify'ın ürettiği taşıma jetonunun aynısı (senaryoyu kısaltmak için)."""
    from app.core.security import create_pending_token
    return create_pending_token("quick_transfer", str(user_id), minutes=60)


async def set_setting(key: str, value: str) -> None:
    from app.game import settings_service
    async with AsyncSessionLocal() as db:
        await settings_service.set_setting(db, key, value)


async def db_scalar(sql: str, **params):
    async with AsyncSessionLocal() as db:
        return (await db.execute(text(sql), params)).scalar()


async def main() -> None:
    await on_startup()
    # Ad moderasyonu testleri etkilemesin (kayıt akışıyla ilgisi yok).
    await set_setting("name_moderation_enabled", "0")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:

        # x-forwarded-for ile IP taklidi (captcha.client_ip önce onu okur).
        def ip(addr: str) -> dict:
            return {"x-forwarded-for": addr}

        # ---------------------------------------------------------------
        print("\n1) İsimle hesap açma")
        r = await c.post("/api/auth/quick", json={"name": "Ayşe Gül"},
                         headers=ip("1.1.1.1"))
        check("HTTP 200", r.status_code == 200, r.text)
        d = r.json()
        check("yanıt biçimi web girişiyle aynı ({token, user})",
              "token" in d and "user" in d)
        u = d["user"]
        check("görünen ad yazıldığı gibi kalır", u["display_name"] == "Ayşe Gül",
              u["display_name"])
        check("username Türkçe harflerden türetilir -> aysegul",
              u["username"] == "aysegul", u["username"])
        check("e-posta boş", u["email"] is None)
        check("hesap doğrulanmamış", u["verified"] is False)
        ayse_token = d["token"]

        r = await c.get("/api/auth/me", headers=hdr(ayse_token))
        check("jeton çalışıyor (/auth/me)", r.status_code == 200, r.text)

        # ---------------------------------------------------------------
        print("\n2) Aynı isim ikinci kez -> sıra numarası")
        r = await c.post("/api/auth/quick", json={"name": "ayşe gül"},
                         headers=ip("1.1.1.2"))
        check("username aysegul2", r.json()["user"]["username"] == "aysegul2",
              r.json()["user"]["username"])
        r = await c.post("/api/auth/quick", json={"name": "AYSEGUL"},
                         headers=ip("1.1.1.3"))
        check("üçüncüsü aysegul3", r.json()["user"]["username"] == "aysegul3",
              r.json()["user"]["username"])

        # ---------------------------------------------------------------
        print("\n3) En az 3 harf/rakam şartı")
        r = await c.post("/api/auth/quick", json={"name": "Ay"}, headers=ip("1.1.1.4"))
        check("2 harflik isim reddedilir", r.status_code == 400, r.text)
        r = await c.post("/api/auth/quick", json={"name": "🙂🙂🙂"}, headers=ip("1.1.1.4"))
        check("sadece emoji reddedilir", r.status_code == 400, r.text)
        r = await c.post("/api/auth/quick", json={"name": "A B"}, headers=ip("1.1.1.4"))
        check("boşluk harf sayılmaz ('A B' -> 'ab') reddedilir",
              r.status_code == 400, r.text)

        # ---------------------------------------------------------------
        print("\n4) IP sınırı (admin ayarı)")
        await set_setting("quick_signup_ip_limit", "3")
        for i in range(3):
            r = await c.post("/api/auth/quick", json={"name": f"Sinir Test {i}"},
                             headers=ip("9.9.9.9"))
            check(f"  {i+1}. hesap açıldı", r.status_code == 200, r.text)
        r = await c.post("/api/auth/quick", json={"name": "Sinir Test 4"},
                         headers=ip("9.9.9.9"))
        check("4. hesap engellendi", r.status_code == 400, r.text)
        check("hata mesajı Türkçe ve anlaşılır",
              "hesap sayısına ulaşıldı" in r.json()["detail"], r.text)
        r = await c.post("/api/auth/quick", json={"name": "Baska Ip"},
                         headers=ip("9.9.9.8"))
        check("başka IP etkilenmiyor", r.status_code == 200, r.text)
        await set_setting("quick_signup_ip_limit", "10")

        # Sınır 0 = sınırsız
        await set_setting("quick_signup_ip_limit", "0")
        r = await c.post("/api/auth/quick", json={"name": "Sinirsiz Test"},
                         headers=ip("9.9.9.9"))
        check("0 = sınırsız (aynı IP'den yine açılır)", r.status_code == 200, r.text)
        await set_setting("quick_signup_ip_limit", "10")

        # ---------------------------------------------------------------
        print("\n5) Hesap doğrulama (e-posta + şifre ekleme)")
        r = await c.post("/api/auth/verify",
                         json={"email": "ayse@example.com", "password": "gizli123"},
                         headers=hdr(ayse_token))
        d = r.json()
        check("HTTP 200", r.status_code == 200, r.text)
        check("ok = true", d.get("ok") is True, r.text)
        check("hesap artık doğrulanmış", d["user"]["verified"] is True)
        check("e-posta yazıldı", d["user"]["email"] == "ayse@example.com")
        check("kullanıcı adı DEĞİŞMEDİ", d["user"]["username"] == "aysegul")

        r = await c.post("/api/auth/login",
                         json={"email": "ayse@example.com", "password": "gizli123"})
        check("artık e-posta + şifre ile girilebiliyor", r.status_code == 200, r.text)
        check("aynı hesap", r.json()["user"]["username"] == "aysegul")

        r = await c.post("/api/auth/verify",
                         json={"email": "baska@example.com", "password": "gizli123"},
                         headers=hdr(ayse_token))
        check("zaten e-postası olan hesap tekrar doğrulanamaz",
              r.status_code == 400, r.text)

        r = await c.post("/api/auth/quick", json={"name": "Kisa Sifre"},
                         headers=ip("2.2.2.1"))
        t = r.json()["token"]
        r = await c.post("/api/auth/verify", json={"email": "x@y.com", "password": "123"},
                         headers=hdr(t))
        check("kısa şifre reddedilir", r.status_code == 400, r.text)
        r = await c.post("/api/auth/verify", json={"email": "gecersiz", "password": "gizli123"},
                         headers=hdr(t))
        check("geçersiz e-posta reddedilir", r.status_code == 400, r.text)

        # ---------------------------------------------------------------
        print("\n6) E-posta başka hesapta -> hata DEĞİL, taşıma teklifi")
        # Hedef: siteye normal kaydolmuş "eski" hesap.
        r = await c.post("/api/auth/register",
                         json={"email": "nazim@example.com", "password": "eskisifre",
                               "display_name": "Nazım"},
                         headers=ip("3.3.3.1"))
        check("normal e-posta kaydı çalışıyor (kırılmadı)", r.status_code == 200, r.text)
        eski = r.json()
        check("e-posta ile açılan hesap doğrulanmış geliyor",
              eski["user"]["verified"] is True)
        eski_username = eski["user"]["username"]

        # Kaynak: mobilde isimle açılmış, biraz oynamış hesap.
        r = await c.post("/api/auth/quick", json={"name": "Mobil Nazım"},
                         headers=ip("3.3.3.2"))
        mobil = r.json()
        mobil_id = mobil["user"]["id"]
        mobil_token = mobil["token"]
        async with AsyncSessionLocal() as db:
            await db.execute(text(
                "UPDATE users SET xp = 500, matches_played = 12, wins = 7, "
                "elo = 1180, words_solved = 40, arena_played = 3, arena_first = 1 "
                "WHERE id = :i"), {"i": mobil_id})
            await db.execute(text(
                "INSERT INTO collected_words (user_id, word) VALUES (:i, 'KALEM'), (:i, 'ORTAK')"
            ), {"i": mobil_id})
            await db.execute(text(
                "INSERT INTO arena_history (user_id, rank, score, correct_count, "
                "total_words, player_count) VALUES (:i, 1, 300, 5, 6, 5)"), {"i": mobil_id})
            await db.commit()
        # Hedef hesabın da bir miktar ilerlemesi olsun (birleştirme sınansın).
        async with AsyncSessionLocal() as db:
            await db.execute(text(
                "UPDATE users SET xp = 200, matches_played = 5, wins = 2, elo = 1050 "
                "WHERE username = :u"), {"u": eski_username})
            await db.commit()

        r = await c.post("/api/auth/verify",
                         json={"email": "nazim@example.com", "password": "yenisifre"},
                         headers=hdr(mobil_token))
        d = r.json()
        check("HTTP 200 (hata değil)", r.status_code == 200, r.text)
        check("ok = false", d.get("ok") is False, r.text)
        check("email_in_use bayrağı var", d.get("email_in_use") is True)
        check("taşıma jetonu verildi", bool(d.get("transfer_token")))
        check("ne taşınacağı önizlemesi var", d["progress"]["xp"] == 500, str(d.get("progress")))
        check("kullanıcıya gösterilecek mesaj var", "taşıyabilirsin" in d["message"])
        transfer_token = d["transfer_token"]

        check("e-posta KAYNAK hesaba yazılmadı",
              await db_scalar("SELECT email FROM users WHERE id = :i", i=mobil_id) is None)

        # ---------------------------------------------------------------
        print("\n7) İlerleme taşıma")
        r = await c.post("/api/auth/login",
                         json={"email": "nazim@example.com", "password": "eskisifre"})
        eski_token = r.json()["token"]
        eski_id = r.json()["user"]["id"]

        r = await c.post("/api/auth/transfer", json={"transfer_token": transfer_token},
                         headers=hdr(eski_token))
        check("HTTP 200", r.status_code == 200, r.text)
        d = r.json()
        u = d["user"]
        check("XP toplandı (200 + 500)", u["xp"] == 700, str(u["xp"]))
        check("maç sayısı toplandı (5 + 12)", u["matches_played"] == 17, str(u["matches_played"]))
        check("galibiyet toplandı (2 + 7)", u["wins"] == 9, str(u["wins"]))
        check("ELO toplanmadı, yüksek olan alındı (1180)", u["elo"] == 1180, str(u["elo"]))
        check("arena katılımı taşındı", u["arena_played"] == 3, str(u["arena_played"]))
        check("hedefin kullanıcı adı DEĞİŞMEDİ", u["username"] == eski_username, u["username"])
        check("özet döndü", d["moved"]["xp_added"] == 500, str(d.get("moved")))

        check("kaynak hesap silindi",
              await db_scalar("SELECT COUNT(*) FROM users WHERE id = :i", i=mobil_id) == 0)
        check("toplanan kelimeler taşındı",
              await db_scalar("SELECT COUNT(*) FROM collected_words WHERE user_id = :i",
                              i=eski_id) == 2)
        check("arena geçmişi taşındı",
              await db_scalar("SELECT COUNT(*) FROM arena_history WHERE user_id = :i",
                              i=eski_id) == 1)
        r = await c.get("/api/auth/me", headers=hdr(mobil_token))
        check("kaynak hesabın eski jetonu artık geçersiz", r.status_code == 401, r.text)

        # ---------------------------------------------------------------
        print("\n7b) Taşımanın çakışan kayıtları birleştirmesi")
        # Kaynak ve hedefin AYNI gün lig puanı, AYNI maraton bölümü, AYNI
        # arkadaşı ve AYNI günün kelimesi çözümü olsun — benzersizlik kısıtları
        # yüzünden düz bir "sahibini değiştir" burada patlardı.
        r = await c.post("/api/auth/register",
                         json={"email": "hedef2@example.com", "password": "sifre123",
                               "display_name": "Hedef Iki"}, headers=ip("7.7.7.1"))
        hedef2_token, hedef2 = r.json()["token"], r.json()["user"]
        hedef2_id, hedef2_uname = hedef2["id"], hedef2["username"]

        r = await c.post("/api/auth/quick", json={"name": "Kaynak Iki"},
                         headers=ip("7.7.7.2"))
        kaynak2_id, kaynak2_token = r.json()["user"]["id"], r.json()["token"]
        kaynak2_uname = r.json()["user"]["username"]

        # Ortak arkadaş + kaynak ile hedefin kendi aralarındaki arkadaşlığı.
        r = await c.post("/api/auth/quick", json={"name": "Ortak Arkadas"},
                         headers=ip("7.7.7.3"))
        arkadas_id = r.json()["user"]["id"]

        pair = {"s": kaynak2_id, "d": hedef2_id, "f": arkadas_id}
        async with AsyncSessionLocal() as db:
            # Lig puanı: aynı gün ikisinde de var (70 ve 120) -> yüksek olan kalmalı,
            # maç sayıları toplanmalı. Farklı gün ise taşınmalı.
            await db.execute(text(
                "INSERT INTO daily_scores (user_id, score_date, best_score, matches) VALUES "
                "(:d, '2026-08-01', 70, 2), (:s, '2026-08-01', 120, 3), "
                "(:s, '2026-08-02', 90, 1)"), pair)
            # Maraton: aynı bölüm (3) ikisinde de -> en iyi yıldız kalmalı,
            # denemeler toplanmalı. Bölüm 4 sadece kaynakta -> taşınmalı.
            await db.execute(text(
                "INSERT INTO solo_progress (user_id, current_level, total_stars) VALUES "
                "(:d, 3, 5), (:s, 7, 14)"), pair)
            await db.execute(text(
                "INSERT INTO solo_level_results (user_id, level, best_stars, attempts) VALUES "
                "(:d, 3, 1, 2), (:s, 3, 3, 4), (:s, 4, 2, 1)"), pair)
            # Arkadaşlıklar: ortak arkadaş (iki tarafta da) + kaynak<->hedef.
            await db.execute(text(
                "INSERT INTO friendships (requester_id, addressee_id, status) VALUES "
                "(:d, :f, 'accepted'), (:s, :f, 'accepted'), (:s, :d, 'accepted')"), pair)
            # Günün kelimesi: aynı gün+uzunluk ikisinde de çözülmüş.
            await db.execute(text(
                "INSERT INTO daily_solves (solve_date, length, solver) VALUES "
                "('2026-08-01', 5, :dk), ('2026-08-01', 5, :sk), ('2026-08-02', 5, :sk)"),
                {"dk": f"u{hedef2_id}", "sk": f"u{kaynak2_id}"})
            # Maç geçmişi: kaynağın kullanıcı adıyla yazılmış satır.
            await db.execute(text(
                "INSERT INTO match_history (p1_name, p2_name, p1_username, p2_username, "
                "p1_score, p2_score, winner_name, has_bot) VALUES "
                "('Kaynak Iki', 'Biri', :su, 'biri', 100, 50, 'Kaynak Iki', :hb)"),
                {"su": kaynak2_uname, "hb": False})
            await db.commit()

        tok = create_pending_token_helper(kaynak2_id)
        r = await c.post("/api/auth/transfer", json={"transfer_token": tok},
                         headers=hdr(hedef2_token))
        check("HTTP 200", r.status_code == 200, r.text)

        check("aynı günün lig puanı: yüksek olan kaldı (120)",
              await db_scalar("SELECT best_score FROM daily_scores WHERE user_id=:i "
                              "AND score_date='2026-08-01'", i=hedef2_id) == 120)
        check("aynı günün maç sayısı toplandı (2+3)",
              await db_scalar("SELECT matches FROM daily_scores WHERE user_id=:i "
                              "AND score_date='2026-08-01'", i=hedef2_id) == 5)
        check("diğer günün puanı taşındı",
              await db_scalar("SELECT COUNT(*) FROM daily_scores WHERE user_id=:i",
                              i=hedef2_id) == 2)
        check("kaynağa ait lig puanı kalmadı",
              await db_scalar("SELECT COUNT(*) FROM daily_scores WHERE user_id=:i",
                              i=kaynak2_id) == 0)

        check("maraton: ileri bölüm kaldı (7)",
              await db_scalar("SELECT current_level FROM solo_progress WHERE user_id=:i",
                              i=hedef2_id) == 7)
        check("maraton: tek satır kaldı",
              await db_scalar("SELECT COUNT(*) FROM solo_progress WHERE user_id IN "
                              "(:i, :j)", i=hedef2_id, j=kaynak2_id) == 1)
        check("aynı bölümde en iyi yıldız kaldı (3)",
              await db_scalar("SELECT best_stars FROM solo_level_results WHERE user_id=:i "
                              "AND level=3", i=hedef2_id) == 3)
        check("aynı bölümde denemeler toplandı (2+4)",
              await db_scalar("SELECT attempts FROM solo_level_results WHERE user_id=:i "
                              "AND level=3", i=hedef2_id) == 6)
        check("diğer bölüm taşındı",
              await db_scalar("SELECT COUNT(*) FROM solo_level_results WHERE user_id=:i",
                              i=hedef2_id) == 2)

        check("ortak arkadaş iki kez yazılmadı",
              await db_scalar("SELECT COUNT(*) FROM friendships WHERE "
                              "(requester_id=:i AND addressee_id=:f) OR "
                              "(requester_id=:f AND addressee_id=:i)",
                              i=hedef2_id, f=arkadas_id) == 1)
        check("kendi kendine arkadaşlık oluşmadı",
              await db_scalar("SELECT COUNT(*) FROM friendships WHERE "
                              "requester_id = addressee_id") == 0)
        check("kaynağa ait arkadaşlık kalmadı",
              await db_scalar("SELECT COUNT(*) FROM friendships WHERE requester_id=:i "
                              "OR addressee_id=:i", i=kaynak2_id) == 0)

        check("günün kelimesi çözümleri birleşti (2 satır)",
              await db_scalar("SELECT COUNT(*) FROM daily_solves WHERE solver=:k",
                              k=f"u{hedef2_id}") == 2)
        check("kaynağın çözüm anahtarı kalmadı",
              await db_scalar("SELECT COUNT(*) FROM daily_solves WHERE solver=:k",
                              k=f"u{kaynak2_id}") == 0)

        check("maç geçmişindeki profil linki hedefe çevrildi",
              await db_scalar("SELECT COUNT(*) FROM match_history WHERE p1_username=:u",
                              u=hedef2_uname) == 1)
        check("maç geçmişinde kırık link kalmadı",
              await db_scalar("SELECT COUNT(*) FROM match_history WHERE p1_username=:u",
                              u=kaynak2_uname) == 0)
        check("kaynak hesap silindi",
              await db_scalar("SELECT COUNT(*) FROM users WHERE id=:i", i=kaynak2_id) == 0)

        # ---------------------------------------------------------------
        print("\n8) Taşıma güvenliği")
        # a) Doğrulanmış bir hesap KAYNAK olamaz (kimse gerçek hesap yutamaz).
        r = await c.post("/api/auth/quick", json={"name": "Kurban Hesap"},
                         headers=ip("4.4.4.1"))
        kurban_id = r.json()["user"]["id"]
        kurban_token = r.json()["token"]
        await c.post("/api/auth/verify",
                     json={"email": "kurban@example.com", "password": "gizli123"},
                     headers=hdr(kurban_token))
        sahte = create_pending_token_helper(kurban_id)
        r = await c.post("/api/auth/transfer", json={"transfer_token": sahte},
                         headers=hdr(eski_token))
        check("doğrulanmış hesap taşınamaz (409)", r.status_code == 409, r.text)
        check("kurban hesap yerinde duruyor",
              await db_scalar("SELECT COUNT(*) FROM users WHERE id = :i", i=kurban_id) == 1)

        # b) Uydurma / yanlış türde jeton geçmez.
        r = await c.post("/api/auth/transfer", json={"transfer_token": "uydurma.jeton.x"},
                         headers=hdr(eski_token))
        check("geçersiz jeton reddedilir (401)", r.status_code == 401, r.text)
        from app.core.security import create_pending_token
        yanlis_tur = create_pending_token("pg_pending", str(kurban_id))
        r = await c.post("/api/auth/transfer", json={"transfer_token": yanlis_tur},
                         headers=hdr(eski_token))
        check("başka amaçlı jeton kabul edilmez (401)", r.status_code == 401, r.text)

        # c) Ara jeton oturum jetonu yerine kullanılamaz.
        r = await c.get("/api/auth/me", headers=hdr(sahte))
        check("ara jetonla oturum açılamaz (401)", r.status_code == 401, r.text)

        # d) Giriş yapmadan taşıma/doğrulama yok.
        r = await c.post("/api/auth/transfer", json={"transfer_token": sahte})
        check("girişsiz taşıma reddedilir (401)", r.status_code == 401, r.text)
        r = await c.post("/api/auth/verify", json={"email": "a@b.com", "password": "gizli123"})
        check("girişsiz doğrulama reddedilir (401)", r.status_code == 401, r.text)

        # ---------------------------------------------------------------
        print("\n9) Hızlı giriş kapatma anahtarı")
        await set_setting("quick_signup_enabled", "0")
        r = await c.get("/api/auth/quick/status")
        check("durum ucu kapalı diyor", r.json()["enabled"] is False, r.text)
        check("şerit süresi de aynı uçtan geliyor (arayüz Aşama 2)",
              r.json().get("verify_banner_days") == 3, r.text)
        r = await c.post("/api/auth/quick", json={"name": "Kapali Test"},
                         headers=ip("5.5.5.1"))
        check("kapalıyken hesap açılamaz (503)", r.status_code == 503, r.text)
        await set_setting("quick_signup_enabled", "1")
        r = await c.post("/api/auth/quick", json={"name": "Acik Test"},
                         headers=ip("5.5.5.1"))
        check("tekrar açılınca çalışıyor", r.status_code == 200, r.text)

        # ---------------------------------------------------------------
        print("\n10) Mevcut kullanıcılar (geriye dönük doldurma)")
        # Değişiklikten ÖNCE kaydolmuş bir kullanıcıyı taklit et: e-postası var
        # ama verified sütunu FALSE (sütun sonradan eklendiği için).
        await c.post("/api/auth/register",
                     json={"email": "eski@example.com", "password": "eskisifre",
                           "display_name": "Eski Uye"},
                     headers=ip("6.6.6.1"))
        async with AsyncSessionLocal() as db:
            await db.execute(text(
                "UPDATE users SET verified = :v WHERE username = 'eskiuye'"),
                {"v": False})
            await db.commit()
        check("taklit hazır: e-postası var ama verified = 0",
              await db_scalar("SELECT verified FROM users WHERE username='eskiuye'")
              in (0, False))
        from app.core.migrations import DATA_MIGRATIONS
        sqls = dict(DATA_MIGRATIONS)["2026_08_users_verified_backfill"]
        async with AsyncSessionLocal() as db:
            for sql in sqls:
                await db.execute(text(sql))
            await db.commit()
        check("e-postası olan eski kullanıcı doğrulanmış sayıldı",
              await db_scalar("SELECT verified FROM users WHERE username='eskiuye'") in (1, True))
        check("isimle açılmış hesap doğrulanmamış KALDI",
              await db_scalar("SELECT verified FROM users WHERE username='aysegul2'") in (0, False))

        # ---------------------------------------------------------------
        print("\n11) Jeton ömrü (mobil için uzun)")
        from app.core.security import TOKEN_EXPIRE_DAYS
        check("oturum jetonu en az 1 yıl geçerli", TOKEN_EXPIRE_DAYS >= 365,
              str(TOKEN_EXPIRE_DAYS))

    motor = "PostgreSQL" if "postgres" in _URL else "SQLite"
    print(f"\n{'='*52}\nSONUÇ ({motor}):  {OK} başarılı, {FAIL} başarısız\n{'='*52}")
    if DB_FILE.exists():
        DB_FILE.unlink()
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    asyncio.run(main())
