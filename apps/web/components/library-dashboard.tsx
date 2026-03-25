'use client';

import type { ChangeEvent, MouseEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell, Badge, MetricCard, Panel } from '@printra/ui';

type StorageFoundation = {
  configured: boolean;
  bucket: string | null;
  health?: {
    configured?: boolean;
    connected?: boolean;
    mode?: string;
    note?: string;
  };
};

type SectionKind = 'mockup' | 'design' | 'brand' | 'other';
type AssetKind = 'mockup' | 'design' | 'misc';

type Section = {
  id: string;
  organization_id: string;
  kind: SectionKind;
  name: string;
  created_at: string;
  updated_at: string;
};

type Asset = {
  id: string;
  organization_id: string;
  title: string;
  type: AssetKind;
  status: 'uploaded';
  mime_type: string | null;
  file_size: number | null;
  library_section_id: string | null;
  public_url: string | null;
  object_key: string | null;
  preview_data_url?: string | null;
  created_at: string;
  updated_at: string;
};

type LocalLibraryStore = {
  sections: Section[];
  assets: Asset[];
};

const DEFAULT_ORG_ID = process.env.NEXT_PUBLIC_DEFAULT_ORGANIZATION_ID ?? '8ea81f60-cf2a-417d-b86e-c618f773c6ed';
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const DB_NAME = 'printra-library';
const DB_VERSION = 1;
const STORE_KEY = 'library-store';
const IDB_TIMEOUT_MS = 2500;

function extractErrorMessage(rawText: string, status: number) {
  const trimmed = rawText.trim();

  if (!trimmed) {
    return status >= 500 ? 'Library service is temporarily unavailable.' : 'Library request could not be completed.';
  }

  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown; message?: unknown; detail?: unknown };
    const candidate = [parsed.error, parsed.message, parsed.detail].find((value) => typeof value === 'string' && value.trim());
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  } catch {}

  if (trimmed === '{}' || trimmed === '{"error":""}') {
    return status >= 500 ? 'Library service is temporarily unavailable.' : 'Library request could not be completed.';
  }

  return trimmed;
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(extractErrorMessage(text, response.status));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function formatBytes(value: number | null) {
  if (!value || Number.isNaN(value)) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function isoNow() {
  return new Date().toISOString();
}

function assetObjectKey(type: AssetKind, title: string) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'asset';
  return `browser-library/${type}/${crypto.randomUUID()}-${base}`;
}

function emptyStore(): LocalLibraryStore {
  return { sections: [], assets: [] };
}

function waitWithTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

async function openLibraryDb() {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    throw new Error('This browser does not support IndexedDB.');
  }

  return waitWithTimeout<IDBDatabase>(
    new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_KEY)) {
          db.createObjectStore(STORE_KEY);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Library database could not be opened.'));
    }),
    IDB_TIMEOUT_MS,
    'Library database open timed out.'
  );
}

async function readLocalLibraryStore(): Promise<LocalLibraryStore> {
  const db = await openLibraryDb();
  return waitWithTimeout<LocalLibraryStore>(
    new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_KEY, 'readonly');
      const objectStore = transaction.objectStore(STORE_KEY);
      const request = objectStore.get(DEFAULT_ORG_ID);
      request.onsuccess = () => {
        const raw = request.result as LocalLibraryStore | undefined;
        resolve({
          sections: Array.isArray(raw?.sections) ? raw.sections : [],
          assets: Array.isArray(raw?.assets) ? raw.assets : []
        });
      };
      request.onerror = () => reject(request.error ?? new Error('Library store could not be read.'));
      transaction.oncomplete = () => db.close();
      transaction.onabort = () => reject(transaction.error ?? new Error('Library read transaction aborted.'));
    }),
    IDB_TIMEOUT_MS,
    'Library read timed out.'
  );
}

async function writeLocalLibraryStore(store: LocalLibraryStore) {
  const db = await openLibraryDb();
  return waitWithTimeout<void>(
    new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_KEY, 'readwrite');
      const objectStore = transaction.objectStore(STORE_KEY);
      objectStore.put(store, DEFAULT_ORG_ID);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error ?? new Error('Library store could not be written.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Library write transaction aborted.'));
    }),
    IDB_TIMEOUT_MS,
    'Library write timed out.'
  );
}

async function createBrowserSection(kind: 'mockup' | 'design', name: string) {
  const store = await readLocalLibraryStore();
  const now = isoNow();
  const section: Section = {
    id: crypto.randomUUID(),
    organization_id: DEFAULT_ORG_ID,
    kind,
    name: name.trim() || 'Untitled section',
    created_at: now,
    updated_at: now
  };
  store.sections.push(section);
  await writeLocalLibraryStore(store);
  return section;
}

async function uploadBrowserAssets(kindToUpload: 'mockup' | 'design', sectionId: string, files: File[]) {
  const store = await readLocalLibraryStore();
  const now = isoNow();
  const nextAssets: Asset[] = [];

  for (const file of files) {
    const previewDataUrl = await readFileAsDataUrl(file);
    nextAssets.push({
      id: crypto.randomUUID(),
      organization_id: DEFAULT_ORG_ID,
      title: file.name,
      type: kindToUpload,
      status: 'uploaded',
      mime_type: file.type || 'application/octet-stream',
      file_size: file.size,
      library_section_id: sectionId,
      public_url: previewDataUrl,
      object_key: assetObjectKey(kindToUpload, file.name),
      preview_data_url: previewDataUrl,
      created_at: now,
      updated_at: now
    });
  }

  store.assets = [...nextAssets, ...store.assets];
  await writeLocalLibraryStore(store);
  return nextAssets;
}

async function duplicateBrowserAsset(assetId: string) {
  const store = await readLocalLibraryStore();
  const source = store.assets.find((asset) => asset.id === assetId);
  if (!source) {
    throw new Error('Asset not found.');
  }
  const now = isoNow();
  const duplicated: Asset = {
    ...source,
    id: crypto.randomUUID(),
    title: `${source.title} Copy`,
    object_key: assetObjectKey(source.type, `${source.title}-copy`),
    created_at: now,
    updated_at: now
  };
  store.assets = [duplicated, ...store.assets];
  await writeLocalLibraryStore(store);
  return duplicated;
}

async function deleteBrowserAsset(assetId: string) {
  const store = await readLocalLibraryStore();
  const nextAssets = store.assets.filter((asset) => asset.id !== assetId);
  if (nextAssets.length === store.assets.length) {
    throw new Error('Asset not found.');
  }
  store.assets = nextAssets;
  await writeLocalLibraryStore(store);
}

function LibraryActionButton({
  children,
  className,
  disabled,
  onClick,
  type = 'button'
}: {
  children: ReactNode;
  className: string;
  disabled?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick?.(event);
      }}
      className={[className, 'relative z-10 pointer-events-auto'].join(' ')}
    >
      {children}
    </button>
  );
}

export function LibraryDashboard() {
  const mockupUploadRef = useRef<HTMLInputElement | null>(null);
  const designUploadRef = useRef<HTMLInputElement | null>(null);
  const [foundation, setFoundation] = useState<StorageFoundation | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [kind, setKind] = useState<'mockup' | 'design'>('mockup');
  const [queryText, setQueryText] = useState('');
  const [sectionDraft, setSectionDraft] = useState('');
  const [activeSectionId, setActiveSectionId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [busyAssetId, setBusyAssetId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const store = await readLocalLibraryStore();
      const nextSections = store.sections
        .filter((section) => section.kind === kind)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const normalizedSectionId = activeSectionId === 'all' || nextSections.some((section) => section.id === activeSectionId) ? activeSectionId : 'all';
      const nextAssets = store.assets
        .filter((asset) => asset.type === kind)
        .filter((asset) => (normalizedSectionId === 'all' ? true : asset.library_section_id === normalizedSectionId))
        .filter((asset) => {
          const query = queryText.trim().toLowerCase();
          return query ? asset.title.toLowerCase().includes(query) : true;
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      if (normalizedSectionId !== activeSectionId) {
        setActiveSectionId('all');
      }

      setSections(nextSections);
      setAssets(nextAssets);
    } catch (libraryError) {
      setError(libraryError instanceof Error ? libraryError.message : 'Library could not be loaded.');
    }

    try {
      const foundationData = await getJson<StorageFoundation>(`/storage/foundation?organizationId=${DEFAULT_ORG_ID}`);
      setFoundation(foundationData);
    } catch {
      setFoundation({
        configured: true,
        bucket: 'browser-library-store',
        health: {
          configured: true,
          connected: true,
          mode: 'browser-indexeddb-foundation',
          note: 'Library is running in browser IndexedDB mode until customer database and object storage credentials are attached.'
        }
      });
    } finally {
      setLoading(false);
    }
  }, [activeSectionId, kind, queryText]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const uploadedCount = useMemo(() => assets.filter((asset) => asset.status === 'uploaded').length, [assets]);
  const storageModeLabel = foundation?.health?.mode ?? (loading ? 'checking' : foundation?.configured ? 'configured' : 'not configured');
  const storageNote =
    foundation?.health?.note ??
    (loading
      ? 'Checking storage readiness…'
      : foundation?.configured
        ? 'Library foundation is configured and ready for customer credentials.'
        : 'Storage is not configured yet. The buyer can attach their own credentials after delivery.');

  async function createSection() {
    const trimmed = sectionDraft.trim();
    if (!trimmed) return;
    setError('');
    setMessage('');
    try {
      await createBrowserSection(kind, trimmed);
      setSectionDraft('');
      setMessage('Library section created.');
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Section could not be created.');
    }
  }

  async function duplicateAsset(assetId: string) {
    setBusyAssetId(assetId);
    setError('');
    setMessage('');
    try {
      await duplicateBrowserAsset(assetId);
      setMessage('Asset duplicated.');
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Asset could not be duplicated.');
    } finally {
      setBusyAssetId(null);
    }
  }

  async function deleteAsset(assetId: string) {
    setBusyAssetId(assetId);
    setError('');
    setMessage('');
    try {
      await deleteBrowserAsset(assetId);
      setMessage('Asset deleted.');
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Asset could not be deleted.');
    } finally {
      setBusyAssetId(null);
    }
  }

  async function uploadFiles(kindToUpload: 'mockup' | 'design', fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    setUploading(true);
    setError('');
    setMessage('');
    try {
      const targetSectionId = activeSectionId !== 'all' ? activeSectionId : sections[0]?.id ?? null;
      if (!targetSectionId) {
        throw new Error(`Create a ${kindToUpload} section before uploading assets.`);
      }

      await uploadBrowserAssets(kindToUpload, targetSectionId, files);
      setMessage(`${files.length} ${kindToUpload === 'mockup' ? 'mockup' : 'design'} asset${files.length > 1 ? 's were' : ' was'} uploaded to the library.`);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Assets could not be uploaded.');
    } finally {
      setUploading(false);
      if (mockupUploadRef.current) mockupUploadRef.current.value = '';
      if (designUploadRef.current) designUploadRef.current.value = '';
    }
  }

  function handleMockupUpload(event: ChangeEvent<HTMLInputElement>) {
    void uploadFiles('mockup', event.target.files);
  }

  function handleDesignUpload(event: ChangeEvent<HTMLInputElement>) {
    void uploadFiles('design', event.target.files);
  }

  return (
    <AppShell title="Library" subtitle="Reusable asset depot for sections, uploads, previews, duplicate, delete, and customer-owned infrastructure handoff.">
      <input ref={mockupUploadRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple className="hidden" onChange={handleMockupUpload} />
      <input ref={designUploadRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple className="hidden" onChange={handleDesignUpload} />
      <div className="relative z-10 grid gap-6 xl:grid-cols-[1.1fr_minmax(0,0.9fr)]">
        <Panel title="Storage state" description="This panel reflects the current library foundation and delivery model.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Mode" value={storageModeLabel} />
            <MetricCard label="Bucket" value={foundation?.bucket ?? 'browser-library-store'} />
            <MetricCard label="Visible assets" value={String(assets.length)} />
            <MetricCard label="Uploaded" value={String(uploadedCount)} />
          </div>
          <div className="mt-4 rounded-3xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">{storageNote}</div>
        </Panel>

        <Panel title="Delivery note" description="This is the handoff model the build now supports.">
          <div className="space-y-3 text-sm leading-6 text-slate-300">
            <p>Library uploads work immediately in the browser without attaching your own storage credentials during development.</p>
            <p>After delivery, the buyer can connect their own Neon, Cloudflare R2, mail and payment credentials through <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">.env</code> or the admin layer.</p>
            <p>This keeps the demo usable now while still matching the customer-owned infrastructure handoff model.</p>
          </div>
        </Panel>
      </div>

      <div className="relative z-10 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Panel title="Sections" description="Create reusable mockup or design buckets and keep assets organized.">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <LibraryActionButton onClick={() => setKind('mockup')} className={["rounded-full border px-3 py-2 text-sm transition", kind === 'mockup' ? 'border-fuchsia-400/40 bg-fuchsia-400/15 text-fuchsia-100' : 'border-white/10 bg-white/[0.03] text-slate-300'].join(' ')}>Mockups</LibraryActionButton>
              <LibraryActionButton onClick={() => setKind('design')} className={["rounded-full border px-3 py-2 text-sm transition", kind === 'design' ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-100' : 'border-white/10 bg-white/[0.03] text-slate-300'].join(' ')}>Designs</LibraryActionButton>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-3">
              <label className="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">New section</label>
              <input value={sectionDraft} onChange={(event) => setSectionDraft(event.target.value)} placeholder={kind === 'mockup' ? 'Summer mockups' : 'Brand designs'} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none" />
              <LibraryActionButton onClick={() => { void createSection(); }} className="mt-3 w-full rounded-2xl border border-sky-400/30 bg-sky-400/15 px-3 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-400/20">Create section</LibraryActionButton>
            </div>

            <div className="space-y-2">
              <LibraryActionButton onClick={() => setActiveSectionId('all')} className={["flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left text-sm transition", activeSectionId === 'all' ? 'border-sky-400/30 bg-sky-400/10 text-white' : 'border-white/10 bg-white/[0.03] text-slate-300'].join(' ')}>
                <span>All sections</span>
                <Badge>{assets.length}</Badge>
              </LibraryActionButton>
              {sections.map((section) => (
                <LibraryActionButton key={section.id} onClick={() => setActiveSectionId(section.id)} className={["flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left text-sm transition", activeSectionId === section.id ? 'border-sky-400/30 bg-sky-400/10 text-white' : 'border-white/10 bg-white/[0.03] text-slate-300'].join(' ')}>
                  <span>{section.name}</span>
                  <span className="text-xs text-slate-500">section</span>
                </LibraryActionButton>
              ))}
              {!sections.length ? <p className="rounded-2xl border border-dashed border-white/10 p-3 text-sm text-slate-500">No sections yet. Create the first one from above.</p> : null}
            </div>
          </div>
        </Panel>

        <Panel title="Asset browser" description="Upload, preview, duplicate, and delete assets without depending on live customer storage credentials.">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="Search asset title" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none lg:max-w-xs" />
            <div className="flex flex-wrap gap-2">
              <LibraryActionButton disabled={uploading} onClick={() => (kind === 'mockup' ? mockupUploadRef.current?.click() : designUploadRef.current?.click())} className="rounded-2xl border border-emerald-400/30 bg-emerald-400/12 px-3 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/18 disabled:opacity-50">{uploading ? 'Uploading…' : kind === 'mockup' ? 'Upload mockups' : 'Upload designs'}</LibraryActionButton>
              <LibraryActionButton onClick={() => { void refresh(); }} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 transition hover:bg-white/[0.06]">Refresh</LibraryActionButton>
            </div>
          </div>

          {message ? <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">{message}</div> : null}
          {error ? <div className="mb-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm whitespace-pre-wrap text-rose-100">{error}</div> : null}

          {loading ? <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-sm text-slate-400">Loading library data…</div> : null}

          {!loading && !assets.length ? (
            <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-sm leading-6 text-slate-400">
              <p>No assets match the current filter yet.</p>
              <p className="mt-2">This library now keeps uploads in browser IndexedDB during development so the screen remains usable before live customer storage is connected.</p>
            </div>
          ) : null}

          <div className="space-y-3">
            {assets.map((asset) => (
              <div key={asset.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-white">{asset.title}</p>
                      <Badge>{asset.type}</Badge>
                      <Badge>{asset.status}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                      <span>{asset.mime_type ?? 'mime pending'}</span>
                      <span>{formatBytes(asset.file_size)}</span>
                      <span>{new Date(asset.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-2 break-all text-xs leading-5 text-slate-500">{asset.object_key ?? 'Object key pending.'}</p>
                  </div>
                  {asset.preview_data_url ? (
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 lg:w-28">
                      <img src={asset.preview_data_url} alt={asset.title} className="h-28 w-28 object-cover" />
                    </div>
                  ) : null}
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <LibraryActionButton disabled={busyAssetId === asset.id} onClick={() => { void duplicateAsset(asset.id); }} className="rounded-2xl border border-sky-400/25 bg-sky-400/10 px-3 py-2 text-xs font-medium text-sky-100 transition hover:bg-sky-400/15 disabled:opacity-50">Duplicate</LibraryActionButton>
                    <LibraryActionButton disabled={busyAssetId === asset.id} onClick={() => { void deleteAsset(asset.id); }} className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-xs font-medium text-rose-100 transition hover:bg-rose-400/15 disabled:opacity-50">Delete</LibraryActionButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
