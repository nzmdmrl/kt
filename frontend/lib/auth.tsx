"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiUrl } from "./api";

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
  email?: string | null;
  has_password?: boolean;
  google_linked?: boolean;
};

type AuthContextType = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginGoogle: (idToken: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "kt_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // İlk yüklemede token'ı geri yükle ve kullanıcıyı çek
  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) {
      setLoading(false);
      return;
    }
    setToken(saved);
    fetch(apiUrl("/api/auth/me"), {
      headers: { Authorization: `Bearer ${saved}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const applyAuth = useCallback((data: { token: string; user: AuthUser }) => {
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const res = await fetch(apiUrl("/api/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, display_name: displayName }),
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

  const loginGoogle = useCallback(
    async (idToken: string) => {
      const res = await fetch(apiUrl("/api/auth/google"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: idToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Google girişi başarısız");
      applyAuth(data);
    },
    [applyAuth]
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, token, loading, register, login, loginGoogle, logout }}
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
