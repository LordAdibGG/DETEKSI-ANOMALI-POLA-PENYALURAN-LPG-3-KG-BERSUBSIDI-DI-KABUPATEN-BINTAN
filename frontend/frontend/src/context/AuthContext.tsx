import { createContext, useContext, useState, type ReactNode } from 'react';
import { API_BASE } from '../api/base';

export type UserRole = 'admin' | 'petugas';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  loginDemo: (role: UserRole) => void;
  logout: () => Promise<void>;
}

const TOKEN_KEY = 'lembar_pantau_token';
const USER_KEY = 'lembar_pantau_user';

const DEMO_USERS: Record<UserRole, AuthUser> = {
  admin: {
    id: 1,
    name: 'Admin Setda Perekonomian',
    email: 'admin@bintankab.go.id',
    role: 'admin',
  },
  petugas: {
    id: 2,
    name: 'Petugas Tim Monev LPG',
    email: 'petugas@bintankab.go.id',
    role: 'petugas',
  },
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const isTestEnv = import.meta.env.MODE === 'test';

  const [token, setToken] = useState<string | null>(() => {
    try {
      const saved = window.localStorage.getItem(TOKEN_KEY);
      if (saved) return saved;
    } catch {
      // Abaikan kendala localStorage
    }
    return isTestEnv ? 'demo-token-petugas' : null;
  });

  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const raw = window.localStorage.getItem(USER_KEY);
      if (raw) {
        return JSON.parse(raw) as AuthUser;
      }
      const savedToken = window.localStorage.getItem(TOKEN_KEY);
      if (savedToken) {
        return savedToken.includes('admin') ? DEMO_USERS.admin : DEMO_USERS.petugas;
      }
    } catch {
      // Abaikan JSON rusak
    }
    return isTestEnv ? DEMO_USERS.petugas : null;
  });

  const saveSession = (nextToken: string | null, nextUser: AuthUser | null) => {
    setToken(nextToken);
    setUser(nextUser);
    try {
      if (nextToken) {
        window.localStorage.setItem(TOKEN_KEY, nextToken);
      } else {
        window.localStorage.removeItem(TOKEN_KEY);
      }
      if (nextUser) {
        window.localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
      } else {
        window.localStorage.removeItem(USER_KEY);
      }
    } catch {
      // Abaikan kendala localStorage
    }
  };

  const login = async (
    email: string,
    password: string
  ): Promise<{ ok: boolean; message?: string }> => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      return { ok: false, message: 'Alamat surel dan kata sandi wajib diisi.' };
    }

    const apiBase = API_BASE;
    try {
      const response = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });

      const body = await response.json();
      if (!response.ok) {
        const msg =
          body?.error?.message ||
          body?.message ||
          'Kredensial tidak cocok dengan catatan pengguna Setda Bintan.';
        return { ok: false, message: msg };
      }

      const nextToken: string = body?.data?.token ?? 'sanctum-session-token';
      const nextUser: AuthUser = body?.data?.user ?? {
        id: 1,
        name: trimmedEmail.includes('admin')
          ? DEMO_USERS.admin.name
          : DEMO_USERS.petugas.name,
        email: trimmedEmail,
        role: trimmedEmail.includes('admin') ? 'admin' : 'petugas',
      };

      saveSession(nextToken, nextUser);
      return { ok: true };
    } catch {
      // Fallback kredensial lokal untuk demo mandiri bila server belum dinyalakan
      if (trimmedEmail === 'admin@bintankab.go.id' && password === 'admin123') {
        saveSession('demo-token-admin', DEMO_USERS.admin);
        return { ok: true };
      }
      if (trimmedEmail === 'petugas@bintankab.go.id' && password === 'petugas123') {
        saveSession('demo-token-petugas', DEMO_USERS.petugas);
        return { ok: true };
      }
      return {
        ok: false,
        message:
          'Server API tidak dapat dihubungi dan kredensial tidak cocok dengan akun pratinjau lokal.',
      };
    }
  };

  const loginDemo = (role: UserRole) => {
    saveSession(`demo-token-${role}`, DEMO_USERS[role]);
  };

  const logout = async () => {
    const apiBase = API_BASE;
    if (token && !token.startsWith('demo-token-')) {
      try {
        await fetch(`${apiBase}/api/auth/logout`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        // Tetap hapus sesi lokal meskipun server luring
      }
    }
    saveSession(null, null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(user),
        login,
        loginDemo,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth harus digunakan di dalam AuthProvider');
  }
  return ctx;
}
