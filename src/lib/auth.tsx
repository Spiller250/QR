import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, session, setUnauthorizedHandler } from '../api/client';

interface Operator {
  email: string;
  role: string;
}

interface AuthState {
  operator: Operator | null;
  checking: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [operator, setOperator] = useState<Operator | null>(null);
  const [checking, setChecking] = useState(() => Boolean(session.get()));

  const clear = useCallback(() => {
    session.set(null);
    setOperator(null);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    setUnauthorizedHandler(clear);
    if (!session.get()) return;
    api
      .get<{ operator: Operator }>('/auth/me')
      .then((r) => setOperator(r.operator))
      .catch(() => clear())
      .finally(() => setChecking(false));
  }, [clear]);

  const value = useMemo<AuthState>(
    () => ({
      operator,
      checking,
      async login(email, password) {
        const r = await api.post<{ token: string; operator: Operator }>('/auth/login', { email, password });
        session.set(r.token);
        setOperator(r.operator);
      },
      async logout() {
        try {
          await api.post('/auth/logout');
        } finally {
          clear();
        }
      },
    }),
    [operator, checking, clear],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
