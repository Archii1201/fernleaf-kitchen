'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { logout as apiLogout, me, type Profile } from './api/auth';

interface AuthValue {
  profile: Profile | null;
  loading: boolean;
  can: (permission: string) => boolean;
  canAny: (permissions: readonly string[]) => boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<Profile | null>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<{ profile: Profile | null; loading: boolean }>({
    profile: null,
    loading: true,
  });

  const refresh = useCallback(async () => {
    try {
      const profile = await me();
      setState({ profile, loading: false });
      return profile;
    } catch {
      setState({ profile: null, loading: false });
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    me()
      .then((profile) => {
        if (active) setState({ profile, loading: false });
      })
      .catch(() => {
        if (active) setState({ profile: null, loading: false });
      });
    return () => {
      active = false;
    };
  }, []);

  const logout = useCallback(async () => {
    await apiLogout().catch(() => undefined);
    setState({ profile: null, loading: false });
    router.replace('/login');
  }, [router]);

  const value = useMemo<AuthValue>(() => {
    const permissions = new Set(state.profile?.permissions ?? []);
    return {
      ...state,
      can: (permission) => permissions.has(permission),
      canAny: (list) => list.some((permission) => permissions.has(permission)),
      logout,
      refresh,
    };
  }, [state, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
