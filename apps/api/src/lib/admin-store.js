import { promises as fs } from 'fs';
import path from 'path';
import { readBilling } from './billing-store.js';

const dataDir = path.resolve(process.cwd(), 'data');
const adminFile = path.join(dataDir, 'admin.json');

const allowedUserRoles = new Set(['owner', 'admin', 'manager', 'member', 'billing']);
const allowedUserStatuses = new Set(['active', 'invited', 'suspended']);
const allowedInviteStatuses = new Set(['pending', 'accepted', 'expired']);
const allowedAuditSeverity = new Set(['info', 'warning', 'critical']);
const allowedPlans = new Set(['starter', 'growth', 'scale']);

function isoNow() {
  return new Date().toISOString();
}

function addDays(dateValue, days) {
  return new Date(new Date(dateValue).getTime() + days * 24 * 60 * 60 * 1000);
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value, fallback = '', maxLength = 160) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : fallback;
}

function normalizeBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizeChoice(value, allowedValues, fallback) {
  return typeof value === 'string' && allowedValues.has(value) ? value : fallback;
}

function normalizeEmail(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const next = value.trim().toLowerCase().slice(0, 160);
  if (!next) return fallback;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next) ? next : fallback;
}

function normalizeIsoDate(value, fallback) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return fallback;
  return new Date(timestamp).toISOString();
}

function makeId(prefix, input) {
  const seed = normalizeText(input, prefix, 64)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${prefix}-${seed || Math.random().toString(36).slice(2, 10)}`;
}

function createDefaultAdmin() {
  const now = isoNow();
  const nextWeek = addDays(now, 7).toISOString();

  return {
    foundation: 'local-json-admin',
    workspace: {
      workspaceName: 'Main Workspace',
      organizationId: 'demo-org',
      primaryDomain: 'printra.local',
      supportEmail: 'ops@printra.local',
      defaultPlanId: 'growth',
      trialDays: 14
    },
    users: [
      {
        id: 'usr-owner',
        name: 'Ömer Y.',
        email: 'owner@printra.local',
        role: 'owner',
        status: 'active',
        planScope: 'scale',
        mfaEnabled: true,
        lastActiveAt: now
      },
      {
        id: 'usr-admin',
        name: 'Platform Admin',
        email: 'admin@printra.local',
        role: 'admin',
        status: 'active',
        planScope: 'growth',
        mfaEnabled: true,
        lastActiveAt: addDays(now, -1).toISOString()
      },
      {
        id: 'usr-manager',
        name: 'Operations Manager',
        email: 'manager@printra.local',
        role: 'manager',
        status: 'active',
        planScope: 'growth',
        mfaEnabled: false,
        lastActiveAt: addDays(now, -2).toISOString()
      }
    ],
    roles: [
      {
        key: 'owner',
        name: 'Owner',
        description: 'Tam yetki, workspace ve plan devri dahil.',
        permissions: ['workspace.manage', 'billing.manage', 'users.manage', 'roles.manage', 'audit.read']
      },
      {
        key: 'admin',
        name: 'Admin',
        description: 'Operasyon, erişim ve kullanıcı yönetimi.',
        permissions: ['users.manage', 'roles.manage', 'billing.read', 'access.manage', 'audit.read']
      },
      {
        key: 'manager',
        name: 'Manager',
        description: 'Takım, proje ve kullanım takibi.',
        permissions: ['users.read', 'projects.manage', 'usage.read']
      },
      {
        key: 'member',
        name: 'Member',
        description: 'Standart uygulama kullanıcısı.',
        permissions: ['projects.read', 'projects.write']
      },
      {
        key: 'billing',
        name: 'Billing',
        description: 'Faturalama görünümü ve ödeme iletişimleri.',
        permissions: ['billing.read', 'invoices.read']
      }
    ],
    planPolicies: {
      enforceSeatCap: true,
      seatCap: 25,
      allowSelfServeUpgrades: true,
      requireApprovalForDowngrades: true,
      defaultPlanId: 'growth',
      allowedPlanIds: ['starter', 'growth', 'scale']
    },
    accessPolicies: {
      ssoRequiredForPrivilegedUsers: false,
      enforceMfaForAdmins: true,
      sessionTimeoutMinutes: 480,
      auditRetentionDays: 180,
      ipAllowlistEnabled: false,
      ipAllowlist: [],
      inviteDomainAllowlist: ['printra.local']
    },
    invitations: [
      {
        id: 'inv-billing',
        email: 'billing@printra.local',
        role: 'billing',
        status: 'pending',
        invitedBy: 'owner@printra.local',
        createdAt: now,
        expiresAt: nextWeek
      }
    ],
    auditLog: [
      {
        id: 'audit-01',
        actor: 'system',
        action: 'workspace.bootstrap',
        target: 'admin-store',
        severity: 'info',
        createdAt: now
      },
      {
        id: 'audit-02',
        actor: 'owner@printra.local',
        action: 'policy.mfa.enabled',
        target: 'access-policies',
        severity: 'warning',
        createdAt: addDays(now, -2).toISOString()
      }
    ],
    createdAt: now,
    updatedAt: now
  };
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(adminFile);
  } catch {
    await fs.writeFile(adminFile, JSON.stringify(createDefaultAdmin(), null, 2), 'utf8');
  }
}

function sanitizeUser(user = {}, index, fallbackDate) {
  const email = normalizeEmail(user.email, `user${index + 1}@printra.local`);
  const name = normalizeText(user.name, email.split('@')[0] || `User ${index + 1}`);
  return {
    id: normalizeText(user.id, makeId('usr', `${email}-${index}`), 64),
    name,
    email,
    role: normalizeChoice(user.role, allowedUserRoles, 'member'),
    status: normalizeChoice(user.status, allowedUserStatuses, 'active'),
    planScope: normalizeChoice(user.planScope, allowedPlans, 'growth'),
    mfaEnabled: normalizeBoolean(user.mfaEnabled, false),
    lastActiveAt: normalizeIsoDate(user.lastActiveAt, fallbackDate)
  };
}

function sanitizeRole(role = {}, fallbackKey = 'member') {
  const key = normalizeChoice(role.key, allowedUserRoles, fallbackKey);
  return {
    key,
    name: normalizeText(role.name, key.toUpperCase()),
    description: normalizeText(role.description, '', 220),
    permissions: Array.from(new Set(ensureArray(role.permissions).map((entry) => normalizeText(entry, '', 64)).filter(Boolean))).slice(0, 24)
  };
}

function sanitizeInvitation(invite = {}, index, fallbackDate) {
  const email = normalizeEmail(invite.email, `invite${index + 1}@printra.local`);
  return {
    id: normalizeText(invite.id, makeId('inv', `${email}-${index}`), 64),
    email,
    role: normalizeChoice(invite.role, allowedUserRoles, 'member'),
    status: normalizeChoice(invite.status, allowedInviteStatuses, 'pending'),
    invitedBy: normalizeEmail(invite.invitedBy, 'system@printra.local'),
    createdAt: normalizeIsoDate(invite.createdAt, fallbackDate),
    expiresAt: normalizeIsoDate(invite.expiresAt, addDays(fallbackDate, 7).toISOString())
  };
}

function sanitizeAuditEntry(entry = {}, index, fallbackDate) {
  return {
    id: normalizeText(entry.id, makeId('audit', `${index}-${entry.action ?? 'entry'}`), 64),
    actor: normalizeText(entry.actor, 'system', 120),
    action: normalizeText(entry.action, 'unknown.action', 120),
    target: normalizeText(entry.target, 'workspace', 120),
    severity: normalizeChoice(entry.severity, allowedAuditSeverity, 'info'),
    createdAt: normalizeIsoDate(entry.createdAt, fallbackDate)
  };
}

function sanitizeAdmin(source = {}, fallback = createDefaultAdmin(), billingPlans = []) {
  const fallbackDate = isoNow();
  const roles = ensureArray(source.roles).map((role, index) => sanitizeRole(role, fallback.roles[index]?.key ?? 'member'));
  const users = ensureArray(source.users).map((user, index) => sanitizeUser(user, index, fallbackDate));
  const invitations = ensureArray(source.invitations).map((invite, index) => sanitizeInvitation(invite, index, fallbackDate));
  const auditLog = ensureArray(source.auditLog)
    .map((entry, index) => sanitizeAuditEntry(entry, index, fallbackDate))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 40);

  const availablePlanIds = Array.from(
    new Set(
      ensureArray(source.planPolicies?.allowedPlanIds)
        .map((entry) => normalizeChoice(entry, allowedPlans, ''))
        .filter(Boolean)
    )
  );

  return {
    foundation: 'local-json-admin',
    workspace: {
      workspaceName: normalizeText(source.workspace?.workspaceName, fallback.workspace.workspaceName),
      organizationId: normalizeText(source.workspace?.organizationId, fallback.workspace.organizationId),
      primaryDomain: normalizeText(source.workspace?.primaryDomain, fallback.workspace.primaryDomain),
      supportEmail: normalizeEmail(source.workspace?.supportEmail, fallback.workspace.supportEmail),
      defaultPlanId: normalizeChoice(source.workspace?.defaultPlanId, allowedPlans, fallback.workspace.defaultPlanId),
      trialDays: normalizeInteger(source.workspace?.trialDays, fallback.workspace.trialDays, 0, 90)
    },
    users,
    roles,
    planPolicies: {
      enforceSeatCap: normalizeBoolean(source.planPolicies?.enforceSeatCap, fallback.planPolicies.enforceSeatCap),
      seatCap: normalizeInteger(source.planPolicies?.seatCap, fallback.planPolicies.seatCap, 1, 1000),
      allowSelfServeUpgrades: normalizeBoolean(source.planPolicies?.allowSelfServeUpgrades, fallback.planPolicies.allowSelfServeUpgrades),
      requireApprovalForDowngrades: normalizeBoolean(source.planPolicies?.requireApprovalForDowngrades, fallback.planPolicies.requireApprovalForDowngrades),
      defaultPlanId: normalizeChoice(source.planPolicies?.defaultPlanId, allowedPlans, fallback.planPolicies.defaultPlanId),
      allowedPlanIds: availablePlanIds.length ? availablePlanIds : [...fallback.planPolicies.allowedPlanIds]
    },
    accessPolicies: {
      ssoRequiredForPrivilegedUsers: normalizeBoolean(source.accessPolicies?.ssoRequiredForPrivilegedUsers, fallback.accessPolicies.ssoRequiredForPrivilegedUsers),
      enforceMfaForAdmins: normalizeBoolean(source.accessPolicies?.enforceMfaForAdmins, fallback.accessPolicies.enforceMfaForAdmins),
      sessionTimeoutMinutes: normalizeInteger(source.accessPolicies?.sessionTimeoutMinutes, fallback.accessPolicies.sessionTimeoutMinutes, 15, 1440),
      auditRetentionDays: normalizeInteger(source.accessPolicies?.auditRetentionDays, fallback.accessPolicies.auditRetentionDays, 30, 730),
      ipAllowlistEnabled: normalizeBoolean(source.accessPolicies?.ipAllowlistEnabled, fallback.accessPolicies.ipAllowlistEnabled),
      ipAllowlist: Array.from(new Set(ensureArray(source.accessPolicies?.ipAllowlist).map((entry) => normalizeText(entry, '', 80)).filter(Boolean))).slice(0, 32),
      inviteDomainAllowlist: Array.from(new Set(ensureArray(source.accessPolicies?.inviteDomainAllowlist).map((entry) => normalizeText(entry, '', 80).toLowerCase()).filter(Boolean))).slice(0, 32)
    },
    invitations,
    auditLog,
    createdAt: normalizeIsoDate(source.createdAt, fallback.createdAt),
    updatedAt: normalizeIsoDate(source.updatedAt, fallback.updatedAt),
    catalog: billingPlans.map((plan) => ({
      id: normalizeChoice(plan.id, allowedPlans, 'starter'),
      name: normalizeText(plan.name, plan.id),
      monthlyPrice: normalizeInteger(plan.monthlyPrice, 0, 0, 1_000_000),
      yearlyPrice: normalizeInteger(plan.yearlyPrice, 0, 0, 1_000_000),
      seatsIncluded: normalizeInteger(plan.seatsIncluded, 1, 1, 1_000),
      projectLimit: normalizeInteger(plan.projectLimit, 0, 0, 1_000_000),
      analysisLimit: normalizeInteger(plan.analysisLimit, 0, 0, 1_000_000)
    }))
  };
}

async function writeAdmin(admin) {
  await ensureStore();
  const { catalog, ...persistable } = admin;
  await fs.writeFile(adminFile, JSON.stringify(persistable, null, 2), 'utf8');
}

function countBy(items, selector) {
  return items.reduce((accumulator, item) => {
    const key = selector(item);
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});
}

export function summarizeAdmin(admin) {
  const userStatus = countBy(admin.users, (user) => user.status);
  const roleCounts = countBy(admin.users, (user) => user.role);
  return {
    foundation: admin.foundation,
    users: admin.users.length,
    activeUsers: userStatus.active ?? 0,
    pendingInvites: admin.invitations.filter((invite) => invite.status === 'pending').length,
    privilegedUsers: admin.users.filter((user) => ['owner', 'admin'].includes(user.role)).length,
    mfaCoverage: admin.users.length ? Math.round((admin.users.filter((user) => user.mfaEnabled).length / admin.users.length) * 100) : 0,
    roleCounts,
    seatCap: admin.planPolicies.seatCap,
    defaultPlanId: admin.planPolicies.defaultPlanId,
    auditEntries: admin.auditLog.length
  };
}

export async function readAdmin() {
  await ensureStore();
  const defaults = createDefaultAdmin();

  try {
    const [raw, billing] = await Promise.all([
      fs.readFile(adminFile, 'utf8'),
      readBilling().catch(() => null)
    ]);
    const parsed = JSON.parse(raw);
    return sanitizeAdmin(parsed, defaults, billing?.availablePlans ?? []);
  } catch {
    const next = sanitizeAdmin(defaults, defaults, []);
    await writeAdmin(next);
    return next;
  }
}

export async function updateAdmin(payload = {}) {
  const current = await readAdmin();
  const next = sanitizeAdmin(payload, current, current.catalog ?? []);
  next.createdAt = current.createdAt;
  next.updatedAt = isoNow();
  await writeAdmin(next);
  return readAdmin();
}

export async function resetAdmin() {
  const defaults = createDefaultAdmin();
  const billing = await readBilling().catch(() => null);
  const next = sanitizeAdmin(defaults, defaults, billing?.availablePlans ?? []);
  await writeAdmin(next);
  return next;
}
