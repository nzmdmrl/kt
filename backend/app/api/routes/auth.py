"""Kimlik doğrulama uçları: kayıt, giriş, /me, Google OAuth (web + native)."""

from __future__ import annotations

import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes import app_settings as app_settings_routes
from app.core.database import get_db
from app.core.config import get_settings
from app.core import captcha
from app.core.security import create_access_token, create_pending_token, decode_pending_token
from app.core.deps import get_current_user, get_optional_user
from app.core import auth_service
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


# ---- şemalar ----
class RegisterIn(BaseModel):
    email: str
    password: str
    display_name: str
    # reCAPTCHA v2 token'ı — özellik yapılandırılmışsa zorunlu.
    captcha_token: str | None = None


class LoginIn(BaseModel):
    email: str
    password: str


class GoogleIn(BaseModel):
    # İstemci Google'dan aldığı id_token'ı gönderir.
    id_token: str


class PlayGamesIn(BaseModel):
    # Uygulama, PlayGames.requestServerSideAccess'ten aldığı TEK KULLANIMLIK
    # yetki kodunu gönderir (id_token DEĞİL — Play Games id_token vermez).
    server_auth_code: str


class PlayGamesNameIn(BaseModel):
    # "İsim belirle" ekranı: sessiz girişten dönen ara jeton + kullanıcının yazdığı ad.
    pending_token: str
    name: str


class PlayGamesLinkIn(BaseModel):
    # "Zaten hesabım var" yolu: kişi e-posta ile giriş yaptıktan sonra aynı ara
    # jetonla kimliğini mevcut hesabına bağlar.
    pending_token: str


def _auth_response(user: User) -> dict:
    token = create_access_token(user.id)
    return {"token": token, "user": user.to_private()}


# ---- e-posta/şifre ----
@router.get("/captcha/status")
def captcha_status():
    """Frontend 'Ben robot değilim' kutusunu gösterecek mi, buradan öğrenir."""
    return {
        "configured": settings.recaptcha_configured,
        "site_key": settings.RECAPTCHA_SITE_KEY or None,
    }


@router.post("/register")
async def register(data: RegisterIn, request: Request, db: AsyncSession = Depends(get_db)):
    try:
        await captcha.verify_captcha(data.captcha_token, captcha.client_ip(request))
    except captcha.CaptchaError as e:
        raise HTTPException(status_code=400, detail=str(e))
    try:
        user = await auth_service.register_email(
            db, data.email, data.password, data.display_name
        )
    except auth_service.AuthError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _auth_response(user)


@router.post("/login")
async def login(data: LoginIn, db: AsyncSession = Depends(get_db)):
    try:
        user = await auth_service.login_email(db, data.email, data.password)
    except auth_service.AuthError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _auth_response(user)


# ---- Google OAuth ----
@router.get("/google/status")
def google_status():
    """Frontend Google butonunu gösterip göstermeyeceğini buradan öğrenir."""
    return {
        "configured": settings.google_oauth_configured,
        "client_id": settings.GOOGLE_CLIENT_ID or None,
    }


GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")


async def _verify_google_id_token(id_token: str, expected_aud: str) -> dict:
    """id_token'ı Google'a doğrulatır ve doğrulanmış iddiaları (claims) döner.

    Hem web (GIS) hem uygulama (native hesap seçici) akışı BURAYA girer — iki
    yolun güvenlik kontrolleri birbirinden ayrışmasın diye tek fonksiyon.

    Kontroller:
      - imza/biçim: tokeninfo ucu 200 dönmezse token geçersizdir,
      - aud       : token BİZİM istemcimiz için mi üretilmiş,
      - iss       : gerçekten Google mı verdi,
      - exp       : süresi dolmuş mu (tokeninfo da reddeder; burada açıkça bakılır).
    Herhangi biri tutmazsa 401 fırlatır.
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(GOOGLE_TOKENINFO_URL, params={"id_token": id_token})
    except httpx.HTTPError:
        # Google'a ulaşılamadı — token'ı doğrulayamadığımız için giriş VERİLMEZ.
        raise HTTPException(status_code=503, detail="Google'a ulaşılamadı, tekrar dene.")
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Google token doğrulanamadı.")
    info = resp.json()

    # aud (client_id) bizim uygulamamıza mı ait?
    if info.get("aud") != expected_aud:
        raise HTTPException(status_code=401, detail="Google token bu uygulama için değil.")
    # Token'ı gerçekten Google mı verdi?
    if info.get("iss") not in GOOGLE_ISSUERS:
        raise HTTPException(status_code=401, detail="Google token kaynağı geçersiz.")
    # Süre. tokeninfo süresi geçmiş token'a zaten 400 döner; yine de açıkça
    # bakıyoruz ki kontrol tek bir dış servisin davranışına bağlı kalmasın.
    try:
        exp = int(info.get("exp") or 0)
    except (TypeError, ValueError):
        exp = 0
    if exp <= int(time.time()):
        raise HTTPException(status_code=401, detail="Google token süresi dolmuş.")

    if not info.get("sub"):
        raise HTTPException(status_code=401, detail="Google kimliği okunamadı.")
    return info


async def _google_sign_in(db: AsyncSession, info: dict) -> dict:
    """Doğrulanmış Google iddialarıyla oturum açar/hesap oluşturur.

    Web ve uygulama akışı için TEK yol: hesap oluşturma varsayılanları, mevcut
    hesaba bağlama ve yan etkiler (ad moderasyonu, benzersiz username, avatar)
    auth_service.get_or_create_google_user içinde — burada kopyalanmaz.
    """
    # E-posta yalnızca Google tarafından doğrulanmışsa mevcut hesapla eşleştirilir;
    # aksi halde doğrulanmamış adresle başkasının hesabı ele geçirilebilir.
    email = info.get("email")
    if str(info.get("email_verified", "")).lower() not in ("true", "1"):
        email = None
    user = await auth_service.get_or_create_google_user(
        db,
        sub=info["sub"],
        email=email,
        name=info.get("name"),
        picture=info.get("picture"),
    )
    return _auth_response(user)


@router.post("/google")
async def google_login(data: GoogleIn, db: AsyncSession = Depends(get_db)):
    """Web akışı — Google Identity Services butonundan gelen id_token."""
    if not settings.google_oauth_configured:
        raise HTTPException(status_code=503, detail="Google girişi yapılandırılmamış.")
    info = await _verify_google_id_token(data.id_token, settings.GOOGLE_CLIENT_ID)
    return await _google_sign_in(db, info)


@router.post("/google/native")
async def google_login_native(data: GoogleIn, db: AsyncSession = Depends(get_db)):
    """Uygulama akışı — cihazın native Google hesap seçicisinden gelen id_token.

    NEDEN AYRI UÇ: Google, gömülü WebView içinde OAuth'a izin vermiyor, bu yüzden
    uygulamada GIS betiği hiç yüklenmiyor ("google servisi yüklenemedi"). Uygulama
    bunun yerine cihazın hesap seçicisini açar; oradan dönen id_token buraya gelir.

    Beklenen audience env'deki GOOGLE_CLIENT_ID DEĞİL, app_settings'teki
    'app.flags'.google_web_client_id'dir: uygulama hesap seçiciyi o kimlikle açar
    (Android Credential Manager'da audience daima **Web** istemci kimliğidir) ve
    değer admin panelden deploy'suz değiştirilebilir.

    Doğrulama ve hesap açma yolu web akışıyla AYNI fonksiyonlardır; dönen yanıt da
    birebir aynıdır ({token, user}) — sonrasındaki her şey (WebSocket kimliği,
    admin kontrolü, push cihaz kaydı) farkı görmez.
    """
    flags = await app_settings_routes.read_flags(db)
    client_id = str(flags.get("google_web_client_id") or "").strip()
    if not client_id:
        raise HTTPException(
            status_code=503,
            detail="Uygulama içi Google girişi yapılandırılmamış.",
        )
    info = await _verify_google_id_token(data.id_token, client_id)
    return await _google_sign_in(db, info)


# ---- Play Games (yalnız Android uygulaması) ----
@router.get("/play-games/status")
def play_games_status():
    """Uygulama "Play Games ile gir" düğmesini gösterecek mi, buradan öğrenir.

    client_id ayrıca İŞE YARAR: native eklenti requestServerSideAccess'i bu
    kimlikle çağırmak zorundadır (kodun hangi proje için üretileceğini o belirler).
    Kimlik gizli bilgi değildir; gizli anahtar (secret) buradan ASLA dönmez.
    """
    return {
        "configured": settings.play_games_configured,
        "client_id": settings.PLAY_GAMES_CLIENT_ID or None,
    }


GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
PLAY_GAMES_PLAYER_URL = "https://games.googleapis.com/games/v1/players/me"


async def _exchange_play_games_code(code: str) -> str:
    """Tek kullanımlık yetki kodunu access_token'a çevirir.

    KİMLİK KARIŞMASIN: burada KESİNLİKLE settings.GOOGLE_CLIENT_ID/SECRET
    kullanılmaz. Onlar sitedeki web Google girişinin (başka bir Google Cloud
    projesi) kimlikleridir; kod ise Play Games projesinde (958058877022)
    üretilmiştir. Yanlış projenin kimliğiyle takas Google tarafından
    "invalid_grant/invalid_client" ile reddedilir.
    """
    data = {
        "code": code,
        "client_id": settings.PLAY_GAMES_CLIENT_ID,
        "client_secret": settings.PLAY_GAMES_CLIENT_SECRET,
        "grant_type": "authorization_code",
        # redirect_uri YOK: sunucu tarafı erişim (server-side access) akışında
        # Google yönlendirme adresi beklemez.
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(GOOGLE_TOKEN_URL, data=data)
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail="Google'a ulaşılamadı, tekrar dene.")
    if resp.status_code != 200:
        # Google'ın hata gövdesi kullanıcıya gösterilmez; log'a düşsün diye yazılır.
        print(f"[play-games] kod takası başarısız: {resp.status_code} {resp.text[:300]}")
        raise HTTPException(status_code=401, detail="Play Games kodu doğrulanamadı.")
    token = resp.json().get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Play Games kodu doğrulanamadı.")
    return token


async def _fetch_play_games_player(access_token: str) -> dict:
    """access_token ile oyuncunun kimliğini ve takma adını Google'dan okur.

    Kimliğin tek güvenilir kaynağı budur: istemcinin gönderdiği hiçbir isim/kimlik
    alanına bakılmaz, yalnız Google'ın bu yanıtına bakılır.
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                PLAY_GAMES_PLAYER_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail="Google'a ulaşılamadı, tekrar dene.")
    if resp.status_code != 200:
        print(f"[play-games] oyuncu okunamadı: {resp.status_code} {resp.text[:300]}")
        raise HTTPException(status_code=401, detail="Play Games oyuncusu okunamadı.")
    info = resp.json()
    if not info.get("playerId"):
        raise HTTPException(status_code=401, detail="Play Games kimliği okunamadı.")
    return info


PLAY_GAMES_PENDING = "pg_pending"


async def _play_games_player_from_code(code: str) -> dict:
    """Yetki kodunu doğrular ve oyuncu bilgisini döner (iki adım tek yerde)."""
    access_token = await _exchange_play_games_code(code)
    return await _fetch_play_games_player(access_token)


@router.post("/play-games")
async def play_games_login(
    data: PlayGamesIn,
    db: AsyncSession = Depends(get_db),
    current: User | None = Depends(get_optional_user),
):
    """Uygulama akışı — Play Games SESSİZ girişi (kullanıcı hiçbir şeye basmaz).

    NEDEN AYRI UÇ: /auth/google ve /auth/google/native bir **id_token** doğrular.
    Play Games id_token vermez; tek kullanımlık bir **yetki kodu** verir. Bu yüzden
    iki adım gerekir: (1) kodu access_token'a takas et, (2) o token'la oyuncunun
    kimliğini Google'dan oku. Kimlik uzayı da farklıdır — Play Games oyuncu kimliği
    Google 'sub' değeri DEĞİLDİR, bu yüzden ayrı sütunda (users.play_games_id) tutulur.

    Üç sonuçtan biri döner:

    a) Authorization başlığı VAR (kişi zaten giriş yapmış)  -> kimlik mevcut hesaba
       BAĞLANIR, {token, user} döner.
    b) Kimlik tanınıyor                                     -> oturum açılır, {token, user}.
    c) Kimlik yeni  ->  HESAP AÇILMAZ. {new_account: true, pending_token, suggested_name}
       döner; uygulama "isim belirle" ekranını gösterir.

    (c) NEDEN HESAP AÇMIYOR — bu akışın en kritik kararı:
    Sessiz giriş kullanıcının bir şeye basmasıyla başlamaz, uygulama açılınca
    kendiliğinden olur. Burada hemen hesap açsaydık, siteye e-posta ile kaydolmuş
    biri uygulamayı ilk açtığında istemediği İKİNCİ bir hesap edinirdi. Dahası
    "Zaten hesabım var" deyip e-posta ile giriş yaptığında, oyuncu kimliği o
    hayalet hesaba bağlı kaldığı için gerçek hesabına BAĞLANAMAZDI (409).
    Bu yüzden kimlik, hesap açılana kadar kısa ömürlü bir ara jetonda taşınır:
    hesabı ya kullanıcı adını yazınca /play-games/complete açar, ya da kişi
    e-posta ile girip /play-games/link ile kimliği mevcut hesabına bağlar.
    Hiçbiri olmazsa geriye tek bir kayıt bile kalmaz.

    Ara jeton neden gerekli: yetki kodu TEK KULLANIMLIKTIR, ikinci adımda tekrar
    kullanılamaz. Jeton, Google'a doğrulatılmış oyuncu kimliğini taşır — istemci
    kendi kimliğini yazamaz, çünkü jeton sunucu anahtarıyla imzalıdır.
    """
    if not settings.play_games_configured:
        raise HTTPException(status_code=503, detail="Play Games girişi yapılandırılmamış.")
    info = await _play_games_player_from_code(data.server_auth_code.strip())
    player_id = str(info["playerId"])
    picture = (info.get("avatarImageUrl") or "").strip() or None

    # (a) Kişi zaten giriş yapmış — kimliği bu hesaba bağla.
    if current is not None:
        try:
            user = await auth_service.link_play_games_id(db, current, player_id, picture)
        except auth_service.AuthError as e:
            raise HTTPException(status_code=409, detail=str(e))
        return _auth_response(user)

    # (b) Kimlik tanınıyor — oturum aç.
    user = await auth_service.get_user_by_play_games_id(db, player_id)
    if user:
        return _auth_response(user)

    # (c) Yeni kimlik — hesap AÇILMAZ, isim ekranına yönlendirilir.
    return {
        "new_account": True,
        "pending_token": create_pending_token(PLAY_GAMES_PENDING, player_id),
        # Ekrandaki alan bununla ön doldurulur; kullanıcı silip kendi adını yazabilir.
        "suggested_name": (info.get("displayName") or "").strip() or None,
    }


def _pending_player_id(token: str) -> str:
    player_id = decode_pending_token(PLAY_GAMES_PENDING, token)
    if not player_id:
        # Süre 20 dk; dolmuşsa uygulama sessiz girişi baştan yapar.
        raise HTTPException(status_code=401, detail="Oturum süresi doldu, tekrar dene.")
    return player_id


@router.post("/play-games/complete")
async def play_games_complete(data: PlayGamesNameIn, db: AsyncSession = Depends(get_db)):
    """"İsim belirle" ekranı — hesap BURADA açılır.

    Yazılan isim hem görünen ad (yazıldığı gibi) hem de kullanıcı adı olur;
    kullanıcı adı türetilirken Türkçe harfler ASCII'ye çevrilir, boşluk silinir,
    küçük harfe inilir ve ad doluysa sonuna sıra numarası eklenir
    ("Ayşe Gül" -> aysegul, "nazim" dolu ise -> nazim2).
    """
    player_id = _pending_player_id(data.pending_token)
    try:
        user = await auth_service.create_play_games_user(db, player_id, data.name)
    except auth_service.AuthError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _auth_response(user)


@router.post("/play-games/link")
async def play_games_link(
    data: PlayGamesLinkIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """"Zaten hesabım var" — kişi e-posta ile giriş yaptıktan sonra kimliği bağlar.

    Aynı işi Authorization başlığıyla /play-games da yapar; fark, orada YENİ bir
    yetki kodu gerekmesi. Kullanıcı isim ekranındayken kodu çoktan harcadık, bu
    yüzden burada elimizdeki ara jeton kullanılır — native tarafa dönüp ikinci bir
    kod istemeye gerek kalmaz.
    """
    player_id = _pending_player_id(data.pending_token)
    try:
        user = await auth_service.link_play_games_id(db, user, player_id)
    except auth_service.AuthError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return _auth_response(user)


# ---- profil ----
@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return {"user": user.to_private()}
