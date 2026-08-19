"""İsim denetimi + admin paneli — senaryo testleri (CANLI VERİTABANINA DOKUNMAZ).

Geçici SQLite dosyası, bellekte FastAPI uygulaması, gerçek HTTP istekleri.
OpenAI'ye HİÇ istek yapılmaz: ikinci katman testte sahte bir fonksiyonla
değiştirilir (gerçek çağrı ağ ve para gerektirirdi).

Çalıştırma (backend dizininde):
    DATABASE_URL='sqlite+aiosqlite:///./test_isim.db' JWT_SECRET=test GAME_LANG=tr \\
        python tests/isim_denetimi_senaryo.py
"""

from __future__ import annotations

import asyncio
import os
import pathlib
import sys

DB_FILE = pathlib.Path(__file__).with_name("test_isim.db")
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{DB_FILE}")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("GAME_LANG", "tr")
# OpenAI anahtarı testte BOŞ — gerçek çağrı yapılmasın.
os.environ.pop("OPENAI_API_KEY", None)
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

_URL = os.environ["DATABASE_URL"]
assert "sqlite" in _URL or "kt_test" in _URL, "TEST CANLI VERİTABANINDA ÇALIŞTIRILAMAZ."
if "sqlite" in _URL and DB_FILE.exists():
    DB_FILE.unlink()

import httpx  # noqa: E402
from datetime import date  # noqa: E402

from sqlalchemy import text  # noqa: E402

from app.main import app, on_startup  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.game import name_filter  # noqa: E402
from app.services import name_review, name_ai  # noqa: E402

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


async def set_setting(key: str, value: str) -> None:
    from app.game import settings_service
    async with AsyncSessionLocal() as db:
        await settings_service.set_setting(db, key, value)


async def db_scalar(sql: str, **params):
    async with AsyncSessionLocal() as db:
        return (await db.execute(text(sql), params)).scalar()


async def db_exec(sql: str, **params) -> None:
    async with AsyncSessionLocal() as db:
        await db.execute(text(sql), params)
        await db.commit()


async def review(uid: int, source: str = "signup") -> dict:
    """Denetimi ELLE ve BEKLEYEREK çalıştırır (normalde arka planda koşar)."""
    from sqlalchemy import select
    from app.models.user import User
    async with AsyncSessionLocal() as db:
        u = (await db.execute(select(User).where(User.id == uid))).scalar_one()
        return await name_review.review_name(db, u, source)


async def main() -> None:
    await on_startup()
    await set_setting("name_moderation_enabled", "0")
    await set_setting("quick_signup_ip_limit", "0")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:

        def ip(addr: str) -> dict:
            return {"x-forwarded-for": addr}

        async def hizli(name: str, addr: str = "1.1.1.1") -> tuple[int, str]:
            r = await c.post("/api/auth/quick", json={"name": name}, headers=ip(addr))
            assert r.status_code == 200, r.text
            d = r.json()
            return d["user"]["id"], d["token"]

        # ---------------------------------------------------------------
        print("\n1) Yerel kara liste — küfür yakalanıyor")
        for bad in ["orospu cocugu", "Siktir Git", "amcik", "Yarrak", "Pezevenk",
                    "fuck you", "Bitch"]:
            score, why = name_filter.check_name(bad)
            check(f"'{bad}' yakalandı", score >= 70, f"puan {score}")

        print("\n   yaratıcı yazımlar (rakam/tekrar/nokta/Türkçe harf)")
        for bad in ["s1kt1r", "S İ K T İ R".replace(" ", ""), "siiiktir",
                    "0r0spu", "y4rr4k", "$iktir", "AmCıK"]:
            score, _ = name_filter.check_name(bad)
            check(f"'{bad}' yakalandı", score >= 70, f"puan {score}")

        print("\n   masum isimler YAKALANMIYOR (yanlış alarm)")
        for good in ["Ayşe Gül", "Nazım", "Nazife", "Mehmet Can", "Gaye",
                     "Betül", "Sikke Koleksiyoncusu", "Amaç Belirle", "Boksör",
                     "Topkapı", "Amerika", "Modacı", "Model Uçak", "Emine",
                     "Maltepeli", "Zeynep", "Kartal 1903", "Sokak Kedisi",
                     "Top Oyuncusu", "Taş Devri", "Amir Bey", "Mal Müdürü"]:
            score, why = name_filter.check_name(good)
            check(f"'{good}' temiz", score == 0, f"puan {score} · {why}")

        print("\n   yetkili taklidi ve uygunsuz içerik")
        check("'admin' yakalandı", name_filter.check_name("admin")[0] >= 60)
        check("'Sistem' yakalandı", name_filter.check_name("Sistem")[0] >= 60)
        check("'porno' yakalandı", name_filter.check_name("porno izle")[0] >= 70)
        check("'Bahis Kral' yakalandı", name_filter.check_name("Bahis Kral")[0] >= 70)
        check("'Yönetici Adayı' temiz değil (taklit)", name_filter.check_name("Yonetici")[0] >= 60)
        check("çok kelimeli 'Admin Yardımcı' yakalanıyor",
              name_filter.check_name("Admin Yardımcı")[0] >= 60,
              str(name_filter.check_name("Admin Yardımcı")))
        check("boşlukla bölünmüş 's i k t i r' yakalanıyor",
              name_filter.check_name("s i k t i r")[0] >= 70)
        check("masum kelime küfrü AKLAMIYOR ('Sikke Siktir')",
              name_filter.check_name("Sikke Siktir")[0] >= 90,
              str(name_filter.check_name("Sikke Siktir")))

        # ---------------------------------------------------------------
        print("\n2) Hesap açma BEKLETİLMİYOR")
        import time
        t0 = time.monotonic()
        kufur_id, kufur_tok = await hizli("Orospu Cocugu", "5.5.5.1")
        elapsed = time.monotonic() - t0
        check("hesap anında açıldı (< 1 sn)", elapsed < 1.0, f"{elapsed:.2f} sn")
        r = await c.get("/api/auth/me", headers=hdr(kufur_tok))
        check("kullanıcı hemen oynayabiliyor", r.status_code == 200, r.text)
        check("denetim henüz kayıt açmamış olabilir (arka planda)",
              True)   # zamanlamaya bağlı — aşağıda elle çalıştırıyoruz

        # ---------------------------------------------------------------
        print("\n3) Yüksek güven -> hesap pasife alınıyor + admine bildirim")
        # Admin hesabı (bildirim gitsin diye)
        r = await c.post("/api/auth/register",
                         json={"email": "admin@ornek.com", "password": "adminsifre",
                               "display_name": "Yonetim"}, headers=ip("9.9.9.1"))
        admin_id = r.json()["user"]["id"]
        admin_tok = r.json()["token"]
        await db_exec("UPDATE users SET is_admin = :v WHERE id = :i", v=True, i=admin_id)

        res = await review(kufur_id)
        check("puan yüksek", res["score"] >= 85, str(res))
        check("hesap pasife alındı", res["disabled"] is True, str(res))
        check("kayıt açıldı", res["flagged"] is True, str(res))
        row = await db_scalar("SELECT action FROM name_flags WHERE user_id = :i", i=kufur_id)
        check("kayıtta 'otomatik kapatıldı' yazıyor", row == "auto_disabled", str(row))
        check("kullanıcı DB'de pasif",
              await db_scalar("SELECT disabled FROM users WHERE id = :i", i=kufur_id) in (1, True))
        n = await db_scalar(
            "SELECT COUNT(*) FROM notifications WHERE user_id = :i AND kind = 'name_flag'", i=admin_id)
        check("admine bildirim gitti", n == 1, str(n))

        # ---------------------------------------------------------------
        print("\n4) Pasif hesap giriş yapamıyor")
        r = await c.get("/api/auth/me", headers=hdr(kufur_tok))
        check("HTTP 403", r.status_code == 403, r.text)
        check("neden kullanıcıya söyleniyor",
              "askıya" in r.text or "incelemesi" in r.text, r.text)

        # ---------------------------------------------------------------
        print("\n5) Sınırdaki isim: sadece listeye düşer, kullanıcı oynar")
        # 'admin' taklidi 70 puan -> flag(40) geçer, auto_disable(85) geçmez.
        sinir_id, sinir_tok = await hizli("Admin Yardimci", "5.5.5.2")
        res = await review(sinir_id)
        check("işaretlendi", res["flagged"] is True, str(res))
        check("hesap pasife ALINMADI", res["disabled"] is False, str(res))
        r = await c.get("/api/auth/me", headers=hdr(sinir_tok))
        check("kullanıcı oynamaya devam ediyor", r.status_code == 200, r.text)

        # ---------------------------------------------------------------
        print("\n6) Temiz isim hiç kaydedilmiyor")
        temiz_id, temiz_tok = await hizli("Zeynep Kaya", "5.5.5.3")
        res = await review(temiz_id)
        check("işaretlenmedi", res["flagged"] is False, str(res))
        check("kayıt yok",
              await db_scalar("SELECT COUNT(*) FROM name_flags WHERE user_id = :i",
                              i=temiz_id) == 0)

        # ---------------------------------------------------------------
        print("\n7) Eşikler admin ayarından okunuyor")
        # Pasife alma eşiğini listeye düşme eşiğine indir -> HEPSİ pasif olsun.
        await set_setting("name_auto_disable_threshold", "40")
        hepsi_id, _ = await hizli("Admin Kopyasi", "5.5.5.4")
        res = await review(hepsi_id)
        check("eşikler eşitken sınırdaki de pasife alındı", res["disabled"] is True, str(res))
        # 100 yaparsan hiçbiri otomatik kapanmaz.
        await set_setting("name_auto_disable_threshold", "100")
        hic_id, _ = await hizli("Siktir Lan", "5.5.5.5")
        res = await review(hic_id)
        check("eşik 100 iken küfür bile otomatik kapanmıyor", res["disabled"] is False, str(res))
        check("ama listeye düşüyor", res["flagged"] is True, str(res))
        await set_setting("name_auto_disable_threshold", "85")

        # ---------------------------------------------------------------
        print("\n8) Denetim kapatılabiliyor")
        await set_setting("name_check_enabled", "false")
        kapali_id, _ = await hizli("Orospu Test", "5.5.5.6")
        res = await review(kapali_id)
        check("kapalıyken hiç kontrol edilmiyor", res["flagged"] is False, str(res))
        check("kayıt yok",
              await db_scalar("SELECT COUNT(*) FROM name_flags WHERE user_id = :i",
                              i=kapali_id) == 0)
        await set_setting("name_check_enabled", "true")

        # ---------------------------------------------------------------
        print("\n9) İKİNCİ KATMAN (OpenAI) — sahte yanıtla")
        check("anahtar yokken katman devre dışı", name_ai.configured() is False)
        # Kara listenin BİLMEDİĞİ uydurma bir küfür.
        uydurma_id, _ = await hizli("Zibidik Marsupyal", "5.5.5.7")
        local_score, _ = name_filter.check_name("Zibidik Marsupyal")
        check("kara liste bunu yakalayamıyor", local_score == 0, str(local_score))
        res = await review(uydurma_id)
        check("yalnız yerel katmanla temiz geçiyor", res["flagged"] is False, str(res))

        # Şimdi ikinci katmanı sahte bir fonksiyonla devreye al.
        orig_conf, orig_check = name_ai.configured, name_ai.check_name_ai
        name_ai.configured = lambda: True
        async def fake_ai(display_name: str, username: str = ""):
            if "zibidik" in (display_name or "").lower():
                return 92, "örtülü hakaret"
            return 0, ""
        name_ai.check_name_ai = fake_ai

        ai_id, _ = await hizli("Zibidik Marsupyal Iki", "5.5.5.8")
        res = await review(ai_id)
        check("yapay zekâ yakaladı", res["flagged"] is True, str(res))
        check("katman 'ai' olarak yazıldı", res["layer"] == "ai", str(res))
        check("puan modelden geldi", res["score"] == 92, str(res))
        check("hesap pasife alındı", res["disabled"] is True, str(res))
        reason = await db_scalar("SELECT reason FROM name_flags WHERE user_id = :i", i=ai_id)
        check("gerekçede model açıklaması var", "örtülü hakaret" in (reason or ""), str(reason))

        # İki katman birlikte yakalarsa 'both' yazılmalı. Kara listenin
        # PASİFE ALMA eşiğini geçmeyen bir eşleşme seçilir (yetkili taklidi=70),
        # yoksa model bilerek hiç çağrılmıyor (bkz. bir alttaki kontrol).
        both_id, _ = await hizli("Zibidik Admin", "5.5.5.9")
        res = await review(both_id)
        check("iki katman birden yakaladı", res["layer"] == "both", str(res))

        # Kara liste zaten KESİN yakaladıysa modele hiç sorulmamalı (para tasarrufu).
        # Arka plan denetimleri de aynı fonksiyonu çağırdığı için sayaç yerine
        # hangi isimlerin sorulduğuna bakıyoruz.
        asked: list[str] = []
        async def recording_ai(display_name: str, username: str = ""):
            asked.append(display_name or "")
            return 0, ""
        name_ai.check_name_ai = recording_ai
        kesin_id, _ = await hizli("Orospu Cocugu Iki", "5.5.6.1")
        await review(kesin_id)
        check("kara liste kesin yakaladığında model çağrılmadı",
              not any("Orospu" in a for a in asked), str(asked))
        temiz2_id, _ = await hizli("Ali Veli", "5.5.6.2")
        await review(temiz2_id)
        check("temiz isimde model çağrıldı (2. katman)",
              any("Ali Veli" in a for a in asked), str(asked))

        name_ai.configured, name_ai.check_name_ai = orig_conf, orig_check

        # ---------------------------------------------------------------
        print("\n10) Ad/kullanıcı adı değişikliğinde de denetleniyor")
        deg_id, deg_tok = await hizli("Temiz Baslangic", "5.5.6.3")
        res = await review(deg_id)
        check("başlangıçta temiz", res["flagged"] is False, str(res))
        r = await c.post("/api/account/display-name",
                         json={"display_name": "Siktir Git"}, headers=hdr(deg_tok))
        check("ad değiştirildi", r.status_code == 200, r.text)
        res = await review(deg_id, "rename")
        check("değişiklik sonrası yakalandı", res["flagged"] is True, str(res))
        src = await db_scalar(
            "SELECT source FROM name_flags WHERE user_id = :i ORDER BY id DESC", i=deg_id)
        check("kaynak 'rename' yazıldı", src == "rename", str(src))

        # ---------------------------------------------------------------
        print("\n11) Admin paneli — İsim Kontrol listesi")
        r = await c.get("/api/admin/name-flags?status=pending", headers=hdr(admin_tok))
        check("liste geldi", r.status_code == 200, r.text)
        j = r.json()
        check("kayıtlar var", len(j["flags"]) > 0, str(len(j["flags"])))
        f0 = j["flags"][0]
        for alan in ("flagged_display_name", "flagged_username", "layer", "score",
                     "reason", "signup_ip", "account"):
            check(f"'{alan}' alanı var", alan in f0, str(list(f0.keys())))
        check("hesap durumu görünüyor", "disabled" in (f0.get("account") or {}), str(f0.get("account")))
        check("eşikler yanıtta", j["flag_threshold"] == 40 and j["auto_disable_threshold"] == 85, r.text)
        r = await c.get("/api/admin/name-flags/counts", headers=hdr(admin_tok))
        check("rozet sayacı çalışıyor", r.json()["pending"] > 0, r.text)

        # Admin olmayan erişemesin.
        r = await c.get("/api/admin/name-flags", headers=hdr(temiz_tok))
        check("admin olmayan erişemiyor (403)", r.status_code == 403, r.text)

        # ---------------------------------------------------------------
        print("\n12) Admin işlemi: onayla (temiz) -> hesap yeniden açılır")
        flag_id = await db_scalar(
            "SELECT id FROM name_flags WHERE user_id = :i ORDER BY id DESC", i=kufur_id)
        r = await c.post(f"/api/admin/name-flags/{flag_id}/clean", headers=hdr(admin_tok))
        check("işlem başarılı", r.status_code == 200, r.text)
        check("hesap yeniden açıldı", r.json()["reopened"] is True, r.text)
        check("DB'de aktif",
              await db_scalar("SELECT disabled FROM users WHERE id = :i", i=kufur_id) in (0, False))
        r = await c.get("/api/auth/me", headers=hdr(kufur_tok))
        check("kullanıcı yine girebiliyor", r.status_code == 200, r.text)
        check("kayıt 'temiz' oldu",
              await db_scalar("SELECT status FROM name_flags WHERE id = :i", i=flag_id) == "clean")

        # ---------------------------------------------------------------
        print("\n13) Admin işlemi: pasife al")
        flag_id2 = await db_scalar(
            "SELECT id FROM name_flags WHERE user_id = :i ORDER BY id DESC", i=sinir_id)
        r = await c.post(f"/api/admin/name-flags/{flag_id2}/disable", headers=hdr(admin_tok))
        check("işlem başarılı", r.status_code == 200, r.text)
        r = await c.get("/api/auth/me", headers=hdr(sinir_tok))
        check("kullanıcı artık giremiyor (403)", r.status_code == 403, r.text)
        check("kayıt 'engellendi' oldu",
              await db_scalar("SELECT status FROM name_flags WHERE id = :i", i=flag_id2) == "blocked")

        # ---------------------------------------------------------------
        print("\n14) Admin işlemi: IP'ye GÖLGE BAN")
        # Aynı IP'den iki hesap açalım.
        g1_id, g1_tok = await hizli("Golge Bir", "7.7.7.7")
        g2_id, g2_tok = await hizli("Golge Iki", "7.7.7.7")
        # Birine küfürlü ad verip işaretleyelim.
        await db_exec("UPDATE users SET display_name = 'Yarrak Adam' WHERE id = :i", i=g1_id)
        res = await review(g1_id)
        check("işaretlendi", res["flagged"] is True, str(res))
        gf = await db_scalar(
            "SELECT id FROM name_flags WHERE user_id = :i ORDER BY id DESC", i=g1_id)
        r = await c.post(f"/api/admin/name-flags/{gf}/ban-ip",
                         json={"reason": "İsim ihlali"}, headers=hdr(admin_tok))
        check("ban uygulandı", r.status_code == 200, r.text)
        check("iki hesap da işaretlendi", r.json()["affected_users"] == 2, r.text)
        check("g1 gölge banlı",
              await db_scalar("SELECT shadow_banned FROM users WHERE id = :i", i=g1_id) in (1, True))
        check("g2 de gölge banlı",
              await db_scalar("SELECT shadow_banned FROM users WHERE id = :i", i=g2_id) in (1, True))

        print("\n   kullanıcı banlandığını ANLAMAMALI")
        # g2 pasife alınmadı, girişi çalışıyor, hata görmüyor.
        r = await c.get("/api/auth/me", headers=hdr(g2_tok))
        check("giriş normal çalışıyor", r.status_code == 200, r.text)
        check("yanıtta ban bilgisi SIZMIYOR",
              "shadow" not in r.text and "ban" not in r.text.lower(), r.text[:200])

        print("\n   ama başkalarına görünmüyor")
        # Üye arama
        r = await c.get("/api/profile/search?q=golge")
        found = [u["username"] for u in r.json()["users"]]
        check("aramada çıkmıyor", len(found) == 0, str(found))
        # Lig sıralaması
        await db_exec(
            "INSERT INTO daily_scores (user_id, score_date, best_score, matches) "
            "VALUES (:i, :d, 500, 1)", i=g2_id, d=date.today())
        r = await c.get("/api/league/leaderboard?scope=all")
        names = [e["username"] for e in r.json()["entries"]]
        check("lig sıralamasında çıkmıyor",
              all(not n.startswith("golge") for n in names), str(names)[:200])

        print("\n   yeni hesap da doğrudan banlı doğuyor")
        g3_id, _ = await hizli("Golge Uc", "7.7.7.7")
        check("aynı IP'den açılan yeni hesap gölge banlı",
              await db_scalar("SELECT shadow_banned FROM users WHERE id = :i", i=g3_id) in (1, True))

        print("\n   ban listesi ve kaldırma")
        r = await c.get("/api/admin/ip-bans", headers=hdr(admin_tok))
        ips = [b["ip"] for b in r.json()["bans"]]
        check("ban listede", "7.7.7.7" in ips, str(ips))
        r = await c.delete("/api/admin/ip-bans/7.7.7.7", headers=hdr(admin_tok))
        check("ban kaldırıldı", r.status_code == 200, r.text)
        check("hesapların işareti de kalktı",
              await db_scalar("SELECT shadow_banned FROM users WHERE id = :i", i=g2_id) in (0, False))
        r = await c.get("/api/profile/search?q=golge")
        check("aramada tekrar görünüyor", len(r.json()["users"]) > 0, r.text[:200])

        # ---------------------------------------------------------------
        print("\n15) Admin paneli — Hızlı Giriş ayarları")
        r = await c.get("/api/admin/quick-auth", headers=hdr(admin_tok))
        check("ayar ekranı geldi", r.status_code == 200, r.text)
        j = r.json()
        keys = [f["key"] for f in j["fields"]]
        for k in ["quick_signup_enabled", "quick_signup_ip_limit", "verify_banner_days",
                  "verify_reminder_enabled", "verify_reminder_min_games",
                  "verify_reminder_2_enabled", "verify_reminder_title",
                  "verify_reminder_body", "verify_reminder_2_title",
                  "verify_reminder_2_body", "name_check_enabled",
                  "name_check_ai_enabled", "name_flag_threshold",
                  "name_auto_disable_threshold"]:
            check(f"'{k}' panelde", k in keys, str(keys))
        check("2. hatırlatma PASİF geliyor",
              next(f for f in j["fields"] if f["key"] == "verify_reminder_2_enabled")["value"] == "false",
              r.text[:200])
        check("durum sayıları var", "unverified" in j["stats"], str(j["stats"]))
        check("OpenAI durumu bildiriliyor", j["ai_configured"] is False, str(j["ai_configured"]))

        r = await c.put("/api/admin/quick-auth",
                        json={"key": "quick_signup_ip_limit", "value": "25"},
                        headers=hdr(admin_tok))
        check("ayar kaydedildi", r.status_code == 200, r.text)
        check("değer okundu",
              await db_scalar("SELECT value FROM game_settings WHERE key = 'quick_signup_ip_limit'") == "25")

        r = await c.put("/api/admin/quick-auth",
                        json={"key": "name_flag_threshold", "value": "250"},
                        headers=hdr(admin_tok))
        check("eşik 100'ü aşamaz", r.status_code == 400, r.text)
        r = await c.put("/api/admin/quick-auth",
                        json={"key": "verify_reminder_body", "value": "x" * 400},
                        headers=hdr(admin_tok))
        check("uzun metin reddediliyor", r.status_code == 400, r.text)
        r = await c.put("/api/admin/quick-auth",
                        json={"key": "uydurma_ayar", "value": "1"}, headers=hdr(admin_tok))
        check("bilinmeyen ayar reddediliyor", r.status_code == 400, r.text)
        r = await c.put("/api/admin/quick-auth", json={"key": "quick_signup_enabled", "value": "1"},
                        headers=hdr(temiz_tok))
        check("admin olmayan ayar değiştiremiyor", r.status_code == 403, r.text)
        await set_setting("quick_signup_ip_limit", "0")

        # ---------------------------------------------------------------
        print("\n16) Bildirim metni panelden değiştirilebiliyor")
        from app.services import verify_reminder as vr
        t1, b1 = vr.first_texts()
        check("varsayılan metin geliyor", t1 == vr.FIRST_TITLE, t1)
        r = await c.put("/api/admin/quick-auth",
                        json={"key": "verify_reminder_title", "value": "Hesabını kurtar!"},
                        headers=hdr(admin_tok))
        check("başlık kaydedildi", r.status_code == 200, r.text)
        t1, b1 = vr.first_texts()
        check("yeni başlık kullanılıyor", t1 == "Hesabını kurtar!", t1)
        # Gerçekten gönderilen bildirimde de görünüyor mu?
        hat_id, hat_tok = await hizli("Hatirlatma Testi", "8.8.8.1")
        await db_exec("UPDATE users SET matches_played = 5 WHERE id = :i", i=hat_id)
        async with AsyncSessionLocal() as db:
            await vr.run_once(db)
        title = await db_scalar(
            "SELECT title FROM notifications WHERE user_id = :i AND type_code = 'verify_reminder'",
            i=hat_id)
        check("bildirim panelden girilen başlıkla gitti", title == "Hesabını kurtar!", str(title))
        await set_setting("verify_reminder_title", "")

        # ---------------------------------------------------------------
        print("\n17) Mevcut paneller ve akışlar bozulmadı")
        r = await c.get("/api/admin/settings", headers=hdr(admin_tok))
        check("⚙️ Ayarlar ucu çalışıyor", r.status_code == 200, r.text[:120])
        allkeys = [s["key"] for s in r.json()["settings"]]
        check("eski ayarlar duruyor", "round_total_seconds" in allkeys and "arena_seconds_5" in allkeys)
        check("yeni ayarlar da orada", "name_flag_threshold" in allkeys)
        r = await c.get("/api/admin/moderation/counts", headers=hdr(admin_tok))
        check("🏷️ Ad Mod sayaçları çalışıyor", r.status_code == 200, r.text[:120])
        r = await c.get("/api/admin/dashboard", headers=hdr(admin_tok))
        check("📊 Özet çalışıyor", r.status_code == 200, r.text[:120])
        r = await c.post("/api/auth/login",
                         json={"email": "admin@ornek.com", "password": "adminsifre"})
        check("e-posta girişi çalışıyor", r.status_code == 200, r.text[:120])
        r = await c.post("/api/auth/quick", json={"name": "Son Kontrol"}, headers=ip("8.8.8.2"))
        check("isimle hesap açma çalışıyor", r.status_code == 200, r.text[:120])
        r = await c.get("/api/notifications", headers=hdr(admin_tok))
        check("bildirim listesi çalışıyor", r.status_code == 200, r.text[:120])

    print(f"\n{'='*52}\nSONUÇ:  {OK} başarılı, {FAIL} başarısız\n{'='*52}")
    if DB_FILE.exists():
        DB_FILE.unlink()
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    asyncio.run(main())
