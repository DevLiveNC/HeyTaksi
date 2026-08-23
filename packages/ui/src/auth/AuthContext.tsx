import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren, type ReactNode } from 'react';
import type { DeviceInput, Role, UserIdentity } from '@heytaksi/shared';

interface Session { user: UserIdentity; accessToken: string; refreshToken: string; }
interface AuthContextValue {
  user: UserIdentity | null; loading: boolean;
  emailLogin(email: string, password: string): Promise<void>;
  register(input: Record<string, unknown>): Promise<void>;
  requestOtp(phone: string, purpose: 'login' | 'register'): Promise<{ debugCode?: string }>;
  verifyOtp(input: Record<string, unknown>): Promise<void>;
  logout(allDevices?: boolean): Promise<void>;
  authorizedFetch(path: string, init?: RequestInit): Promise<Response>;
}
const AuthContext = createContext<AuthContextValue | null>(null);
const storageKey = 'heytaksi.session';
const deviceKey = 'heytaksi.device';

function getDevice(): DeviceInput {
  let id = localStorage.getItem(deviceKey);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(deviceKey, id); }
  return { id, name: navigator.userAgent.includes('Mobile') ? 'Mobil web' : 'Web tarayıcı', platform: 'web' };
}
function storedSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Session | null; } catch { return null; }
}

export function AuthProvider({ apiUrl, children }: PropsWithChildren<{ apiUrl: string }>) {
  const [session, setSession] = useState<Session | null>(storedSession);
  const [loading, setLoading] = useState(true);
  const save = (next: Session | null) => {
    setSession(next);
    if (next) localStorage.setItem(storageKey, JSON.stringify(next));
    else localStorage.removeItem(storageKey);
  };
  const post = async <T,>(path: string, body: unknown): Promise<T> => {
    const response = await fetch(`${apiUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json() as { data?: T; error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message ?? 'İşlem tamamlanamadı.');
    return payload.data!;
  };
  const rotate = async (current: Session) => post<Session>('/auth/refresh', { refreshToken: current.refreshToken });

  useEffect(() => {
    let active = true;
    const verify = async () => {
      if (!session) { if (active) setLoading(false); return; }
      try {
        const response = await fetch(`${apiUrl}/auth/me`, { headers: { authorization: `Bearer ${session.accessToken}` } });
        if (!response.ok) save(await rotate(session));
      } catch { save(null); }
      finally { if (active) setLoading(false); }
    };
    void verify();
    return () => { active = false; };
    // Oturum yalnızca ilk yüklemede sunucuda doğrulanır; sonraki 401 yanıtları rotation akışını kullanır.
  }, [apiUrl]);

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null, loading,
    async emailLogin(email, password) { setLoading(true); try { save(await post<Session>('/auth/login', { email, password, device: getDevice() })); } finally { setLoading(false); } },
    async register(input) { setLoading(true); try { save(await post<Session>('/auth/register', { ...input, device: getDevice() })); } finally { setLoading(false); } },
    async requestOtp(phone, purpose) { setLoading(true); try { return await post<{ debugCode?: string }>('/auth/otp/request', { phone, purpose }); } finally { setLoading(false); } },
    async verifyOtp(input) { setLoading(true); try { save(await post<Session>('/auth/otp/verify', { ...input, device: getDevice() })); } finally { setLoading(false); } },
    async logout(allDevices = false) {
      if (session) await fetch(`${apiUrl}/auth/logout`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.accessToken}` }, body: JSON.stringify({ allDevices }) });
      save(null);
    },
    async authorizedFetch(path, init) {
      if (!session) throw new Error('Oturum bulunamadı.');
      const execute = (accessToken: string) => fetch(`${apiUrl}${path}`, { ...init, headers: { ...init?.headers, authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' } });
      let response = await execute(session.accessToken);
      if (response.status === 401) {
        const next = await rotate(session);
        save(next);
        response = await execute(next.accessToken);
      }
      return response;
    },
  // API yardımcıları mevcut session snapshot'ına bağlıdır.
  }), [apiUrl, loading, session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth, AuthProvider içinde kullanılmalıdır.');
  return value;
}
export function AuthGate({ roles, children, fallback }: PropsWithChildren<{ roles?: Role[]; fallback: ReactNode }>) {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth-loading"><span>HT</span><p>Güvenli oturum doğrulanıyor…</p></div>;
  return user && (!roles || roles.includes(user.role)) ? children : fallback;
}
