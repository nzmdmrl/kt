"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiUrl } from "./api";
import { detectPlatform } from "./platform";
import { useIsoLayoutEffect } from "./useIsoLayoutEffect";

export type AuthUser = {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  elo: number;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
  words_solved: number;
  solo_best_score: number;
  xp?: number;
  level?: number;
  email?: string | null;
  has_password?: boolean;
  google_linked?: boolean;
  play_games_linked?: boolean;
  /** Reklamsız hak — tüm reklam yolları buna bakar (AdSlot, AdMob bandı, geçiş). */
  ad_free?: boolean;
  /** manual | play | apple | web */
  ad_free_source?: string | null;
  /** Yönetici mi — admin'e özel menü girişlerini açar (ör. Reklam Oyunu). */
  is_admin?: boolean;
};

type AuthContextType = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  register: (
    email: string,
    password: string,
    displayName: string,
    captchaToken?: string | null
  ) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  /** Web akışı — Google Identity Services butonundan gelen id_token. */
  loginGoogle: (idToken: string) => Promise<void>;
  /**
   * Uygulama akışı — cihazın native hesap seçicisinden gelen id_token.
   * Yanıt web akışıyla BİREBİR aynıdır ({token, user}), aynı applyAuth'tan geçer;
   * token değişince NativeBootstrap bekleyen push token'ını yeniden kaydeder.
   */
  loginGoogleNative: (idToken: string) => Promise<void>;
  /**
   * Play Games SESSİZ girişi (uygulama açılışı). İki sonuçtan biri döner:
   *  - "signed-in": oturum açıldı, iş bitti,
   *  - "new": bu kimlik yeni — HESAP AÇILMADI, isim ekranı gösterilmeli.
   * Ayrıntı: backend/app/api/routes/auth.py → play_games_login.
   */
  playGamesSilent: (serverAuthCode: string) => Promise<PlayGamesSilentResult>;
  /** İsim ekranı — hesap burada açılır. */
  playGamesComplete: (pendingToken: string, name: string) => Promise<void>;
  /** "Zaten hesabım var" — kimliği ŞU AN girişli hesaba bağlar. */
  playGamesLink: (pendingToken: string) => Promise<void>;
  logout: () => void;
};

export type PlayGamesSilentResult =
  | { status: "signed-in" }
  | { status: "new"; pendingToken: string; suggestedName: string | null };

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "kt_token";
// Son bilinen kullanıcı — sayfa açılışında /auth/me beklenmeden anında gösterilir.
const USER_CACHE_KEY = "kt_user";

function readCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch { return null; }
}
function writeCachedUser(u: AuthUser | null) {
  try {
    if (u) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_CACHE_KEY);
  } catch {}
}

/**
 * Reklamsız (ad-free) hak — TÜM reklam yolları bunu kullanır.
 *
 * `ready` false iken hiçbir reklam AÇILMAMALIDIR. Üç belirsiz durum var:
 *   1) oturum henüz çözülmedi (loading),
 *   2) önbellekten gelen kullanıcı nesnesi ESKİ ve `ad_free` alanını hiç
 *      taşımıyor (bu alan eklenmeden önce yazılmış önbellek) — /auth/me
 *      yanıtı gelene kadar bilinmiyor sayılır,
 *   3) token var ama kullanıcı henüz yok.
 * Bu durumlarda çağıran taraf reklamı GÖSTERMEZ: hak sahibine yanlışlıkla
 * reklam basmaktansa sıradan kullanıcıya bir saniye gecikmeli göstermek yeğdir
 * (AdSense'te basılan reklam GÖSTERİM sayılır, geri alınamaz).
 *
 * Çıkış yapmış ziyaretçi reklamsız DEĞİLDİR.
 */
export function useAdFree(): { adFree: boolean; ready: boolean } {
  const { user, token, loading } = useAuth();
  if (loading) return { adFree: false, ready: false };
  if (!token) return { adFree: false, ready: true };
  if (!user || user.ad_free === undefined) return { adFree: false, ready: false };
  return { adFree: !!user.ad_free, ready: true };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // İlk yüklemede token'ı geri yükle ve kullanıcıyı çek.
  // Önbellekte son kullanıcı varsa ekran BOYANMADAN önce gösterilir; /auth/me
  // arka planda tazeler. Böylece "önce misafir ekranı, sonra pat diye profil"
  // sıçraması olmaz.
  useIsoLayoutEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) {
      writeCachedUser(null);
      setLoading(false);
      return;
    }
    setToken(saved);
    const cached = readCachedUser();
    if (cached) {
      setUser(cached);
      setLoading(false);   // içerik hazır — iskelet gösterme
    }
    fetch(apiUrl("/api/auth/me"), {
      headers: { Authorization: `Bearer ${saved}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setUser(data.user);
        writeCachedUser(data.user);
        try { if (data.user?.id) localStorage.setItem("kt_uid", String(data.user.id)); } catch {}
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        writeCachedUser(null);
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const applyAuth = useCallback((data: { token: string; user: AuthUser }) => {
    localStorage.setItem(TOKEN_KEY, data.token);
    writeCachedUser(data.user);
    try { if (data.user?.id) localStorage.setItem("kt_uid", String(data.user.id)); } catch {}
    setToken(data.token);
    setUser(data.user);
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName: string, captchaToken?: string | null) => {
      const res = await fetch(apiUrl("/api/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          display_name: displayName,
          captcha_token: captchaToken || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Kayıt başarısız");
      applyAuth(data);
    },
    [applyAuth]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Giriş başarısız");
      applyAuth(data);
    },
    [applyAuth]
  );

  // Web ve uygulama akışı aynı gövdeyi gönderir, aynı yanıtı alır; tek fark uç.
  const postGoogleToken = useCallback(
    async (path: string, idToken: string) => {
      const res = await fetch(apiUrl(path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: idToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Google girişi başarısız");
      applyAuth(data);
    },
    [applyAuth]
  );

  const loginGoogle = useCallback(
    (idToken: string) => postGoogleToken("/api/auth/google", idToken),
    [postGoogleToken]
  );

  const loginGoogleNative = useCallback(
    (idToken: string) => postGoogleToken("/api/auth/google/native", idToken),
    [postGoogleToken]
  );

  // --- Play Games ---------------------------------------------------------
  // Üç uç da aynı applyAuth'tan geçer; oturum jetonu bu dosyanın dışına çıkmaz.
  const playGamesSilent = useCallback(
    async (serverAuthCode: string): Promise<PlayGamesSilentResult> => {
      const saved = localStorage.getItem(TOKEN_KEY);
      const res = await fetch(apiUrl("/api/auth/play-games"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Kişi zaten girişliyse kimlik O hesaba bağlanır (yeni hesap açılmaz).
          ...(saved ? { Authorization: `Bearer ${saved}` } : {}),
        },
        body: JSON.stringify({ server_auth_code: serverAuthCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Play Games girişi başarısız");
      if (data.new_account) {
        return {
          status: "new",
          pendingToken: String(data.pending_token || ""),
          suggestedName: data.suggested_name || null,
        };
      }
      applyAuth(data);
      return { status: "signed-in" };
    },
    [applyAuth]
  );

  const playGamesComplete = useCallback(
    async (pendingToken: string, name: string) => {
      const res = await fetch(apiUrl("/api/auth/play-games/complete"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pending_token: pendingToken, name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Hesap oluşturulamadı");
      applyAuth(data);
    },
    [applyAuth]
  );

  const playGamesLink = useCallback(
    async (pendingToken: string) => {
      // Bu çağrı e-posta girişinin HEMEN ardından yapılır; jeton state'e daha
      // yansımamış olabilir, bu yüzden localStorage'dan okunur.
      const saved = localStorage.getItem(TOKEN_KEY);
      if (!saved) throw new Error("Önce giriş yapmalısın");
      const res = await fetch(apiUrl("/api/auth/play-games/link"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${saved}` },
        body: JSON.stringify({ pending_token: pendingToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Play Games hesabı bağlanamadı");
      applyAuth(data);
    },
    [applyAuth]
  );

  const logout = useCallback(() => {
    // 1) Bizim oturumumuz — KOŞULSUZ ve ÖNCE. Aşağıdaki native adım ne yaparsa
    //    yapsın (hata da verse) kullanıcı çıkmış olur; arayüz beklemez.
    localStorage.removeItem(TOKEN_KEY);
    writeCachedUser(null);
    setToken(null);
    setUser(null);

    // 2) UYGULAMADA ayrıca cihazın Google oturumu bırakılır. Yoksa Credential
    //    Manager son hesabı hatırlar ve bir dahaki "Google ile giriş"te seçici
    //    soru sormadan aynı hesaptan devam edebilir. Ateşle-unut: sonucu
    //    beklenmez, hatası yutulur (ayrıntı için lib/nativeGoogle.ts).
    //    Web'de eklenti CHUNK'I BİLE indirilmez — önce platform kontrol edilir.
    if (detectPlatform() !== "web") {
      void import("./nativeGoogle").then((m) => m.nativeGoogleSignOut()).catch(() => {});
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user, token, loading, register, login, loginGoogle, loginGoogleNative,
        playGamesSilent, playGamesComplete, playGamesLink, logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth AuthProvider içinde kullanılmalı");
  return ctx;
}
