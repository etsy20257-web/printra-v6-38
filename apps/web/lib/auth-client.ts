import {
  AUTH_COOKIE_KEY,
  AUTH_STORAGE_KEY,
  type AuthSession,
  type AuthUser,
  type AuthRole
} from '@printra/shared';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');

type AuthResponse = {
  ok: boolean;
  session?: {
    token?: string;
    expiresAt?: string;
    user?: AuthUser;
  };
  error?: string;
  code?: string;
};

function getNowIso() {
  return new Date().toISOString();
}

function isValidRole(role: string): role is AuthRole {
  return role === 'admin' || role === 'user';
}

function parseSessionPayload(input: unknown): AuthSession | null {
  if (!input || typeof input !== 'object') return null;
  const source = input as Record<string, unknown>;
  const token = typeof source.token === 'string' ? source.token : '';
  const expiresAt = typeof source.expiresAt === 'string' ? source.expiresAt : '';
  const user = source.user as Record<string, unknown> | undefined;
  if (!token || !expiresAt || !user) return null;
  const role = typeof user.role === 'string' ? user.role : '';
  if (!isValidRole(role)) return null;
  const email = typeof user.email === 'string' ? user.email : '';
  const id = typeof user.id === 'string' ? user.id : '';
  const name = typeof user.name === 'string' ? user.name : '';
  if (!email || !id || !name) return null;

  return {
    token,
    expiresAt,
    user: {
      id,
      name,
      email,
      role,
      createdAt: typeof user.createdAt === 'string' ? user.createdAt : undefined,
      updatedAt: typeof user.updatedAt === 'string' ? user.updatedAt : undefined,
      lastLoginAt: typeof user.lastLoginAt === 'string' || user.lastLoginAt === null ? (user.lastLoginAt as string | null) : undefined
    }
  };
}

export function readStoredAuthSession(): AuthSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return parseSessionPayload(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeAuthCookie(token: string, expiresAt: string) {
  if (typeof document === 'undefined') {
    return;
  }

  const expiresAtMs = Date.parse(expiresAt);
  const maxAge = Number.isFinite(expiresAtMs)
    ? Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000))
    : 0;
  document.cookie = `${AUTH_COOKIE_KEY}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function persistAuthSession(session: AuthSession) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  writeAuthCookie(session.token, session.expiresAt);
  window.dispatchEvent(new CustomEvent('printra:auth-updated', { detail: { at: getNowIso() } }));
}

export function clearAuthSession() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('printra:auth-updated', { detail: { at: getNowIso() } }));
  }
  if (typeof document !== 'undefined') {
    document.cookie = `${AUTH_COOKIE_KEY}=; path=/; max-age=0; samesite=lax`;
  }
}

async function postAuth(path: '/login' | '/signup', payload: Record<string, unknown>) {
  const response = await fetch(`${API_BASE}/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = (await response.json().catch(() => ({}))) as AuthResponse;
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || 'Authentication request failed.');
  }

  const session = parseSessionPayload(data.session);
  if (!session) {
    throw new Error('Session payload is invalid.');
  }

  return session;
}

export async function signupWithEmail(payload: { name: string; email: string; password: string }) {
  return postAuth('/signup', payload);
}

export async function loginWithEmail(payload: { email: string; password: string }) {
  return postAuth('/login', payload);
}

export async function validateAuthSession(token: string) {
  const response = await fetch(`${API_BASE}/auth/session`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = (await response.json().catch(() => ({}))) as AuthResponse;
  if (!response.ok || !data?.ok) {
    return null;
  }

  const session = parseSessionPayload({
    token,
    expiresAt: data.session?.expiresAt,
    user: data.session?.user
  });

  return session;
}
