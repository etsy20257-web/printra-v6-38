import { promises as fs } from 'fs';
import path from 'path';

const dataDir = path.resolve(process.cwd(), 'data');
const billingFile = path.join(dataDir, 'billing.json');

const allowedPlans = new Set(['starter', 'growth', 'scale']);
const allowedBillingCycles = new Set(['monthly', 'yearly']);
const AVAILABLE_PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 19,
    yearlyPrice: 190,
    projectLimit: 10,
    analysisLimit: 100,
    seatsIncluded: 1,
    overagePerSeat: 9,
    features: ['10 active projects', '100 analyses / month', 'Email support']
  },
  {
    id: 'growth',
    name: 'Growth',
    monthlyPrice: 49,
    yearlyPrice: 490,
    projectLimit: 50,
    analysisLimit: 500,
    seatsIncluded: 3,
    overagePerSeat: 12,
    features: ['50 active projects', '500 analyses / month', 'Priority support']
  },
  {
    id: 'scale',
    name: 'Scale',
    monthlyPrice: 99,
    yearlyPrice: 990,
    projectLimit: 200,
    analysisLimit: 2500,
    seatsIncluded: 10,
    overagePerSeat: 15,
    features: ['200 active projects', '2,500 analyses / month', 'Team workflow support']
  }
];

function isoNow() {
  return new Date().toISOString();
}

function addDays(dateValue, days) {
  return new Date(new Date(dateValue).getTime() + days * 24 * 60 * 60 * 1000);
}

function addMonths(dateValue, months) {
  const date = new Date(dateValue);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
}

function addYears(dateValue, years) {
  const date = new Date(dateValue);
  return new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
}

function toIso(dateValue) {
  return new Date(dateValue).toISOString();
}

function getCycleDays(billingCycle) {
  return billingCycle === 'yearly' ? 365 : 30;
}

function advanceCycle(dateValue, billingCycle, count = 1) {
  if (billingCycle === 'yearly') return addYears(dateValue, count);
  return addMonths(dateValue, count);
}

function createInvoice({ id, planId, amount, status, issuedAt, dueAt, currency = 'USD' }) {
  return {
    id,
    number: `INV-${id.toUpperCase()}`,
    planId,
    amount,
    currency,
    status,
    issuedAt,
    dueAt,
    paidAt: status === 'paid' ? issuedAt : null
  };
}

function getPlan(planId) {
  return AVAILABLE_PLANS.find((entry) => entry.id === planId) ?? AVAILABLE_PLANS[0];
}

function clonePlans() {
  return AVAILABLE_PLANS.map((plan) => ({ ...plan, features: [...plan.features] }));
}

function normalizeText(value, fallback = '', maxLength = 160) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : fallback;
}

function normalizeBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeNumber(value, fallback, min, max) {
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

function computePlanSummary(planId, billingCycle, seats) {
  const plan = getPlan(planId);
  const seatOverage = Math.max(0, seats - plan.seatsIncluded) * plan.overagePerSeat;
  const basePrice = billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
  const total = basePrice + seatOverage;
  return {
    id: plan.id,
    name: plan.name,
    includedSeats: plan.seatsIncluded,
    projectLimit: plan.projectLimit,
    analysisLimit: plan.analysisLimit,
    billingCycle,
    seatOverage,
    total,
    currency: 'USD'
  };
}

function seedFromText(input) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function ratioFromSeed(seed, min, max) {
  const normalized = (seed % 10_000) / 10_000;
  return min + (max - min) * normalized;
}

function buildUsage(account, summary) {
  const periodEnd = normalizeIsoDate(account.nextInvoiceAt, toIso(advanceCycle(Date.now(), account.billingCycle, 1)));
  const periodStart = toIso(advanceCycle(periodEnd, account.billingCycle, -1));
  const seed = seedFromText([
    account.workspaceName,
    account.currentPlanId,
    account.billingCycle,
    account.seats,
    periodStart
  ].join('|'));

  const projectRatio = ratioFromSeed(seed, 0.28, 0.74);
  const analysisRatio = ratioFromSeed(seed >>> 3, 0.31, 0.83);
  const storageRatio = ratioFromSeed(seed >>> 5, 0.06, 0.42);

  const seatCapacityFactor = Math.max(1, Math.min(account.seats, summary.includedSeats + 4));
  const projectsActive = Math.max(1, Math.min(summary.projectLimit, Math.round(summary.projectLimit * projectRatio)));
  const analysesUsed = Math.min(summary.analysisLimit, Math.max(0, Math.round(summary.analysisLimit * analysisRatio)));
  const storageUsedGb = Number((Math.max(0.5, projectsActive * 0.35 + analysesUsed / 220 + seatCapacityFactor * 0.8) * storageRatio * 6).toFixed(1));

  return {
    periodStart,
    periodEnd,
    analysesUsed,
    storageUsedGb,
    teamMembersActive: account.seats,
    projectsActive
  };
}

function buildInvoices(account, summary) {
  const nextInvoiceAt = normalizeIsoDate(account.nextInvoiceAt, toIso(advanceCycle(Date.now(), account.billingCycle, 1)));
  const currentIssuedAt = toIso(advanceCycle(nextInvoiceAt, account.billingCycle, -1));

  const invoices = [
    createInvoice({
      id: `${account.currentPlanId}-${account.billingCycle}-current`,
      planId: account.currentPlanId,
      amount: summary.total,
      status: 'open',
      issuedAt: currentIssuedAt,
      dueAt: nextInvoiceAt,
      currency: summary.currency
    })
  ];

  for (let index = 1; index <= 3; index += 1) {
    const issuedAt = toIso(advanceCycle(currentIssuedAt, account.billingCycle, -index));
    const dueAt = toIso(advanceCycle(nextInvoiceAt, account.billingCycle, -index));
    invoices.push(
      createInvoice({
        id: `${account.currentPlanId}-${account.billingCycle}-history-${index}`,
        planId: account.currentPlanId,
        amount: summary.total,
        status: 'paid',
        issuedAt,
        dueAt,
        currency: summary.currency
      })
    );
  }

  return invoices;
}

function buildSnapshot(account, foundation = 'local-json-billing') {
  const summary = computePlanSummary(account.currentPlanId, account.billingCycle, account.seats);
  const usage = buildUsage(account, summary);

  return {
    account,
    usage,
    invoices: buildInvoices(account, summary),
    availablePlans: clonePlans(),
    foundation,
    summary
  };
}

function createDefaultAccount() {
  const now = new Date();
  return {
    workspaceName: 'Main Workspace',
    billingEmail: 'billing@printra.local',
    currentPlanId: 'growth',
    billingCycle: 'monthly',
    seats: 3,
    autoRenew: true,
    paymentMethodSummary: 'Visa •••• 4242',
    nextInvoiceAt: toIso(advanceCycle(now, 'monthly', 1)),
    updatedAt: now.toISOString(),
    createdAt: now.toISOString()
  };
}

function createDefaultBilling() {
  return buildSnapshot(createDefaultAccount());
}

function sanitizeBilling(source = {}, fallback = createDefaultBilling()) {
  const currentPlanId = normalizeChoice(source.account?.currentPlanId, allowedPlans, fallback.account.currentPlanId);
  const billingCycle = normalizeChoice(source.account?.billingCycle, allowedBillingCycles, fallback.account.billingCycle);
  const seats = normalizeNumber(source.account?.seats, fallback.account.seats, 1, 250);
  const createdAt = normalizeIsoDate(source.account?.createdAt, fallback.account.createdAt);
  const updatedAt = normalizeIsoDate(source.account?.updatedAt, fallback.account.updatedAt);
  const defaultNextInvoiceAt = toIso(advanceCycle(updatedAt, billingCycle, 1));

  return {
    account: {
      workspaceName: normalizeText(source.account?.workspaceName, fallback.account.workspaceName),
      billingEmail: normalizeEmail(source.account?.billingEmail, fallback.account.billingEmail),
      currentPlanId,
      billingCycle,
      seats,
      autoRenew: normalizeBoolean(source.account?.autoRenew, fallback.account.autoRenew),
      paymentMethodSummary: normalizeText(source.account?.paymentMethodSummary, fallback.account.paymentMethodSummary),
      nextInvoiceAt: normalizeIsoDate(source.account?.nextInvoiceAt, defaultNextInvoiceAt),
      updatedAt,
      createdAt
    },
    foundation: normalizeText(source.foundation, fallback.foundation, 48) || 'local-json-billing'
  };
}

function sanitizePersistedBilling(source = {}, fallback = createDefaultBilling()) {
  const sanitized = sanitizeBilling(source, fallback);
  return buildSnapshot(sanitized.account, sanitized.foundation);
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(billingFile);
  } catch {
    await fs.writeFile(billingFile, JSON.stringify(createDefaultBilling(), null, 2), 'utf8');
  }
}

async function writeBilling(snapshot) {
  await ensureStore();
  await fs.writeFile(billingFile, JSON.stringify(snapshot, null, 2), 'utf8');
}

export function summarizeBilling(snapshot) {
  const planSummary = computePlanSummary(snapshot.account.currentPlanId, snapshot.account.billingCycle, snapshot.account.seats);
  return {
    foundation: snapshot.foundation,
    workspaceName: snapshot.account.workspaceName,
    billingEmail: snapshot.account.billingEmail,
    currentPlanId: snapshot.account.currentPlanId,
    billingCycle: snapshot.account.billingCycle,
    seats: snapshot.account.seats,
    estimatedCharge: planSummary.total,
    nextInvoiceAt: snapshot.account.nextInvoiceAt,
    openInvoices: snapshot.invoices.filter((invoice) => invoice.status !== 'paid').length,
    analysesUsed: snapshot.usage.analysesUsed,
    projectUsage: snapshot.usage.projectsActive
  };
}

export async function readBilling() {
  await ensureStore();
  const defaults = createDefaultBilling();

  try {
    const raw = await fs.readFile(billingFile, 'utf8');
    const parsed = JSON.parse(raw);
    const snapshot = sanitizePersistedBilling(parsed, defaults);
    await writeBilling(snapshot);
    return snapshot;
  } catch {
    await writeBilling(defaults);
    return defaults;
  }
}

export async function updateBilling(payload = {}) {
  const current = await readBilling();
  const incoming = sanitizeBilling(payload, current);
  const previousAccount = current.account;
  const hasPlanChanged = previousAccount.currentPlanId !== incoming.account.currentPlanId
    || previousAccount.billingCycle !== incoming.account.billingCycle
    || previousAccount.seats !== incoming.account.seats;

  const updatedAt = isoNow();
  const account = {
    ...incoming.account,
    createdAt: previousAccount.createdAt,
    updatedAt,
    nextInvoiceAt: hasPlanChanged ? toIso(advanceCycle(updatedAt, incoming.account.billingCycle, 1)) : incoming.account.nextInvoiceAt
  };

  const snapshot = buildSnapshot(account, incoming.foundation);
  await writeBilling(snapshot);
  return snapshot;
}

export async function resetBilling() {
  const defaults = createDefaultBilling();
  await writeBilling(defaults);
  return defaults;
}
