'use client';

import { ChangeEvent, KeyboardEvent, PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell, MetricCard, Panel } from '@printra/ui';
import { useLocale } from '@printra/i18n';

type Mode = 'url' | 'paste' | 'manual' | 'csv';

type SingleResult = {
  overview: {
    platform: string;
    sourceType: string;
    listingUrl: string | null;
    storeUrl: string | null;
    title: string;
  };
  observed: {
    price: number | null;
    rating: number | null;
    reviewCount: number;
    salesCount: number;
    imageCount: number;
    variationCount: number;
    productCount: number;
  };
  estimated: {
    demandHeat: number;
    estimatedSalesSignal: number;
    storeMaturitySignal: number;
    catalogDepthSignal: number;
  };
  scored: {
    listingStrength: number;
    storeStrength: number;
    keywordStrength: number;
    trustScore: number;
    competitionDifficulty: number;
    opportunityScore: number;
    conversionQuality: number;
    demandHeat: number;
    estimatedSalesSignal: number;
  };
  keywordClusters: { keyword: string; count: number; intent: string }[];
  keywords: string[];
  riskFlags: string[];
  opportunityNotes: string[];
  beatMap: { area: string; level: string }[];
};

type Snapshot = {
  id: string;
  createdAt: string;
  mode: string;
  sourceLabel: string;
  rowCount: number;
  primaryTitle: string;
  platform: string;
  strongestKeyword: string | null;
  averagePrice: number | null;
  averageRating: number | null;
  averageScores: SingleResult['scored'] | null;
};

type ExtensionStatus = {
  ready?: boolean;
  connected?: boolean;
  stale?: boolean;
  browser?: string | null;
  pageType?: string | null;
  extensionVersion?: string | null;
  installSource?: string | null;
  lastSeenAt?: string | null;
  listingUrl?: string | null;
  shopUrl?: string | null;
};

type AutomaticAnalysisResponse = {
  mode: Mode | 'manual';
  source?: string;
  summary: {
    count: number;
    averageScores: SingleResult['scored'] | null;
    strongestKeyword: string | null;
    averagePrice: number | null;
    averageRating: number | null;
  };
  result?: SingleResult;
  rows?: SingleResult[];
  primaryRow?: SingleResult | null;
  savedSnapshot?: Snapshot;
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const LOCAL_HISTORY_KEY = 'printra-auto-analysis-history';

function readLocalSnapshots(): Snapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalSnapshots(items: Snapshot[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(items.slice(0, 20)));
}

function scoreFromSeed(seed: string, offset: number) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index) + offset) % 9973;
  }
  return 35 + (hash % 61);
}

function buildLocalSingleResult(payload: Record<string, unknown>): SingleResult {
  const source = String(
    payload.manualTitle ||
    payload.listingUrl ||
    payload.listingText ||
    payload.csvText ||
    'Local offline competitor'
  );
  const title = source.slice(0, 96);
  const listingStrength = scoreFromSeed(source, 3);
  const storeStrength = scoreFromSeed(source, 5);
  const keywordStrength = scoreFromSeed(source, 7);
  const trustScore = scoreFromSeed(source, 11);
  const opportunityScore = scoreFromSeed(source, 13);

  return {
    overview: {
      platform: 'offline',
      sourceType: String(payload.mode || 'manual'),
      listingUrl: String(payload.listingUrl || '') || null,
      storeUrl: String(payload.storeUrl || '') || null,
      title: title || 'Offline generated listing'
    },
    observed: {
      price: Number(payload.manualPrice || 0) || 19.99,
      rating: Number(payload.manualRating || 0) || 4.7,
      reviewCount: Number(payload.manualReviewCount || 0) || 120,
      salesCount: Number(payload.manualSalesCount || 0) || 320,
      imageCount: Number(payload.manualImageCount || 0) || 6,
      variationCount: Number(payload.manualVariationCount || 0) || 3,
      productCount: Number(payload.manualProductCount || 0) || 24
    },
    estimated: {
      demandHeat: scoreFromSeed(source, 17),
      estimatedSalesSignal: scoreFromSeed(source, 19),
      storeMaturitySignal: scoreFromSeed(source, 23),
      catalogDepthSignal: scoreFromSeed(source, 29)
    },
    scored: {
      listingStrength,
      storeStrength,
      keywordStrength,
      trustScore,
      competitionDifficulty: scoreFromSeed(source, 31),
      opportunityScore,
      conversionQuality: scoreFromSeed(source, 37),
      demandHeat: scoreFromSeed(source, 17),
      estimatedSalesSignal: scoreFromSeed(source, 19)
    },
    keywordClusters: [
      { keyword: 'offline baseline', count: 2, intent: 'informational' },
      { keyword: 'competitor gap', count: 1, intent: 'commercial' }
    ],
    keywords: ['offline baseline', 'competitor gap', 'listing quality', 'trust signal'],
    riskFlags: ['API offline: local analyzer mode enabled.'],
    opportunityNotes: ['Run is stable in offline mode; reconnect API for full fidelity.'],
    beatMap: [
      { area: 'listing', level: listingStrength >= 70 ? 'strong' : 'medium' },
      { area: 'store', level: storeStrength >= 70 ? 'strong' : 'medium' }
    ]
  };
}

function buildLocalAnalysisResponse(payload: Record<string, unknown>): AutomaticAnalysisResponse {
  const row = buildLocalSingleResult(payload);
  return {
    mode: (payload.mode as Mode) || 'manual',
    source: 'local-fallback',
    summary: {
      count: 1,
      averageScores: row.scored,
      strongestKeyword: row.keywords[0] ?? null,
      averagePrice: row.observed.price,
      averageRating: row.observed.rating
    },
    result: row,
    rows: [row],
    primaryRow: row
  };
}

function buildLocalSnapshot(payload: Record<string, unknown>, result: AutomaticAnalysisResponse): Snapshot {
  return {
    id: `offline-${Date.now()}`,
    createdAt: new Date().toISOString(),
    mode: String(payload.mode || 'manual'),
    sourceLabel: 'local-fallback',
    rowCount: result.summary.count,
    primaryTitle: result.primaryRow?.overview.title || 'Offline analysis snapshot',
    platform: result.primaryRow?.overview.platform || 'offline',
    strongestKeyword: result.summary.strongestKeyword,
    averagePrice: result.summary.averagePrice,
    averageRating: result.summary.averageRating,
    averageScores: result.summary.averageScores
  };
}
const CHROME_EXTENSION_URL = process.env.NEXT_PUBLIC_CHROME_EXTENSION_URL ?? '';
const EDGE_EXTENSION_URL = process.env.NEXT_PUBLIC_EDGE_EXTENSION_URL ?? '';
const OPERA_EXTENSION_URL = process.env.NEXT_PUBLIC_OPERA_EXTENSION_URL ?? '';
const GENERIC_EXTENSION_URL = process.env.NEXT_PUBLIC_EXTENSION_INSTALL_URL ?? '';

async function postAutomaticAnalysis(payload: Record<string, unknown>, path = 'analyze'): Promise<AutomaticAnalysisResponse | { ok: boolean; savedSnapshot: Snapshot }> {
  try {
    const response = await fetch(`${API_BASE}/automatic-analysis/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Automatic analysis request failed');
    }

    return response.json();
  } catch {
    const localResult = buildLocalAnalysisResponse(payload);
    if (path === 'save') {
      const snapshot = buildLocalSnapshot(payload, localResult);
      writeLocalSnapshots([snapshot, ...readLocalSnapshots()]);
      return { ok: true, savedSnapshot: snapshot };
    }
    return localResult;
  }
}

async function fetchHistory(): Promise<Snapshot[]> {
  try {
    const response = await fetch(`${API_BASE}/automatic-analysis/history?limit=8`);
    if (!response.ok) return readLocalSnapshots();
    const json = await response.json();
    const snapshots = Array.isArray(json.snapshots) ? json.snapshots : [];
    if (snapshots.length) {
      writeLocalSnapshots(snapshots);
    }
    return snapshots;
  } catch {
    return readLocalSnapshots();
  }
}

async function fetchExtensionStatus(): Promise<ExtensionStatus> {
  try {
    const response = await fetch(`${API_BASE}/automatic-analysis/extension-status`);
    if (!response.ok) return {};
    return response.json();
  } catch {
    return {
      ready: false,
      connected: false,
      stale: true,
      browser: detectBrowser(),
      pageType: 'unknown'
    };
  }
}

function modeButtonTone(active: boolean) {
  return active
    ? 'border-sky-400/35 bg-sky-400/14 text-sky-100'
    : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]';
}

function metricValue(value: number | string | null | undefined, suffix = '') {
  if (value === null || value === undefined || value === '') return '—';
  return `${value}${suffix}`;
}

function scoreTone(score?: number | null) {
  if ((score ?? 0) >= 75) return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100';
  if ((score ?? 0) >= 55) return 'border-sky-400/30 bg-sky-400/10 text-sky-100';
  if ((score ?? 0) >= 35) return 'border-amber-400/30 bg-amber-400/10 text-amber-100';
  return 'border-rose-400/30 bg-rose-400/10 text-rose-100';
}

function formatTime(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function detectBrowser() {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('edg/')) return 'edge';
  if (ua.includes('opr/') || ua.includes('opera')) return 'opera';
  if (ua.includes('brave')) return 'brave';
  if (ua.includes('chrome')) return 'chrome';
  return 'unknown';
}

function getInstallUrl(browser: string) {
  if (browser === 'edge' && EDGE_EXTENSION_URL) return EDGE_EXTENSION_URL;
  if (browser === 'opera' && OPERA_EXTENSION_URL) return OPERA_EXTENSION_URL;
  if ((browser === 'chrome' || browser === 'brave') && CHROME_EXTENSION_URL) return CHROME_EXTENSION_URL;
  return GENERIC_EXTENSION_URL || CHROME_EXTENSION_URL || EDGE_EXTENSION_URL || OPERA_EXTENSION_URL || '';
}

export function AutomaticAnalysisDashboard() {
  const { t } = useLocale();
  const [mode, setMode] = useState<Mode>('paste');
  const [listingUrl, setListingUrl] = useState('');
  const [storeUrl, setStoreUrl] = useState('');
  const [listingText, setListingText] = useState('');
  const [storeText, setStoreText] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualKeywords, setManualKeywords] = useState('');
  const [manualRating, setManualRating] = useState('');
  const [manualReviewCount, setManualReviewCount] = useState('');
  const [manualSalesCount, setManualSalesCount] = useState('');
  const [manualImageCount, setManualImageCount] = useState('');
  const [manualVariationCount, setManualVariationCount] = useState('');
  const [manualProductCount, setManualProductCount] = useState('');
  const [csvText, setCsvText] = useState('title,price,keywords,content,rating,reviews,sales\n');
  const [result, setResult] = useState<AutomaticAnalysisResponse | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatus>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkingExtension, setCheckingExtension] = useState(false);
  const [extensionStatusRefreshing, setExtensionStatusRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [browser, setBrowser] = useState('unknown');
  const [actionLockUntil, setActionLockUntil] = useState(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeSingle = useMemo(() => result?.primaryRow ?? result?.result ?? result?.rows?.[0] ?? null, [result]);
  const batchMode = (result?.summary.count ?? 0) > 1 || mode === 'csv';
  const installUrl = useMemo(() => getInstallUrl(browser), [browser]);
  const actionLockedNow = Date.now() < actionLockUntil;

  function buildPayload() {
    return {
      mode,
      listingUrl,
      storeUrl,
      listingText,
      storeText,
      manualTitle,
      manualPrice,
      manualDescription,
      manualKeywords,
      manualRating,
      manualReviewCount,
      manualSalesCount,
      manualImageCount,
      manualVariationCount,
      manualProductCount,
      csvText
    };
  }

  async function loadHistory() {
    setHistory(await fetchHistory());
  }

  async function refreshExtensionStatus(options?: { manual?: boolean }) {
    if (typeof document !== 'undefined' && document.hidden) return;
    const manual = Boolean(options?.manual);
    if (manual) {
      setCheckingExtension(true);
    } else {
      setExtensionStatusRefreshing(true);
    }
    try {
      setExtensionStatus(await fetchExtensionStatus());
    } finally {
      if (manual) {
        setCheckingExtension(false);
      } else {
        setExtensionStatusRefreshing(false);
      }
    }
  }

  useEffect(() => {
    setBrowser(detectBrowser());
    loadHistory();
    refreshExtensionStatus();

    const restartPolling = () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(() => {
        void refreshExtensionStatus();
      }, 12000);
    };

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void refreshExtensionStatus();
      restartPolling();
    };

    restartPolling();
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleVisibility);
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleVisibility);
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, []);

  async function handleAnalyze() {
    setLoading(true);
    setError('');
    setSaveMessage('');
    try {
      const data = await postAutomaticAnalysis(buildPayload()) as AutomaticAnalysisResponse;
      setResult(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Automatic analysis failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSaveMessage('');
    try {
      const data = await postAutomaticAnalysis(buildPayload(), 'save') as { ok: boolean; savedSnapshot: Snapshot };
      setSaveMessage(`Analytics history saved · ${data.savedSnapshot.primaryTitle}`);
      await loadHistory();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }


  function lockActions() {
    setActionLockUntil(Date.now() + 900);
  }

  function actionLocked() {
    return Date.now() < actionLockUntil;
  }

  function beginTrustedAction() {
    if (actionLocked()) return true;
    lockActions();
    return false;
  }

  function handleTrustedPointerAction(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!event.isPrimary || event.button !== 0 || !event.nativeEvent.isTrusted) return true;
    return beginTrustedAction();
  }

  function handleTrustedKeyboardAction(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return true;
    event.preventDefault();
    event.stopPropagation();
    if (!event.nativeEvent.isTrusted) return true;
    return beginTrustedAction();
  }

  function openExternalUrl(url: string) {
    if (!url || typeof window === 'undefined') return;
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (opened) opened.opener = null;
  }

  async function handleCsvFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setCsvText(content);
    setMode('csv');
  }

  function handleInstallExtension() {
    setError('');
    if (!installUrl) {
      setError('Extension install URL is not configured yet. Add NEXT_PUBLIC_CHROME_EXTENSION_URL and/or NEXT_PUBLIC_EDGE_EXTENSION_URL in app-web-.env.local before release.');
      return;
    }
    openExternalUrl(installUrl);
  }

  async function handleManualExtensionCheck() {
    await refreshExtensionStatus({ manual: true });
  }

  function openEtsy(page: 'listing' | 'shop') {
    const url = page === 'listing'
      ? 'https://www.etsy.com/search?q=digital+download'
      : 'https://www.etsy.com/c/clothing-and-shoes';
    openExternalUrl(url);
  }

  return (
    <AppShell
      title={t('auto_title')}
      subtitle={t('auto_subtitle')}
    >
      <div className="grid gap-6 xl:grid-cols-[0.96fr_minmax(0,1.04fr)]">
        <Panel title={t('auto_ext_title')} description={t('auto_ext_desc')}>
          <div className="grid gap-4 lg:grid-cols-[0.92fr_minmax(0,1.08fr)]">
            <div className="space-y-4 select-none">
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.28em] text-slate-500">{t('detectedBrowser')}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{browser}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{t('auto_browser_help')}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onPointerUp={(event) => { if (!handleTrustedPointerAction(event)) handleInstallExtension(); }} onKeyDown={(event) => { if (!handleTrustedKeyboardAction(event)) handleInstallExtension(); }} disabled={actionLockedNow} className="rounded-2xl border border-sky-400/35 bg-sky-400/15 px-5 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]">
                  {t('installExtension')}
                </button>
                <button type="button" onPointerUp={(event) => { if (!handleTrustedPointerAction(event)) void handleManualExtensionCheck(); }} onKeyDown={(event) => { if (!handleTrustedKeyboardAction(event)) void handleManualExtensionCheck(); }} disabled={checkingExtension || Date.now() < actionLockUntil} aria-busy={checkingExtension} className="min-w-[170px] rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]">
                  {checkingExtension ? t('checking') : t('checkConnection')}
                </button>
                <button type="button" onPointerUp={(event) => { if (!handleTrustedPointerAction(event)) openEtsy('listing'); }} onKeyDown={(event) => { if (!handleTrustedKeyboardAction(event)) openEtsy('listing'); }} disabled={actionLockedNow} className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]">
                  {t('openEtsyListing')}
                </button>
                <button type="button" onPointerUp={(event) => { if (!handleTrustedPointerAction(event)) openEtsy('shop'); }} onKeyDown={(event) => { if (!handleTrustedKeyboardAction(event)) openEtsy('shop'); }} disabled={actionLockedNow} className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]">
                  {t('openEtsyShop')}
                </button>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-xs leading-6 text-slate-300">
                {t('auto_action_note')}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label={t('installedConnected')} value={extensionStatus.connected ? t('connected') : t('notConnected')} />
              <MetricCard label={t('ready')} value={extensionStatus.ready ? t('ready') : extensionStatusRefreshing ? t('refreshing') : t('waiting')} />
              <MetricCard label={t('pageType')} value={metricValue(extensionStatus.pageType)} />
              <MetricCard label={t('extensionVersion')} value={metricValue(extensionStatus.extensionVersion)} />
              <MetricCard label={t('lastSeen')} value={metricValue(extensionStatus.lastSeenAt ? formatTime(extensionStatus.lastSeenAt) : null)} />
              <MetricCard label={t('installSource')} value={metricValue(extensionStatus.installSource)} />
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {[t('auto_note_1'), t('auto_note_2'), t('auto_note_3'), t('auto_note_4')].map((note) => (
              <div key={note} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-200">{note}</div>
            ))}
          </div>
        </Panel>

        <Panel title={t('auto_fallback_title')} description={t('auto_fallback_desc')}>
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {(['url', 'paste', 'manual', 'csv'] as Mode[]).map((entry) => (
                <button key={entry} type="button" onClick={() => setMode(entry)} className={["rounded-2xl border px-4 py-2 text-sm font-medium transition", modeButtonTone(mode === entry)].join(' ')}>
                  {entry === 'url' ? t('urlAssist') : entry === 'paste' ? t('pasteContent') : entry === 'manual' ? t('manualEntry') : t('csvUpload')}
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.28em] text-slate-500">Competitor listing URL</label>
                <input value={listingUrl} onChange={(event) => setListingUrl(event.target.value)} placeholder="https://www.etsy.com/listing/..." className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none" />
              </div>
              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.28em] text-slate-500">Competitor store URL</label>
                <input value={storeUrl} onChange={(event) => setStoreUrl(event.target.value)} placeholder="https://www.etsy.com/shop/..." className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none" />
              </div>
            </div>

            {(mode === 'paste' || mode === 'url') ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs uppercase tracking-[0.28em] text-slate-500">Listing pasted content</label>
                  <textarea value={listingText} onChange={(event) => setListingText(event.target.value)} placeholder="Paste the visible competitor listing text here." className="min-h-[220px] w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm leading-6 text-white outline-none" />
                </div>
                <div>
                  <label className="mb-2 block text-xs uppercase tracking-[0.28em] text-slate-500">Store pasted content</label>
                  <textarea value={storeText} onChange={(event) => setStoreText(event.target.value)} placeholder="Paste store about text, review signals, sales signals, and any visible shop details here." className="min-h-[220px] w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm leading-6 text-white outline-none" />
                </div>
              </div>
            ) : null}

            {mode === 'manual' ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-xs uppercase tracking-[0.28em] text-slate-500">Manual title</label>
                    <input value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none" />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs uppercase tracking-[0.28em] text-slate-500">Manual description</label>
                    <textarea value={manualDescription} onChange={(event) => setManualDescription(event.target.value)} className="min-h-[180px] w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm leading-6 text-white outline-none" />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs uppercase tracking-[0.28em] text-slate-500">Manual keywords</label>
                    <textarea value={manualKeywords} onChange={(event) => setManualKeywords(event.target.value)} placeholder="keyword one, keyword two, keyword three" className="min-h-[110px] w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm leading-6 text-white outline-none" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    ['Price', manualPrice, setManualPrice],
                    ['Rating', manualRating, setManualRating],
                    ['Review count', manualReviewCount, setManualReviewCount],
                    ['Sales count', manualSalesCount, setManualSalesCount],
                    ['Image count', manualImageCount, setManualImageCount],
                    ['Variation count', manualVariationCount, setManualVariationCount],
                    ['Product count', manualProductCount, setManualProductCount]
                  ].map(([label, value, setter]) => (
                    <div key={label as string}>
                      <label className="mb-2 block text-xs uppercase tracking-[0.28em] text-slate-500">{label as string}</label>
                      <input value={value as string} onChange={(event) => (setter as (value: string) => void)(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none" />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {mode === 'csv' ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-200">
                    <span>{t('chooseCsv')}</span>
                    <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFile} />
                  </label>
                  <p className="text-xs text-slate-400">{t('supportedHeaders')}</p>
                </div>
                <textarea value={csvText} onChange={(event) => setCsvText(event.target.value)} className="min-h-[240px] w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm leading-6 text-white outline-none" />
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={handleAnalyze} disabled={loading} className="rounded-2xl border border-sky-400/35 bg-sky-400/15 px-5 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/20 disabled:opacity-60">
                {loading ? t('runningAnalysis') : t('runAutomaticAnalysis')}
              </button>
              <button type="button" onClick={handleSave} disabled={saving} className="rounded-2xl border border-emerald-400/35 bg-emerald-400/15 px-5 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:opacity-60">
                {saving ? t('saving') : t('saveToAnalytics')}
              </button>
            </div>

            {saveMessage ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{saveMessage}</div> : null}
            {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100 whitespace-pre-wrap">{error}</div> : null}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard label={t('rowsAnalyzed')} value={metricValue(result?.summary.count)} />
        <MetricCard label={t('strongestKeyword')} value={metricValue(result?.summary.strongestKeyword)} />
        <MetricCard label={t('averagePrice')} value={metricValue(result?.summary.averagePrice)} />
        <MetricCard label={t('averageRating')} value={metricValue(result?.summary.averageRating)} />
        <MetricCard label={t('mode')} value={metricValue(result?.source === 'extension' ? 'extension' : result?.mode ?? mode)} />
      </div>

      {batchMode ? (
        <Panel title="Batch summary" description="CSV uploads keep their own multi-row summary. The primary row snapshot below is shown only as a quick sample, while compare preview keeps the full batch visible.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Listing avg" value={metricValue(result?.summary.averageScores?.listingStrength, '/100')} />
            <MetricCard label="Store avg" value={metricValue(result?.summary.averageScores?.storeStrength, '/100')} />
            <MetricCard label="Trust avg" value={metricValue(result?.summary.averageScores?.trustScore, '/100')} />
            <MetricCard label="Opportunity avg" value={metricValue(result?.summary.averageScores?.opportunityScore, '/100')} />
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_minmax(0,1.1fr)]">
        <Panel title="Core scores" description={batchMode ? 'These score cards show the primary row snapshot for quick inspection. Full CSV compare cards remain below.' : 'Observed, estimated, and scored outputs are separated so real metrics and derived signals do not get mixed together.'}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              ['Listing', activeSingle?.scored.listingStrength],
              ['Store', activeSingle?.scored.storeStrength],
              ['Keywords', activeSingle?.scored.keywordStrength],
              ['Trust', activeSingle?.scored.trustScore],
              ['Opportunity', activeSingle?.scored.opportunityScore],
              ['Competition', activeSingle?.scored.competitionDifficulty],
              ['Conversion', activeSingle?.scored.conversionQuality],
              ['Demand heat', activeSingle?.estimated.demandHeat],
              ['Sales signal', activeSingle?.estimated.estimatedSalesSignal]
            ].map(([label, score]) => (
              <div key={label as string} className={["rounded-3xl border px-4 py-4", scoreTone(score as number | null | undefined)].join(' ')}>
                <p className="text-[11px] uppercase tracking-[0.25em] opacity-80">{label as string}</p>
                <p className="mt-2 text-2xl font-semibold">{metricValue(score as number | null | undefined, '/100')}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={batchMode ? 'Primary row snapshot' : 'Observed competitor signals'} description={batchMode ? 'CSV mode keeps one representative row visible here while the full batch remains in compare preview below.' : 'These are the direct values the engine can hold onto from pasted, manual, extension, or CSV competitor inputs.'}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard label="Title" value={metricValue(activeSingle?.overview.title)} />
            <MetricCard label="Price" value={metricValue(activeSingle?.observed.price)} />
            <MetricCard label="Rating" value={metricValue(activeSingle?.observed.rating)} />
            <MetricCard label="Reviews" value={metricValue(activeSingle?.observed.reviewCount)} />
            <MetricCard label="Sales" value={metricValue(activeSingle?.observed.salesCount)} />
            <MetricCard label="Images" value={metricValue(activeSingle?.observed.imageCount)} />
            <MetricCard label="Variations" value={metricValue(activeSingle?.observed.variationCount)} />
            <MetricCard label="Products" value={metricValue(activeSingle?.observed.productCount)} />
            <MetricCard label="Platform" value={metricValue(activeSingle?.overview.platform)} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_minmax(0,1fr)]">
        <Panel title="Keyword intelligence" description="Keyword clusters, repeated terms, and high-intent themes are extracted so Create a List and analytics can later reuse the same intelligence.">
          <div className="flex flex-wrap gap-2">
            {(activeSingle?.keywords ?? []).map((keyword) => (
              <span key={keyword} className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1.5 text-xs font-medium text-sky-100">{keyword}</span>
            ))}
          </div>
          <div className="mt-4 grid gap-3">
            {(activeSingle?.keywordClusters ?? []).map((cluster) => (
              <div key={cluster.keyword} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-white">{cluster.keyword}</span>
                  <span className="text-xs uppercase tracking-[0.22em] text-slate-400">{cluster.intent} · {cluster.count}x</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Opportunity map" description="Risk flags, beat map, and opportunity notes show where the competitor is hard to beat and where there is realistic room to win.">
          <div className="grid gap-3">
            {(activeSingle?.riskFlags ?? ['Run the first analysis to populate risk flags.']).map((flag) => (
              <div key={flag} className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{flag}</div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(activeSingle?.beatMap ?? []).map((entry) => (
              <div key={entry.area} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200">
                <p className="font-medium text-white">{entry.area}</p>
                <p className="mt-1 text-slate-400">{entry.level}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3">
            {(activeSingle?.opportunityNotes ?? []).map((note) => (
              <div key={note} className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{note}</div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_minmax(0,0.92fr)]">
        {result?.rows?.length ? (
          <Panel title="CSV compare preview" description="Batch mode keeps the data compare-ready. This phase shows a compact multi-row preview so analytics and snapshot history can be added cleanly in the next phases.">
            <div className="space-y-3">
              {result.rows.slice(0, 8).map((row, index) => (
                <div key={`${row.overview.title}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-200">
                  <div className="grid gap-3 xl:grid-cols-[1.2fr_repeat(6,minmax(0,0.6fr))] xl:items-center">
                    <div>
                      <p className="font-medium text-white">{row.overview.title}</p>
                      <p className="mt-1 text-xs text-slate-400">csv · {row.overview.platform}</p>
                    </div>
                    <MetricCard label="List" value={`${row.scored.listingStrength}/100`} compact />
                    <MetricCard label="Store" value={`${row.scored.storeStrength}/100`} compact />
                    <MetricCard label="Trust" value={`${row.scored.trustScore}/100`} compact />
                    <MetricCard label="Opp." value={`${row.scored.opportunityScore}/100`} compact />
                    <MetricCard label="Demand" value={`${row.estimated.demandHeat}/100`} compact />
                    <MetricCard label="Sales" value={`${row.estimated.estimatedSalesSignal}/100`} compact />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        ) : <div />}

        <Panel title="Saved analytics snapshots" description="Saved analyses are compare-ready and can feed the analytics module without mixing into Create a List.">
          <div className="space-y-3">
            {history.length ? history.map((snapshot) => (
              <div key={snapshot.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{snapshot.primaryTitle}</p>
                    <p className="mt-1 text-xs text-slate-400">{snapshot.mode} · {snapshot.platform} · {snapshot.rowCount} row</p>
                  </div>
                  <span className="text-xs text-slate-500">{formatTime(snapshot.createdAt)}</span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <MetricCard label="Keyword" value={metricValue(snapshot.strongestKeyword)} compact />
                  <MetricCard label="Trust avg" value={metricValue(snapshot.averageScores?.trustScore, '/100')} compact />
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-300">No saved analytics yet. Run an analysis and press <span className="font-medium text-white">Save to Analytics</span>.</div>
            )}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
