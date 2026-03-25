export const revalidate = 20;

import Link from 'next/link';
import { AppShell, MetricCard, Panel } from '@printra/ui';

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

type ConnectorResponse = {
  googleDrive?: { mode?: string; readyForOAuthConfig?: boolean };
  oneDrive?: { mode?: string; readyForOAuthConfig?: boolean };
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

function statusValue(value: boolean | undefined, positive = 'Ready', negative = 'Pending') {
  return value ? positive : negative;
}

export default async function Page() {
  const [health, connectors, extensionStatus] = await Promise.all([
    getJson<HealthResponse>('/health'),
    getJson<ConnectorResponse>('/connectors/foundation'),
    getJson<ExtensionStatus>('/automatic-analysis/extension-status')
  ]);

  return (
    <AppShell
      title="Platform"
      subtitle="Platform artık placeholder bir kabuk değil; health endpoint, connector readiness ve extension heartbeat verilerini okuyup operasyon görünümü veren canlı bir sayfa."
    >
      <div className="grid gap-6 lg:grid-cols-4">
        <MetricCard label="API" value={statusValue(Boolean(health), 'Online', 'Offline')} />
        <MetricCard label="Database" value={statusValue(Boolean(health?.services?.database?.connected || health?.readiness?.database), 'Connected', 'Missing')} />
        <MetricCard label="Storage" value={statusValue(Boolean(health?.services?.storage?.connected || health?.readiness?.storage), 'Connected', 'Customer setup')} />
        <MetricCard label="Extension" value={statusValue(Boolean(extensionStatus?.ready || extensionStatus?.connected), 'Seen', 'Waiting')} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_minmax(0,0.9fr)]">
        <Panel title="System health board" description="The page now reflects real backend contracts instead of static promises.">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-3xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] p-4 text-sm leading-6 text-[var(--shell-text)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--shell-label)]">Core services</p>
              <div className="mt-4 space-y-2 text-[var(--shell-text-muted)]">
                <p>API status: {health?.api ?? 'offline'}</p>
                <p>Web shell: {health?.services?.webShell ?? 'unknown'}</p>
                <p>Worker: {health?.services?.worker ?? 'unknown'}</p>
                <p>Checked at: {health?.time ? new Date(health.time).toLocaleString() : '—'}</p>
              </div>
            </div>
            <div className="rounded-3xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] p-4 text-sm leading-6 text-[var(--shell-text)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--shell-label)]">Delivery mode</p>
              <div className="mt-4 space-y-2 text-[var(--shell-text-muted)]">
                <p>Mode: {health?.deliveryMode ?? 'customer-owned-infrastructure'}</p>
                <p>Database: {health?.services?.database?.mode ?? statusValue(health?.readiness?.database, 'configured', 'not configured')}</p>
                <p>Storage: {health?.services?.storage?.mode ?? statusValue(health?.readiness?.storage, 'configured', 'customer will attach')}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
            {health?.services?.storage?.note ?? 'The infrastructure is prepared so the buyer can attach their own credentials after delivery.'}
          </div>
        </Panel>

        <Panel title="Connector readiness" description="OAuth placeholders stay visible so delivery status is honest.">
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard label="Google Drive" value={statusValue(connectors?.googleDrive?.readyForOAuthConfig, 'OAuth ready', 'Planned')} />
            <MetricCard label="OneDrive" value={statusValue(connectors?.oneDrive?.readyForOAuthConfig, 'OAuth ready', 'Planned')} />
            <MetricCard label="GDrive mode" value={connectors?.googleDrive?.mode ?? 'planned-import-connector'} />
            <MetricCard label="OneDrive mode" value={connectors?.oneDrive?.mode ?? 'planned-import-connector'} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/library" className="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-400/10 px-3 py-2 text-xs font-medium text-fuchsia-100 transition hover:bg-fuchsia-400/15">Open library</Link>
            <Link href="/automatic-analysis" className="rounded-2xl border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs font-medium text-sky-100 transition hover:bg-sky-400/15">Open automatic analysis</Link>
          </div>
        </Panel>
      </div>

      <Panel title="Extension heartbeat" description="Useful for Etsy-side collection and analysis workflow checks.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Ready" value={statusValue(Boolean(extensionStatus?.ready || extensionStatus?.connected), 'Yes', 'No')} />
          <MetricCard label="Browser" value={extensionStatus?.browser ?? '—'} />
          <MetricCard label="Page type" value={extensionStatus?.pageType ?? '—'} />
          <MetricCard label="Version" value={extensionStatus?.extensionVersion ?? '—'} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] p-4 text-sm leading-6 text-[var(--shell-text-muted)]">
            <p>Install source: {extensionStatus?.installSource ?? '—'}</p>
            <p>Last seen: {extensionStatus?.lastSeenAt ? new Date(extensionStatus.lastSeenAt).toLocaleString() : '—'}</p>
            <p>Listing URL: {extensionStatus?.listingUrl ?? '—'}</p>
          </div>
          <div className="rounded-3xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] p-4 text-sm leading-6 text-[var(--shell-text-muted)]">
            <p>Shop URL: {extensionStatus?.shopUrl ?? '—'}</p>
            <p>Stale: {extensionStatus?.stale ? 'yes' : 'no'}</p>
            <p>Connected: {extensionStatus?.connected ? 'yes' : 'no'}</p>
          </div>
        </div>
      </Panel>
    </AppShell>
  );
}
