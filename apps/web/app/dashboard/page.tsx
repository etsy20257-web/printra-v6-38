export const revalidate = 20;

import Link from 'next/link';
import { AppShell, Badge, MetricCard, Panel } from '@printra/ui';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE}${path}`, { next: { revalidate } });
    if (!response.ok) return null;
    return response.json() as Promise<T>;
  } catch {
    return null;
  }
}

type HealthResponse = {
  api?: string;
  time?: string;
  deliveryMode?: string;
  readiness?: {
    database?: boolean;
    storage?: boolean;
    googleDriveConnector?: boolean;
    oneDriveConnector?: boolean;
  };
  services?: {
    webShell?: string;
    worker?: string;
    database?: { connected?: boolean; configured?: boolean; mode?: string; note?: string };
    storage?: { connected?: boolean; configured?: boolean; mode?: string; note?: string };
  };
};

type ExtensionStatus = {
  ready?: boolean;
  connected?: boolean;
  stale?: boolean;
  browser?: string | null;
  pageType?: string | null;
  extensionVersion?: string | null;
  installSource?: string | null;
  listingUrl?: string | null;
  shopUrl?: string | null;
  lastSeenAt?: string | null;
};

type HistoryResponse = {
  snapshots?: Array<{
    id: string;
    createdAt: string;
    mode: string;
    platform: string;
    rowCount: number;
    primaryTitle: string;
    strongestKeyword?: string | null;
    averageScores?: {
      listingStrength?: number;
      trustScore?: number;
      opportunityScore?: number;
    } | null;
  }>;
};

type StorageFoundation = {
  configured?: boolean;
  bucket?: string | null;
  health?: {
    configured?: boolean;
    connected?: boolean;
    mode?: string;
    note?: string;
  };
};

function boolLabel(value: boolean | undefined, trueLabel = 'Connected', falseLabel = 'Pending') {
  return value ? trueLabel : falseLabel;
}

function cardTone(active: boolean) {
  return active
    ? 'border-emerald-400/20 bg-emerald-400/10'
    : 'border-amber-400/20 bg-amber-400/10';
}

export default async function DashboardPage() {
  const [health, history, extensionStatus, storageFoundation] = await Promise.all([
    getJson<HealthResponse>('/health'),
    getJson<HistoryResponse>('/automatic-analysis/history?limit=5'),
    getJson<ExtensionStatus>('/automatic-analysis/extension-status'),
    getJson<StorageFoundation>('/storage/foundation')
  ]);

  const snapshots = history?.snapshots ?? [];
  const latestSnapshot = snapshots[0] ?? null;
  const readiness = health?.readiness ?? {};
  const databaseReady = Boolean(health?.services?.database?.connected || readiness.database);
  const storageReady = Boolean(health?.services?.storage?.connected || readiness.storage || storageFoundation?.configured);
  const extensionReady = Boolean(extensionStatus?.ready || extensionStatus?.connected);
  const connectorsReady = Boolean(readiness.googleDriveConnector || readiness.oneDriveConnector);

  const cards = [
    {
      title: 'Studio',
      href: '/studio',
      description: 'Design and mockup workspace stays inside the same shell.',
      status: 'Live route',
      active: true
    },
    {
      title: 'Library',
      href: '/library',
      description: 'Sections, asset list, duplicate and delete already talk to the API.',
      status: boolLabel(databaseReady, 'Storage-backed', 'Needs database'),
      active: databaseReady
    },
    {
      title: 'Automatic Analysis',
      href: '/automatic-analysis',
      description: 'Competitor runs, CSV mode and analytics save lane are wired.',
      status: snapshots.length ? `${snapshots.length} saved runs` : 'Ready to run',
      active: true
    },
    {
      title: 'Platform',
      href: '/platform',
      description: 'Health, delivery mode, extension handshake and infrastructure status.',
      status: boolLabel(Boolean(health), 'API linked', 'API offline'),
      active: Boolean(health)
    }
  ];

  return (
    <AppShell
      title="Dashboard"
      subtitle="Dashboard now behaves as a live operations screen that reads API health, storage readiness, extension status, and recent automatic-analysis snapshots."
    >
      <div className="grid gap-6 xl:grid-cols-[1.3fr_minmax(0,0.9fr)]">
        <Panel title="System readiness" description="These cards now reflect live backend answers instead of static shell text.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="API" value={boolLabel(Boolean(health), 'Online', 'Offline')} />
            <MetricCard label="Database" value={boolLabel(databaseReady)} />
            <MetricCard label="Storage" value={boolLabel(storageReady)} />
            <MetricCard label="Extension" value={boolLabel(extensionReady, 'Detected', 'Waiting')} />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <Link key={card.title} href={card.href} className={`rounded-3xl border p-4 transition duration-200 hover:-translate-y-0.5 ${cardTone(card.active)}`}>
                <div className="flex items-center justify-between gap-3">
                  <Badge>{card.title}</Badge>
                  <span className="text-xs text-[var(--shell-text-muted)]">Open</span>
                </div>
                <p className="mt-4 text-sm leading-6 text-[var(--shell-text)]">{card.description}</p>
                <p className="mt-4 text-xs font-medium text-[var(--shell-text-muted)]">{card.status}</p>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel title="Commercial handoff model" description="This shows the real delivery mode currently exposed by the backend.">
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard label="Delivery" value={health?.deliveryMode ?? 'customer-owned-infrastructure'} />
            <MetricCard label="Bucket" value={storageFoundation?.bucket ?? 'customer-defined'} />
            <MetricCard label="Drive connector" value={boolLabel(readiness.googleDriveConnector, 'OAuth ready', 'Planned')} />
            <MetricCard label="OneDrive" value={boolLabel(readiness.oneDriveConnector, 'OAuth ready', 'Planned')} />
          </div>
          <div className="mt-4 rounded-3xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
            {health?.services?.storage?.note ?? storageFoundation?.health?.note ?? 'Integration points are ready. Real customer credentials are attached after delivery.'}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_minmax(0,1.05fr)]">
        <Panel title="Recent activity" description="Latest automatic-analysis results are shown directly on the dashboard.">
          {snapshots.length ? (
            <div className="space-y-3">
              {snapshots.map((snapshot) => (
                <div key={snapshot.id} className="rounded-3xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--shell-heading)]">{snapshot.primaryTitle}</p>
                      <p className="mt-1 text-xs text-[var(--shell-text-muted)]">{snapshot.mode} - {snapshot.platform} - {snapshot.rowCount} row</p>
                    </div>
                    <span className="text-xs text-[var(--shell-text-muted)]">{new Date(snapshot.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <MetricCard label="Keyword" value={snapshot.strongestKeyword ?? '--'} compact />
                    <MetricCard label="List" value={snapshot.averageScores?.listingStrength != null ? `${snapshot.averageScores.listingStrength}/100` : '--'} compact />
                    <MetricCard label="Trust" value={snapshot.averageScores?.trustScore != null ? `${snapshot.averageScores.trustScore}/100` : '--'} compact />
                    <MetricCard label="Opp." value={snapshot.averageScores?.opportunityScore != null ? `${snapshot.averageScores.opportunityScore}/100` : '--'} compact />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-[var(--shell-border)] bg-[var(--shell-surface-soft)] p-6 text-sm leading-6 text-[var(--shell-text-muted)]">
              No saved analysis yet. Run Automatic Analysis once and the dashboard will start showing live history here.
            </div>
          )}
        </Panel>

        <Panel title="Live signals" description="Quick operational view from health and extension state.">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--shell-label)]">Automatic Analysis extension</p>
              <p className="mt-3 text-sm font-semibold text-[var(--shell-heading)]">{extensionReady ? 'Connected recently' : 'Waiting for extension handshake'}</p>
              <div className="mt-4 space-y-2 text-sm text-[var(--shell-text-muted)]">
                <p>Browser: {extensionStatus?.browser ?? '--'}</p>
                <p>Page type: {extensionStatus?.pageType ?? '--'}</p>
                <p>Version: {extensionStatus?.extensionVersion ?? '--'}</p>
                <p>Install source: {extensionStatus?.installSource ?? '--'}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/automatic-analysis" className="rounded-2xl border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs font-medium text-sky-100 transition hover:bg-sky-400/15">Open analysis</Link>
                <Link href="/platform" className="rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface)] px-3 py-2 text-xs font-medium text-[var(--shell-heading)] transition hover:bg-[var(--shell-surface-strong)]">Open platform</Link>
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--shell-label)]">Infrastructure</p>
              <p className="mt-3 text-sm font-semibold text-[var(--shell-heading)]">{connectorsReady ? 'Connector credentials detected' : 'Core infra still customer-owned ready'}</p>
              <div className="mt-4 space-y-2 text-sm text-[var(--shell-text-muted)]">
                <p>Database: {health?.services?.database?.mode ?? (databaseReady ? 'configured' : 'not configured')}</p>
                <p>Storage: {health?.services?.storage?.mode ?? storageFoundation?.health?.mode ?? 'planned'}</p>
                <p>Web shell: {health?.services?.webShell ?? 'linked'}</p>
                <p>Worker: {health?.services?.worker ?? 'linked'}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/library" className="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-400/10 px-3 py-2 text-xs font-medium text-fuchsia-100 transition hover:bg-fuchsia-400/15">Open library</Link>
                <Link href="/settings" className="rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface)] px-3 py-2 text-xs font-medium text-[var(--shell-heading)] transition hover:bg-[var(--shell-surface-strong)]">Open settings</Link>
              </div>
            </div>
          </div>

          {latestSnapshot ? (
            <div className="mt-4 rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-100">
              Latest saved run: <span className="font-semibold">{latestSnapshot.primaryTitle}</span> with {latestSnapshot.rowCount} row and strongest keyword <span className="font-semibold">{latestSnapshot.strongestKeyword ?? '--'}</span>.
            </div>
          ) : null}
        </Panel>
      </div>
    </AppShell>
  );
}

