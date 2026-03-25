'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell, Badge, MetricCard, Panel } from '@printra/ui';
import { useLocale } from '@printra/i18n';

type Plan = {
  id: 'starter' | 'growth' | 'scale';
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  projectLimit: number;
  analysisLimit: number;
  seatsIncluded: number;
  overagePerSeat: number;
  features: string[];
};

type BillingSnapshot = {
  account: {
    workspaceName: string;
    billingEmail: string;
    currentPlanId: Plan['id'];
    billingCycle: 'monthly' | 'yearly';
    seats: number;
    autoRenew: boolean;
    paymentMethodSummary: string;
    nextInvoiceAt: string;
    updatedAt: string;
    createdAt: string;
  };
  usage: {
    periodStart: string;
    periodEnd: string;
    analysesUsed: number;
    storageUsedGb: number;
    teamMembersActive: number;
    projectsActive: number;
  };
  invoices: Array<{
    id: string;
    number: string;
    planId: Plan['id'];
    amount: number;
    currency: string;
    status: string;
    issuedAt: string;
    dueAt: string;
    paidAt: string | null;
  }>;
  availablePlans: Plan[];
  summary: {
    id: Plan['id'];
    name: string;
    includedSeats: number;
    projectLimit: number;
    analysisLimit: number;
    billingCycle: 'monthly' | 'yearly';
    seatOverage: number;
    total: number;
    currency: string;
  };
  foundation: string;
};

type BillingResponse = {
  ok: true;
  billing: BillingSnapshot;
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const BILLING_CACHE_KEY = 'printra-billing-cache-v1';

function readCachedBilling(): BillingResponse | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(BILLING_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed?.billing) return null;
    return parsed as BillingResponse;
  } catch {
    return null;
  }
}

function writeCachedBilling(payload: BillingResponse) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(BILLING_CACHE_KEY, JSON.stringify(payload));
}

async function getBilling(): Promise<BillingResponse> {
  const response = await fetch(`${API_BASE}/billing`);
  if (!response.ok) throw new Error('Billing service is temporarily unavailable.');
  const data = await response.json() as BillingResponse;
  writeCachedBilling(data);
  return data;
}

async function saveBilling(payload: BillingSnapshot): Promise<BillingResponse> {
  try {
    const response = await fetch(`${API_BASE}/billing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('Billing settings could not be saved.');
    const data = await response.json() as BillingResponse;
    writeCachedBilling(data);
    return data;
  } catch {
    const local: BillingResponse = { ok: true, billing: { ...payload, foundation: 'local-browser-billing' } };
    writeCachedBilling(local);
    return local;
  }
}

async function resetBilling(): Promise<BillingResponse> {
  try {
    const response = await fetch(`${API_BASE}/billing/reset`, { method: 'POST' });
    if (!response.ok) throw new Error('Billing settings could not be reset.');
    const data = await response.json() as BillingResponse;
    writeCachedBilling(data);
    return data;
  } catch {
    const cached = readCachedBilling();
    if (cached) return cached;
    throw new Error('Billing settings could not be reset.');
  }
}

function formatMoney(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString('tr-TR', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return value;
  }
}

function statusTone(status: string) {
  if (status === 'paid') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300';
  if (status === 'open') return 'border-amber-400/25 bg-amber-400/10 text-amber-300';
  return 'border-slate-400/25 bg-slate-400/10 text-slate-300';
}

export function BillingDashboard() {
  const { t } = useLocale();
  const [data, setData] = useState<BillingSnapshot | null>(null);
  const [draft, setDraft] = useState<BillingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadBilling(options?: { silent?: boolean }) {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    setError('');
    try {
      const response = await getBilling();
      setData(response.billing);
      setDraft(response.billing);
      if (!silent) setMessage('');
    } catch (requestError) {
      const nextError = requestError instanceof Error ? requestError.message : 'Billing could not be loaded.';
      const cached = readCachedBilling();
      if (cached) {
        setData(cached.billing);
        setDraft(cached.billing);
        setMessage('Billing offline fallback aktif: cached veriler kullanılıyor.');
      } else {
        setError(nextError);
        setData(null);
        setDraft(null);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadBilling();
  }, []);

  const selectedPlan = useMemo(() => {
    if (!draft) return null;
    return draft.availablePlans.find((plan) => plan.id === draft.account.currentPlanId) ?? draft.availablePlans[0] ?? null;
  }, [draft]);

  const preview = useMemo(() => {
    if (!draft || !selectedPlan) return null;
    const base = draft.account.billingCycle === 'yearly' ? selectedPlan.yearlyPrice : selectedPlan.monthlyPrice;
    const seatOverage = Math.max(0, draft.account.seats - selectedPlan.seatsIncluded) * selectedPlan.overagePerSeat;
    return {
      total: base + seatOverage,
      includedSeats: selectedPlan.seatsIncluded,
      seatOverage,
      projectLimit: selectedPlan.projectLimit,
      analysisLimit: selectedPlan.analysisLimit
    };
  }, [draft, selectedPlan]);

  function updateDraft(mutator: (current: BillingSnapshot) => BillingSnapshot) {
    setDraft((current) => (current ? mutator(current) : current));
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await saveBilling(draft);
      setData(response.billing);
      setDraft(response.billing);
      setMessage('Billing ayarları kaydedildi.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Billing kaydı başarısız.');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await resetBilling();
      setData(response.billing);
      setDraft(response.billing);
      setMessage('Billing varsayılan değerlere döndürüldü.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Billing reset başarısız.');
    } finally {
      setSaving(false);
    }
  }

  const dirty = JSON.stringify(data) !== JSON.stringify(draft);

  return (
    <AppShell
      title="Billing"
      subtitle={t('billingSubtitle')}
      topSlot={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <MetricCard compact label="Foundation" value={draft?.foundation ?? 'loading'} />
            <MetricCard compact label="Plan" value={draft?.account.currentPlanId ?? '-'} />
            <MetricCard compact label="Cycle" value={draft?.account.billingCycle ?? '-'} />
            <MetricCard compact label="Seats" value={String(draft?.account.seats ?? '-')} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadBilling({ silent: false })}
              className="rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] px-4 py-2 text-sm font-semibold text-[var(--shell-heading)] shadow-[var(--shell-button-glow)]"
            >
              {t('refreshBtn')}
            </button>
            <button
              type="button"
              onClick={() => void handleReset()}
              disabled={saving}
              className="rounded-2xl border border-[var(--shell-danger-border)] bg-[var(--shell-danger-bg)] px-4 py-2 text-sm font-semibold text-[var(--shell-danger)] disabled:opacity-60"
            >
              {t('resetDefaultsBtn')}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!dirty || saving || !draft}
              className="rounded-2xl border border-sky-400/25 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-200 shadow-[var(--shell-button-glow)] disabled:opacity-60"
            >
              {saving ? t('savingBtn') : t('saveBtn')}
            </button>
          </div>
        </div>
      }
    >
      {loading ? <Panel title="Billing loading" description="Billing verileri yükleniyor."><p className="text-sm text-[var(--shell-text-muted)]">Yükleniyor…</p></Panel> : null}
      {!loading && error ? <Panel title="Billing error" description="Servis yanıt vermedi."><p className="text-sm text-[var(--shell-danger)]">{error}</p></Panel> : null}
      {!loading && !error && draft ? (
        <>
          {message ? <Panel title="Durum" description="Son işlem sonucu."><p className="text-sm text-[var(--shell-text)]">{message}</p></Panel> : null}

          <div className="grid gap-6 xl:grid-cols-[1.2fr_minmax(0,0.8fr)]">
            <Panel title="Plan yönetimi" description="Plan ve faturalama periyodu burada belirlenir.">
              <div className="grid gap-4 lg:grid-cols-3">
                {draft.availablePlans.map((plan) => {
                  const active = draft.account.currentPlanId === plan.id;
                  const price = draft.account.billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => updateDraft((current) => ({ ...current, account: { ...current.account, currentPlanId: plan.id } }))}
                      className={[
                        'rounded-[24px] border p-4 text-left transition',
                        active
                          ? 'border-sky-400/35 bg-sky-400/10 shadow-[var(--shell-button-glow)]'
                          : 'border-[var(--shell-border)] bg-[var(--shell-surface-soft)] hover:border-sky-300/35'
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--shell-heading)]">{plan.name}</p>
                          <p className="mt-1 text-xs text-[var(--shell-text-muted)]">{formatMoney(price)} / {draft.account.billingCycle === 'yearly' ? 'year' : 'month'}</p>
                        </div>
                        {active ? <Badge>Current</Badge> : null}
                      </div>
                      <div className="mt-4 space-y-2 text-xs text-[var(--shell-text-muted)]">
                        <p>{plan.projectLimit} project limit</p>
                        <p>{plan.analysisLimit} analyses / month</p>
                        <p>{plan.seatsIncluded} seat included</p>
                        {plan.features.map((feature) => <p key={feature}>{feature}</p>)}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--shell-label)]">Billing cycle</span>
                  <select
                    value={draft.account.billingCycle}
                    onChange={(event) => updateDraft((current) => ({ ...current, account: { ...current.account, billingCycle: event.target.value as BillingSnapshot['account']['billingCycle'] } }))}
                    className="w-full rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-select-bg)] px-4 py-3 text-sm text-[var(--shell-heading)] outline-none"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--shell-label)]">Seats</span>
                  <input
                    type="number"
                    min={1}
                    max={250}
                    value={draft.account.seats}
                    onChange={(event) => updateDraft((current) => ({ ...current, account: { ...current.account, seats: Math.min(250, Math.max(1, Number(event.target.value) || 1)) } }))}
                    className="w-full rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-select-bg)] px-4 py-3 text-sm text-[var(--shell-heading)] outline-none"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--shell-label)]">Workspace name</span>
                  <input
                    value={draft.account.workspaceName}
                    onChange={(event) => updateDraft((current) => ({ ...current, account: { ...current.account, workspaceName: event.target.value } }))}
                    className="w-full rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-select-bg)] px-4 py-3 text-sm text-[var(--shell-heading)] outline-none"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--shell-label)]">Billing email</span>
                  <input
                    type="email"
                    value={draft.account.billingEmail}
                    onChange={(event) => updateDraft((current) => ({ ...current, account: { ...current.account, billingEmail: event.target.value } }))}
                    className="w-full rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-select-bg)] px-4 py-3 text-sm text-[var(--shell-heading)] outline-none"
                  />
                </label>
              </div>

              <label className="mt-4 flex items-center gap-3 rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] px-4 py-3 text-sm text-[var(--shell-text)]">
                <input
                  type="checkbox"
                  checked={draft.account.autoRenew}
                  onChange={(event) => updateDraft((current) => ({ ...current, account: { ...current.account, autoRenew: event.target.checked } }))}
                />
                {t('billingAutoRenewLabel')}
              </label>
            </Panel>

            <Panel title="Charge preview" description="Plan ve koltuk sayısına göre oluşan anlık tahmin.">
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard label="Estimated total" value={preview ? formatMoney(preview.total) : '-'} />
                <MetricCard label="Included seats" value={preview ? String(preview.includedSeats) : '-'} />
                <MetricCard label="Seat overage" value={preview ? formatMoney(preview.seatOverage) : '-'} />
                <MetricCard label="Next invoice" value={formatDate(draft.account.nextInvoiceAt)} />
                <MetricCard label="Project limit" value={preview ? String(preview.projectLimit) : '-'} />
                <MetricCard label="Analysis limit" value={preview ? String(preview.analysisLimit) : '-'} />
              </div>
              <div className="mt-4 rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--shell-label)]">Payment method</p>
                <p className="mt-2 text-sm font-semibold text-[var(--shell-heading)]">{draft.account.paymentMethodSummary}</p>
              </div>
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.9fr_minmax(0,1.1fr)]">
            <Panel title="Usage" description="Bu dönem tüketilen kaynakların anlık görünümü.">
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard label="Analyses used" value={String(draft.usage.analysesUsed)} />
                <MetricCard label="Storage used" value={`${draft.usage.storageUsedGb} GB`} />
                <MetricCard label="Active members" value={String(draft.usage.teamMembersActive)} />
                <MetricCard label="Active projects" value={String(draft.usage.projectsActive)} />
                <MetricCard label="Period start" value={formatDate(draft.usage.periodStart)} />
                <MetricCard label="Period end" value={formatDate(draft.usage.periodEnd)} />
              </div>
            </Panel>

            <Panel title="Invoices" description="Kaydedilmiş fatura geçmişi ve mevcut açık kalemler.">
              <div className="space-y-3">
                {draft.invoices.map((invoice) => (
                  <div key={invoice.id} className="rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--shell-heading)]">{invoice.number}</p>
                        <p className="mt-1 text-xs text-[var(--shell-text-muted)]">Issued {formatDate(invoice.issuedAt)} · Due {formatDate(invoice.dueAt)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={[ 'inline-flex rounded-full border px-3 py-1 text-xs font-medium', statusTone(invoice.status) ].join(' ')}>{invoice.status}</span>
                        <span className="text-sm font-semibold text-[var(--shell-heading)]">{formatMoney(invoice.amount, invoice.currency)}</span>
                      </div>
                    </div>
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
