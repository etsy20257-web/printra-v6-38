import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const dataDir = path.resolve(process.cwd(), 'data');
const projectsFile = path.join(dataDir, 'projects.json');
const PROJECTS_CACHE_TTL_MS = 1500;

let ensureStorePromise = null;
let projectsCache = null;
let projectsCacheExpiresAt = 0;
let writeQueue = Promise.resolve();

function isoNow() {
  return new Date().toISOString();
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'project';
}

function computeStudioMetrics(studioState) {
  const objects = Array.isArray(studioState?.objects) ? studioState.objects : [];
  const visibleObjects = objects.filter((object) => object?.visible !== false);
  const stageCount = visibleObjects.filter((object) => object?.type === 'mockup').length;
  const assetCount = visibleObjects.filter((object) => object?.type === 'image' || object?.type === 'mockup').length;
  return {
    sceneCount: stageCount || 0,
    assetCount: assetCount || 0
  };
}

function withStudioState(project, studioState) {
  const metrics = computeStudioMetrics(studioState);
  return {
    ...project,
    sceneCount: metrics.sceneCount,
    assetCount: metrics.assetCount,
    studioState: studioState ?? project.studioState ?? null,
    lastSavedSource: studioState ? 'studio' : project.lastSavedSource ?? 'projects-route'
  };
}

export function toPublicProject(project) {
  const { studioState, ...rest } = project;
  return rest;
}

function defaultProjects() {
  const now = isoNow();
  return [
    {
      id: randomUUID(),
      name: 'Spring launch workspace',
      slug: 'spring-launch-workspace',
      description: 'Starter project for mockups, listings, and saved automatic-analysis snapshots.',
      status: 'active',
      sceneCount: 3,
      assetCount: 12,
      outputCount: 4,
      favorite: true,
      archived: false,
      tags: ['studio', 'launch'],
      updatedAt: now,
      createdAt: now,
      lastSavedSource: 'projects-route',
      studioState: null
    },
    {
      id: randomUUID(),
      name: 'Evergreen catalog batch',
      slug: 'evergreen-catalog-batch',
      description: 'Used for repeatable catalog exports and future batch packaging.',
      status: 'draft',
      sceneCount: 1,
      assetCount: 5,
      outputCount: 0,
      favorite: false,
      archived: false,
      tags: ['batch'],
      updatedAt: now,
      createdAt: now,
      lastSavedSource: 'projects-route',
      studioState: null
    }
  ];
}

async function ensureStore() {
  if (!ensureStorePromise) {
    ensureStorePromise = (async () => {
      await fs.mkdir(dataDir, { recursive: true });
      try {
        await fs.access(projectsFile);
      } catch {
        await fs.writeFile(projectsFile, JSON.stringify(defaultProjects(), null, 2), 'utf8');
      }
    })();
  }

  try {
    await ensureStorePromise;
  } catch (error) {
    ensureStorePromise = null;
    throw error;
  }
}

function cloneProjectsState(projects) {
  if (typeof structuredClone === 'function') {
    return structuredClone(projects);
  }
  return JSON.parse(JSON.stringify(projects));
}

export async function readProjects(options = {}) {
  const forceRefresh = options.forceRefresh === true;
  await ensureStore();
  if (!forceRefresh && projectsCache && Date.now() < projectsCacheExpiresAt) {
    return cloneProjectsState(projectsCache);
  }
  try {
    const raw = await fs.readFile(projectsFile, 'utf8');
    const parsed = JSON.parse(raw);
    const normalized = Array.isArray(parsed) ? parsed : [];
    projectsCache = cloneProjectsState(normalized);
    projectsCacheExpiresAt = Date.now() + PROJECTS_CACHE_TTL_MS;
    return cloneProjectsState(normalized);
  } catch {
    const fallback = defaultProjects();
    await writeProjects(fallback);
    return cloneProjectsState(fallback);
  }
}

async function writeProjects(projects) {
  await ensureStore();
  const normalized = Array.isArray(projects) ? projects : [];
  projectsCache = cloneProjectsState(normalized);
  projectsCacheExpiresAt = Date.now() + PROJECTS_CACHE_TTL_MS;

  const payload = JSON.stringify(normalized, null, 2);
  const task = () => fs.writeFile(projectsFile, payload, 'utf8');
  const queued = writeQueue.then(task, task);
  writeQueue = queued.then(() => undefined, () => undefined);
  await queued;
}

function summarize(projects) {
  const active = projects.filter((project) => !project.archived);
  const archived = projects.filter((project) => project.archived);
  return {
    total: projects.length,
    active: active.length,
    archived: archived.length,
    favorites: active.filter((project) => project.favorite).length,
    totalScenes: active.reduce((sum, project) => sum + Number(project.sceneCount || 0), 0),
    totalOutputs: active.reduce((sum, project) => sum + Number(project.outputCount || 0), 0),
    autosaveMode: 'local-json-foundation + studio-state'
  };
}

export async function listProjects() {
  const projects = await readProjects();
  const sorted = [...projects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return { projects: sorted.map(toPublicProject), summary: summarize(sorted) };
}

export async function getProject(projectId) {
  const projects = await readProjects();
  return projects.find((project) => project.id === projectId) ?? null;
}

export async function createProject(payload = {}) {
  const projects = await readProjects();
  const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : 'Untitled project';
  const description = typeof payload.description === 'string' ? payload.description.trim() : '';
  const tags = Array.isArray(payload.tags) ? payload.tags.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim().slice(0, 24)) : [];
  const now = isoNow();
  const studioState = payload.studioState && typeof payload.studioState === 'object' ? payload.studioState : null;
  const metrics = computeStudioMetrics(studioState);
  const project = {
    id: randomUUID(),
    name,
    slug: slugify(name),
    description,
    status: studioState ? 'active' : 'draft',
    sceneCount: metrics.sceneCount,
    assetCount: metrics.assetCount,
    outputCount: 0,
    favorite: false,
    archived: false,
    tags,
    updatedAt: now,
    createdAt: now,
    lastSavedSource: studioState ? 'studio' : 'projects-route',
    studioState
  };
  const next = [project, ...projects];
  await writeProjects(next);
  return project;
}

export async function updateProject(projectId, updates = {}) {
  const projects = await readProjects();
  const index = projects.findIndex((project) => project.id === projectId);
  if (index === -1) return null;
  const current = projects[index];
  const nextProject = {
    ...current,
    name: typeof updates.name === 'string' && updates.name.trim() ? updates.name.trim() : current.name,
    slug: typeof updates.name === 'string' && updates.name.trim() ? slugify(updates.name) : current.slug,
    description: typeof updates.description === 'string' ? updates.description.trim() : current.description,
    favorite: typeof updates.favorite === 'boolean' ? updates.favorite : current.favorite,
    archived: typeof updates.archived === 'boolean' ? updates.archived : current.archived,
    status: typeof updates.status === 'string' && updates.status.trim() ? updates.status.trim() : current.status,
    tags: Array.isArray(updates.tags)
      ? updates.tags.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim().slice(0, 24))
      : current.tags,
    updatedAt: isoNow()
  };
  const next = [...projects];
  next[index] = nextProject;
  await writeProjects(next);
  return nextProject;
}

export async function saveProjectStudioState(projectId, studioState) {
  const projects = await readProjects();
  const index = projects.findIndex((project) => project.id === projectId);
  if (index === -1) return null;
  const current = projects[index];
  const metrics = computeStudioMetrics(studioState);
  const nextProject = {
    ...current,
    studioState,
    sceneCount: metrics.sceneCount,
    assetCount: metrics.assetCount,
    status: metrics.sceneCount > 0 || metrics.assetCount > 0 ? 'active' : current.status,
    updatedAt: isoNow(),
    lastSavedSource: 'studio'
  };
  const next = [...projects];
  next[index] = nextProject;
  await writeProjects(next);
  return nextProject;
}

export async function deleteProject(projectId) {
  const projects = await readProjects();
  const index = projects.findIndex((project) => project.id === projectId);
  if (index === -1) return null;
  const [deleted] = projects.splice(index, 1);
  await writeProjects(projects);
  return deleted;
}

export async function duplicateProject(projectId) {
  const projects = await readProjects();
  const source = projects.find((project) => project.id === projectId);
  if (!source) return null;
  const now = isoNow();
  const copy = {
    ...source,
    id: randomUUID(),
    name: `${source.name} Copy`,
    slug: slugify(`${source.name}-copy`),
    favorite: false,
    archived: false,
    status: source.studioState ? 'active' : 'draft',
    updatedAt: now,
    createdAt: now
  };
  const next = [copy, ...projects];
  await writeProjects(next);
  return copy;
}
