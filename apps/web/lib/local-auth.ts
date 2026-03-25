import { AUTH_STORAGE_KEY, type AuthRole, type AuthSession, type AuthUser } from '@printra/shared';

const LOCAL_AUTH_USERS_KEY = 'printra-local-auth-users-v1';
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

type LocalAuthUserRecord = AuthUser & {
  passwordHash: string;
  passwordSalt: string;
};

type LocalAuthStore = {
  version: 1;
  updatedAt: string;
  users: LocalAuthUserRecord[];
};

type LocalAuthSeed = {
  id: string;
  name: string;
  email: string;
  role: AuthRole;
  password: string;
};

const defaultSeeds: LocalAuthSeed[] = [
  {
    id: 'usr-admin-root',
    name: 'Printra Admin',
    email: 'admin@printra.local',
    role: 'admin',
    password: 'Admin123!'
  },
  {
    id: 'usr-member-root',
    name: 'Printra Member',
    email: 'user@printra.local',
    role: 'user',
    password: 'User12345!'
  }
];

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase();
  if (!email) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function normalizeName(value: unknown, fallback = 'Member User') {
  if (typeof value !== 'string') return fallback;
  const name = value.trim().replace(/\s+/g, ' ').slice(0, 120);
  return name || fallback;
}

function normalizeRole(value: unknown): AuthRole {
  return value === 'admin' ? 'admin' : 'user';
}

function normalizePassword(value: unknown) {
  if (typeof value !== 'string') {
    throw new Error('Password is required.');
  }
  const password = value.trim();
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
  if (password.length > 128) {
    throw new Error('Password is too long.');
  }
  return password;
}

function createSalt() {
  const random = globalThis.crypto?.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint8Array(16))
    : Uint8Array.from(Array.from({ length: 16 }, () => Math.floor(Math.random() * 256)));
  return Array.from(random, (value) => value.toString(16).padStart(2, '0')).join('');
}

function bytesToHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (value) => value.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, salt: string) {
  if (!globalThis.crypto?.subtle) {
    return btoa(`${salt}:${password}`);
  }
  const payload = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', payload);
  return bytesToHex(digest);
}

async function verifyPassword(password: string, user: LocalAuthUserRecord) {
  const hash = await hashPassword(password, user.passwordSalt);
  return hash === user.passwordHash;
}

function toPublicUser(user: LocalAuthUserRecord): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt
  };
}

function createSession(user: LocalAuthUserRecord): AuthSession {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const tokenPart = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    token: `local-${tokenPart}`,
    expiresAt,
    user: toPublicUser(user)
  };
}

function parseStore(raw: unknown): LocalAuthStore | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  if (!Array.isArray(source.users)) return null;

  const users: LocalAuthUserRecord[] = [];
  for (const item of source.users) {
    if (!item || typeof item !== 'object') continue;
    const user = item as Record<string, unknown>;
    const id = typeof user.id === 'string' ? user.id : '';
    const email = normalizeEmail(user.email);
    const name = normalizeName(user.name);
    const role = normalizeRole(user.role);
    const passwordHash = typeof user.passwordHash === 'string' ? user.passwordHash : '';
    const passwordSalt = typeof user.passwordSalt === 'string' ? user.passwordSalt : '';
    if (!id || !email || !passwordHash || !passwordSalt) continue;
    users.push({
      id,
      name,
      email,
      role,
      passwordHash,
      passwordSalt,
      createdAt: typeof user.createdAt === 'string' ? user.createdAt : nowIso(),
      updatedAt: typeof user.updatedAt === 'string' ? user.updatedAt : nowIso(),
      lastLoginAt: typeof user.lastLoginAt === 'string' || user.lastLoginAt === null ? (user.lastLoginAt as string | null) : null
    });
  }

  if (!users.length) return null;
  return {
    version: 1,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : nowIso(),
    users
  };
}

function writeStore(store: LocalAuthStore) {
  if (typeof window === 'undefined') {
    throw new Error('Auth storage is only available in browser mode.');
  }
  window.localStorage.setItem(LOCAL_AUTH_USERS_KEY, JSON.stringify(store));
}

async function createDefaultStore(): Promise<LocalAuthStore> {
  const now = nowIso();
  const users: LocalAuthUserRecord[] = [];
  for (const seed of defaultSeeds) {
    const salt = createSalt();
    users.push({
      id: seed.id,
      name: seed.name,
      email: seed.email,
      role: seed.role,
      passwordSalt: salt,
      passwordHash: await hashPassword(seed.password, salt),
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null
    });
  }
  return {
    version: 1,
    updatedAt: now,
    users
  };
}

async function getStore() {
  if (typeof window === 'undefined') {
    throw new Error('Auth storage is only available in browser mode.');
  }

  const raw = window.localStorage.getItem(LOCAL_AUTH_USERS_KEY);
  if (raw) {
    try {
      const parsed = parseStore(JSON.parse(raw));
      if (parsed) {
        return parsed;
      }
    } catch {
      // Fall through to reset a healthy store.
    }
  }

  const store = await createDefaultStore();
  writeStore(store);
  return store;
}

function upsertStoredSession(session: AuthSession) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export async function localSignupWithEmail(payload: { name: string; email: string; password: string }) {
  const email = normalizeEmail(payload.email);
  if (!email) {
    throw new Error('Valid email address is required.');
  }

  const password = normalizePassword(payload.password);
  const name = normalizeName(payload.name, email.split('@')[0] || 'Member User');
  const store = await getStore();

  if (store.users.some((entry) => entry.email === email)) {
    throw new Error('Email is already registered.');
  }

  const now = nowIso();
  const salt = createSalt();
  const user: LocalAuthUserRecord = {
    id: globalThis.crypto?.randomUUID?.() ?? `usr-${Date.now().toString(36)}`,
    name,
    email,
    role: 'user',
    passwordSalt: salt,
    passwordHash: await hashPassword(password, salt),
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now
  };

  const nextStore: LocalAuthStore = {
    ...store,
    updatedAt: now,
    users: [...store.users, user]
  };
  writeStore(nextStore);

  const session = createSession(user);
  upsertStoredSession(session);
  return session;
}

export async function localLoginWithEmail(payload: { email: string; password: string }) {
  const email = normalizeEmail(payload.email);
  if (!email) {
    throw new Error('Valid email address is required.');
  }

  const password = normalizePassword(payload.password);
  const store = await getStore();
  const userIndex = store.users.findIndex((entry) => entry.email === email);
  if (userIndex < 0) {
    throw new Error('Invalid email or password.');
  }

  const user = store.users[userIndex];
  const validPassword = await verifyPassword(password, user);
  if (!validPassword) {
    throw new Error('Invalid email or password.');
  }

  const now = nowIso();
  const updatedUser: LocalAuthUserRecord = {
    ...user,
    updatedAt: now,
    lastLoginAt: now
  };
  const nextUsers = [...store.users];
  nextUsers[userIndex] = updatedUser;
  writeStore({
    ...store,
    updatedAt: now,
    users: nextUsers
  });

  const session = createSession(updatedUser);
  upsertStoredSession(session);
  return session;
}

function parseSession(raw: unknown): AuthSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const token = typeof source.token === 'string' ? source.token : '';
  const expiresAt = typeof source.expiresAt === 'string' ? source.expiresAt : '';
  if (!token || !expiresAt) return null;
  const userSource = source.user as Record<string, unknown> | undefined;
  if (!userSource) return null;
  const id = typeof userSource.id === 'string' ? userSource.id : '';
  const email = normalizeEmail(userSource.email);
  const name = normalizeName(userSource.name);
  const role = normalizeRole(userSource.role);
  if (!id || !email) return null;

  return {
    token,
    expiresAt,
    user: {
      id,
      email,
      name,
      role,
      createdAt: typeof userSource.createdAt === 'string' ? userSource.createdAt : undefined,
      updatedAt: typeof userSource.updatedAt === 'string' ? userSource.updatedAt : undefined,
      lastLoginAt:
        typeof userSource.lastLoginAt === 'string' || userSource.lastLoginAt === null
          ? (userSource.lastLoginAt as string | null)
          : undefined
    }
  };
}

export async function localValidateSession(token: string) {
  if (typeof window === 'undefined' || !token) {
    return null;
  }

  const rawSession = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!rawSession) {
    return null;
  }

  let session: AuthSession | null = null;
  try {
    session = parseSession(JSON.parse(rawSession));
  } catch {
    session = null;
  }
  if (!session || session.token !== token) {
    return null;
  }

  const expiresAtMs = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    return null;
  }

  const activeSession = session;
  const store = await getStore();
  const user = store.users.find((entry) => entry.id === activeSession.user.id || entry.email === activeSession.user.email);
  if (!user) {
    return null;
  }

  const nextSession: AuthSession = {
    ...activeSession,
    user: toPublicUser(user)
  };
  upsertStoredSession(nextSession);
  return nextSession;
}
