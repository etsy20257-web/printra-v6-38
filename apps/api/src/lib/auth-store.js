import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'fs';
import path from 'path';

const dataDir = path.resolve(process.cwd(), 'data');
const authFile = path.join(dataDir, 'auth-users.json');
const TOKEN_TTL_SECONDS = 14 * 24 * 60 * 60;
const AUTH_SECRET = normalizeSecret(process.env.PRINTRA_AUTH_SECRET);

const allowedRoles = new Set(['admin', 'user']);

class AuthStoreError extends Error {
  constructor(message, status = 400, code = 'bad_request') {
    super(message);
    this.name = 'AuthStoreError';
    this.status = status;
    this.code = code;
  }
}

function normalizeSecret(value) {
  if (typeof value === 'string' && value.trim().length >= 16) {
    return value.trim();
  }
  return 'printra-local-auth-secret-change-me';
}

function isoNow() {
  return new Date().toISOString();
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  const next = value.trim().toLowerCase().slice(0, 160);
  if (!next) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next) ? next : '';
}

function normalizeName(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const next = value.trim().replace(/\s+/g, ' ').slice(0, 120);
  return next || fallback;
}

function normalizeRole(value, fallback = 'user') {
  if (typeof value === 'string' && allowedRoles.has(value)) {
    return value;
  }
  return fallback;
}

function assertPasswordStrength(password) {
  if (typeof password !== 'string') {
    throw new AuthStoreError('Password is required.', 400, 'password_required');
  }
  const normalized = password.trim();
  if (normalized.length < 8) {
    throw new AuthStoreError('Password must be at least 8 characters.', 400, 'password_too_short');
  }
  if (normalized.length > 128) {
    throw new AuthStoreError('Password is too long.', 400, 'password_too_long');
  }
  return normalized;
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, passwordHash) {
  if (typeof passwordHash !== 'string' || !passwordHash.includes(':')) {
    return false;
  }
  const [salt, storedHex] = passwordHash.split(':');
  if (!salt || !storedHex) {
    return false;
  }

  const candidateHex = scryptSync(password, salt, 64).toString('hex');
  const storedBuffer = Buffer.from(storedHex, 'hex');
  const candidateBuffer = Buffer.from(candidateHex, 'hex');
  if (storedBuffer.length !== candidateBuffer.length) {
    return false;
  }
  return timingSafeEqual(storedBuffer, candidateBuffer);
}

function toBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function fromBase64Url(value) {
  try {
    return Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    return '';
  }
}

function signEncodedPayload(encodedPayload) {
  return createHmac('sha256', AUTH_SECRET).update(encodedPayload).digest('base64url');
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function sanitizeUser(user = {}) {
  const createdAt = typeof user.createdAt === 'string' && user.createdAt ? user.createdAt : isoNow();
  return {
    id: typeof user.id === 'string' && user.id ? user.id : `usr-${randomBytes(6).toString('hex')}`,
    name: normalizeName(user.name, 'Member User'),
    email: normalizeEmail(user.email),
    role: normalizeRole(user.role, 'user'),
    passwordHash: typeof user.passwordHash === 'string' ? user.passwordHash : '',
    createdAt,
    updatedAt: typeof user.updatedAt === 'string' && user.updatedAt ? user.updatedAt : createdAt,
    lastLoginAt: typeof user.lastLoginAt === 'string' && user.lastLoginAt ? user.lastLoginAt : null
  };
}

function toPublicUser(user) {
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

function createDefaultStore() {
  const now = isoNow();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    users: [
      {
        id: 'usr-admin-root',
        name: 'Printra Admin',
        email: 'admin@printra.local',
        role: 'admin',
        passwordHash: hashPassword('Admin123!'),
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null
      },
      {
        id: 'usr-member-root',
        name: 'Printra Member',
        email: 'user@printra.local',
        role: 'user',
        passwordHash: hashPassword('User12345!'),
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null
      }
    ]
  };
}

function sanitizeStore(raw = {}) {
  const fallback = createDefaultStore();
  const users = Array.isArray(raw.users) ? raw.users.map((entry) => sanitizeUser(entry)).filter((entry) => entry.email) : fallback.users;

  return {
    version: 1,
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : fallback.createdAt,
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : fallback.updatedAt,
    users: users.length ? users : fallback.users
  };
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(authFile);
  } catch {
    await fs.writeFile(authFile, JSON.stringify(createDefaultStore(), null, 2), 'utf8');
  }
}

async function readStore() {
  await ensureStore();
  try {
    const raw = await fs.readFile(authFile, 'utf8');
    return sanitizeStore(JSON.parse(raw));
  } catch {
    const next = createDefaultStore();
    await fs.writeFile(authFile, JSON.stringify(next, null, 2), 'utf8');
    return next;
  }
}

async function writeStore(store) {
  const persistable = {
    ...store,
    updatedAt: isoNow()
  };
  await ensureStore();
  await fs.writeFile(authFile, JSON.stringify(persistable, null, 2), 'utf8');
  return persistable;
}

export function createAuthSessionToken(user) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + TOKEN_TTL_SECONDS;
  const payload = {
    sub: user.id,
    role: normalizeRole(user.role, 'user'),
    iat: issuedAt,
    exp: expiresAt
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signEncodedPayload(encodedPayload);
  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: new Date(expiresAt * 1000).toISOString()
  };
}

export function verifyAuthSessionToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) {
    return null;
  }

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signEncodedPayload(encodedPayload);
  if (!safeCompare(signature, expectedSignature)) {
    return null;
  }

  const payloadRaw = fromBase64Url(encodedPayload);
  if (!payloadRaw) {
    return null;
  }

  try {
    const payload = JSON.parse(payloadRaw);
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    const userId = typeof payload.sub === 'string' ? payload.sub : '';
    const role = normalizeRole(payload.role, 'user');
    const issuedAt = Number(payload.iat);
    const expiresAt = Number(payload.exp);
    if (!userId || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
      return null;
    }
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt <= now) {
      return null;
    }
    return {
      userId,
      role,
      issuedAt,
      expiresAt,
      expiresAtIso: new Date(expiresAt * 1000).toISOString()
    };
  } catch {
    return null;
  }
}

export async function getAuthUserById(userId) {
  const store = await readStore();
  const user = store.users.find((entry) => entry.id === userId);
  return user ? toPublicUser(user) : null;
}

export async function signupAuthUser(payload = {}) {
  const email = normalizeEmail(payload.email);
  if (!email) {
    throw new AuthStoreError('Valid email address is required.', 400, 'email_invalid');
  }

  const password = assertPasswordStrength(payload.password);
  const name = normalizeName(payload.name, email.split('@')[0] || 'Member User');

  const store = await readStore();
  if (store.users.some((entry) => entry.email === email)) {
    throw new AuthStoreError('Email is already registered.', 409, 'email_exists');
  }

  const now = isoNow();
  const role = normalizeRole(payload.role, 'user');
  const user = {
    id: `usr-${randomBytes(6).toString('hex')}`,
    name,
    email,
    role,
    passwordHash: hashPassword(password),
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now
  };

  const nextStore = {
    ...store,
    users: [...store.users, user]
  };

  await writeStore(nextStore);
  return toPublicUser(user);
}

export async function loginAuthUser(payload = {}) {
  const email = normalizeEmail(payload.email);
  if (!email) {
    throw new AuthStoreError('Valid email address is required.', 400, 'email_invalid');
  }

  if (typeof payload.password !== 'string') {
    throw new AuthStoreError('Password is required.', 400, 'password_required');
  }

  const store = await readStore();
  const index = store.users.findIndex((entry) => entry.email === email);
  if (index < 0) {
    throw new AuthStoreError('Invalid email or password.', 401, 'invalid_credentials');
  }

  const user = store.users[index];
  if (!verifyPassword(payload.password, user.passwordHash)) {
    throw new AuthStoreError('Invalid email or password.', 401, 'invalid_credentials');
  }

  const now = isoNow();
  const updatedUser = {
    ...user,
    lastLoginAt: now,
    updatedAt: now
  };

  const nextUsers = [...store.users];
  nextUsers[index] = updatedUser;
  await writeStore({
    ...store,
    users: nextUsers
  });

  return toPublicUser(updatedUser);
}

export async function resolveAuthSession(token) {
  const tokenPayload = verifyAuthSessionToken(token);
  if (!tokenPayload) {
    return null;
  }

  const user = await getAuthUserById(tokenPayload.userId);
  if (!user) {
    return null;
  }

  if (normalizeRole(user.role, 'user') !== tokenPayload.role) {
    return null;
  }

  return {
    user,
    expiresAt: tokenPayload.expiresAtIso
  };
}

export function toAuthErrorPayload(error, fallbackMessage = 'Authentication request failed.') {
  if (error instanceof AuthStoreError) {
    return {
      status: error.status,
      body: {
        ok: false,
        code: error.code,
        error: error.message
      }
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      code: 'auth_unhandled_error',
      error: fallbackMessage
    }
  };
}
