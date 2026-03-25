import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const dataDir = path.resolve(process.cwd(), 'data');
const libraryFile = path.join(dataDir, 'library.json');

function isoNow() {
  return new Date().toISOString();
}

function normalizeSectionKind(kind) {
  return kind === 'mockup' || kind === 'design' || kind === 'brand' || kind === 'other' ? kind : 'other';
}

function normalizeAssetType(type) {
  return type === 'mockup' || type === 'design' || type === 'misc' ? type : 'misc';
}

function safeString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function makePreviewData(asset) {
  return asset.previewDataUrl ?? asset.public_url ?? null;
}

function createEmptyStore() {
  return { sections: [], assets: [] };
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(libraryFile);
  } catch {
    await fs.writeFile(libraryFile, JSON.stringify(createEmptyStore(), null, 2), 'utf8');
  }
}

async function readStore() {
  await ensureStore();
  try {
    const raw = await fs.readFile(libraryFile, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      sections: Array.isArray(parsed?.sections) ? parsed.sections : [],
      assets: Array.isArray(parsed?.assets) ? parsed.assets : []
    };
  } catch {
    const fallback = createEmptyStore();
    await fs.writeFile(libraryFile, JSON.stringify(fallback, null, 2), 'utf8');
    return fallback;
  }
}

async function writeStore(store) {
  await ensureStore();
  await fs.writeFile(libraryFile, JSON.stringify(store, null, 2), 'utf8');
}

export async function listLocalSections({ organizationId, kind }) {
  const store = await readStore();
  return store.sections
    .filter((section) => section.organization_id === organizationId)
    .filter((section) => (kind ? section.kind === kind : true))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export async function createLocalSection({ organizationId, kind, name }) {
  const store = await readStore();
  const now = isoNow();
  const section = {
    id: randomUUID(),
    organization_id: organizationId,
    kind: normalizeSectionKind(kind),
    name: safeString(name, 'Untitled section'),
    created_at: now,
    updated_at: now
  };
  store.sections.push(section);
  await writeStore(store);
  return section;
}

export async function updateLocalSection(sectionId, { name }) {
  const store = await readStore();
  const index = store.sections.findIndex((section) => section.id === sectionId);
  if (index === -1) return null;
  store.sections[index] = {
    ...store.sections[index],
    name: safeString(name, store.sections[index].name),
    updated_at: isoNow()
  };
  await writeStore(store);
  return store.sections[index];
}

export async function deleteLocalSection(sectionId) {
  const store = await readStore();
  const index = store.sections.findIndex((section) => section.id === sectionId);
  if (index === -1) return false;
  store.sections.splice(index, 1);
  store.assets = store.assets.map((asset) => asset.library_section_id === sectionId ? { ...asset, library_section_id: null, updated_at: isoNow() } : asset);
  await writeStore(store);
  return true;
}

export async function listLocalAssets({ organizationId, type, status, sectionId, q }) {
  const store = await readStore();
  const queryText = typeof q === 'string' ? q.trim().toLowerCase() : '';
  return store.assets
    .filter((asset) => asset.organization_id === organizationId)
    .filter((asset) => (type ? asset.type === type : true))
    .filter((asset) => (status ? asset.status === status : true))
    .filter((asset) => (sectionId ? asset.library_section_id === sectionId : true))
    .filter((asset) => (queryText ? String(asset.title || '').toLowerCase().includes(queryText) : true))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 200)
    .map((asset) => ({ ...asset, preview_data_url: makePreviewData(asset) }));
}

export async function createLocalAsset(payload = {}) {
  const store = await readStore();
  const now = isoNow();
  const title = safeString(payload.title || payload.filename, 'Untitled asset');
  const asset = {
    id: randomUUID(),
    organization_id: payload.organizationId,
    project_id: typeof payload.projectId === 'string' && payload.projectId.trim() ? payload.projectId.trim() : null,
    library_section_id: typeof payload.librarySectionId === 'string' && payload.librarySectionId.trim() ? payload.librarySectionId.trim() : null,
    type: normalizeAssetType(payload.assetType),
    title,
    status: 'uploaded',
    mime_type: safeString(payload.contentType, 'application/octet-stream'),
    file_size: Number(payload.sizeBytes || 0),
    checksum: typeof payload.checksum === 'string' ? payload.checksum : null,
    public_url: typeof payload.previewDataUrl === 'string' ? payload.previewDataUrl : null,
    previewDataUrl: typeof payload.previewDataUrl === 'string' ? payload.previewDataUrl : null,
    object_key: `local-library/${normalizeAssetType(payload.assetType)}/${randomUUID()}-${title}`,
    source_type: 'local-json-foundation',
    source_ref: null,
    created_at: now,
    updated_at: now
  };
  store.assets.unshift(asset);
  await writeStore(store);
  return { ...asset, preview_data_url: makePreviewData(asset) };
}

export async function duplicateLocalAsset(assetId) {
  const store = await readStore();
  const source = store.assets.find((asset) => asset.id === assetId);
  if (!source) return null;
  const now = isoNow();
  const duplicated = {
    ...source,
    id: randomUUID(),
    title: `${source.title} Copy`,
    object_key: `local-library/${source.type}/${randomUUID()}-${safeString(source.title, 'asset-copy')}`,
    created_at: now,
    updated_at: now
  };
  store.assets.unshift(duplicated);
  await writeStore(store);
  return { ...duplicated, preview_data_url: makePreviewData(duplicated) };
}

export async function deleteLocalAsset(assetId) {
  const store = await readStore();
  const index = store.assets.findIndex((asset) => asset.id === assetId);
  if (index === -1) return null;
  const [deleted] = store.assets.splice(index, 1);
  await writeStore(store);
  return { ...deleted, preview_data_url: makePreviewData(deleted) };
}

export async function getLocalLibrarySummary(organizationId) {
  const store = await readStore();
  const scopedAssets = store.assets.filter((asset) => asset.organization_id === organizationId);
  return {
    totalAssets: scopedAssets.length,
    uploadedAssets: scopedAssets.filter((asset) => asset.status === 'uploaded').length,
    mockupAssets: scopedAssets.filter((asset) => asset.type === 'mockup').length,
    designAssets: scopedAssets.filter((asset) => asset.type === 'design').length
  };
}
