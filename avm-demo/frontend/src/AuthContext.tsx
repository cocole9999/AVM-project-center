/**
 * 认证 Context
 * - localStorage 持久化登录态
 * - 提供 user / token / login / logout
 * - 受保护路由：未登录跳登录页
 */
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { userApi } from './api';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
  department?: string;
  tenantId?: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => void;
}

const STORAGE_KEY = 'avm-auth';

interface PersistedAuth {
  user: AuthUser;
  token: string;
}

const AuthContext = createContext<AuthState | null>(null);

function loadPersisted(): PersistedAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedAuth;
  } catch {
    return null;
  }
}

function savePersisted(data: PersistedAuth) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function clearPersisted() {
  localStorage.removeItem(STORAGE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ user: AuthUser | null; token: string | null }>(() => {
    const p = loadPersisted();
    return { user: p?.user || null, token: p?.token || null };
  });
  const [loading, setLoading] = useState(false);

  const login = async (username: string, password: string) => {
    setLoading(true);
    try {
      const r = await userApi.login(username, password);
      const user: AuthUser = r.user;
      const token = r.token;
      savePersisted({ user, token });
      setState({ user, token });
      return user;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    clearPersisted();
    setState({ user: null, token: null });
  };

  return (
    <AuthContext.Provider value={{ ...state, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
