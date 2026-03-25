'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AppShell, Badge, MetricCard, Panel } from '@printra/ui';

type Project = {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: string;
  sceneCount: number;
  assetCount: number;
  outputCount: number;
  favorite: boolean;
  archived: boolean;
  tags: string[];
  updatedAt: string;
  createdAt: string;
};

type ProjectsResponse = {
  projects: Project[];
  summary: {
    total: number;
    active: number;
    archived: number;
    favorites: number;
    totalScenes: number;
    totalOutputs: number;
    autosaveMode: string;
  };
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const PROJECTS_CACHE_KEY = 'printra-projects-cache-v1';

function readCachedProjects(): ProjectsResponse | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PROJECTS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || !Array.isArray(parsed.projects) || !parsed.summary) return null;
    return parsed as ProjectsResponse;
  } catch {
    return null;
  }
}

function writeCachedProjects(payload: ProjectsResponse) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PROJECTS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    try {
      window.localStorage.removeItem(PROJECTS_CACHE_KEY);
    } catch {}
  }
}

async function getProjects(): Promise<ProjectsResponse> {
  const response = await fetch(`${API_BASE}/projects`);
  if (!response.ok) throw new Error('Projects service is temporarily unavailable.');
  return response.json();
}

async function createProject(payload: { name: string; description: string; tags: string[] }) {
  const response = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error('Project could not be created.');
  return response.json() as Promise<{ ok: true; project: Project }>;
}

async function patchProject(projectId: string, payload: Partial<Pick<Project, 'name' | 'description' | 'favorite' | 'archived' | 'status' | 'tags'>>) {
  const response = await fetch(`${API_BASE}/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error('Project update failed.');
  return response.json() as Promise<{ ok: true; project: Project }>;
}

async function duplicateProject(projectId: string) {
  const response = await fetch(`${API_BASE}/projects/${projectId}/duplicate`, { method: 'POST' });
  if (!response.ok) throw new Error('Project duplicate failed.');
  return response.json() as Promise<{ ok: true; project: Project }>;
}

async function removeProject(projectId: string) {
  const response = await fetch(`${API_BASE}/projects/${projectId}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Project delete failed.');
  return response.json() as Promise<{ ok: true; project: Project }>;
}

function formatTime(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function statusTone(project: Project) {
  if (project.archived) return 'border-amber-400/20 bg-amber-400/10 text-amber-100';
  if (project.favorite) return 'border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-100';
  return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100';
}

export function ProjectsDashboard() {
  const searchParams = useSearchParams();
  const requestedProjectId = searchParams.get('projectId') ?? '';

  const [lastStudioProjectId, setLastStudioProjectId] = useState('');
  const preferredProjectId = requestedProjectId || lastStudioProjectId;
  const [data, setData] = useState<ProjectsResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function applySelection(project: Project | null) {
    setSelectedId(project?.id ?? '');
    setName(project?.name ?? '');
    setDescription(project?.description ?? '');
    setTags((project?.tags ?? []).join(', '));
  }

  async function loadProjects(options?: { keepSelected?: boolean; preferredProjectId?: string; silent?: boolean }) {
    const keepSelected = options?.keepSelected ?? true;
    const preferredProjectId = options?.preferredProjectId;
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    if (!silent) setError('');
    try {
      const next = await getProjects();
      writeCachedProjects(next);
      setData(next);
      const forcedTarget = preferredProjectId ? next.projects.find((project) => project.id === preferredProjectId) : null;
      const retainedTarget = keepSelected ? next.projects.find((project) => project.id === selectedId) : null;
      const current = forcedTarget ?? retainedTarget ?? next.projects[0] ?? null;
      applySelection(current);
      if (preferredProjectId && forcedTarget) {
        setMessage(`Project loaded · ${forcedTarget.name}`);
      } else if (preferredProjectId && !forcedTarget) {
        setMessage('Saved project was not found in the refreshed list yet.');
      }
    } catch (requestError) {
      const cached = readCachedProjects();
      if (cached) {
        setData(cached);
        const forcedTarget = preferredProjectId ? cached.projects.find((project) => project.id === preferredProjectId) : null;
        const retainedTarget = keepSelected ? cached.projects.find((project) => project.id === selectedId) : null;
        const current = forcedTarget ?? retainedTarget ?? cached.projects[0] ?? null;
        applySelection(current);
        setMessage('Projects offline fallback aktif: cached verilerle devam ediliyor.');
      } else {
        setError(requestError instanceof Error ? requestError.message : 'Projects could not be loaded.');
        setData(null);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }


  useEffect(() => {
    if (typeof window === 'undefined') return;
    let stored = '';
    try {
      stored = window.sessionStorage.getItem('printra-last-project-id') ?? '';
    } catch {}
    if (stored) setLastStudioProjectId(stored);
  }, []);

  useEffect(() => {
    void loadProjects({ keepSelected: false, preferredProjectId: preferredProjectId || undefined });
  }, [preferredProjectId]);

  useEffect(() => {
    const handleFocusRefresh = () => {
      if (document.visibilityState === 'hidden') return;
      void loadProjects({ keepSelected: true, preferredProjectId: preferredProjectId || selectedId || undefined, silent: true });
    };

    const handleStudioProjectSaved = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string }>).detail;
      if (detail?.projectId && typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem('printra-last-project-id', detail.projectId);
        } catch {}
      }
      void loadProjects({ keepSelected: false, preferredProjectId: detail?.projectId || preferredProjectId || selectedId || undefined, silent: false });
    };

    window.addEventListener('focus', handleFocusRefresh);
    window.addEventListener('printra:project-saved', handleStudioProjectSaved as EventListener);
    document.addEventListener('visibilitychange', handleFocusRefresh);
    return () => {
      window.removeEventListener('focus', handleFocusRefresh);
      window.removeEventListener('printra:project-saved', handleStudioProjectSaved as EventListener);
      document.removeEventListener('visibilitychange', handleFocusRefresh);
    };
  }, [preferredProjectId, selectedId]);

  const selectedProject = useMemo(() => data?.projects.find((project) => project.id === selectedId) ?? null, [data, selectedId]);

  async function handleCreate() {
    setSaving(true);
    setError('');
    setMessage('Creating project…');
    try {
      const payload = {
        name: name.trim() || 'Untitled project',
        description: description.trim(),
        tags: tags.split(',').map((entry) => entry.trim()).filter(Boolean)
      };
      const created = await createProject(payload);
      setMessage(`Project created · ${created.project.name}`);
      await loadProjects({ keepSelected: false, preferredProjectId: created.project.id });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Project could not be created.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!selectedProject) return;
    setSaving(true);
    setError('');
    setMessage('Saving project changes…');
    try {
      await patchProject(selectedProject.id, {
        name,
        description,
        tags: tags.split(',').map((entry) => entry.trim()).filter(Boolean)
      });
      setMessage(`Project updated · ${name.trim() || selectedProject.name}`);
      await loadProjects({ keepSelected: true, preferredProjectId: selectedProject.id });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Project update failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate() {
    if (!selectedProject) return;
    setSaving(true);
    setError('');
    setMessage('Duplicating project…');
    try {
      const duplicated = await duplicateProject(selectedProject.id);
      setMessage(`Project duplicated · ${duplicated.project.name}`);
      await loadProjects({ keepSelected: false, preferredProjectId: duplicated.project.id });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Project duplicate failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleFavorite() {
    if (!selectedProject) return;
    setSaving(true);
    setError('');
    setMessage(selectedProject.favorite ? 'Removing project from favorites…' : 'Adding project to favorites…');
    try {
      await patchProject(selectedProject.id, { favorite: !selectedProject.favorite });
      setMessage(selectedProject.favorite ? 'Project removed from favorites.' : 'Project added to favorites.');
      await loadProjects({ keepSelected: true, preferredProjectId: selectedProject.id });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Favorite state could not be changed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleArchive() {
    if (!selectedProject) return;
    setSaving(true);
    setError('');
    setMessage(selectedProject.archived ? 'Restoring project…' : 'Archiving project…');
    try {
      await patchProject(selectedProject.id, {
        archived: !selectedProject.archived,
        status: !selectedProject.archived ? 'archived' : 'active'
      });
      setMessage(selectedProject.archived ? 'Project restored to active lane.' : 'Project archived.');
      await loadProjects({ keepSelected: true, preferredProjectId: selectedProject.id });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Archive state could not be changed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedProject) return;
    const confirmed = typeof window === 'undefined' ? true : window.confirm(`Delete project "${selectedProject.name}"? This cannot be undone.`);
    if (!confirmed) return;

    setSaving(true);
    setError('');
    setMessage('Deleting project…');
    try {
      const deleted = await removeProject(selectedProject.id);
      setMessage(`Project deleted · ${deleted.project.name}`);
      await loadProjects({ keepSelected: false });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Project delete failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Projects"
      subtitle="Projects artık boş shell değil; Studio ile senkron çalışan create, update, duplicate, archive, favorite ve delete akışlarına sahip canlı çalışma alanı."
    >
      <div className="grid gap-6 lg:grid-cols-4">
        <MetricCard label="Projects" value={loading ? '…' : String(data?.summary.total ?? 0)} />
        <MetricCard label="Active" value={loading ? '…' : String(data?.summary.active ?? 0)} />
        <MetricCard label="Favorites" value={loading ? '…' : String(data?.summary.favorites ?? 0)} />
        <MetricCard label="Autosave" value={loading ? 'checking' : data?.summary.autosaveMode ?? 'local-json-foundation'} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {error ? <div className="rounded-3xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">{error}</div> : <div />}
        {message ? <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">{message}</div> : <div />}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_minmax(0,1.25fr)]">
        <Panel title="Project inventory" description="Saved workspaces refresh when you return from Studio, so newly saved projects should appear here without manual cleanup.">
          <div className="mb-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadProjects({ keepSelected: true, preferredProjectId: preferredProjectId || undefined })} className="rounded-2xl border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs font-medium text-sky-100 transition hover:bg-sky-400/15">
              Refresh list
            </button>
            {preferredProjectId ? <Badge>requested {preferredProjectId.slice(0, 8)}</Badge> : null}
          </div>
          <div className="space-y-3">
            {(data?.projects ?? []).map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => {
                  applySelection(project);
                  setMessage(`Selected project · ${project.name}`);
                  setError('');
                }}
                className={[
                  'w-full rounded-3xl border p-4 text-left transition duration-200 hover:-translate-y-0.5',
                  project.id === selectedId ? 'border-sky-400/30 bg-sky-400/10' : 'border-[var(--shell-border)] bg-[var(--shell-surface-soft)]'
                ].join(' ')}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--shell-heading)]">{project.name}</p>
                      <span className={['rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]', statusTone(project)].join(' ')}>
                        {project.archived ? 'archived' : project.favorite ? 'favorite' : project.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--shell-text-muted)]">{project.description || 'No description yet.'}</p>
                  </div>
                  <Badge>{project.slug}</Badge>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <MetricCard label="Scenes" value={String(project.sceneCount)} />
                  <MetricCard label="Assets" value={String(project.assetCount)} />
                  <MetricCard label="Outputs" value={String(project.outputCount)} />
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--shell-text-muted)]">
                  <span>Updated {formatTime(project.updatedAt)}</span>
                  <span>{project.tags?.length ? project.tags.join(' • ') : 'No tags yet'}</span>
                </div>
              </button>
            ))}

            {!loading && !(data?.projects?.length) ? (
              <div className="rounded-3xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] p-4 text-sm text-[var(--shell-text-muted)]">No projects found yet. Save your first Studio scene, then come back here.</div>
            ) : null}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Project editor" description="Save from Studio, come here, select the project, then use Open studio to restore that exact scene.">
            <div className="grid gap-4">
              <label className="grid gap-2 text-sm text-[var(--shell-text-muted)]">
                <span className="font-medium text-[var(--shell-heading)]">Project name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Spring launch workspace" className="rounded-2xl border px-4 py-3 outline-none" />
              </label>
              <label className="grid gap-2 text-sm text-[var(--shell-text-muted)]">
                <span className="font-medium text-[var(--shell-heading)]">Description</span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What this workspace is used for..." rows={4} className="rounded-2xl border px-4 py-3 outline-none" />
              </label>
              <label className="grid gap-2 text-sm text-[var(--shell-text-muted)]">
                <span className="font-medium text-[var(--shell-heading)]">Tags</span>
                <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="studio, launch, export" className="rounded-2xl border px-4 py-3 outline-none" />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={selectedProject ? `/studio?projectId=${selectedProject.id}` : '/studio'} className={[
                'rounded-2xl border px-4 py-2 text-sm font-medium transition',
                selectedProject ? 'border-sky-400/30 bg-sky-400/10 text-sky-100 hover:bg-sky-400/15' : 'pointer-events-none border-[var(--shell-border)] bg-[var(--shell-surface)] text-[var(--shell-text-muted)] opacity-60'
              ].join(' ')}>Open studio</Link>
              <button type="button" onClick={handleCreate} disabled={saving} className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/15 disabled:opacity-60">Save as new project</button>
              <button type="button" onClick={handleSave} disabled={!selectedProject || saving} className="rounded-2xl border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-400/15 disabled:opacity-60">Save changes</button>
              <button type="button" onClick={handleDuplicate} disabled={!selectedProject || saving} className="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-400/10 px-4 py-2 text-sm font-medium text-fuchsia-100 transition hover:bg-fuchsia-400/15 disabled:opacity-60">Duplicate</button>
              <button type="button" onClick={handleToggleFavorite} disabled={!selectedProject || saving} className="rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface)] px-4 py-2 text-sm font-medium text-[var(--shell-heading)] transition hover:bg-[var(--shell-surface-strong)] disabled:opacity-60">{selectedProject?.favorite ? 'Unfavorite' : 'Favorite'}</button>
              <button type="button" onClick={handleToggleArchive} disabled={!selectedProject || saving} className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-400/15 disabled:opacity-60">{selectedProject?.archived ? 'Restore' : 'Archive'}</button>
              <button type="button" onClick={handleDelete} disabled={!selectedProject || saving} className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-400/15 disabled:opacity-60">Delete</button>
            </div>
          </Panel>

          <Panel title="Current selection" description="Safe handoff summary for the selected project.">
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="Status" value={selectedProject ? (selectedProject.archived ? 'Archived' : selectedProject.status) : 'No selection'} />
              <MetricCard label="Favorite" value={selectedProject?.favorite ? 'Yes' : 'No'} />
              <MetricCard label="Created" value={selectedProject ? formatTime(selectedProject.createdAt) : '—'} />
              <MetricCard label="Updated" value={selectedProject ? formatTime(selectedProject.updatedAt) : '—'} />
            </div>
            <div className="mt-4 rounded-3xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] p-4 text-sm leading-6 text-[var(--shell-text-muted)]">
              <p>Projects foundation is currently persisted in a local JSON file so the route still works even without database setup.</p>
              <p className="mt-2">Delete is now available separately from archive, and Studio saves can be focused in this list by project id.</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={selectedProject ? `/studio?projectId=${selectedProject.id}` : '/studio'} className="rounded-2xl border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs font-medium text-sky-100 transition hover:bg-sky-400/15">Open studio</Link>
              <Link href="/library" className="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-400/10 px-3 py-2 text-xs font-medium text-fuchsia-100 transition hover:bg-fuchsia-400/15">Open library</Link>
              <Link href="/automatic-analysis" className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-medium text-emerald-100 transition hover:bg-emerald-400/15">Open automatic analysis</Link>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
