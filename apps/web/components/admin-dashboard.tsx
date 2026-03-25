'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell, Badge, MetricCard, Panel } from '@printra/ui';
import { useLocale } from '@printra/i18n';

type UserRole = 'owner' | 'admin' | 'manager' | 'member' | 'billing';
type UserStatus = 'active' | 'invited' | 'suspended';
type InviteStatus = 'pending' | 'accepted' | 'expired';
type AuditSeverity = 'info' | 'warning' | 'critical';
type PlanId = 'starter' | 'growth' | 'scale';

type AdminSnapshot = {
  foundation: string;
  workspace: {
    workspaceName: string;
    organizationId: string;
    primaryDomain: string;
    supportEmail: string;
    defaultPlanId: PlanId;
    trialDays: number;
  };
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: UserRole;
    status: UserStatus;
    planScope: PlanId;
    mfaEnabled: boolean;
    lastActiveAt: string;
  }>;
  roles: Array<{
    key: UserRole;
    name: string;
    description: string;
    permissions: string[];
  }>;
  planPolicies: {
    enforceSeatCap: boolean;
    seatCap: number;
    allowSelfServeUpgrades: boolean;
    requireApprovalForDowngrades: boolean;
    defaultPlanId: PlanId;
    allowedPlanIds: PlanId[];
  };
  accessPolicies: {
    ssoRequiredForPrivilegedUsers: boolean;
    enforceMfaForAdmins: boolean;
    sessionTimeoutMinutes: number;
    auditRetentionDays: number;
    ipAllowlistEnabled: boolean;
    ipAllowlist: string[];
    inviteDomainAllowlist: string[];
  };
  invitations: Array<{
    id: string;
    email: string;
    role: UserRole;
    status: InviteStatus;
    invitedBy: string;
    createdAt: string;
    expiresAt: string;
  }>;
  auditLog: Array<{
    id: string;
    actor: string;
    action: string;
    target: string;
    severity: AuditSeverity;
    createdAt: string;
  }>;
  catalog: Array<{
    id: PlanId;
    name: string;
    monthlyPrice: number;
    yearlyPrice: number;
    seatsIncluded: number;
    projectsctLimit: number;
    analysisLimit: number;
  }>;
  createdAt: string;
  updatedAt: string;
};

type AdminResponse = {
  ok: true;
  admin: AdminSnapshot;
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const ADMIN_CACHE_KEY = 'printra-admin-cache-v1';
const ROLE_OPTIONS: UserRole[] = ['owner', 'admin', 'manager', 'member', 'billing'];
const STATUS_OPTIONS: UserStatus[] = ['active', 'invited', 'suspended'];
const PLAN_OPTIONS: PlanId[] = ['starter', 'growth', 'scale'];

function readCachedAdmin(): AdminResponse | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ADMIN_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed?.admin) return null;
    return parsed as AdminResponse;
  } catch {
    return null;
  }
}

function writeCachedAdmin(payload: AdminResponse) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify(payload));
}

async function getAdmin(): Promise<AdminResponse> {
  const response = await fetch(`${API_BASE}/admin`);
  if (!response.ok) throw new Error('Admin service is temporarily unavailable.');
  const data = await response.json() as AdminResponse;
  writeCachedAdmin(data);
  return data;
}

async function saveAdmin(payload: AdminSnapshot): Promise<AdminResponse> {
  const response = await fetch(`${API_BASE}/admin`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error('Admin settings could not be saved.');
  return response.json();
}

async function resetAdmin(): Promise<AdminResponse> {
  const response = await fetch(`${API_BASE}/admin/reset`, { method: 'POST' });
  if (!response.ok) throw new Error('Admin settings could not be reset.');
  return response.json();
}

function formatDateTime(value: string, locale: string) {
  try {
    return new Date(value).toLocaleString(locale || 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return value;
  }
}

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function severityTone(severity: AuditSeverity) {
  if (severity === 'critical') return 'border-rose-400/25 bg-rose-400/10 text-rose-200';
  if (severity === 'warning') return 'border-amber-400/25 bg-amber-400/10 text-amber-200';
  return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200';
}

function statusTone(status: UserStatus | InviteStatus) {
  if (status === 'active' || status === 'accepted') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200';
  if (status === 'pending' || status === 'invited') return 'border-sky-400/25 bg-sky-400/10 text-sky-200';
  return 'border-rose-400/25 bg-rose-400/10 text-rose-200';
}

export function AdminDashboard() {
  const { t, locale } = useLocale();
  const [data, setData] = useState<AdminSnapshot | null>(null);
  const [draft, setDraft] = useState<AdminSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadAdmin(options?: { silent?: boolean }) {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    setError('');
    try {
      const response = await getAdmin();
      setData(response.admin);
      setDraft(response.admin);
      if (!silent) setMessage('');
    } catch (requestError) {
      const nextError = requestError instanceof Error ? requestError.message : 'Admin data could not be loaded.';
      setError(nextError);
      setData(null);
      setDraft(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadAdmin();
  }, []);

  function updateDraft(mutator: (current: AdminSnapshot) => AdminSnapshot) {
    setDraft((current) => (current ? mutator(current) : current));
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await saveAdmin(draft);
      setData(response.admin);
      setDraft(response.admin);
      setMessage('Admin settings were saved.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Admin save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await resetAdmin();
      setData(response.admin);
      setDraft(response.admin);
      setMessage('Admin data was reset to defaults.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Admin reset failed.');
    } finally {
      setSaving(false);
    }
  }

  const dirty = JSON.stringify(data) !== JSON.stringify(draft);

  const derived = useMemo(() => {
    if (!draft) return null;
    const privilegedUsers = draft.users.filter((user) => user.role === 'owner' || user.role === 'admin').length;
    const activeUsers = draft.users.filter((user) => user.status === 'active').length;
    const pendingInvites = draft.invitations.filter((invite) => invite.status === 'pending').length;
    const mfaCoverage = draft.users.length ? Math.round((draft.users.filter((user) => user.mfaEnabled).length / draft.users.length) * 100) : 0;
    return { privilegedUsers, activeUsers, pendingInvites, mfaCoverage };
  }, [draft]);

  return (
    <AppShell
      title="Admin"
      subtitle={t('adminSubtitle')}
      topSlot={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <MetricCard compact label="Foundation" value={draft?.foundation ?? 'loading'} />
            <MetricCard compact label="Users" value={String(draft?.users.length ?? 0)} />
            <MetricCard compact label="Pending invites" value={String(derived?.pendingInvites ?? 0)} />
            <MetricCard compact label="MFA" value={derived ? `${derived.mfaCoverage}%` : '-'} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadAdmin()} className="rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] px-4 py-2 text-sm font-semibold text-[var(--shell-heading)] shadow-[var(--shell-button-glow)]">{t('refreshBtn')}</button>
            <button type="button" onClick={() => void handleReset()} disabled={saving} className="rounded-2xl border border-[var(--shell-danger-border)] bg-[var(--shell-danger-bg)] px-4 py-2 text-sm font-semibold text-[var(--shell-danger)] disabled:opacity-60">{t('resetDefaultsBtn')}</button>
            <button type="button" onClick={() => void handleSave()} disabled={!dirty || saving || !draft} className="rounded-2xl border border-sky-400/25 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-200 shadow-[var(--shell-button-glow)] disabled:opacity-60">{saving ? t('savingBtn') : t('saveBtn')}</button>
          </div>
        </div>
      }
    >
      {loading ? <Panel title="Admin loading" description="Loading admin data."><p className="text-sm text-[var(--shell-text-muted)]">Loading...</p></Panel> : null}
      {!loading && error ? <Panel title="Admin error" description="Service did not return a valid response."><p className="text-sm text-[var(--shell-danger)]">{error}</p></Panel> : null}
      {!loading && !error && draft && derived ? (
        <>
          {message ? <Panel title="Status" description="Result of the last action."><p className="text-sm text-[var(--shell-text)]">{message}</p></Panel> : null}

          <div className="grid gap-6 xl:grid-cols-[1.15fr_minmax(0,0.85fr)]">
            <Panel title="Workspace management" description="Domain, support email, and default plan settings.">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--shell-label)]">Workspace name</span>
                  <input value={draft.workspace.workspaceName} onChange={(event) => updateDraft((current) => ({ ...current, workspace: { ...current.workspace, workspaceName: event.target.value } }))} className="w-full rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-select-bg)] px-4 py-3 text-sm text-[var(--shell-heading)] outline-none" />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--shell-label)]">Organization ID</span>
                  <input value={draft.workspace.organizationId} onChange={(event) => updateDraft((current) => ({ ...current, workspace: { ...current.workspace, organizationId: event.target.value } }))} className="w-full rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-select-bg)] px-4 py-3 text-sm text-[var(--shell-heading)] outline-none" />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--shell-label)]">Primary domain</span>
                  <input value={draft.workspace.primaryDomain} onChange={(event) => updateDraft((current) => ({ ...current, workspace: { ...current.workspace, primaryDomain: event.target.value } }))} className="w-full rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-select-bg)] px-4 py-3 text-sm text-[var(--shell-heading)] outline-none" />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--shell-label)]">Support email</span>
                  <input type="email" value={draft.workspace.supportEmail} onChange={(event) => updateDraft((current) => ({ ...current, workspace: { ...current.workspace, supportEmail: event.target.value } }))} className="w-full rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-select-bg)] px-4 py-3 text-sm text-[var(--shell-heading)] outline-none" />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--shell-label)]">Default plan</span>
                  <select value={draft.workspace.defaultPlanId} onChange={(event) => updateDraft((current) => ({ ...current, workspace: { ...current.workspace, defaultPlanId: event.target.value as PlanId } }))} className="w-full rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-select-bg)] px-4 py-3 text-sm text-[var(--shell-heading)] outline-none">
                    {PLAN_OPTIONS.map((planId) => <option key={planId} value={planId}>{planId}</option>)}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--shell-label)]">Trial days</span>
                  <input type="number" min={0} max={90} value={draft.workspace.trialDays} onChange={(event) => updateDraft((current) => ({ ...current, workspace: { ...current.workspace, trialDays: Math.min(90, Math.max(0, Number(event.target.value) || 0)) } }))} className="w-full rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-select-bg)] px-4 py-3 text-sm text-[var(--shell-heading)] outline-none" />
                </label>
              </div>
            </Panel>

            <Panel title="Operations overview" description="Live admin status and enforcement indicators.">
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard label="Active users" value={String(derived.activeUsers)} />
                <MetricCard label="Privileged users" value={String(derived.privilegedUsers)} />
                <MetricCard label="Pending invites" value={String(derived.pendingInvites)} />
                <MetricCard label="Seat cap" value={String(draft.planPolicies.seatCap)} />
                <MetricCard label="Session timeout" value={`${draft.accessPolicies.sessionTimeoutMinutes} min`} />
                <MetricCard label="Audit retention" value={`${draft.accessPolicies.auditRetentionDays} days`} />
              </div>
              <div className="mt-4 rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] p-4 text-sm text-[var(--shell-text-muted)]">
                Last updated: <span className="font-semibold text-[var(--shell-heading)]">{formatDateTime(draft.updatedAt, locale)}</span>
              </div>
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_minmax(0,0.8fr)]">
            <Panel title={t('adminUserMatrixTitle')} description={t('adminUserMatrixDesc')}>
              <div className="space-y-3">
                {draft.users.map((user) => (
                  <div key={user.id} className="rounded-[24px] border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] p-4">
                    <div className="grid gap-4 lg:grid-cols-[1.1fr_1.2fr_repeat(3,minmax(0,0.8fr))_minmax(0,1fr)]">
                      <label className="space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--shell-label)]">Name</span>
                        <input value={user.name} onChange={(event) => updateDraft((current) => ({ ...current, users: current.users.map((entry) => entry.id === user.id ? { ...entry, name: event.target.value } : entry) }))} className="w-full rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-select-bg)] px-3 py-2.5 text-sm text-[var(--shell-heading)] outline-none" />
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--shell-label)]">Email</span>
                        <input type="email" value={user.email} onChange={(event) => updateDraft((current) => ({ ...current, users: current.users.map((entry) => entry.id === user.id ? { ...entry, email: event.target.value } : entry) }))} className="w-full rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-select-bg)] px-3 py-2.5 text-sm text-[var(--shell-heading)] outline-none" />
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--shell-label)]">Role</span>
                        <select value={user.role} onChange={(event) => updateDraft((current) => ({ ...current, users: current.users.map((entry) => entry.id === user.id ? { ...entry, role: event.target.value as UserRole } : entry) }))} className="w-full rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-select-bg)] px-3 py-2.5 text-sm text-[var(--shell-heading)] outline-none">
                          {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--shell-label)]">Status</span>
                        <select value={user.status} onChange={(event) => updateDraft((current) => ({ ...current, users: current.users.map((entry) => entry.id === user.id ? { ...entry, status: event.target.value as UserStatus } : entry) }))} className="w-full rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-select-bg)] px-3 py-2.5 text-sm text-[var(--shell-heading)] outline-none">
                          {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--shell-label)]">Plan</span>
                        <select value={user.planScope} onChange={(event) => updateDraft((current) => ({ ...current, users: current.users.map((entry) => entry.id === user.id ? { ...entry, planScope: event.target.value as PlanId } : entry) }))} className="w-full rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-select-bg)] px-3 py-2.5 text-sm text-[var(--shell-heading)] outline-none">
                          {PLAN_OPTIONS.map((planId) => <option key={planId} value={planId}>{planId}</option>)}
                        </select>
                      </label>
                      <div className="flex min-w-0 items-end gap-2">
                        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-select-bg)] px-3 py-2.5 text-sm text-[var(--shell-heading)]">
                          <input type="checkbox" checked={user.mfaEnabled} onChange={(event) => updateDraft((current) => ({ ...current, users: current.users.map((entry) => entry.id === user.id ? { ...entry, mfaEnabled: event.target.checked } : entry) }))} />
                          MFA
                        </label>
                        <button type="button" onClick={() => updateDraft((current) => ({ ...current, users: current.users.filter((entry) => entry.id !== user.id) }))} className="rounded-xl border border-[var(--shell-danger-border)] bg-[var(--shell-danger-bg)] px-2.5 py-2 text-xs font-semibold leading-none text-[var(--shell-danger)] whitespace-nowrap">{t('adminDeleteBtn')}</button>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-[var(--shell-text-muted)]">{t('adminLastActivity')}: {formatDateTime(user.lastActiveAt, locale)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={() => updateDraft((current) => ({ ...current, users: [...current.users, { id: createId('usr'), name: t('adminNewUserName'), email: `user${current.users.length + 1}@${current.workspace.primaryDomain || 'printra.local'}`, role: 'member', status: 'invited', planScope: current.workspace.defaultPlanId, mfaEnabled: false, lastActiveAt: new Date().toISOString() }] }))} className="rounded-2xl border border-sky-400/25 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-200 shadow-[var(--shell-button-glow)]">{t('adminAddUserBtn')}</button>
              </div>
            </Panel>

            <Panel title={t('adminRoleSchemaTitle')} description={t('adminRoleSchemaDesc')}>
              <div className="space-y-3">
                {draft.roles.map((role) => {
                  const usageCount = draft.users.filter((user) => user.role === role.key).length;
                  return (
                    <div key={role.key} className="rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--shell-heading)]">{role.name}</p>
                          <p className="mt-1 text-xs text-[var(--shell-text-muted)]">{role.description}</p>
                        </div>
                        <Badge>{usageCount} user</Badge>
                      </div>
                      <label className="mt-4 block space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--shell-label)]">Permissions</span>
                        <textarea value={role.permissions.join(', ')} onChange={(event) => updateDraft((current) => ({ ...current, roles: current.roles.map((entry) => entry.key === role.key ? { ...entry, permissions: event.target.value.split(',').map((permission) => permission.trim()).filter(Boolean) } : entry) }))} rows={3} className="w-full rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-select-bg)] px-3 py-3 text-sm text-[var(--shell-heading)] outline-none" />
                      </label>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.95fr_minmax(0,1.05fr)]">
            <Panel title="Plan policies" description="Seat cap, allowed plan list, and upgrade/downgrade behavior.">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] px-4 py-3 text-sm text-[var(--shell-text)]">
                  <input type="checkbox" checked={draft.planPolicies.enforceSeatCap} onChange={(event) => updateDraft((current) => ({ ...current, planPolicies: { ...current.planPolicies, enforceSeatCap: event.target.checked } }))} />
                  Enforce seat cap
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] px-4 py-3 text-sm text-[var(--shell-text)]">
                  <input type="checkbox" checked={draft.planPolicies.allowSelfServeUpgrades} onChange={(event) => updateDraft((current) => ({ ...current, planPolicies: { ...current.planPolicies, allowSelfServeUpgrades: event.target.checked } }))} />
                  Self-serve upgrade enabled
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] px-4 py-3 text-sm text-[var(--shell-text)]">
                  <input type="checkbox" checked={draft.planPolicies.requireApprovalForDowngrades} onChange={(event) => updateDraft((current) => ({ ...current, planPolicies: { ...current.planPolicies, requireApprovalForDowngrades: event.target.checked } }))} />
                  Downgrades require approval
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--shell-label)]">Seat cap</span>
                  <input type="number" min={1} max={1000} value={draft.planPolicies.seatCap} onChange={(event) => updateDraft((current) => ({ ...current, planPolicies: { ...current.planPolicies, seatCap: Math.min(1000, Math.max(1, Number(event.target.value) || 1)) } }))} className="w-full rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-select-bg)] px-4 py-3 text-sm text-[var(--shell-heading)] outline-none" />
                </label>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {draft.catalog.map((plan) => {
                  const enabled = draft.planPolicies.allowedPlanIds.includes(plan.id);
                  return (
                    <label key={plan.id} className={[ 'rounded-[24px] border p-4', enabled ? 'border-sky-400/30 bg-sky-400/10' : 'border-[var(--shell-border)] bg-[var(--shell-surface-soft)]' ].join(' ')}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--shell-heading)]">{plan.name}</p>
                          <p className="mt-1 text-xs text-[var(--shell-text-muted)]">${plan.monthlyPrice}/mo - ${plan.yearlyPrice}/yr</p>
                        </div>
                        <input type="checkbox" checked={enabled} onChange={(event) => updateDraft((current) => ({ ...current, planPolicies: { ...current.planPolicies, allowedPlanIds: event.target.checked ? Array.from(new Set([...current.planPolicies.allowedPlanIds, plan.id])) : current.planPolicies.allowedPlanIds.filter((entry) => entry !== plan.id) } }))} />
                      </div>
                      <div className="mt-3 space-y-1 text-xs text-[var(--shell-text-muted)]">
                        <p>{plan.seatsIncluded} seats included</p>
                        <p>{plan.projectsctLimit} projects</p>
                        <p>{plan.analysisLimit} analyses</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </Panel>

            <Panel title="Access policies" description="SSO, MFA, timeout, and allowlist settings.">
              <div className="grid gap-3">
                <label className="flex items-center gap-3 rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] px-4 py-3 text-sm text-[var(--shell-text)]">
                  <input type="checkbox" checked={draft.accessPolicies.ssoRequiredForPrivilegedUsers} onChange={(event) => updateDraft((current) => ({ ...current, accessPolicies: { ...current.accessPolicies, ssoRequiredForPrivilegedUsers: event.target.checked } }))} />
                  Require SSO for privileged users
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] px-4 py-3 text-sm text-[var(--shell-text)]">
                  <input type="checkbox" checked={draft.accessPolicies.enforceMfaForAdmins} onChange={(event) => updateDraft((current) => ({ ...current, accessPolicies: { ...current.accessPolicies, enforceMfaForAdmins: event.target.checked } }))} />
                  Require MFA for admin and owner roles
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] px-4 py-3 text-sm text-[var(--shell-text)]">
                  <input type="checkbox" checked={draft.accessPolicies.ipAllowlistEnabled} onChange={(event) => updateDraft((current) => ({ ...current, accessPolicies: { ...current.accessPolicies, ipAllowlistEnabled: event.target.checked } }))} />
                  Enable IP allowlist
                </label>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--shell-label)]">Session timeout (min)</span>
                    <input type="number" min={15} max={1440} value={draft.accessPolicies.sessionTimeoutMinutes} onChange={(event) => updateDraft((current) => ({ ...current, accessPolicies: { ...current.accessPolicies, sessionTimeoutMinutes: Math.min(1440, Math.max(15, Number(event.target.value) || 15)) } }))} className="w-full rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-select-bg)] px-4 py-3 text-sm text-[var(--shell-heading)] outline-none" />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--shell-label)]">Audit retention (days)</span>
                    <input type="number" min={30} max={730} value={draft.accessPolicies.auditRetentionDays} onChange={(event) => updateDraft((current) => ({ ...current, accessPolicies: { ...current.accessPolicies, auditRetentionDays: Math.min(730, Math.max(30, Number(event.target.value) || 30)) } }))} className="w-full rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-select-bg)] px-4 py-3 text-sm text-[var(--shell-heading)] outline-none" />
                  </label>
                </div>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--shell-label)]">Invite domain allowlist</span>
                  <textarea value={draft.accessPolicies.inviteDomainAllowlist.join(', ')} onChange={(event) => updateDraft((current) => ({ ...current, accessPolicies: { ...current.accessPolicies, inviteDomainAllowlist: event.target.value.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean) } }))} rows={3} className="w-full rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-select-bg)] px-4 py-3 text-sm text-[var(--shell-heading)] outline-none" />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--shell-label)]">IP allowlist</span>
                  <textarea value={draft.accessPolicies.ipAllowlist.join(', ')} onChange={(event) => updateDraft((current) => ({ ...current, accessPolicies: { ...current.accessPolicies, ipAllowlist: event.target.value.split(',').map((entry) => entry.trim()).filter(Boolean) } }))} rows={3} className="w-full rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-select-bg)] px-4 py-3 text-sm text-[var(--shell-heading)] outline-none" />
                </label>
              </div>
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.9fr_minmax(0,1.1fr)]">
            <Panel title="Invitations" description="Pending invitations and role assignments.">
              <div className="space-y-3">
                {draft.invitations.map((invite) => (
                  <div key={invite.id} className="rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--shell-heading)]">{invite.email}</p>
                        <p className="mt-1 text-xs text-[var(--shell-text-muted)]">{invite.role} - invited by {invite.invitedBy}</p>
                      </div>
                      <span className={[ 'inline-flex rounded-full border px-3 py-1 text-xs font-medium', statusTone(invite.status) ].join(' ')}>{invite.status}</span>
                    </div>
                    <p className="mt-3 text-xs text-[var(--shell-text-muted)]">Created: {formatDateTime(invite.createdAt, locale)} - Expires: {formatDateTime(invite.expiresAt, locale)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={() => updateDraft((current) => ({ ...current, invitations: [{ id: createId('inv'), email: `invite${current.invitations.length + 1}@${current.workspace.primaryDomain || 'printra.local'}`, role: 'member', status: 'pending', invitedBy: current.workspace.supportEmail || 'ops@printra.local', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() }, ...current.invitations] }))} className="rounded-2xl border border-sky-400/25 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-200 shadow-[var(--shell-button-glow)]">Add invitation</button>
              </div>
            </Panel>

            <Panel title="Audit stream" description="Stored view of recent admin activity.">
              <div className="space-y-3">
                {draft.auditLog.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--shell-heading)]">{entry.action}</p>
                        <p className="mt-1 text-xs text-[var(--shell-text-muted)]">{entry.actor} {'->'} {entry.target}</p>
                      </div>
                      <span className={[ 'inline-flex rounded-full border px-3 py-1 text-xs font-medium', severityTone(entry.severity) ].join(' ')}>{entry.severity}</span>
                    </div>
                    <p className="mt-3 text-xs text-[var(--shell-text-muted)]">{formatDateTime(entry.createdAt, locale)}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </>
      ) : null}
    </AppShell>
  );
}

