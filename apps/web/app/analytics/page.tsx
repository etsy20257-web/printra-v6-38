export const revalidate = 20;
import { AppShell, MetricCard, Panel } from '@printra/ui';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');

async function getSnapshots() {
  try {
    const response = await fetch(`${API_BASE}/automatic-analysis/history?limit=6`, { next: { revalidate } });
    if (!response.ok) return [];
    const json = await response.json();
    return Array.isArray(json.snapshots) ? json.snapshots : [];
  } catch {
    return [];
  }
}

export default async function Page() {
  const snapshots = await getSnapshots();
  return (
    <AppShell
      title="Analytics"
      subtitle="Internal analytics shell now includes saved Automatic Analysis snapshots so batch compare history can land cleanly before broader product analytics arrives."
    >
      <div className="grid gap-6 lg:grid-cols-4">
        <MetricCard label="Saved snapshots" value={String(snapshots.length)} />
        <MetricCard label="Automatic Analysis" value={snapshots.length ? 'Connected' : 'Ready'} />
        <MetricCard label="Batch compare" value="Prepared" />
        <MetricCard label="History lane" value="Live" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_minmax(0,1.1fr)]">
        <Panel title="What is already live" description="This page now reads saved competitor-analysis snapshots from the Automatic Analysis module instead of staying as a placeholder shell.">
          <div className="grid gap-3">
            {[
              'Automatic Analysis can now save lightweight snapshots into analytics history.',
              'CSV runs stay compare-ready, so later trend charts can reuse the same structure.',
              'History records keep mode, platform, row count, strongest keyword, and score summaries.',
              'This remains separate from Create a List and does not reuse listing-generation data.'
            ].map((entry) => (
              <div key={entry} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-200">{entry}</div>
            ))}
          </div>
        </Panel>

        <Panel title="Recent analysis snapshots" description="These are the latest saved competitor analyses. They are the first phase of compare history before chart-heavy analytics lands.">
          <div className="space-y-3">
            {snapshots.length ? snapshots.map((snapshot: any) => (
              <div key={snapshot.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{snapshot.primaryTitle}</p>
                    <p className="mt-1 text-xs text-slate-400">{snapshot.mode} · {snapshot.platform} · {snapshot.rowCount} row</p>
                  </div>
                  <span className="text-xs text-slate-500">{new Date(snapshot.createdAt).toLocaleString()}</span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard label="Keyword" value={snapshot.strongestKeyword ?? '—'} compact />
                  <MetricCard label="List" value={snapshot.averageScores ? `${snapshot.averageScores.listingStrength}/100` : '—'} compact />
                  <MetricCard label="Trust" value={snapshot.averageScores ? `${snapshot.averageScores.trustScore}/100` : '—'} compact />
                  <MetricCard label="Opp." value={snapshot.averageScores ? `${snapshot.averageScores.opportunityScore}/100` : '—'} compact />
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-300">No saved analytics yet. Save a run from Automatic Analysis to populate this view.</div>
            )}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
