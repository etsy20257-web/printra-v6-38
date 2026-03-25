'use client';

import { ChangeEvent, SyntheticEvent, RefObject, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { useLocale } from '@printra/i18n';
import { Badge, Panel } from '@printra/ui';
import type { StudioMode } from '@printra/shared';
import { createServerExportJob, downloadServerExport, waitForServerExport } from './studio/export/server-export';

type ToolKey = 'select' | 'text' | 'image' | 'shape' | 'mockup' | 'layers';
type InspectorTab = 'properties' | 'layers' | 'scene';
type ObjectType = 'text' | 'image' | 'shape' | 'mockup';
type TextAlign = 'left' | 'center' | 'right';
type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';
type SceneKind = 'design' | 'preview';
type ExportFormat = 'png' | 'jpg' | 'pdf';
type SnapGuide = {
  orientation: 'vertical' | 'horizontal';
  position: number;
  kind: 'scene-center' | 'object-align';
};
type RotateState = {
  objectId: string;
  sceneKind: SceneKind;
  pointerId: number;
  stageMockupId?: string;
  startObjectAngle: number;
  startPointerAngle: number;
  pointerAngleOffset: number;
  centerX: number;
  centerY: number;
};
type CanvasContextMenuState = {
  x: number;
  y: number;
  objectId: string;
  objectType: ObjectType;
};

type ToolDefinition = {
  key: ToolKey;
  label: string;
  hint: string;
};

type StudioObject = {
  id: string;
  name: string;
  type: ObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  locked?: boolean;
  visible?: boolean;
  text?: string;
  fill?: string;
  radius?: number;
  srcLabel?: string;
  imageSrc?: string;
  opacity?: number;
  rotation?: number;
  mockupProjectionPreset?: MockupProjectionPresetId;
  printInsetXRatio?: number;
  printInsetYRatio?: number;
  projectionCurveX?: number;
  projectionCurveY?: number;
  projectionDepth?: number;
  projectionSoftness?: number;
  librarySectionId?: string;
  libraryAssetId?: string;
  fontSize?: number;
  fontWeight?: 400 | 500 | 600 | 700;
  textAlign?: TextAlign;
  textColor?: string;
};

type StageObjectPlacement = Pick<StudioObject, 'x' | 'y' | 'width' | 'height' | 'rotation'>;
type StagePlacementMap = Record<string, Record<string, StageObjectPlacement>>;

type LibraryKind = 'mockup' | 'design';
type LibraryDrawerTab = 'mockups' | 'designs' | 'tools';

type LibrarySection = {
  id: string;
  name: string;
};

type LibraryAsset = {
  id: string;
  name: string;
  src: string;
  sectionId: string;
  kind: LibraryKind;
  linkedObjectId?: string;
  sourceLabel?: string;
};

type ProjectionTuning = {
  insetXRatio: number;
  insetYRatio: number;
  curveX: number;
  curveY: number;
  depth: number;
  softness: number;
};

type MockupProjectionPresetId = 'auto' | 'flat-front' | 'relaxed-front' | 'oversize-front' | 'hoodie-front' | 'sleeve-badge';

const MOCKUP_PROJECTION_PRESETS: Record<Exclude<MockupProjectionPresetId, 'auto'>, ProjectionTuning> = {
  'flat-front': {
    insetXRatio: 0.19,
    insetYRatio: 0.2,
    curveX: 1.4,
    curveY: -0.7,
    depth: 0.1,
    softness: 0.12
  },
  'relaxed-front': {
    insetXRatio: 0.2,
    insetYRatio: 0.22,
    curveX: 2.8,
    curveY: -1.2,
    depth: 0.16,
    softness: 0.2
  },
  'oversize-front': {
    insetXRatio: 0.17,
    insetYRatio: 0.19,
    curveX: 3.8,
    curveY: -1.5,
    depth: 0.22,
    softness: 0.24
  },
  'hoodie-front': {
    insetXRatio: 0.22,
    insetYRatio: 0.24,
    curveX: 3.4,
    curveY: -2.4,
    depth: 0.24,
    softness: 0.28
  },
  'sleeve-badge': {
    insetXRatio: 0.33,
    insetYRatio: 0.29,
    curveX: 5.8,
    curveY: -2.8,
    depth: 0.32,
    softness: 0.34
  }
};

const MOCKUP_PRESET_OPTIONS: Array<[MockupProjectionPresetId, string]> = [
  ['auto', 'Auto detect'],
  ['flat-front', 'Flat front'],
  ['relaxed-front', 'Relaxed front'],
  ['oversize-front', 'Oversize front'],
  ['hoodie-front', 'Hoodie front'],
  ['sleeve-badge', 'Sleeve badge']
];

type DragState = {
  objectId: string;
  sceneKind: SceneKind;
  pointerId: number;
  stageMockupId?: string;
  pointerOffsetX: number;
  pointerOffsetY: number;
  sceneLeft: number;
  sceneTop: number;
  sceneWidth: number;
  sceneHeight: number;
  sceneScaleX: number;
  sceneScaleY: number;
  coordinateSpace?: 'scene' | 'projected';
  printableX?: number;
  printableY?: number;
  printableWidth?: number;
  printableHeight?: number;
};

type ResizeState = {
  objectId: string;
  sceneKind: SceneKind;
  pointerId: number;
  stageMockupId?: string;
  handle: ResizeHandle;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  sceneWidth: number;
  sceneHeight: number;
  sceneScaleX: number;
  sceneScaleY: number;
  coordinateSpace?: 'scene' | 'projected';
  printableWidth?: number;
  printableHeight?: number;
};

const MIN_OBJECT_WIDTH = 72;
const MIN_OBJECT_HEIGHT = 64;
const MAX_HISTORY_ENTRIES = 50;
const SNAP_THRESHOLD = 18;
const SCENE_BASE_WIDTH = 640;
const SCENE_BASE_HEIGHT = 640;

const studioModes: Array<{ key: StudioMode; label: string; description: string }> = [
  { key: 'design', label: 'Design Mode', description: 'Canva benzeri düzenleme görünümü.' },
  { key: 'mockup', label: 'Mockup Mode', description: 'Tasarımı ürün yüzeyine oturtan görünüm.' },
  { key: 'split', label: 'Split Preview', description: 'Tasarım ve mockup sonucu yan yana görünür.' }
];

const tools: ToolDefinition[] = [
  { key: 'select', label: 'Seç', hint: 'Objeleri seç, odakla ve sahne durumunu izle.' },
  { key: 'text', label: 'Yazı', hint: 'Başlık, metin ve tipografi katmanları.' },
  { key: 'image', label: 'Görsel', hint: 'Yüklenen tasarımlar ve görseller.' },
  { key: 'shape', label: 'Şekil', hint: 'Arka plan blokları ve basit vektörler.' },
  { key: 'mockup', label: 'Mockup', hint: 'Ürün şablonu ve baskı alanı kontrolleri.' },
  { key: 'layers', label: 'Katman', hint: 'Katman sırası ve görünürlük yönetimi.' }
];

const objectSeed: StudioObject[] = [
  {
    id: 'object-mockup-1',
    name: 'Mockup Stage 1',
    type: 'mockup',
    x: 0,
    y: 0,
    width: SCENE_BASE_WIDTH,
    height: SCENE_BASE_HEIGHT,
    locked: false,
    srcLabel: 'Primary mockup surface',
    opacity: 1,
    rotation: 0,
    mockupProjectionPreset: 'relaxed-front',
    printInsetXRatio: 0.2,
    printInsetYRatio: 0.22,
    projectionCurveX: 2.8,
    projectionCurveY: -1.2,
    projectionDepth: 0.16,
    projectionSoftness: 0.2,
    visible: true
  }
];



type StudioSnapshot = {
  version: number;
  revision: number;
  savedAt: string;
  projectId: string | null;
  projectName: string;
  objects: StudioObject[];
  stagePlacements: StagePlacementMap;
  mockupSections: LibrarySection[];
  designSections: LibrarySection[];
  mockupAssets: LibraryAsset[];
  designAssets: LibraryAsset[];
  previewSelectedStageId: string | null;
};

function getSnapshotRank(snapshot: StudioSnapshot | null) {
  if (!snapshot) {
    return 0;
  }
  const revision = Number.isFinite(snapshot.revision) ? snapshot.revision : 0;
  if (revision > 0) {
    return revision;
  }
  const savedAt = new Date(snapshot.savedAt).getTime();
  return Number.isFinite(savedAt) ? savedAt : 0;
}

function compareSnapshotsByFreshness(left: StudioSnapshot, right: StudioSnapshot) {
  return getSnapshotRank(right) - getSnapshotRank(left);
}

type ProjectPublicRecord = {
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

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const STUDIO_DRAFT_DB_NAME = 'printra-studio';
const STUDIO_DRAFT_STORE_NAME = 'drafts';
const STUDIO_DRAFT_RECORD_ID = 'active-draft';
const STUDIO_LAST_GOOD_DRAFT_RECORD_ID = 'last-good-draft';
const STUDIO_PROJECT_DRAFT_KEY_PREFIX = 'project:';
const STUDIO_LOCAL_AUTOSAVE_DEBOUNCE_MS = 35;
const STUDIO_SERVER_AUTOSAVE_MIN_INTERVAL_MS = 3000;
let runtimeStudioSnapshot: StudioSnapshot | null = null;

function getProjectDraftRecordId(projectId: string | null | undefined) {
  return projectId ? `${STUDIO_PROJECT_DRAFT_KEY_PREFIX}${projectId}` : null;
}

function readRuntimeStudioSnapshot(projectId?: string | null) {
  if (!runtimeStudioSnapshot) {
    return null;
  }
  if (!projectId) {
    return runtimeStudioSnapshot;
  }
  return runtimeStudioSnapshot.projectId === projectId ? runtimeStudioSnapshot : null;
}

function writeRuntimeStudioSnapshot(snapshot: StudioSnapshot) {
  runtimeStudioSnapshot = {
    ...snapshot,
    objects: snapshot.objects.map((item) => ({ ...item })),
    mockupSections: snapshot.mockupSections.map((item) => ({ ...item })),
    designSections: snapshot.designSections.map((item) => ({ ...item })),
    mockupAssets: snapshot.mockupAssets.map((item) => ({ ...item })),
    designAssets: snapshot.designAssets.map((item) => ({ ...item })),
    stagePlacements: JSON.parse(JSON.stringify(snapshot.stagePlacements ?? {}))
  };
}

function scheduleStudioIdleWork(callback: () => void) {
  if (typeof window === 'undefined') {
    callback();
    return () => undefined;
  }

  const idleWindow = window as Window & typeof globalThis & {
    requestIdleCallback?: (handler: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (typeof idleWindow.requestIdleCallback === 'function') {
    const idleId = idleWindow.requestIdleCallback(() => callback(), { timeout: 1400 });
    return () => idleWindow.cancelIdleCallback?.(idleId);
  }

  const timeoutId = window.setTimeout(callback, 120);
  return () => window.clearTimeout(timeoutId);
}

function openStudioDraftDatabase(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  }

  const open = (version?: number) =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const request = version === undefined
        ? window.indexedDB.open(STUDIO_DRAFT_DB_NAME)
        : window.indexedDB.open(STUDIO_DRAFT_DB_NAME, version);
      request.onerror = () => reject(request.error ?? new Error('Studio draft database could not be opened.'));
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STUDIO_DRAFT_STORE_NAME)) {
          database.createObjectStore(STUDIO_DRAFT_STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
    });

  return open().then(async (db) => {
    if (db.objectStoreNames.contains(STUDIO_DRAFT_STORE_NAME)) {
      return db;
    }
    const nextVersion = Number(db.version || 1) + 1;
    db.close();
    return open(nextVersion);
  }).catch(async (error) => {
    const name = (error as DOMException | Error)?.name;
    if (name !== 'VersionError') {
      throw error;
    }
    const db = await open();
    if (db.objectStoreNames.contains(STUDIO_DRAFT_STORE_NAME)) {
      return db;
    }
    const nextVersion = Number(db.version || 1) + 1;
    db.close();
    return open(nextVersion);
  });
}

async function readStudioDraftFromIndexedDb(recordId: string = STUDIO_DRAFT_RECORD_ID): Promise<StudioSnapshot | null> {
  const database = await openStudioDraftDatabase();
  return await new Promise((resolve, reject) => {
    const transaction = database.transaction(STUDIO_DRAFT_STORE_NAME, 'readonly');
    const store = transaction.objectStore(STUDIO_DRAFT_STORE_NAME);
    const request = store.get(recordId);
    request.onerror = () => reject(request.error ?? new Error('Studio draft could not be read.'));
    request.onsuccess = () => resolve(sanitizeStudioSnapshot(request.result));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('Studio draft read transaction failed.'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error('Studio draft read transaction aborted.'));
    };
  });
}

async function writeStudioDraftToIndexedDb(snapshot: StudioSnapshot, recordId: string = STUDIO_DRAFT_RECORD_ID): Promise<void> {
  const database = await openStudioDraftDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STUDIO_DRAFT_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STUDIO_DRAFT_STORE_NAME);
    store.put(snapshot, recordId);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('Studio draft could not be written.'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error('Studio draft write transaction aborted.'));
    };
  });
}

async function readLocalStudioDraftCandidates(projectId?: string | null): Promise<StudioSnapshot[]> {
  const runtimeDraft = readRuntimeStudioSnapshot(projectId);
  if (typeof window === 'undefined') {
    return runtimeDraft ? [runtimeDraft] : [];
  }

  const lastProjectId = window.sessionStorage.getItem('printra-last-project-id');
  const scopedProjectId = projectId ?? lastProjectId ?? null;
  const recordIds = new Set<string>([STUDIO_DRAFT_RECORD_ID, STUDIO_LAST_GOOD_DRAFT_RECORD_ID]);
  const scopedRecordId = getProjectDraftRecordId(scopedProjectId);
  if (scopedRecordId) {
    recordIds.add(scopedRecordId);
  }

  const storedDrafts = await Promise.all(
    Array.from(recordIds).map((recordId) => readStudioDraftFromIndexedDb(recordId).catch(() => null))
  );

  return [runtimeDraft, ...storedDrafts]
    .filter((entry): entry is StudioSnapshot => Boolean(entry))
    .sort((left, right) => {
      const rightHasData = snapshotHasLibraryOrCanvasData(right) ? 1 : 0;
      const leftHasData = snapshotHasLibraryOrCanvasData(left) ? 1 : 0;
      if (rightHasData !== leftHasData) {
        return rightHasData - leftHasData;
      }
      if (projectId) {
        const rightMatchesProject = right.projectId === projectId ? 1 : 0;
        const leftMatchesProject = left.projectId === projectId ? 1 : 0;
        if (rightMatchesProject !== leftMatchesProject) {
          return rightMatchesProject - leftMatchesProject;
        }
      }
      return compareSnapshotsByFreshness(left, right);
    });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function persistStudioDraftSnapshot(snapshot: StudioSnapshot): Promise<void> {
  const persistableSnapshot = prepareSnapshotForPersistence(snapshot);
  const shouldSkipWrite = async (recordId: string) => {
    const current = await readStudioDraftFromIndexedDb(recordId).catch(() => null);
    if (!current) {
      return false;
    }
    if (getSnapshotRank(current) > getSnapshotRank(persistableSnapshot)) {
      return true;
    }
    const currentHasData = snapshotHasLibraryOrCanvasData(current);
    const nextHasData = snapshotHasLibraryOrCanvasData(persistableSnapshot);
    if (!currentHasData || nextHasData) {
      return false;
    }
    const currentTs = new Date(current.savedAt).getTime();
    const nextTs = new Date(persistableSnapshot.savedAt).getTime();
    return Number.isFinite(currentTs) && Number.isFinite(nextTs) && nextTs >= currentTs - 15_000;
  };

  const writes: Promise<void>[] = [];
  if (!(await shouldSkipWrite(STUDIO_DRAFT_RECORD_ID))) {
    writes.push(writeStudioDraftToIndexedDb(persistableSnapshot, STUDIO_DRAFT_RECORD_ID));
  }
  const projectRecordId = getProjectDraftRecordId(snapshot.projectId);
  if (projectRecordId) {
    if (!(await shouldSkipWrite(projectRecordId))) {
      writes.push(writeStudioDraftToIndexedDb(persistableSnapshot, projectRecordId));
    }
  }
  if (snapshotHasLibraryOrCanvasData(persistableSnapshot)) {
    if (!(await shouldSkipWrite(STUDIO_LAST_GOOD_DRAFT_RECORD_ID))) {
      writes.push(writeStudioDraftToIndexedDb(persistableSnapshot, STUDIO_LAST_GOOD_DRAFT_RECORD_ID));
    }
  }
  if (!writes.length) {
    return;
  }
  await Promise.all(writes);
}

async function normalizeDesignImageDataUrl(dataUrl: string): Promise<string> {
  if (typeof document === 'undefined') {
    return dataUrl;
  }

  try {
    const image = await loadImageElement(dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return dataUrl;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const sampleSize = Math.max(4, Math.min(24, Math.floor(Math.min(canvas.width, canvas.height) * 0.08)));
    let matteR = 0;
    let matteG = 0;
    let matteB = 0;
    let matteA = 0;
    let matteCount = 0;

    const sampleCorner = (startX: number, startY: number) => {
      for (let y = startY; y < startY + sampleSize; y += 1) {
        for (let x = startX; x < startX + sampleSize; x += 1) {
          const index = (y * canvas.width + x) * 4;
          matteR += pixels[index];
          matteG += pixels[index + 1];
          matteB += pixels[index + 2];
          matteA += pixels[index + 3];
          matteCount += 1;
        }
      }
    };

    sampleCorner(0, 0);
    sampleCorner(Math.max(0, canvas.width - sampleSize), 0);
    sampleCorner(0, Math.max(0, canvas.height - sampleSize));
    sampleCorner(Math.max(0, canvas.width - sampleSize), Math.max(0, canvas.height - sampleSize));

    const avgR = matteCount ? matteR / matteCount : 0;
    const avgG = matteCount ? matteG / matteCount : 0;
    const avgB = matteCount ? matteB / matteCount : 0;
    const avgA = matteCount ? matteA / matteCount : 0;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      const delta =
        Math.abs(pixels[index] - avgR) +
        Math.abs(pixels[index + 1] - avgG) +
        Math.abs(pixels[index + 2] - avgB);
      const matchesCornerMatte = delta < 42 && alpha <= Math.max(180, avgA + 18);
      if (alpha < 36 || matchesCornerMatte) {
        pixels[index + 3] = 0;
        continue;
      }
      const pixelIndex = index / 4;
      const x = pixelIndex % canvas.width;
      const y = Math.floor(pixelIndex / canvas.width);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return dataUrl;
  }
}

function buildStudioSnapshot(input: {
  projectId: string | null;
  projectName: string;
  objects: StudioObject[];
  stagePlacements: StagePlacementMap;
  mockupSections: LibrarySection[];
  designSections: LibrarySection[];
  mockupAssets: LibraryAsset[];
  designAssets: LibraryAsset[];
  previewSelectedStageId: string | null;
}): StudioSnapshot {
  return {
    version: 1,
    revision: Date.now(),
    savedAt: new Date().toISOString(),
    projectId: input.projectId,
    projectName: input.projectName,
    objects: input.objects,
    stagePlacements: input.stagePlacements,
    mockupSections: input.mockupSections,
    designSections: input.designSections,
    mockupAssets: input.mockupAssets,
    designAssets: input.designAssets,
    previewSelectedStageId: input.previewSelectedStageId
  };
}

function sanitizeStudioSnapshot(raw: unknown): StudioSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Partial<StudioSnapshot>;
  const objects = Array.isArray(source.objects)
    ? source.objects.filter((entry) => entry && typeof entry === 'object') as StudioObject[]
    : null;
  const resolvedObjects = objects?.length ? objects : objectSeed;
  return {
    version: 1,
    revision: typeof source.revision === 'number' && Number.isFinite(source.revision) ? source.revision : 0,
    savedAt: typeof source.savedAt === 'string' ? source.savedAt : new Date().toISOString(),
    projectId: typeof source.projectId === 'string' && source.projectId.trim() ? source.projectId : null,
    projectName: typeof source.projectName === 'string' ? source.projectName : 'Untitled project',
    objects: resolvedObjects,
    stagePlacements: source.stagePlacements && typeof source.stagePlacements === 'object' ? source.stagePlacements as StagePlacementMap : {},
    mockupSections: Array.isArray(source.mockupSections) && source.mockupSections.length ? source.mockupSections as LibrarySection[] : [{ id: 'mockup-section-default', name: 'Genel Mockups' }],
    designSections: Array.isArray(source.designSections) && source.designSections.length ? source.designSections as LibrarySection[] : [{ id: 'design-section-default', name: 'Genel Designs' }],
    mockupAssets: Array.isArray(source.mockupAssets) ? source.mockupAssets as LibraryAsset[] : [],
    designAssets: Array.isArray(source.designAssets) ? source.designAssets as LibraryAsset[] : [],
    previewSelectedStageId: typeof source.previewSelectedStageId === 'string' ? source.previewSelectedStageId : null
  };
}

function restoreStudioSnapshot(snapshot: StudioSnapshot, actions: {
  setObjects: (value: StudioObject[]) => void;
  setStagePlacements: (value: StagePlacementMap) => void;
  stagePlacementsRef: { current: StagePlacementMap };
  setMockupSections: (value: LibrarySection[]) => void;
  setDesignSections: (value: LibrarySection[]) => void;
  setMockupAssets: (value: LibraryAsset[]) => void;
  setDesignAssets: (value: LibraryAsset[]) => void;
  setPreviewSelectedStageId: (value: string | null) => void;
  setDesignSelectedObjectId: (value: string) => void;
  setPreviewSelectedObjectId: (value: string) => void;
  setSelectionOwner: (value: SceneKind) => void;
  setHasPreviewSelection: (value: boolean) => void;
  setHasDesignSelection: (value: boolean) => void;
}) {
  const assetSrcById = new Map<string, string>();
  for (const asset of snapshot.designAssets ?? []) {
    if (asset.id && asset.src) {
      assetSrcById.set(asset.id, asset.src);
    }
  }
  for (const asset of snapshot.mockupAssets ?? []) {
    if (asset.id && asset.src) {
      assetSrcById.set(asset.id, asset.src);
    }
  }

  const hydratedObjects = snapshot.objects.map((item) => {
    if (item.imageSrc || !item.libraryAssetId) {
      return item;
    }
    const resolvedSrc = assetSrcById.get(item.libraryAssetId);
    if (!resolvedSrc) {
      return item;
    }
    return {
      ...item,
      imageSrc: resolvedSrc
    };
  });

  const visibleMockup = hydratedObjects.find((item) => item.type === 'mockup') ?? hydratedObjects[0];
  const visibleDesign = hydratedObjects.find((item) => item.type !== 'mockup') ?? visibleMockup;
  actions.setObjects(hydratedObjects);
  actions.setStagePlacements(snapshot.stagePlacements ?? {});
  actions.stagePlacementsRef.current = snapshot.stagePlacements ?? {};
  actions.setMockupSections(snapshot.mockupSections?.length ? snapshot.mockupSections : [{ id: 'mockup-section-default', name: 'Genel Mockups' }]);
  actions.setDesignSections(snapshot.designSections?.length ? snapshot.designSections : [{ id: 'design-section-default', name: 'Genel Designs' }]);
  actions.setMockupAssets(snapshot.mockupAssets ?? []);
  actions.setDesignAssets(snapshot.designAssets ?? []);
  actions.setPreviewSelectedStageId(snapshot.previewSelectedStageId ?? visibleMockup?.id ?? null);
  actions.setDesignSelectedObjectId(visibleDesign?.id ?? hydratedObjects[0].id);
  actions.setPreviewSelectedObjectId(visibleMockup?.id ?? hydratedObjects[0].id);
  actions.setSelectionOwner(visibleMockup?.type === 'mockup' ? 'preview' : 'design');
  actions.setHasPreviewSelection(true);
  actions.setHasDesignSelection(Boolean(visibleDesign && visibleDesign.type !== 'mockup'));
}

async function fetchProjectDetail(projectId: string): Promise<{ project: ProjectPublicRecord; studioState: StudioSnapshot | null }> {
  const response = await fetch(`${API_BASE}/projects/${projectId}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Saved project could not be loaded.');
  const payload = await response.json();
  return {
    project: payload.project as ProjectPublicRecord,
    studioState: sanitizeStudioSnapshot(payload.studioState)
  };
}

async function createProjectFromStudio(payload: { name: string; description: string; tags: string[] }) {
  const response = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error('Project could not be created from Studio.');
  const result = await response.json();
  return result.project as ProjectPublicRecord;
}

class ProjectRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ProjectRequestError';
    this.status = status;
  }
}

async function readProjectRequestError(response: Response, fallbackMessage: string) {
  let message = fallbackMessage;
  try {
    const payload = await response.json();
    if (payload && typeof payload.error === 'string' && payload.error.trim()) {
      message = payload.error.trim();
    }
  } catch {
    // ignore invalid error payloads
  }
  return new ProjectRequestError(message, response.status);
}

async function patchProjectRecord(projectId: string, payload: Partial<Pick<ProjectPublicRecord, 'name' | 'description' | 'tags' | 'status'>>) {
  const response = await fetch(`${API_BASE}/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw await readProjectRequestError(response, 'Project details could not be updated.');
  const result = await response.json();
  return result.project as ProjectPublicRecord;
}

async function saveStudioStateToProject(projectId: string, studioState: StudioSnapshot) {
  const response = await fetch(`${API_BASE}/projects/${projectId}/studio-state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studioState })
  });
  if (!response.ok) throw await readProjectRequestError(response, 'Studio scene could not be saved.');
  const result = await response.json();
  return result.project as ProjectPublicRecord;
}

const toolCards: Record<ToolKey, { title: string; summary: string; bullets: string[] }> = {
  select: {
    title: 'Selection lane active',
    summary: 'Bu görünüm Studio çekirdeğinin seçim ve bağlam omurgasını gerçek obje state ile sabitler.',
    bullets: ['Canvas içindeki kartlar tıklanabilir.', 'Seçili obje state ve layer listesi aynı kaynağı paylaşır.', 'Sağ panel seçili objeye göre canlı güncellenir.']
  },
  text: {
    title: 'Typography object lane',
    summary: 'Text object artık statik açıklama değil; gerçek obje listesinde yaşayan bir kayıt durumunda.',
    bullets: ['Text nesnesi canvas üstünde görünür.', 'Seçildiğinde inspector tipografi odaklı görünür.', 'Sonraki katmanda inline edit ve font kontrolleri eklenebilir.']
  },
  image: {
    title: 'Image object lane',
    summary: 'Görsel nesnesi için ilk object modeli, boyutları ve bağlam kartı gerçek state üzerinde çalışır.',
    bullets: ['Image nesnesi layer ile eşleşir.', 'Seçildiğinde kaynak etiketi ve boyut bilgisi görünür.', 'Sonraki katmanda upload/crop akışı bağlanabilir.']
  },
  shape: {
    title: 'Shape object lane',
    summary: 'Şekil nesnesi dolgu, yarıçap ve opaklık gibi temel alanlarıyla gerçek modelde tutulur.',
    bullets: ['Shape objesi canvas içinde seçilebilir.', 'Inspector dolgu ve radius bilgisini gösterir.', 'Sonraki katmanda resize ve style edit eklenebilir.']
  },
  mockup: {
    title: 'Mockup object lane',
    summary: 'Mockup artık ayrı açıklama değil; sahnede kilitli bir obje olarak görünür ve seçim sistemine katılır.',
    bullets: ['Mockup katmanı kilitli olarak ayrışır.', 'Placement notu sağ panelde görünür.', 'Sonraki katmanda gerçek baskı alanı ve surface mapper bağlanabilir.']
  },
  layers: {
    title: 'Layer lane active',
    summary: 'Katman paneli artık doğrudan obje listesine bağlı ve seçimler çift yönlü senkron durumdadır.',
    bullets: ['Layer listesi object state üzerinden üretilir.', 'Canvas ve layer seçimleri birbirini günceller.', 'Kilitli objeler katman panelinde açıkça ayrışır.']
  }
};

export function StudioWorkspace() {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const requestedProjectId = searchParams.get('projectId');
  const [mode] = useState<StudioMode>('mockup');
  const [activeTool, setActiveTool] = useState<ToolKey>('select');
  const [objects, setObjects] = useState<StudioObject[]>(objectSeed);
  const [designSelectedObjectId, setDesignSelectedObjectId] = useState<string>(objectSeed[0].id);
  const [previewSelectedObjectId, setPreviewSelectedObjectId] = useState<string>(objectSeed[0].id);
  const [selectionOwner, setSelectionOwner] = useState<SceneKind>('preview');
  const [hasDesignSelection, setHasDesignSelection] = useState(false);
  const [hasPreviewSelection, setHasPreviewSelection] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('properties');
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [rotateState, setRotateState] = useState<RotateState | null>(null);
  const [historyDepth, setHistoryDepth] = useState(0);
  const [futureDepth, setFutureDepth] = useState(0);
  const [inlineTextEditId, setInlineTextEditId] = useState<string | null>(null);
  const [inlineTextDraft, setInlineTextDraft] = useState('');
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const historyRef = useRef<StudioObject[][]>([]);
  const futureRef = useRef<StudioObject[][]>([]);
  const objectsRef = useRef<StudioObject[]>(objectSeed);
  const uploadImageInputRef = useRef<HTMLInputElement | null>(null);
  const replaceImageInputRef = useRef<HTMLInputElement | null>(null);
  const uploadMockupInputRef = useRef<HTMLInputElement | null>(null);
  const [stagePlacements, setStagePlacements] = useState<StagePlacementMap>({});
  const stagePlacementsRef = useRef<StagePlacementMap>({});
  const [previewSelectedStageId, setPreviewSelectedStageId] = useState<string | null>(objectSeed[0].id);
  const [commandBarOpen, setCommandBarOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportFormats, setExportFormats] = useState<Record<ExportFormat, boolean>>({ png: true, jpg: false, pdf: false });
  const [exportTransparentPng, setExportTransparentPng] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [exportMessage, setExportMessage] = useState('');
  const [mockupSections, setMockupSections] = useState<LibrarySection[]>([{ id: 'mockup-section-default', name: 'Genel Mockups' }]);
  const [designSections, setDesignSections] = useState<LibrarySection[]>([{ id: 'design-section-default', name: 'Genel Designs' }]);
  const [mockupAssets, setMockupAssets] = useState<LibraryAsset[]>([]);
  const [designAssets, setDesignAssets] = useState<LibraryAsset[]>([]);
  const [selectedMockupAssetIds, setSelectedMockupAssetIds] = useState<string[]>([]);
  const [selectedDesignAssetIds, setSelectedDesignAssetIds] = useState<string[]>([]);
  const [mockupSectionDraft, setMockupSectionDraft] = useState('');
  const [designSectionDraft, setDesignSectionDraft] = useState('');
  const [openLibraryMenu, setOpenLibraryMenu] = useState<string | null>(null);
  const [openMockupSectionId, setOpenMockupSectionId] = useState<string>('mockup-section-default');
  const [openDesignSectionId, setOpenDesignSectionId] = useState<string>('design-section-default');
  const [activeLibraryDrawerTab, setActiveLibraryDrawerTab] = useState<LibraryDrawerTab>('mockups');
  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);
  const [canvasContextMenu, setCanvasContextMenu] = useState<CanvasContextMenuState | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(requestedProjectId);
  const [projectNameDraft, setProjectNameDraft] = useState('Untitled project');
  const [projectDescriptionDraft, setProjectDescriptionDraft] = useState('');
  const [projectSaveState, setProjectSaveState] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('idle');
  const [projectSaveMessage, setProjectSaveMessage] = useState('Studio draft is local until you save it to Projects.');
  const [hydrationReady, setHydrationReady] = useState(false);
  const [canPersistDraft, setCanPersistDraft] = useState(false);
  const [commandBarPortalHost, setCommandBarPortalHost] = useState<HTMLElement | null>(null);
  const libraryMockupUploadRef = useRef<HTMLInputElement | null>(null);
  const libraryDesignUploadRef = useRef<HTMLInputElement | null>(null);
  const pendingMockupSectionIdRef = useRef<string>('mockup-section-default');
  const pendingDesignSectionIdRef = useRef<string>('design-section-default');
  const draftSnapshotRef = useRef<StudioSnapshot | null>(null);
  const normalizedDesignAssetSrcRef = useRef<Record<string, string>>({});
  const stagePlacementRafRef = useRef<number | null>(null);
  const autoProjectCreateInFlightRef = useRef(false);
  const serverAutosaveInFlightRef = useRef(false);
  const lastServerAutosaveAtRef = useRef(0);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());

  const syncHistoryMeta = useCallback(() => {
    setHistoryDepth(historyRef.current.length);
    setFutureDepth(futureRef.current.length);
  }, []);

  const cloneObjects = useCallback((items: StudioObject[]) => items.map((item) => ({ ...item })), []);
  const enqueueDraftPersist = useCallback((snapshot: StudioSnapshot) => {
    const task = async () => {
      await persistStudioDraftSnapshot(snapshot);
    };
    const queued = persistQueueRef.current.then(task, task);
    persistQueueRef.current = queued.then(() => undefined, () => undefined);
    return queued;
  }, []);

  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  useEffect(() => {
    stagePlacementsRef.current = stagePlacements;
  }, [stagePlacements]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const applyHashState = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'mockups') {
        startTransition(() => {
          setActiveLibraryDrawerTab('mockups');
          setLibraryPanelOpen(true);
        });
      } else if (hash === 'designs') {
        startTransition(() => {
          setActiveLibraryDrawerTab('designs');
          setLibraryPanelOpen(true);
        });
      } else if (hash === 'tools') {
        startTransition(() => {
          setActiveLibraryDrawerTab('tools');
          setLibraryPanelOpen(true);
        });
      }
    };

    const handlePanelToggle = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: LibraryDrawerTab; sameTab?: boolean }>).detail;
      const tab = detail?.tab;
      if (!tab) {
        return;
      }

      startTransition(() => {
        setActiveLibraryDrawerTab(tab);
        setLibraryPanelOpen((current) => (detail?.sameTab && current ? false : true));
      });
    };

    applyHashState();
    window.addEventListener('hashchange', applyHashState);
    window.addEventListener('printra:studio-panel-toggle', handlePanelToggle as EventListener);
    return () => {
      window.removeEventListener('hashchange', applyHashState);
      window.removeEventListener('printra:studio-panel-toggle', handlePanelToggle as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!canvasContextMenu) return;
    const closeMenu = () => setCanvasContextMenu(null);
    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [canvasContextMenu]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const host = document.getElementById('studio-command-bar-slot');
    if (host !== commandBarPortalHost) {
      setCommandBarPortalHost(host);
    }
  });

  useEffect(() => {
    let cancelled = false;

    async function hydrateStudio() {
      setHydrationReady(false);
      setCanPersistDraft(false);
      setProjectSaveState(requestedProjectId ? 'loading' : 'idle');
      try {
        if (requestedProjectId) {
          const detail = await fetchProjectDetail(requestedProjectId);
          if (cancelled) return;
          setCurrentProjectId(detail.project.id);
          setProjectNameDraft(detail.project.name);
          setProjectDescriptionDraft(detail.project.description ?? '');
          const localDraftCandidates = await readLocalStudioDraftCandidates(detail.project.id);
          const newestLocalDraft = localDraftCandidates[0] ?? null;
          const localDraftForProject = localDraftCandidates.find((entry) => entry.projectId === detail.project.id) ?? null;
          const shouldPreferLocalDraft =
            !!localDraftForProject &&
            (!detail.studioState ||
              new Date(localDraftForProject.savedAt).getTime() >= new Date(detail.studioState.savedAt).getTime());
          const fallbackToAnyRecentLocalDraft =
            !localDraftForProject &&
            snapshotHasLibraryOrCanvasData(newestLocalDraft) &&
            !snapshotHasLibraryOrCanvasData(detail.studioState);
          const snapshotToRestore = shouldPreferLocalDraft
            ? localDraftForProject
            : fallbackToAnyRecentLocalDraft
              ? newestLocalDraft
              : detail.studioState;

          if (snapshotToRestore) {
            restoreStudioSnapshot(snapshotToRestore, {
              setObjects,
              setStagePlacements,
              stagePlacementsRef,
              setMockupSections,
              setDesignSections,
              setMockupAssets,
              setDesignAssets,
              setPreviewSelectedStageId,
              setDesignSelectedObjectId,
              setPreviewSelectedObjectId,
              setSelectionOwner,
              setHasPreviewSelection,
              setHasDesignSelection
            });
            historyRef.current = [];
            futureRef.current = [];
            syncHistoryMeta();
            if (shouldPreferLocalDraft) {
              setProjectSaveMessage(`Loaded newer local Studio draft · ${detail.project.name}`);
              setProjectSaveState('idle');
              setCanPersistDraft(true);
              return;
            }
            setProjectSaveMessage(`Loaded project · ${detail.project.name}`);
            if (fallbackToAnyRecentLocalDraft) {
              setProjectSaveMessage(`Recovered your latest local Studio draft to prevent data loss · ${detail.project.name}`);
              setProjectSaveState('idle');
              setCanPersistDraft(true);
              return;
            }
            setProjectSaveState('saved');
            setCanPersistDraft(true);
          } else {
            setProjectSaveMessage(`Project loaded · ${detail.project.name}. Save a Studio scene to attach canvas data.`);
            setProjectSaveState('idle');
            setCanPersistDraft(true);
          }
          return;
        }

        if (typeof window !== 'undefined') {
          const draftCandidates = await readLocalStudioDraftCandidates();
          const draftToRestore = draftCandidates.find((entry) => snapshotHasLibraryOrCanvasData(entry)) ?? draftCandidates[0] ?? null;
          if (cancelled) return;
          if (draftToRestore) {
            restoreStudioSnapshot(draftToRestore, {
              setObjects,
              setStagePlacements,
              stagePlacementsRef,
              setMockupSections,
              setDesignSections,
              setMockupAssets,
              setDesignAssets,
              setPreviewSelectedStageId,
              setDesignSelectedObjectId,
              setPreviewSelectedObjectId,
              setSelectionOwner,
              setHasPreviewSelection,
              setHasDesignSelection
            });
            setCurrentProjectId(draftToRestore.projectId);
            setProjectNameDraft(draftToRestore.projectName || 'Untitled project');
            setProjectSaveMessage(draftToRestore.projectId ? 'Recovered local Studio draft linked to a saved project.' : 'Recovered unsaved local Studio draft.');
            setProjectSaveState('idle');
            setCanPersistDraft(true);
          }
        }
        setCanPersistDraft(true);
      } catch (error) {
        if (!cancelled) {
          const draftCandidates = typeof window !== 'undefined' ? await readLocalStudioDraftCandidates() : [];
          const draftToRestore = draftCandidates.find((entry) => snapshotHasLibraryOrCanvasData(entry)) ?? draftCandidates[0] ?? null;
          if (draftToRestore) {
            restoreStudioSnapshot(draftToRestore, {
              setObjects,
              setStagePlacements,
              stagePlacementsRef,
              setMockupSections,
              setDesignSections,
              setMockupAssets,
              setDesignAssets,
              setPreviewSelectedStageId,
              setDesignSelectedObjectId,
              setPreviewSelectedObjectId,
              setSelectionOwner,
              setHasPreviewSelection,
              setHasDesignSelection
            });
            setCurrentProjectId(draftToRestore.projectId);
            setProjectNameDraft(draftToRestore.projectName || 'Untitled project');
            setProjectSaveState('idle');
            setProjectSaveMessage('API hydrate failed, local Studio draft restored.');
            setCanPersistDraft(true);
          } else {
            setProjectSaveState('error');
            setProjectSaveMessage(error instanceof Error ? error.message : 'Studio state could not be restored.');
            setCanPersistDraft(false);
          }
        }
      } finally {
        if (!cancelled) setHydrationReady(true);
      }
    }

    void hydrateStudio();
    return () => {
      cancelled = true;
    };
  }, [requestedProjectId, syncHistoryMeta]);

  const pushHistorySnapshot = useCallback(
    (snapshot: StudioObject[] = objectsRef.current) => {
      historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY_ENTRIES - 1)), cloneObjects(snapshot)];
      futureRef.current = [];
      syncHistoryMeta();
    },
    [cloneObjects, syncHistoryMeta]
  );

  const commitObjects = useCallback(
    (updater: (current: StudioObject[]) => StudioObject[], options?: { recordHistory?: boolean }) => {
      const current = objectsRef.current;
      if (options?.recordHistory) {
        pushHistorySnapshot(current);
      }

      const next = updater(current);
      objectsRef.current = next;
      setObjects(next);
    },
    [pushHistorySnapshot]
  );


  const readStagePlacement = useCallback(
    (stageMockupId: string | undefined, object: StudioObject): StudioObject => {
      if (!stageMockupId || object.type === 'mockup') {
        return object;
      }
      const placement = stagePlacementsRef.current[stageMockupId]?.[object.id];
      return placement ? { ...object, ...placement } : object;
    },
    []
  );

  const writeStagePlacement = useCallback((stageMockupId: string | undefined, objectId: string, placement: StageObjectPlacement) => {
    if (!stageMockupId) {
      return;
    }
    stagePlacementsRef.current = {
      ...stagePlacementsRef.current,
      [stageMockupId]: {
        ...(stagePlacementsRef.current[stageMockupId] ?? {}),
        [objectId]: placement
      }
    };
    if (typeof window === 'undefined') {
      setStagePlacements(stagePlacementsRef.current);
      return;
    }
    if (stagePlacementRafRef.current !== null) {
      return;
    }
    stagePlacementRafRef.current = window.requestAnimationFrame(() => {
      stagePlacementRafRef.current = null;
      setStagePlacements(stagePlacementsRef.current);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (stagePlacementRafRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(stagePlacementRafRef.current);
      }
    };
  }, []);

  const clearInteractions = useCallback(() => {
    setDragState(null);
    setResizeState(null);
    setRotateState(null);
    setSnapGuides([]);
  }, []);

  const restoreObjectsSnapshot = useCallback(
    (snapshot: StudioObject[]) => {
      const next = cloneObjects(snapshot);
      objectsRef.current = next;
      setObjects(next);

      const preferred =
        next.find((item) => item.id === designSelectedObjectId && item.visible !== false) ??
        next.find((item) => item.visible !== false) ??
        next[0];
      if (preferred) {
        setDesignSelectedObjectId(preferred.id);
        setPreviewSelectedObjectId(preferred.id);
        setPreviewSelectedStageId(preferred.type === 'mockup' ? preferred.id : previewSelectedStageId);
        setSelectionOwner('preview');
        setHasDesignSelection(false);
        setHasPreviewSelection(false);
        setActiveTool(resolveToolFromObject(preferred.type));
      }
    },
    [cloneObjects, designSelectedObjectId, previewSelectedStageId]
  );

  const undo = useCallback(() => {
    const previous = historyRef.current.at(-1);
    if (!previous) {
      return;
    }

    futureRef.current = [cloneObjects(objectsRef.current), ...futureRef.current].slice(0, MAX_HISTORY_ENTRIES);
    historyRef.current = historyRef.current.slice(0, -1);
    restoreObjectsSnapshot(previous);
    syncHistoryMeta();
  }, [cloneObjects, restoreObjectsSnapshot, syncHistoryMeta]);

  const redo = useCallback(() => {
    const nextSnapshot = futureRef.current[0];
    if (!nextSnapshot) {
      return;
    }

    historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY_ENTRIES - 1)), cloneObjects(objectsRef.current)];
    futureRef.current = futureRef.current.slice(1);
    restoreObjectsSnapshot(nextSnapshot);
    syncHistoryMeta();
  }, [cloneObjects, restoreObjectsSnapshot, syncHistoryMeta]);

  const activeObjectId = selectionOwner === 'preview' ? previewSelectedObjectId : designSelectedObjectId;
  const activeGuideScene = dragState?.sceneKind ?? null;
  const activeObject = useMemo(() => objects.find((item) => item.id === activeObjectId) ?? objects[0], [activeObjectId, objects]);
  const canEditActiveObjectGeometry = activeObject.type !== 'mockup' || selectionOwner === 'preview';
  const activeCard = toolCards[activeTool];
  const currentMode = studioModes.find((entry) => entry.key === mode) ?? studioModes[0];
  const objectCount = objects.length;
  const visibleObjects = useMemo(() => objects.filter((item) => item.visible !== false), [objects]);
  const visibleMockupObjects = useMemo(() => visibleObjects.filter((item) => item.type === 'mockup'), [visibleObjects]);
  const deferredMockupAssets = useDeferredValue(mockupAssets);
  const deferredDesignAssets = useDeferredValue(designAssets);
  const visibleImageCount = useMemo(() => visibleObjects.reduce((count, item) => count + (item.type === 'image' ? 1 : 0), 0), [visibleObjects]);
  const mockupAssetsBySection = useMemo(() => {
    const grouped = new Map<string, LibraryAsset[]>();
    for (const asset of deferredMockupAssets) {
      const current = grouped.get(asset.sectionId);
      if (current) current.push(asset);
      else grouped.set(asset.sectionId, [asset]);
    }
    return grouped;
  }, [deferredMockupAssets]);
  const designAssetsBySection = useMemo(() => {
    const grouped = new Map<string, LibraryAsset[]>();
    for (const asset of deferredDesignAssets) {
      const current = grouped.get(asset.sectionId);
      if (current) current.push(asset);
      else grouped.set(asset.sectionId, [asset]);
    }
    return grouped;
  }, [deferredDesignAssets]);
  const studioSnapshot = useMemo(() => buildStudioSnapshot({
    projectId: currentProjectId,
    projectName: projectNameDraft.trim() || 'Untitled project',
    objects,
    stagePlacements,
    mockupSections,
    designSections,
    mockupAssets,
    designAssets,
    previewSelectedStageId
  }), [currentProjectId, projectNameDraft, objects, stagePlacements, mockupSections, designSections, mockupAssets, designAssets, previewSelectedStageId]);
  const isInteracting = Boolean(dragState || resizeState || rotateState);

  useEffect(() => {
    draftSnapshotRef.current = studioSnapshot;
    writeRuntimeStudioSnapshot(studioSnapshot);
  }, [studioSnapshot]);

  useEffect(() => {
    if (typeof window === 'undefined' || !currentProjectId) {
      return;
    }
    window.sessionStorage.setItem('printra-last-project-id', currentProjectId);
  }, [currentProjectId]);

  const libraryDrawerTitle = activeLibraryDrawerTab === 'mockups' ? 'Mockup Library' : activeLibraryDrawerTab === 'designs' ? 'Design Library' : 'Studio Tools';
  const libraryDrawerDescription = activeLibraryDrawerTab === 'mockups'
    ? t('studioMockupLibraryDesc')
    : activeLibraryDrawerTab === 'designs'
      ? t('studioDesignLibraryDesc')
      : t('studioToolsLibraryDesc');

  useEffect(() => {
    if (!hydrationReady || !canPersistDraft || typeof window === 'undefined') {
      return;
    }
    if (isInteracting) {
      return;
    }
    let cancelled = false;
    const persistTimer = window.setTimeout(() => {
      void (async () => {
        try {
          const nowIso = new Date().toISOString();
          let snapshotToPersist = { ...studioSnapshot, savedAt: nowIso, revision: Date.now() };
          await enqueueDraftPersist(snapshotToPersist);

          const hasStudioData = snapshotHasLibraryOrCanvasData(snapshotToPersist);
          let resolvedProjectId = currentProjectId;

          if (!resolvedProjectId && hasStudioData && !autoProjectCreateInFlightRef.current) {
            autoProjectCreateInFlightRef.current = true;
            try {
              const created = await createProjectFromStudio({
                name: projectNameDraft.trim() || `Studio Draft ${new Date().toLocaleDateString('tr-TR')}`,
                description: projectDescriptionDraft.trim(),
                tags: ['studio', 'autosave']
              });
              if (!cancelled) {
                resolvedProjectId = created.id;
                setCurrentProjectId(created.id);
                setProjectNameDraft(created.name);
                setProjectDescriptionDraft(created.description ?? '');
                window.sessionStorage.setItem('printra-last-project-id', created.id);
                window.dispatchEvent(new CustomEvent('printra:project-saved', { detail: { projectId: created.id } }));
              }
            } finally {
              autoProjectCreateInFlightRef.current = false;
            }
          }

          const now = Date.now();
          const shouldServerAutosave =
            Boolean(resolvedProjectId && hasStudioData) &&
            !serverAutosaveInFlightRef.current &&
            now - lastServerAutosaveAtRef.current > STUDIO_SERVER_AUTOSAVE_MIN_INTERVAL_MS;
          if (shouldServerAutosave && resolvedProjectId) {
            serverAutosaveInFlightRef.current = true;
            try {
              const serverSnapshot = {
                ...snapshotToPersist,
                projectId: resolvedProjectId,
                projectName: projectNameDraft.trim() || snapshotToPersist.projectName,
                savedAt: new Date().toISOString(),
                revision: Date.now()
              };
              await saveStudioStateToProject(resolvedProjectId, serverSnapshot);
              await enqueueDraftPersist(serverSnapshot);
              lastServerAutosaveAtRef.current = Date.now();
              snapshotToPersist = serverSnapshot;
            } finally {
              serverAutosaveInFlightRef.current = false;
            }
          }

          if (cancelled) return;
          setProjectSaveMessage(
            snapshotToPersist.projectId
              ? 'Studio autosave is active (local + project).'
              : 'Studio draft is stored locally.'
          );
          setProjectSaveState((current) => (current === 'saved' ? 'idle' : current));
        } catch (error) {
          if (cancelled) return;
          setProjectSaveState('error');
          setProjectSaveMessage(error instanceof Error ? error.message : 'Studio draft could not be stored locally.');
        }
      })();
    }, STUDIO_LOCAL_AUTOSAVE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(persistTimer);
    };
  }, [hydrationReady, canPersistDraft, studioSnapshot, currentProjectId, projectNameDraft, projectDescriptionDraft, isInteracting, enqueueDraftPersist]);

  useEffect(() => {
    if (!hydrationReady || !canPersistDraft || typeof window === 'undefined') {
      return;
    }

    const flushDraft = () => {
      const snapshot = draftSnapshotRef.current;
      if (!snapshot) {
        return;
      }
      void enqueueDraftPersist({ ...snapshot, savedAt: new Date().toISOString(), revision: Date.now() }).catch(() => undefined);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushDraft();
      }
    };

    window.addEventListener('pagehide', flushDraft);
    window.addEventListener('beforeunload', flushDraft);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      flushDraft();
      window.removeEventListener('pagehide', flushDraft);
      window.removeEventListener('beforeunload', flushDraft);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hydrationReady, canPersistDraft, enqueueDraftPersist]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const flush = async () => {
      const snapshot = draftSnapshotRef.current;
      if (!snapshot || !canPersistDraft) {
        return;
      }
      await enqueueDraftPersist({ ...snapshot, savedAt: new Date().toISOString(), revision: Date.now() });
    };
    (window as Window & { __printraFlushStudioDraft?: () => Promise<void> }).__printraFlushStudioDraft = flush;
    return () => {
      const typedWindow = window as Window & { __printraFlushStudioDraft?: () => Promise<void> };
      if (typedWindow.__printraFlushStudioDraft === flush) {
        delete typedWindow.__printraFlushStudioDraft;
      }
    };
  }, [canPersistDraft, enqueueDraftPersist]);

  useEffect(() => {
    if (!hydrationReady || !canPersistDraft || typeof document === 'undefined') {
      return;
    }

    const flushDraftOnNavigationClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a[href]');
      if (!anchor) {
        return;
      }
      const href = anchor.getAttribute('href') ?? '';
      if (!href || href.startsWith('#')) {
        return;
      }
      const snapshot = draftSnapshotRef.current;
      if (!snapshot) {
        return;
      }
      void enqueueDraftPersist({ ...snapshot, savedAt: new Date().toISOString(), revision: Date.now() }).catch(() => undefined);
    };

    document.addEventListener('click', flushDraftOnNavigationClick, true);
    return () => {
      document.removeEventListener('click', flushDraftOnNavigationClick, true);
    };
  }, [hydrationReady, canPersistDraft, enqueueDraftPersist]);

  const handleSaveProject = useCallback(async () => {
    setProjectSaveState('saving');
    setProjectSaveMessage('Saving Studio scene to Projects…');
    try {
      const projectName = projectNameDraft.trim() || 'Untitled project';
      const projectDescription = projectDescriptionDraft.trim();
      const persistProjectSnapshot = async (projectId: string) => {
        await saveStudioStateToProject(projectId, { ...studioSnapshot, projectId, projectName });
        return projectId;
      };
      let projectId = currentProjectId;

      const createFreshProject = async () => {
        const created = await createProjectFromStudio({
          name: projectName,
          description: projectDescription,
          tags: ['studio']
        });
        setCurrentProjectId(created.id);
        setProjectNameDraft(created.name);
        setProjectDescriptionDraft(created.description ?? '');
        await persistProjectSnapshot(created.id);
        return created.id;
      };

      if (!projectId) {
        projectId = await createFreshProject();
      } else {
        try {
          await patchProjectRecord(projectId, {
            name: projectName,
            description: projectDescription,
            status: 'active'
          });
          await persistProjectSnapshot(projectId);
        } catch (error) {
          if (error instanceof ProjectRequestError && error.status === 404) {
            projectId = await createFreshProject();
          } else {
            throw error;
          }
        }
      }

      const nextSnapshot = { ...studioSnapshot, projectId, projectName, savedAt: new Date().toISOString(), revision: Date.now() };
      if (typeof window !== 'undefined') {
        await enqueueDraftPersist(nextSnapshot);
        if (projectId) {
          window.sessionStorage.setItem('printra-last-project-id', projectId);
          if (window.location.search !== `?projectId=${projectId}`) {
            window.history.replaceState(null, '', `/studio?projectId=${projectId}${window.location.hash}`);
          }
          window.dispatchEvent(new CustomEvent('printra:project-saved', { detail: { projectId } }));
        }
      }
      setProjectSaveState('saved');
      setProjectSaveMessage(`Project saved · ${projectName}`);
    } catch (error) {
      setProjectSaveState('error');
      setProjectSaveMessage(error instanceof Error ? error.message : 'Project could not be saved from Studio.');
    }
  }, [currentProjectId, projectDescriptionDraft, projectNameDraft, studioSnapshot, enqueueDraftPersist]);

  useEffect(() => {
    if (inlineTextEditId && inlineTextEditId !== activeObjectId) {
      setInlineTextEditId(null);
      setInlineTextDraft('');
    }

    const designSelectionStillVisible = visibleObjects.some((item) => item.id === designSelectedObjectId);
    const previewSelectionStillVisible = visibleObjects.some((item) => item.id === previewSelectedObjectId);
    const fallbackObject = visibleObjects[0] ?? objects[0];

    if (fallbackObject && !designSelectionStillVisible) {
      setDesignSelectedObjectId(fallbackObject.id);
      if (selectionOwner !== 'preview') {
        setActiveTool(resolveToolFromObject(fallbackObject.type));
      }
    }

    if (fallbackObject && !previewSelectionStillVisible) {
      setPreviewSelectedObjectId(fallbackObject.id);
      if (selectionOwner === 'preview') {
        setActiveTool(resolveToolFromObject(fallbackObject.type));
      }
    }
  }, [activeObjectId, designSelectedObjectId, objects, previewSelectedObjectId, selectionOwner, visibleObjects]);

  const updateTextProperties = (
    objectId: string,
    patch: Partial<Pick<StudioObject, 'text' | 'fontSize' | 'fontWeight' | 'textAlign' | 'textColor'>>,
    options?: { recordHistory?: boolean }
  ) => {
    commitObjects((current) =>
      current.map((item) => {
        if (item.id !== objectId || item.type !== 'text' || item.locked) {
          return item;
        }

        return {
          ...item,
          text: patch.text !== undefined ? patch.text : item.text,
          fontSize: patch.fontSize !== undefined ? Math.max(12, Math.round(patch.fontSize)) : item.fontSize,
          fontWeight: patch.fontWeight !== undefined ? patch.fontWeight : item.fontWeight,
          textAlign: patch.textAlign !== undefined ? patch.textAlign : item.textAlign,
          textColor: patch.textColor !== undefined ? patch.textColor : item.textColor
        };
      })
    , { recordHistory: options?.recordHistory ?? true });
  };

  const beginInlineTextEdit = (objectId: string) => {
    const target = objectsRef.current.find((item) => item.id === objectId && item.type === 'text' && !item.locked);
    if (!target) {
      return;
    }

    pushHistorySnapshot();
    setInlineTextEditId(objectId);
    setInlineTextDraft(target.text ?? '');
    setDesignSelectedObjectId(objectId);
    setSelectionOwner('design');
    setActiveTool('text');
    setInspectorTab('properties');
  };

  const commitInlineTextEdit = () => {
    if (!inlineTextEditId) {
      return;
    }

    updateTextProperties(inlineTextEditId, { text: inlineTextDraft }, { recordHistory: false });
    setInlineTextEditId(null);
  };

  const cancelInlineTextEdit = () => {
    setInlineTextEditId(null);
    setInlineTextDraft('');
  };

  const updateObjectGeometry = (
    objectId: string,
    patch: Partial<
      Pick<
        StudioObject,
        | 'x'
        | 'y'
        | 'width'
        | 'height'
        | 'rotation'
        | 'mockupProjectionPreset'
        | 'printInsetXRatio'
        | 'printInsetYRatio'
        | 'projectionCurveX'
        | 'projectionCurveY'
        | 'projectionDepth'
        | 'projectionSoftness'
      >
    >
  ) => {
    commitObjects((current) =>
      current.map((item) => {
        if (item.id !== objectId || item.locked) {
          return item;
        }

        const nextX = patch.x !== undefined ? Math.round(Math.max(0, patch.x)) : item.x;
        const nextY = patch.y !== undefined ? Math.round(Math.max(0, patch.y)) : item.y;
        const nextWidth = patch.width !== undefined ? Math.round(Math.max(MIN_OBJECT_WIDTH, patch.width)) : item.width;
        const nextHeight = patch.height !== undefined ? Math.round(Math.max(MIN_OBJECT_HEIGHT, patch.height)) : item.height;
        const nextRotation = patch.rotation !== undefined ? normalizeRotation(patch.rotation) : item.rotation ?? 0;

        return {
          ...item,
          x: nextX,
          y: nextY,
          width: nextWidth,
          height: nextHeight,
          rotation: nextRotation,
          mockupProjectionPreset: patch.mockupProjectionPreset !== undefined ? patch.mockupProjectionPreset : item.mockupProjectionPreset,
          printInsetXRatio: patch.printInsetXRatio !== undefined ? Math.max(0.05, Math.min(0.45, patch.printInsetXRatio)) : item.printInsetXRatio,
          printInsetYRatio: patch.printInsetYRatio !== undefined ? Math.max(0.05, Math.min(0.45, patch.printInsetYRatio)) : item.printInsetYRatio,
          projectionCurveX: patch.projectionCurveX !== undefined ? Math.max(-10, Math.min(10, patch.projectionCurveX)) : item.projectionCurveX,
          projectionCurveY: patch.projectionCurveY !== undefined ? Math.max(-10, Math.min(10, patch.projectionCurveY)) : item.projectionCurveY,
          projectionDepth: patch.projectionDepth !== undefined ? Math.max(0, Math.min(0.5, patch.projectionDepth)) : item.projectionDepth,
          projectionSoftness: patch.projectionSoftness !== undefined ? Math.max(0, Math.min(0.5, patch.projectionSoftness)) : item.projectionSoftness
        };
      })
    , { recordHistory: true });
  };

  const renameObject = (objectId: string, nextName: string) => {
    const trimmedName = nextName.trim();
    if (!trimmedName) {
      return;
    }

    commitObjects((current) =>
      current.map((item) => {
        if (item.id !== objectId || item.type === 'mockup') {
          return item;
        }

        return {
          ...item,
          name: trimmedName
        };
      })
    , { recordHistory: true });
  };

  const toggleVisibility = (objectId: string) => {
    commitObjects((current) =>
      current.map((item) => {
        if (item.id !== objectId || item.type === 'mockup') {
          return item;
        }

        return {
          ...item,
          visible: item.visible === false
        };
      })
    , { recordHistory: true });
  };

  const toggleLock = (objectId: string) => {
    commitObjects((current) =>
      current.map((item) => {
        if (item.id !== objectId || item.type === 'mockup') {
          return item;
        }

        return {
          ...item,
          locked: !item.locked
        };
      })
    , { recordHistory: true });
  };

  const duplicateObject = (objectId: string) => {
    commitObjects((current) => {
      const source = current.find((item) => item.id === objectId);
      if (!source || source.type === 'mockup') {
        return current;
      }

      const nextId = `${source.id}-copy-${Date.now()}`;
      const duplicateName = `${source.name} Copy`;
      const duplicate = {
        ...source,
        id: nextId,
        name: duplicateName,
        x: source.x + 24,
        y: source.y + 24,
        locked: false,
        visible: true
      };

      setDesignSelectedObjectId(nextId);
      setPreviewSelectedObjectId(nextId);
      setSelectionOwner('design');
      setActiveTool(resolveToolFromObject(source.type));
      setInspectorTab('layers');

      return [...current, duplicate];
    }, { recordHistory: true });
  };

  const duplicateMockupObject = (objectId: string) => {
    commitObjects((current) => {
      const source = current.find((item) => item.id === objectId);
      if (!source || source.type !== 'mockup') {
        return current;
      }
      const nextId = `${source.id}-copy-${Date.now()}`;
      const visibleMockups = current.filter((item) => item.type === 'mockup' && item.visible !== false).length;
      const duplicate: StudioObject = {
        ...source,
        id: nextId,
        name: `${source.name} Copy ${visibleMockups + 1}`,
        locked: false,
        visible: true
      };
      setPreviewSelectedObjectId(nextId);
      setPreviewSelectedStageId(nextId);
      setSelectionOwner('preview');
      setHasPreviewSelection(true);
      setHasDesignSelection(false);
      setActiveTool('mockup');
      setInspectorTab('layers');
      return [...current, duplicate];
    }, { recordHistory: true });
  };

  const deleteObject = (objectId: string) => {
    commitObjects((current) => {
      const source = current.find((item) => item.id === objectId);
      if (!source || source.type === 'mockup') {
        return current;
      }

      const remaining = current.filter((item) => item.id !== objectId);
      const nextActive = remaining.find((item) => item.visible !== false) ?? remaining[0];
      if (nextActive) {
        setDesignSelectedObjectId(nextActive.id);
        setPreviewSelectedObjectId(nextActive.id);
        setSelectionOwner('design');
        setHasDesignSelection(true);
        setHasPreviewSelection(false);
        setActiveTool(resolveToolFromObject(nextActive.type));
      }

      return remaining;
    }, { recordHistory: true });
  };

  const deleteMockupObject = (objectId: string) => {
    commitObjects((current) => {
      const source = current.find((item) => item.id === objectId);
      if (!source || source.type !== 'mockup') {
        return current;
      }
      const mockups = current.filter((item) => item.type === 'mockup' && item.visible !== false);
      if (mockups.length <= 1) {
        return current;
      }
      const remaining = current.filter((item) => item.id !== objectId);
      const nextMockup = remaining.find((item) => item.type === 'mockup' && item.visible !== false) ?? remaining[0];
      if (nextMockup) {
        setPreviewSelectedObjectId(nextMockup.id);
        setPreviewSelectedStageId(nextMockup.id);
        setSelectionOwner('preview');
        setHasPreviewSelection(true);
        setHasDesignSelection(false);
        setActiveTool('mockup');
      }
      return remaining;
    }, { recordHistory: true });
  };

  const clearSceneObjects = useCallback(() => {
    const fallbackMockup: StudioObject = {
      ...objectSeed[0],
      id: 'object-mockup-1',
      name: 'Mockup Stage 1',
      x: 0,
      y: 0,
      width: SCENE_BASE_WIDTH,
      height: SCENE_BASE_HEIGHT,
      visible: true,
      locked: false,
      imageSrc: undefined,
      libraryAssetId: undefined,
      librarySectionId: undefined
    };

    commitObjects(() => [fallbackMockup], { recordHistory: true });
    stagePlacementsRef.current = {};
    setStagePlacements({});
    setPreviewSelectedStageId(fallbackMockup.id);
    setPreviewSelectedObjectId(fallbackMockup.id);
    setDesignSelectedObjectId(fallbackMockup.id);
    setSelectionOwner('preview');
    setHasPreviewSelection(true);
    setHasDesignSelection(false);
    setActiveTool('mockup');
    setInspectorTab('properties');
    clearInteractions();
    setInlineTextEditId(null);
    setInlineTextDraft('');
    setCanvasContextMenu(null);
  }, [clearInteractions, commitObjects]);

  const requestNewImageUpload = () => {
    pendingDesignSectionIdRef.current = openDesignSectionId || designSections[0]?.id || 'design-section-default';
    uploadImageInputRef.current?.click();
  };

  const requestMockupUpload = () => {
    pendingMockupSectionIdRef.current = openMockupSectionId || mockupSections[0]?.id || 'mockup-section-default';
    uploadMockupInputRef.current?.click();
  };

  const requestReplaceImage = () => {
    if (activeObject?.type !== 'image' || activeObject.locked) {
      return;
    }

    replaceImageInputRef.current?.click();
  };

  const appendDesignAssetToCanvas = useCallback((asset: Pick<LibraryAsset, 'id' | 'name' | 'src' | 'sourceLabel'> & { sectionId?: string }) => {
    const nextId = `object-image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const defaultWidth = 180;
    const defaultHeight = 180;
    const centeredX = Math.round((SCENE_BASE_WIDTH - defaultWidth) / 2);
    const centeredY = Math.round((SCENE_BASE_HEIGHT - defaultHeight) / 2);
    const resolvedSectionId = asset.sectionId ?? pendingDesignSectionIdRef.current ?? openDesignSectionId ?? designSections[0]?.id ?? 'design-section-default';
    commitObjects((current) => {
      const nextObject: StudioObject = {
        id: nextId,
        name: asset.name || 'Uploaded Image',
        type: 'image',
        x: centeredX,
        y: centeredY,
        width: defaultWidth,
        height: defaultHeight,
        srcLabel: asset.sourceLabel ?? asset.name,
        imageSrc: asset.src,
        opacity: 1,
        rotation: 0,
        librarySectionId: resolvedSectionId,
        libraryAssetId: asset.id,
        visible: true
      };

      setDesignSelectedObjectId(nextId);
      setPreviewSelectedObjectId(nextId);
      setSelectionOwner('design');
      setHasDesignSelection(true);
      setHasPreviewSelection(false);
      setActiveTool('select');
      setInspectorTab('properties');
      return [...current, nextObject];
    }, { recordHistory: true });
    return nextId;
  }, [commitObjects, designSections, openDesignSectionId]);

  const appendMockupStageFromAsset = useCallback((asset: Pick<LibraryAsset, 'id' | 'name' | 'src' | 'sourceLabel'> & { sectionId?: string }) => {
    const currentMockups = objectsRef.current.filter((item) => item.type === 'mockup' && item.visible !== false);
    const placeholderMockup = currentMockups.find((item) => !item.imageSrc);
    const targetId = placeholderMockup?.id ?? `object-mockup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    commitObjects((current) => {
      const visibleMockups = current.filter((item) => item.type === 'mockup' && item.visible !== false);
      const placeholder = visibleMockups.find((item) => item.id === placeholderMockup?.id);

      if (placeholder) {
        return current.map((item) => {
          if (item.id !== placeholder.id) {
            return item;
          }

          return {
            ...item,
            name: asset.name || item.name,
            srcLabel: asset.sourceLabel ?? asset.name,
            imageSrc: asset.src,
            opacity: 1,
            visible: true,
            rotation: 0,
            librarySectionId: asset.sectionId ?? pendingMockupSectionIdRef.current ?? openMockupSectionId ?? mockupSections[0]?.id ?? 'mockup-section-default',
            libraryAssetId: asset.id,
            mockupProjectionPreset: item.mockupProjectionPreset ?? 'relaxed-front',
            x: 0,
            y: 0,
            width: SCENE_BASE_WIDTH,
            height: SCENE_BASE_HEIGHT,
            printInsetXRatio: item.printInsetXRatio ?? 0.2,
            printInsetYRatio: item.printInsetYRatio ?? 0.22,
            projectionCurveX: item.projectionCurveX ?? 2.8,
            projectionCurveY: item.projectionCurveY ?? -1.2,
            projectionDepth: item.projectionDepth ?? 0.16,
            projectionSoftness: item.projectionSoftness ?? 0.2
          };
        });
      }

      const nextIndex = visibleMockups.length + 1;
      const nextMockup: StudioObject = {
        id: targetId,
        name: asset.name || `Mockup ${nextIndex}`,
        type: 'mockup',
        x: 0,
        y: 0,
        width: SCENE_BASE_WIDTH,
        height: SCENE_BASE_HEIGHT,
        locked: false,
        srcLabel: asset.sourceLabel ?? asset.name,
        imageSrc: asset.src,
        opacity: 1,
        rotation: 0,
        visible: true,
        librarySectionId: asset.sectionId ?? pendingMockupSectionIdRef.current ?? openMockupSectionId ?? mockupSections[0]?.id ?? 'mockup-section-default',
        libraryAssetId: asset.id,
        mockupProjectionPreset: 'relaxed-front',
        printInsetXRatio: 0.2,
        printInsetYRatio: 0.22,
        projectionCurveX: 2.8,
        projectionCurveY: -1.2,
        projectionDepth: 0.16,
        projectionSoftness: 0.2
      };

      return [...current, nextMockup];
    }, { recordHistory: true });

    setSelectionOwner('preview');
    setPreviewSelectedStageId(targetId);
    setHasPreviewSelection(false);
    setHasDesignSelection(false);
    setActiveTool('select');
    setInspectorTab('properties');
    return targetId;
  }, [commitObjects, mockupSections, openMockupSectionId]);

  const sendSingleLibraryAsset = useCallback((kind: LibraryKind, asset: LibraryAsset) => {
    if (kind === 'mockup') {
      appendMockupStageFromAsset(asset);
      return;
    }

    appendDesignAssetToCanvas(asset);
  }, [appendDesignAssetToCanvas, appendMockupStageFromAsset]);

  const addLibrarySection = useCallback((kind: LibraryKind) => {
    if (kind === 'mockup') {
      const name = mockupSectionDraft.trim();
      if (!name) return;
      setMockupSections((current) => {
        const id = `mockup-section-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setOpenMockupSectionId(id);
        pendingMockupSectionIdRef.current = id;
        return [...current, { id, name }];
      });
      setMockupSectionDraft('');
      return;
    }

    const name = designSectionDraft.trim();
    if (!name) return;
    setDesignSections((current) => {
      const id = `design-section-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setOpenDesignSectionId(id);
      pendingDesignSectionIdRef.current = id;
      return [...current, { id, name }];
    });
    setDesignSectionDraft('');
  }, [designSectionDraft, mockupSectionDraft]);

  const toggleLibrarySelection = useCallback((kind: LibraryKind, assetId: string) => {
    const setter = kind === 'mockup' ? setSelectedMockupAssetIds : setSelectedDesignAssetIds;
    setter((current) => (current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId]));
  }, []);


  const toggleLibrarySectionSelection = useCallback((kind: LibraryKind, sectionId: string) => {
    const assetsInSection = (kind === 'mockup' ? mockupAssets : designAssets)
      .filter((asset) => asset.sectionId === sectionId)
      .map((asset) => asset.id);

    if (!assetsInSection.length) return;

    const setter = kind === 'mockup' ? setSelectedMockupAssetIds : setSelectedDesignAssetIds;
    setter((current) => {
      const allSelected = assetsInSection.every((id) => current.includes(id));
      if (allSelected) {
        return current.filter((id) => !assetsInSection.includes(id));
      }
      return [...new Set([...current, ...assetsInSection])];
    });
  }, [designAssets, mockupAssets]);

  const requestLibraryUpload = useCallback((kind: LibraryKind, sectionId: string) => {
    if (kind === 'mockup') {
      pendingMockupSectionIdRef.current = sectionId;
      libraryMockupUploadRef.current?.click();
      return;
    }

    pendingDesignSectionIdRef.current = sectionId;
    libraryDesignUploadRef.current?.click();
  }, []);

  const duplicateLibrarySelection = useCallback((kind: LibraryKind, sectionId: string) => {
    if (kind === 'mockup') {
      const source = mockupAssets.filter((asset) => selectedMockupAssetIds.includes(asset.id) && asset.sectionId === sectionId);
      if (!source.length) return;
      const copies = source.map((asset, index) => ({
        ...asset,
        id: `${asset.id}-copy-${Date.now()}-${index}`,
        name: `${asset.name} Copy`,
        sectionId
      }));
      setMockupAssets((current) => [...current, ...copies]);
      setSelectedMockupAssetIds(copies.map((item) => item.id));
      return;
    }

    const source = designAssets.filter((asset) => selectedDesignAssetIds.includes(asset.id) && asset.sectionId === sectionId);
    if (!source.length) return;
    const copies = source.map((asset, index) => ({
      ...asset,
      id: `${asset.id}-copy-${Date.now()}-${index}`,
      name: `${asset.name} Copy`,
      sectionId
    }));
    setDesignAssets((current) => [...current, ...copies]);
    setSelectedDesignAssetIds(copies.map((item) => item.id));
  }, [designAssets, mockupAssets, selectedDesignAssetIds, selectedMockupAssetIds]);

  const deleteLibrarySelection = useCallback((kind: LibraryKind, sectionId: string) => {
    if (kind === 'mockup') {
      const removable = mockupAssets.filter((asset) => selectedMockupAssetIds.includes(asset.id) && asset.sectionId === sectionId);
      if (!removable.length) return;
      const removableAssetIds = new Set(removable.map((asset) => asset.id));
      const removableLinkedIds = objectsRef.current
        .filter((item) => item.type === 'mockup' && item.libraryAssetId && removableAssetIds.has(item.libraryAssetId))
        .map((item) => item.id);
      if (removableLinkedIds.length) {
        commitObjects((current) => {
          const stageIds = current.filter((item) => item.type === 'mockup' && item.visible !== false).map((item) => item.id);
          const toRemove = removableLinkedIds.filter((id) => stageIds.length - removableLinkedIds.length >= 1 || id !== stageIds[0]);
          if (!toRemove.length) return current;
          return current.filter((item) => !toRemove.includes(item.id));
        }, { recordHistory: true });
      }
      setMockupAssets((current) => current.filter((asset) => !(selectedMockupAssetIds.includes(asset.id) && asset.sectionId === sectionId)));
      setSelectedMockupAssetIds((current) => current.filter((id) => !removable.some((asset) => asset.id === id)));
      return;
    }

    const removable = designAssets.filter((asset) => selectedDesignAssetIds.includes(asset.id) && asset.sectionId === sectionId);
    if (!removable.length) return;
    const removableAssetIds = new Set(removable.map((asset) => asset.id));
    const removableLinkedIds = objectsRef.current
      .filter((item) => item.type === 'image' && item.libraryAssetId && removableAssetIds.has(item.libraryAssetId))
      .map((item) => item.id);
    if (removableLinkedIds.length) {
      commitObjects((current) => current.filter((item) => !removableLinkedIds.includes(item.id)), { recordHistory: true });
    }
    setDesignAssets((current) => current.filter((asset) => !(selectedDesignAssetIds.includes(asset.id) && asset.sectionId === sectionId)));
    setSelectedDesignAssetIds((current) => current.filter((id) => !removable.some((asset) => asset.id === id)));
  }, [commitObjects, designAssets, mockupAssets, selectedDesignAssetIds, selectedMockupAssetIds]);

  const sendLibrarySelection = useCallback((kind: LibraryKind, sectionId: string) => {
    if (kind === 'mockup') {
      const selectedAssets = mockupAssets.filter((asset) => selectedMockupAssetIds.includes(asset.id) && asset.sectionId === sectionId);
      if (!selectedAssets.length) return;
      selectedAssets.forEach((asset, index) => {
        const createdObjectId = appendMockupStageFromAsset(asset);
        if (index === selectedAssets.length - 1) {
          setPreviewSelectedStageId(createdObjectId);
        }
      });
      setOpenLibraryMenu(null);
      return;
    }

    const selectedAssets = designAssets.filter((asset) => selectedDesignAssetIds.includes(asset.id) && asset.sectionId === sectionId);
    if (!selectedAssets.length) return;
    selectedAssets.forEach((asset) => {
      appendDesignAssetToCanvas(asset);
    });
    setOpenLibraryMenu(null);
  }, [appendDesignAssetToCanvas, appendMockupStageFromAsset, designAssets, mockupAssets, selectedDesignAssetIds, selectedMockupAssetIds]);

  const addImageObjectFromFile = useCallback(async (file: File) => {
    const sectionId = pendingDesignSectionIdRef.current;
    const result = await readFileAsDataUrl(file).catch(() => '');
    if (!result) {
      return;
    }
    setDesignAssets((current) => [
      ...current,
      {
        id: `design-asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name.replace(/\.[^.]+$/, '') || 'Uploaded Image',
        src: result,
        sectionId,
        kind: 'design',
        sourceLabel: file.name
      }
    ]);
  }, []);

  const replaceImageObjectFromFile = useCallback(async (objectId: string, file: File) => {
    const result = await readFileAsDataUrl(file).catch(() => '');
    if (!result) {
      return;
    }
    commitObjects((current) =>
      current.map((item) => {
        if (item.id !== objectId || item.type !== 'image' || item.locked) {
          return item;
        }

        return {
          ...item,
          name: file.name.replace(/\.[^.]+$/, '') || item.name,
          srcLabel: file.name,
          imageSrc: result
        };
      })
    , { recordHistory: true });
    const linkedAssetId = objectsRef.current.find((item) => item.id === objectId)?.libraryAssetId;
    if (linkedAssetId) {
      setDesignAssets((current) => current.map((asset) => asset.id === linkedAssetId ? { ...asset, name: file.name.replace(/\.[^.]+$/, '') || asset.name, sourceLabel: file.name, src: result } : asset));
    }
  }, [commitObjects]);

  const replaceMockupObjectFromFile = useCallback(async (file: File) => {
    const sectionId = pendingMockupSectionIdRef.current;
    const result = await readFileAsDataUrl(file).catch(() => '');
    if (!result) {
      return;
    }
    setMockupAssets((current) => [
      ...current,
      {
        id: `mockup-asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name.replace(/\.[^.]+$/, '') || 'Mockup',
        src: result,
        sectionId,
        kind: 'mockup',
        sourceLabel: file.name
      }
    ]);
  }, []);

  const handleUploadImageFile = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) {
      return;
    }
    const targetSectionId = pendingDesignSectionIdRef.current || openDesignSectionId || designSections[0]?.id || 'design-section-default';
    event.target.value = '';
    void (async () => {
      for (const file of files) {
        const result = await readFileAsDataUrl(file).catch(() => '');
        if (!result) {
          continue;
        }
        const name = file.name.replace(/\.[^.]+$/, '') || 'Uploaded Image';
        const assetId = `design-asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        startTransition(() => {
          setDesignAssets((current) => [...current, {
            id: assetId,
            name,
            src: result,
            sectionId: targetSectionId,
            kind: 'design',
            sourceLabel: file.name
          }]);
        });
        if (typeof window !== 'undefined') {
          await new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => {
              appendDesignAssetToCanvas({
                id: assetId,
                name,
                src: result,
                sourceLabel: file.name,
                sectionId: targetSectionId
              });
              resolve();
            });
          });
        } else {
          appendDesignAssetToCanvas({
            id: assetId,
            name,
            src: result,
            sourceLabel: file.name,
            sectionId: targetSectionId
          });
        }
      }
    })();
  };

  const handleUploadMockupFile = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) {
      return;
    }
    const targetSectionId = pendingMockupSectionIdRef.current || openMockupSectionId || mockupSections[0]?.id || 'mockup-section-default';
    event.target.value = '';
    void (async () => {
      for (const file of files) {
        const result = await readFileAsDataUrl(file).catch(() => '');
        if (!result) {
          continue;
        }
        const name = file.name.replace(/\.[^.]+$/, '') || 'Mockup';
        const assetId = `mockup-asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        startTransition(() => {
          setMockupAssets((current) => [...current, {
            id: assetId,
            name,
            src: result,
            sectionId: targetSectionId,
            kind: 'mockup',
            sourceLabel: file.name
          }]);
        });
        if (typeof window !== 'undefined') {
          await new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => {
              appendMockupStageFromAsset({
                id: assetId,
                name,
                src: result,
                sourceLabel: file.name,
                sectionId: targetSectionId
              });
              resolve();
            });
          });
        } else {
          appendMockupStageFromAsset({
            id: assetId,
            name,
            src: result,
            sourceLabel: file.name,
            sectionId: targetSectionId
          });
        }
      }
    })();
  };

  const handleReplaceImageFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || activeObject?.type !== 'image') {
      return;
    }

    void replaceImageObjectFromFile(activeObject.id, file);
    event.target.value = '';
  };

  const handleLibraryMockupUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) {
      return;
    }
    event.target.value = '';
    void (async () => {
      for (const file of files) {
        await replaceMockupObjectFromFile(file);
      }
    })();
  };

  const handleLibraryDesignUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) {
      return;
    }
    event.target.value = '';
    void (async () => {
      for (const file of files) {
        await addImageObjectFromFile(file);
      }
    })();
  };

  useEffect(() => {
    const validSectionIds = new Set(mockupSections.map((section) => section.id));
    const fallbackSectionId = mockupSections[0]?.id ?? 'mockup-section-default';
    if (openMockupSectionId && !validSectionIds.has(openMockupSectionId)) {
      setOpenMockupSectionId(fallbackSectionId);
    }
  }, [mockupSections, openMockupSectionId]);

  useEffect(() => {
    const validSectionIds = new Set(designSections.map((section) => section.id));
    const fallbackSectionId = designSections[0]?.id ?? 'design-section-default';
    if (openDesignSectionId && !validSectionIds.has(openDesignSectionId)) {
      setOpenDesignSectionId(fallbackSectionId);
    }
  }, [designSections, openDesignSectionId]);

  useEffect(() => {
    const knownSectionIds = new Set(mockupSections.map((section) => section.id));
    const missingSectionIds = Array.from(
      new Set(
        mockupAssets
          .map((asset) => asset.sectionId)
          .filter((sectionId) => sectionId && !knownSectionIds.has(sectionId))
      )
    );
    if (!missingSectionIds.length) {
      return;
    }
    const now = new Date().toISOString();
    setMockupSections((current) => {
      const existing = new Set(current.map((section) => section.id));
      const additions = missingSectionIds
        .filter((sectionId) => !existing.has(sectionId))
        .map((sectionId, index) => ({
          id: sectionId,
          name: `Recovered mockup section ${index + 1}`,
          kind: 'mockup' as const,
          createdAt: now
        }));
      return additions.length ? [...current, ...additions] : current;
    });
  }, [mockupAssets, mockupSections]);

  useEffect(() => {
    const knownSectionIds = new Set(designSections.map((section) => section.id));
    const missingSectionIds = Array.from(
      new Set(
        designAssets
          .map((asset) => asset.sectionId)
          .filter((sectionId) => sectionId && !knownSectionIds.has(sectionId))
      )
    );
    if (!missingSectionIds.length) {
      return;
    }
    const now = new Date().toISOString();
    setDesignSections((current) => {
      const existing = new Set(current.map((section) => section.id));
      const additions = missingSectionIds
        .filter((sectionId) => !existing.has(sectionId))
        .map((sectionId, index) => ({
          id: sectionId,
          name: `Recovered design section ${index + 1}`,
          kind: 'design' as const,
          createdAt: now
        }));
      return additions.length ? [...current, ...additions] : current;
    });
  }, [designAssets, designSections]);

  useEffect(() => {
    const assetMetaById = new Map<string, { sectionId: string; assetId: string }>();
    for (const asset of mockupAssets) {
      assetMetaById.set(asset.id, { sectionId: asset.sectionId, assetId: asset.id });
    }
    for (const asset of designAssets) {
      assetMetaById.set(asset.id, { sectionId: asset.sectionId, assetId: asset.id });
    }
    if (!assetMetaById.size) {
      return;
    }
    setObjects((current) => {
      let changed = false;
      const next = current.map((item) => {
        if (!item.libraryAssetId) {
          return item;
        }
        const meta = assetMetaById.get(item.libraryAssetId);
        if (!meta) {
          return item;
        }
        if (item.librarySectionId === meta.sectionId && item.libraryAssetId === meta.assetId) {
          return item;
        }
        changed = true;
        return { ...item, librarySectionId: meta.sectionId, libraryAssetId: meta.assetId };
      });
      if (changed) {
        objectsRef.current = next;
      }
      return changed ? next : current;
    });
  }, [designAssets, mockupAssets]);

  useEffect(() => {
    let cancelled = false;
    const targetAsset = designAssets.find(
      (asset) =>
        asset.src.startsWith('data:image/') &&
        normalizedDesignAssetSrcRef.current[asset.id] !== asset.src
    );
    if (!targetAsset) {
      return;
    }

    const cancelIdle = scheduleStudioIdleWork(() => {
      void normalizeDesignImageDataUrl(targetAsset.src).then((normalizedSrc) => {
        normalizedDesignAssetSrcRef.current[targetAsset.id] = targetAsset.src;
        if (cancelled || !normalizedSrc) {
          return;
        }

        if (normalizedSrc === targetAsset.src) {
          return;
        }

        setDesignAssets((current) => current.map((asset) => (
          asset.id === targetAsset.id ? { ...asset, src: normalizedSrc } : asset
        )));
        setObjects((current) => {
          let changed = false;
          const next = current.map((item) => {
            if (item.libraryAssetId !== targetAsset.id || item.type !== 'image') {
              return item;
            }
            changed = true;
            return { ...item, imageSrc: normalizedSrc };
          });
          if (changed) {
            objectsRef.current = next;
          }
          return changed ? next : current;
        });
      });
    });

    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [designAssets]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget = Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable));

      if (isTypingTarget || !(event.metaKey || event.ctrlKey)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }

      if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [redo, undo]);

  const viewTitle =
    mode === 'design' ? t('studioSceneDesign') : mode === 'mockup' ? t('studioSceneMockup') : t('studioSceneSplit');
  const interactionStateLabel = rotateState
    ? t('studioInteractionRotating')
    : resizeState
      ? t('studioInteractionResizing')
      : dragState
        ? t('studioInteractionDragging')
        : t('studioInteractionIdle');

  const selectObjectFromScene = useCallback(
    (scene: SceneKind, objectId: string, stageMockupId?: string) => {
      const objectType = objectsRef.current.find((item) => item.id === objectId)?.type;
      const resolvedScene = scene === 'design' && objectType === 'mockup' ? 'preview' : scene;

      if (resolvedScene === 'design') {
        setDesignSelectedObjectId(objectId);
        setHasDesignSelection(true);
        setHasPreviewSelection(false);
      } else {
        setPreviewSelectedObjectId(objectId);
        setPreviewSelectedStageId(stageMockupId ?? (objectType === 'mockup' ? objectId : previewSelectedStageId));
        setHasPreviewSelection(true);
        setHasDesignSelection(false);
      }

      setSelectionOwner(resolvedScene);
      setInspectorTab('properties');
      setActiveTool(resolveToolFromObject(objectType));
    },
    [previewSelectedStageId]
  );


  useEffect(() => {
    if (!dragState || resizeState || rotateState) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return;
      }

      if (event.buttons === 0) {
        clearInteractions();
        return;
      }

      const current = objectsRef.current;
      const baseTarget = current.find((item) => item.id === dragState.objectId);
      const target = baseTarget ? readStagePlacement(dragState.stageMockupId, baseTarget) : undefined;
      if (!target || target.locked) {
        return;
      }

      const rawX = (event.clientX - dragState.sceneLeft) / dragState.sceneScaleX - dragState.pointerOffsetX;
      const rawY = (event.clientY - dragState.sceneTop) / dragState.sceneScaleY - dragState.pointerOffsetY;

      if (dragState.coordinateSpace === 'projected') {
        const nextX = rawX;
        const nextY = rawY;
        setSnapGuides([]);
        writeStagePlacement(dragState.stageMockupId, dragState.objectId, {
          x: Math.round(nextX),
          y: Math.round(nextY),
          width: target.width,
          height: target.height,
          rotation: target.rotation ?? 0
        });
        return;
      }

      const boundedX = clamp(rawX, 0, dragState.sceneWidth - target.width);
      const boundedY = clamp(rawY, 0, dragState.sceneHeight - target.height);

      const snapResult = computeSnapResult({
        object: target,
        x: boundedX,
        y: boundedY,
        sceneWidth: dragState.sceneWidth,
        sceneHeight: dragState.sceneHeight,
        objects: current
      });

      setSnapGuides(snapResult.guides);
      setObjects(
        current.map((item) => {
          if (item.id !== dragState.objectId || item.locked) {
            return item;
          }

          return {
            ...item,
            x: Math.round(snapResult.x),
            y: Math.round(snapResult.y)
          };
        })
      );
    };

    const handlePointerUp = (event?: PointerEvent | MouseEvent) => {
      if (event && 'pointerId' in event && typeof event.pointerId === 'number' && event.pointerId !== dragState.pointerId) {
        return;
      }

      clearInteractions();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('mouseup', handlePointerUp as EventListener);
    window.addEventListener('blur', clearInteractions);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('mouseup', handlePointerUp as EventListener);
      window.removeEventListener('blur', clearInteractions);
    };
  }, [clearInteractions, dragState, readStagePlacement, resizeState, rotateState, writeStagePlacement]);

  useEffect(() => {
    if (!dragState) {
      setSnapGuides([]);
    }
  }, [dragState]);

  useEffect(() => {
    if (!resizeState) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== resizeState.pointerId) {
        return;
      }

      if (event.buttons === 0) {
        clearInteractions();
        return;
      }

      const current = objectsRef.current;
      const source = current.find((item) => item.id === resizeState.objectId);
      if (!source || source.locked) {
        return;
      }

      const deltaX = (event.clientX - resizeState.startClientX) / resizeState.sceneScaleX;
      const deltaY = (event.clientY - resizeState.startClientY) / resizeState.sceneScaleY;

      let nextX = resizeState.startX;
      let nextY = resizeState.startY;
      let nextWidth = resizeState.startWidth;
      let nextHeight = resizeState.startHeight;

      if (resizeState.handle.includes('e')) {
        nextWidth = resizeState.startWidth + deltaX;
      }

      if (resizeState.handle.includes('s')) {
        nextHeight = resizeState.startHeight + deltaY;
      }

      if (resizeState.handle.includes('w')) {
        nextWidth = resizeState.startWidth - deltaX;
        nextX = resizeState.startX + deltaX;
      }

      if (resizeState.handle.includes('n')) {
        nextHeight = resizeState.startHeight - deltaY;
        nextY = resizeState.startY + deltaY;
      }

      if (nextWidth < MIN_OBJECT_WIDTH) {
        if (resizeState.handle.includes('w')) {
          nextX -= MIN_OBJECT_WIDTH - nextWidth;
        }
        nextWidth = MIN_OBJECT_WIDTH;
      }

      if (nextHeight < MIN_OBJECT_HEIGHT) {
        if (resizeState.handle.includes('n')) {
          nextY -= MIN_OBJECT_HEIGHT - nextHeight;
        }
        nextHeight = MIN_OBJECT_HEIGHT;
      }

      nextX = clamp(nextX, 0, resizeState.sceneWidth - nextWidth);
      nextY = clamp(nextY, 0, resizeState.sceneHeight - nextHeight);
      nextWidth = clamp(nextWidth, MIN_OBJECT_WIDTH, resizeState.sceneWidth - nextX);
      nextHeight = clamp(nextHeight, MIN_OBJECT_HEIGHT, resizeState.sceneHeight - nextY);

      if (resizeState.coordinateSpace === 'projected') {
        writeStagePlacement(resizeState.stageMockupId, resizeState.objectId, {
          x: Math.round(nextX),
          y: Math.round(nextY),
          width: Math.round(nextWidth),
          height: Math.round(nextHeight),
          rotation: readStagePlacement(resizeState.stageMockupId, source).rotation ?? 0
        });
        return;
      }

      setObjects(
        current.map((item) => {
          if (item.id !== resizeState.objectId || item.locked) {
            return item;
          }
          return { ...item, x: Math.round(nextX), y: Math.round(nextY), width: Math.round(nextWidth), height: Math.round(nextHeight) };
        })
      );
    };

    const handlePointerUp = (event?: PointerEvent | MouseEvent) => {
      if (event && 'pointerId' in event && typeof event.pointerId === 'number' && event.pointerId !== resizeState.pointerId) {
        return;
      }

      clearInteractions();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('mouseup', handlePointerUp as EventListener);
    window.addEventListener('blur', clearInteractions);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('mouseup', handlePointerUp as EventListener);
      window.removeEventListener('blur', clearInteractions);
    };
  }, [clearInteractions, readStagePlacement, resizeState, writeStagePlacement]);

  useEffect(() => {
    if (!rotateState) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== rotateState.pointerId) {
        return;
      }

      if (event.buttons === 0) {
        clearInteractions();
        return;
      }

      const pointerAngle = pointerAngleDegrees(event.clientX, event.clientY, rotateState.centerX, rotateState.centerY);

      setRotateState((currentState) => {
        if (!currentState || currentState.objectId !== rotateState.objectId) {
          return currentState;
        }

        const angleDelta = shortestAngleDelta(currentState.startPointerAngle, pointerAngle);
        const nextRotation = currentState.startObjectAngle + angleDelta;

        const current = objectsRef.current;
        const source = current.find((item) => item.id === currentState.objectId);
        if (!source || source.locked) {
          return currentState;
        }

        if (currentState.sceneKind === 'preview' && currentState.stageMockupId && source.type !== 'mockup') {
          const placed = readStagePlacement(currentState.stageMockupId, source);
          writeStagePlacement(currentState.stageMockupId, currentState.objectId, {
            x: placed.x,
            y: placed.y,
            width: placed.width,
            height: placed.height,
            rotation: nextRotation
          });
        } else {
          setObjects(
            current.map((item) => {
              if (item.id !== currentState.objectId || item.locked) {
                return item;
              }
              return { ...item, rotation: nextRotation };
            })
          );
        }

        return currentState;
      });
    };

    const handlePointerUp = (event?: PointerEvent | MouseEvent) => {
      if (event && 'pointerId' in event && typeof event.pointerId === 'number' && event.pointerId !== rotateState.pointerId) {
        return;
      }

      clearInteractions();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('mouseup', handlePointerUp as EventListener);
    window.addEventListener('blur', clearInteractions);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('mouseup', handlePointerUp as EventListener);
      window.removeEventListener('blur', clearInteractions);
    };
  }, [clearInteractions, readStagePlacement, rotateState, writeStagePlacement]);


  const toggleExportFormat = useCallback((format: ExportFormat) => {
    setExportFormats((current) => ({ ...current, [format]: !current[format] }));
  }, []);

  const selectedExportFormats = useMemo(
    () => (Object.entries(exportFormats).filter(([, enabled]) => enabled).map(([format]) => format) as ExportFormat[]),
    [exportFormats]
  );

  const exportableStageIds = useMemo(() => visibleMockupObjects.map((item) => item.id), [visibleMockupObjects]);
  const exportableStageIdSet = useMemo(() => new Set(exportableStageIds), [exportableStageIds]);

  const handleExport = useCallback(
    async (scope: 'selected' | 'all') => {
      const stageIds = scope === 'selected'
        ? (previewSelectedStageId && exportableStageIdSet.has(previewSelectedStageId) ? [previewSelectedStageId] : exportableStageIds.slice(0, 1))
        : exportableStageIds;

      if (!stageIds.length) {
        setExportStatus('error');
        setExportMessage('Export için en az bir mockup stage gerekli.');
        return;
      }

      if (!selectedExportFormats.length) {
        setExportStatus('error');
        setExportMessage('En az bir format seçmen gerekiyor.');
        return;
      }

      setExportStatus('working');
      setExportMessage(scope === 'selected' ? 'Seçili stage export hazırlanıyor...' : 'Toplu export hazırlanıyor...');

      try {
        const stageCanvasCache = new Map<string, Array<{ stageId: string; canvas: HTMLCanvasElement }>>();
        const imageCache = new Map<string, Promise<HTMLImageElement>>();
        const renderSize = stageIds.length > 20 ? 1300 : stageIds.length > 10 ? 1600 : 2000;
        const getStageCanvases = async (transparent: boolean) => {
          const cacheKey = transparent ? 'transparent' : 'opaque';
          const cached = stageCanvasCache.get(cacheKey);
          if (cached) {
            return cached;
          }

          const rendered = await Promise.all(
            stageIds.map(async (stageId) => ({
              stageId,
                canvas: await renderStageExportCanvas({
                  stageMockupId: stageId,
                  objects: objectsRef.current,
                  stagePlacements: stagePlacementsRef.current,
                  size: renderSize,
                  transparent,
                  imageCache
                })
              }))
            );
          stageCanvasCache.set(cacheKey, rendered);
          return rendered;
        };

        const zip = new JSZip();
        const outputEntries: Array<{ fileName: string; blob: Blob }> = [];

        for (const format of selectedExportFormats) {
          const stageCanvases = await getStageCanvases(format === 'png' && exportTransparentPng);
          if (format === 'pdf') {
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [renderSize, renderSize], compress: false });
            stageCanvases.forEach(({ canvas }, index) => {
              if (index > 0) {
                pdf.addPage([renderSize, renderSize], 'portrait');
              }
              pdf.addImage(canvas, 'JPEG', 0, 0, renderSize, renderSize, undefined, 'FAST');
            });
            const pdfBlob = pdf.output('blob');
            outputEntries.push({
              fileName: stageCanvases.length > 1 ? 'printra-export-bundle.pdf' : `${sanitizeFileName(getStageName(stageCanvases[0].stageId, objectsRef.current))}.pdf`,
              blob: pdfBlob
            });
            continue;
          }

          for (const { stageId, canvas } of stageCanvases) {
            const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
            const quality = format === 'jpg' ? 0.97 : undefined;
            const blob = await canvasToBlob(canvas, mimeType, quality);
            outputEntries.push({
              fileName: `${sanitizeFileName(getStageName(stageId, objectsRef.current))}.${format === 'jpg' ? 'jpg' : 'png'}`,
              blob
            });
          }
        }

        const shouldUseServerExport =
          outputEntries.length > 60 ||
          stageIds.length > 60;

        if (outputEntries.length === 1) {
          downloadBlob(outputEntries[0].blob, outputEntries[0].fileName);
        } else if (shouldUseServerExport) {
          try {
            setExportMessage('Large batch algılandı, server export kuyruğuna aktarılıyor...');
            const jobId = await createServerExportJob(
              API_BASE,
              outputEntries.map((entry) => ({
                fileName: entry.fileName,
                blob: entry.blob,
                mimeType: entry.fileName.toLowerCase().endsWith('.jpg')
                  ? 'image/jpeg'
                  : entry.fileName.toLowerCase().endsWith('.png')
                    ? 'image/png'
                    : 'application/pdf'
              }))
            );
            const job = await waitForServerExport(
              API_BASE,
              jobId,
              (status) => {
                if (status.status === 'queued') {
                  setExportMessage('Server export sıraya alındı...');
                } else if (status.status === 'processing') {
                  setExportMessage('Server export zip hazırlıyor...');
                }
              },
              { timeoutMs: 12000, intervalMs: 500 }
            );
            if (job.status !== 'completed') {
              throw new Error(job.error || 'Server export failed');
            }
            await downloadServerExport(API_BASE, jobId, `printra-export-${scope}-${Date.now()}.zip`);
          } catch {
            setExportMessage('Server export ulaşılamadı, local zip fallback çalışıyor...');
            for (const entry of outputEntries) {
              zip.file(entry.fileName, entry.blob);
            }
            const archive = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
            downloadBlob(archive, `printra-export-${scope === 'selected' ? 'selected' : 'all'}-${Date.now()}.zip`);
          }
        } else {
          for (const entry of outputEntries) {
            zip.file(entry.fileName, entry.blob);
          }
          const archive = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
          downloadBlob(archive, `printra-export-${scope === 'selected' ? 'selected' : 'all'}-${Date.now()}.zip`);
        }

        setExportStatus('done');
        setExportMessage(
          outputEntries.length === 1
            ? 'Export başarıyla indirildi.'
            : `${outputEntries.length} çıktı güçlü kalite ile zip olarak hazırlandı.`
        );
      } catch (error) {
        console.error(error);
        setExportStatus('error');
        setExportMessage('Export sırasında hata oluştu. Bu stage içeriğini bana bildir, temiz şekilde düzeltelim.');
      }
    },
    [exportTransparentPng, exportableStageIdSet, exportableStageIds, previewSelectedStageId, selectedExportFormats]
  );

  const commandBarNode = (
    <section className="relative z-[140] overflow-visible rounded-[18px] border border-white/10 bg-white/[0.03] shadow-[0_18px_45px_rgba(2,6,23,0.28)] backdrop-blur-xl">
      <button
        type="button"
        onClick={() => setCommandBarOpen((current) => !current)}
        aria-expanded={commandBarOpen}
        className="flex w-full items-center justify-between gap-4 px-4 py-2 text-left"
      >
        <div className="min-w-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-100/90">{t('studioCommandBarTitle')}</h3>
          <p className="mt-1 text-[11px] leading-5 text-slate-400">{t('studioCommandBarDesc')}</p>
        </div>
        <div className="inline-flex items-center gap-3">
          <div className="hidden rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-slate-400 sm:block">{commandBarOpen ? t('studioCommandBarOpen') : t('studioCommandBarCollapsed')}</div>
          <span className={["text-[10px] text-slate-400 transition", commandBarOpen ? 'rotate-180' : ''].join(' ')}>⌄</span>
        </div>
      </button>
      {commandBarOpen ? (
        <div className="border-t border-white/8 px-4 py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Mockup Editor</Badge>
                <Badge>{visibleMockupObjects.length > 1 ? `${visibleMockupObjects.length} stage` : 'Single stage surface'}</Badge>
                <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-400">History {historyDepth} / Redo {futureDepth}</div>
                <button type="button" onClick={undo} disabled={!historyDepth} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-sky-400/25 hover:bg-sky-400/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">Undo</button>
                <button type="button" onClick={redo} disabled={!futureDepth} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-sky-400/25 hover:bg-sky-400/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">Redo</button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <StatusCard label={t('studioStatusActiveMode')} value={currentMode.label} />
                <StatusCard label={t('studioStatusActiveTool')} value={tools.find((tool) => tool.key === activeTool)?.label ?? '-'} />
                <StatusCard label={t('studioStatusSelectedObject')} value={activeObject.name} />
                <StatusCard label={t('studioStatusObjectCount')} value={String(objectCount)} />
              </div>
              <div className="grid gap-3 rounded-[20px] border border-white/10 bg-white/[0.03] p-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-100/80">Project binding</p>
                  <input
                    value={projectNameDraft}
                    onChange={(event) => setProjectNameDraft(event.target.value)}
                    placeholder="Project name"
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none"
                  />
                  <input
                    value={projectDescriptionDraft}
                    onChange={(event) => setProjectDescriptionDraft(event.target.value)}
                    placeholder="Short project note"
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <StatusCard label="Project" value={currentProjectId ? 'Linked' : 'Unsaved'} />
                    <StatusCard label="Stages" value={String(visibleMockupObjects.length)} />
                    <StatusCard label="Assets" value={String(visibleImageCount)} />
                  </div>
                  <p className="rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2 text-xs text-slate-300">{projectSaveMessage}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <button type="button" onClick={handleSaveProject} disabled={projectSaveState === 'saving' || projectSaveState === 'loading'} className="rounded-2xl border border-emerald-300/35 bg-emerald-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-50 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-60">{currentProjectId ? 'Save project' : 'Create project'}</button>
                  <a href={currentProjectId ? `/projects?projectId=${currentProjectId}` : '/projects'} className="rounded-2xl border border-sky-300/35 bg-sky-400/10 px-4 py-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-sky-50 transition hover:bg-sky-400/15">Open projects</a>
                </div>
              </div>
            </div>

            <div className="relative z-[60] flex shrink-0 items-start justify-end self-start xl:min-w-[3.25rem]">
              {exportMenuOpen ? (
                <div className="studio-export-popover absolute right-[3.25rem] top-0 z-[220] w-[min(92vw,20rem)] overflow-hidden rounded-[22px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.08),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.96))] p-3 shadow-[0_32px_80px_rgba(2,6,23,0.55)] xl:w-[20rem]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200/80">Export</p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-400">{t('studioExportDesc')}</p>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-slate-400">{exportStatus === 'working' ? 'Working' : exportStatus === 'done' ? 'Done' : exportStatus === 'error' ? 'Error' : 'Idle'}</div>
                  </div>
                  <div className="mt-3 grid gap-2.5">
                    <div className="grid grid-cols-3 gap-2">
                      {(['png', 'jpg', 'pdf'] as ExportFormat[]).map((format) => (
                        <label key={format} className={[
                          'flex cursor-pointer items-center justify-between rounded-2xl border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] transition',
                          exportFormats[format] ? 'border-amber-300/30 bg-amber-400/10 text-amber-50' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20'
                        ].join(' ')}>
                          <span>{format}</span>
                          <input type="checkbox" checked={exportFormats[format]} onChange={() => toggleExportFormat(format)} className="h-3.5 w-3.5 rounded border-white/20 bg-slate-950/60" />
                        </label>
                      ))}
                    </div>
                    <label className={[
                      'flex cursor-pointer items-center justify-between rounded-2xl border px-3 py-2 text-[11px] transition',
                      exportFormats.png ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-50' : 'border-white/10 bg-white/[0.03] text-slate-400 opacity-70'
                    ].join(' ')}>
                      <span className="font-semibold uppercase tracking-[0.16em]">PNG transparent</span>
                      <input type="checkbox" checked={exportTransparentPng} onChange={() => setExportTransparentPng((current) => !current)} disabled={!exportFormats.png} className="h-3.5 w-3.5 rounded border-white/20 bg-slate-950/60" />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => handleExport('selected')} disabled={exportStatus === 'working'} className="rounded-2xl border border-sky-300/35 bg-sky-400/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-50 transition hover:border-sky-200/55 hover:bg-sky-400/15 disabled:cursor-not-allowed disabled:opacity-60">
              Selected
            </button>
                      <button type="button" onClick={() => handleExport('all')} disabled={exportStatus === 'working'} className="rounded-2xl border border-fuchsia-300/35 bg-fuchsia-400/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-fuchsia-50 transition hover:border-fuchsia-200/55 hover:bg-fuchsia-400/15 disabled:cursor-not-allowed disabled:opacity-60">All stages</button>
                    </div>
                    {exportMessage ? <p className="rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">{exportMessage}</p> : null}
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setExportMenuOpen((current) => !current)}
                aria-expanded={exportMenuOpen}
                className="studio-export-trigger inline-flex h-[3.65rem] w-10 shrink-0 items-center justify-center rounded-[16px] border border-amber-300/35 bg-[linear-gradient(180deg,rgba(251,191,36,0.22),rgba(251,191,36,0.08))] px-0 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-50 shadow-[0_12px_24px_rgba(251,191,36,0.12)] transition hover:-translate-y-0.5 hover:border-amber-200/55 hover:bg-[linear-gradient(180deg,rgba(251,191,36,0.28),rgba(251,191,36,0.12))]"
                style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
              >
                Export {exportMenuOpen ? '•' : ''}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );

  return (
    <div
      className="space-y-6"
      onPointerDownCapture={(event) => {
        const target = event.target as HTMLElement | null;
        if (!target?.closest('[data-canvas-context-menu="true"]')) {
          setCanvasContextMenu(null);
        }
      }}
    >
      <input ref={uploadImageInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleUploadImageFile} />
      <input ref={uploadMockupInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleUploadMockupFile} />
      <input ref={replaceImageInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleReplaceImageFile} />
      <input ref={libraryMockupUploadRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple className="hidden" onChange={handleLibraryMockupUpload} />
      <input ref={libraryDesignUploadRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple className="hidden" onChange={handleLibraryDesignUpload} />
      {commandBarPortalHost ? createPortal(commandBarNode, commandBarPortalHost) : commandBarNode}
      {canvasContextMenu ? (
        <div
          data-canvas-context-menu="true"
          className="fixed z-[260] w-44 rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-popover)] p-2 shadow-[0_18px_48px_rgba(15,23,42,0.28)] backdrop-blur-xl"
          style={{ left: Math.max(12, canvasContextMenu.x), top: Math.max(12, canvasContextMenu.y) }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              if (canvasContextMenu.objectType === 'mockup') {
                duplicateMockupObject(canvasContextMenu.objectId);
              } else {
                duplicateObject(canvasContextMenu.objectId);
              }
              setCanvasContextMenu(null);
            }}
            className="w-full rounded-xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] px-3 py-2 text-left text-xs font-semibold text-[var(--shell-heading)] transition hover:bg-[var(--shell-surface-strong)]"
          >
            {t('studioCtxDuplicate')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (canvasContextMenu.objectType === 'mockup') {
                deleteMockupObject(canvasContextMenu.objectId);
              } else {
                deleteObject(canvasContextMenu.objectId);
              }
              setCanvasContextMenu(null);
            }}
            className="mt-2 w-full rounded-xl border border-[var(--shell-danger-border)] bg-[var(--shell-danger-bg)] px-3 py-2 text-left text-xs font-semibold text-[var(--shell-danger)] transition hover:brightness-105"
          >
            {t('studioCtxDelete')}
          </button>
        </div>
      ) : null}


      <div
        className={[
          'relative grid items-start gap-6 xl:h-[calc(100vh-14rem)] xl:overflow-hidden',
          'xl:grid-cols-[minmax(0,1fr)_340px]'
        ].join(' ')}
      >
        {libraryPanelOpen ? (
        <div className="min-h-0 space-y-6 xl:absolute xl:left-0 xl:top-0 xl:z-20 xl:h-full xl:w-[400px] xl:overflow-y-auto xl:overscroll-contain xl:pr-1">
          <Panel title={libraryDrawerTitle} description={libraryDrawerDescription}>
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{t('studioPanelLabel')}</p>
              <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-slate-400">{activeLibraryDrawerTab === 'mockups' ? 'Mockups' : activeLibraryDrawerTab === 'designs' ? 'Designs' : 'Tools'}</div>
            </div>

            {activeLibraryDrawerTab === 'mockups' ? (
              <div className="mt-4 space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={mockupSectionDraft}
                    onChange={(event) => setMockupSectionDraft(event.target.value)}
                    placeholder={t('studioMockupSectionPlaceholder')}
                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-sm text-white outline-none transition focus:border-fuchsia-300/40"
                  />
                  <button
                    type="button"
                    onClick={() => addLibrarySection('mockup')}
                    className="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-400/10 px-4 py-2.5 text-sm font-semibold text-fuchsia-100 transition hover:border-fuchsia-300/50 hover:bg-fuchsia-400/15"
                  >
                    {t('studioAddSectionBtn')}
                  </button>
                </div>
                <div className="space-y-3">
                  {mockupSections.map((section) => (
                    <LibrarySectionCard
                      key={section.id}
                      kind="mockup"
                      section={section}
                      isOpen={openMockupSectionId === section.id}
                      onToggleOpen={() => setOpenMockupSectionId((current) => current === section.id ? '' : section.id)}
                      assets={mockupAssetsBySection.get(section.id) ?? []}
                      selectedIds={selectedMockupAssetIds}
                      menuOpen={openLibraryMenu === `mockup-${section.id}`}
                      onToggleMenu={() => setOpenLibraryMenu((current) => current === `mockup-${section.id}` ? null : `mockup-${section.id}`)}
                      onToggleSectionSelection={() => toggleLibrarySectionSelection('mockup', section.id)}
                      onToggleSelection={(assetId) => toggleLibrarySelection('mockup', assetId)}
                      onUpload={() => requestLibraryUpload('mockup', section.id)}
                      onSendSelected={() => sendLibrarySelection('mockup', section.id)}
                      onDuplicateSelected={() => duplicateLibrarySelection('mockup', section.id)}
                      onDeleteSelected={() => deleteLibrarySelection('mockup', section.id)}
                      onSendSingle={(asset) => sendSingleLibraryAsset('mockup', asset)}
                      accent="fuchsia"
                      helperText={t('studioMockupHelperMultiStage')}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {activeLibraryDrawerTab === 'designs' ? (
              <div className="mt-4 space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={designSectionDraft}
                    onChange={(event) => setDesignSectionDraft(event.target.value)}
                    placeholder={t('studioDesignSectionPlaceholder')}
                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-sm text-white outline-none transition focus:border-emerald-300/40"
                  />
                  <button
                    type="button"
                    onClick={() => addLibrarySection('design')}
                    className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/50 hover:bg-emerald-400/15"
                  >
                    {t('studioAddSectionBtn')}
                  </button>
                </div>
                <div className="space-y-3">
                  {designSections.map((section) => (
                    <LibrarySectionCard
                      key={section.id}
                      kind="design"
                      section={section}
                      isOpen={openDesignSectionId === section.id}
                      onToggleOpen={() => setOpenDesignSectionId((current) => current === section.id ? '' : section.id)}
                      assets={designAssetsBySection.get(section.id) ?? []}
                      selectedIds={selectedDesignAssetIds}
                      menuOpen={openLibraryMenu === `design-${section.id}`}
                      onToggleMenu={() => setOpenLibraryMenu((current) => current === `design-${section.id}` ? null : `design-${section.id}`)}
                      onToggleSectionSelection={() => toggleLibrarySectionSelection('design', section.id)}
                      onToggleSelection={(assetId) => toggleLibrarySelection('design', assetId)}
                      onUpload={() => requestLibraryUpload('design', section.id)}
                      onSendSelected={() => sendLibrarySelection('design', section.id)}
                      onDuplicateSelected={() => duplicateLibrarySelection('design', section.id)}
                      onDeleteSelected={() => deleteLibrarySelection('design', section.id)}
                      onSendSingle={(asset) => sendSingleLibraryAsset('design', asset)}
                      accent="emerald"
                      helperText={t('studioDesignHelperMultiSend')}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {activeLibraryDrawerTab === 'tools' ? (
              <div className="mt-4 space-y-3">
                {tools.map((tool) => {
                  const active = tool.key === activeTool;
                  return (
                    <button
                      key={tool.key}
                      type="button"
                      onClick={() => {
                        setActiveTool(tool.key);
                        setInspectorTab(tool.key === 'layers' ? 'layers' : 'properties');
                        const preferred =
                          tool.key === 'text'
                            ? objects.find((item) => item.type === 'text')
                            : tool.key === 'image'
                              ? objects.find((item) => item.type === 'image')
                              : tool.key === 'shape'
                                ? objects.find((item) => item.type === 'shape')
                                : tool.key === 'mockup'
                                  ? objects.find((item) => item.type === 'mockup')
                                  : undefined;
                        if (preferred) {
                          setDesignSelectedObjectId(preferred.id);
                          setPreviewSelectedObjectId(preferred.id);
                          setSelectionOwner(preferred.type === 'mockup' ? 'preview' : 'design');
                        }
                      }}
                      className={[
                        'w-full rounded-2xl border px-3 py-3 text-left transition',
                        active
                          ? 'border-sky-400/40 bg-sky-400/15 text-white'
                          : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-sky-400/25 hover:bg-sky-400/10 hover:text-white'
                      ].join(' ')}
                    >
                      <p className="text-sm font-semibold">{tool.label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{tool.hint}</p>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </Panel>
        </div>
        ) : null}
        <div className={["min-h-0 space-y-6 xl:h-full xl:overflow-y-auto xl:overscroll-contain xl:pr-1", libraryPanelOpen ? 'xl:pl-[420px]' : ''].join(' ')}>

          <Panel title={t('studioCanvasTitle')} description={t('studioCanvasDesc')}>
            <div className="rounded-[28px] border border-white/10 p-4" style={{ background: "var(--studio-canvas-shell)" }}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em]" style={{ color: "var(--studio-canvas-label)" }}>{t('studioCanvasState')}</p>
                  <h3 className="mt-2 text-lg font-semibold" style={{ color: "var(--studio-canvas-heading)" }}>{viewTitle}</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={clearSceneObjects}
                    className="rounded-2xl border border-[var(--shell-danger-border)] bg-[var(--shell-danger-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--shell-danger)] transition hover:brightness-105"
                  >
                    {t('studioClearScene')}
                  </button>
                  <Badge>{currentMode.label}</Badge>
                  <Badge>{tools.find((tool) => tool.key === activeTool)?.label}</Badge>
                  <Badge>{activeObject.type}</Badge>
                  <Badge>{interactionStateLabel}</Badge>
                </div>
              </div>

              <div className="mt-4 grid gap-4 grid-cols-1">
                {visibleMockupObjects.map((mockupObject, index) => (
                  <CanvasScene
                    key={mockupObject.id}
                    title={index === 0 ? t('studioMockupEditorSurface') : `${t('studioMockupStage')} ${index + 1}`}
                    sceneKind="preview"
                    objects={visibleObjects}
                    stagePlacements={stagePlacements}
                    stageMockupId={mockupObject.id}
                    activeObjectId={previewSelectedObjectId}
                    activeStageMockupId={previewSelectedStageId}
                    onSelect={(id, scene) => {
                      selectObjectFromScene(scene, id, mockupObject.id);
                    }}
                    onTextEditStart={beginInlineTextEdit}
                    editingObjectId={inlineTextEditId}
                    textDraft={inlineTextDraft}
                    onTextDraftChange={setInlineTextDraft}
                    onTextDraftCommit={commitInlineTextEdit}
                    onTextDraftCancel={cancelInlineTextEdit}
                    onDragStart={(payload) => {
                      if (resizeState || rotateState) return;
                      selectObjectFromScene(payload.sceneKind, payload.objectId, payload.stageMockupId);
                      pushHistorySnapshot();
                      setDragState(payload);
                    }}
                    onResizeStart={(payload) => {
                      selectObjectFromScene(payload.sceneKind, payload.objectId, payload.stageMockupId);
                      pushHistorySnapshot();
                      setResizeState(payload);
                    }}
                    onRotateStart={(payload) => {
                      selectObjectFromScene(payload.sceneKind, payload.objectId, payload.stageMockupId);
                      pushHistorySnapshot();
                      setRotateState(payload);
                    }}
                    draggingObjectId={dragState?.objectId ?? null}
                    resizingObjectId={resizeState?.objectId ?? null}
                    resizeHandle={resizeState?.handle ?? null}
                    rotatingObjectId={rotateState?.objectId ?? null}
                    snapGuides={activeGuideScene === 'preview' && previewSelectedStageId === mockupObject.id ? snapGuides : []}
                    emphasizeMockup
                    renderMockupBinding
                    allowProjectedSelection
                    showSelectionChrome={selectionOwner === 'preview' && hasPreviewSelection}
                    onObjectContextMenu={({ objectId, objectType, x, y }) => {
                      setCanvasContextMenu({ objectId, objectType, x, y });
                    }}
                  />
                ))}
              </div>
            </div>
          </Panel>

          <Panel title={activeCard.title} description={activeCard.summary}>
            <div className="grid gap-4 md:grid-cols-3">
              {activeCard.bullets.map((bullet) => (
                <div key={bullet} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-slate-300">
                  {bullet}
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="min-h-0 space-y-6 xl:h-full xl:overflow-y-auto xl:overscroll-contain xl:pr-1">
          <Panel title={t('studioInspectorTitle')} description={t('studioInspectorDesc')}>
            <div className="flex flex-wrap gap-2">
              {([
                ['properties', t('studioTabProperties')],
                ['layers', t('studioTabLayers')],
                ['scene', t('studioTabScene')]
              ] as Array<[InspectorTab, string]>).map(([key, label]) => {
                const active = inspectorTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setInspectorTab(key)}
                    className={[
                      'rounded-2xl border px-3 py-2 text-sm transition',
                      active
                        ? 'border-sky-400/40 bg-sky-400/15 text-sky-100'
                        : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-sky-400/25 hover:bg-sky-400/10 hover:text-white'
                    ].join(' ')}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
              {inspectorTab === 'properties' && (
                <ObjectInspector
                  object={activeObject}
                  modeLabel={currentMode.label}
                  toolLabel={tools.find((tool) => tool.key === activeTool)?.label ?? '-'}
                  isDragging={dragState?.objectId === activeObject.id}
                  isResizing={resizeState?.objectId === activeObject.id}
                  isRotating={rotateState?.objectId === activeObject.id}
                  onUpdateObject={(patch) => updateObjectGeometry(activeObject.id, patch)}
                  canEditGeometry={canEditActiveObjectGeometry}
                  onUpdateText={(patch, options) => updateTextProperties(activeObject.id, patch, options)}
                  onStartTextEdit={() => beginInlineTextEdit(activeObject.id)}
                  inlineEditing={inlineTextEditId === activeObject.id}
                  onUploadNewImage={requestNewImageUpload}
                  onReplaceImage={requestReplaceImage}
                />
              )}

              {inspectorTab === 'layers' && (
                <LayerList
                  objects={objects}
                  activeObjectId={activeObjectId}
                  onSelect={(objectId) => {
                    const objectType = objects.find((item) => item.id === objectId)?.type;
                    selectObjectFromScene(objectType === 'mockup' ? 'preview' : 'design', objectId, previewSelectedStageId ?? undefined);
                  }}
                  onRename={renameObject}
                  onToggleVisibility={toggleVisibility}
                  onToggleLock={toggleLock}
                  onDuplicate={duplicateObject}
                  onDelete={deleteObject}
                  compact
                />
              )}

              {inspectorTab === 'scene' && (
                <div className="space-y-4">
                  <InspectorRow label="Scene" value="Primary print canvas" />
                  <InspectorRow label="Object source" value="Local state v2 / draggable + resizable" />
                  <InspectorRow label="Mockup preset" value="Oversized t-shirt / front" />
                  <InspectorRow label="Printable area" value="Center chest binding active" />
                  <InspectorRow label="Binding" value={'Mockup surface + printable area'} />
                  <InspectorRow label="Guides" value="Center + edge" />
                </div>
              )}
            </div>
          </Panel>

          <Panel title={t('studioLayerLaneTitle')} description={t('studioLayerLaneDesc')}>
            <LayerList
              objects={objects}
              activeObjectId={activeObjectId}
              onSelect={(objectId) => {
                const objectType = objects.find((item) => item.id === objectId)?.type;
                selectObjectFromScene(objectType === 'mockup' ? 'preview' : 'design', objectId, previewSelectedStageId ?? undefined);
                setInspectorTab('layers');
              }}
              onRename={renameObject}
              onToggleVisibility={toggleVisibility}
              onToggleLock={toggleLock}
              onDuplicate={duplicateObject}
              onDelete={deleteObject}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}


function DrawerRailButton({
  label,
  accent,
  active,
  onClick
}: {
  label: string;
  accent: 'fuchsia' | 'emerald' | 'sky';
  active: boolean;
  onClick: () => void;
}) {
  const classes = accent === 'fuchsia'
    ? active
      ? 'border-fuchsia-300/40 bg-fuchsia-400/[0.16] text-fuchsia-50 shadow-[0_12px_30px_rgba(217,70,239,0.14)]'
      : 'border-fuchsia-400/20 bg-fuchsia-400/[0.06] text-fuchsia-100 hover:border-fuchsia-300/40 hover:bg-fuchsia-400/[0.12]'
    : accent === 'emerald'
      ? active
        ? 'border-emerald-300/40 bg-emerald-400/[0.16] text-emerald-50 shadow-[0_12px_30px_rgba(16,185,129,0.14)]'
        : 'border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-100 hover:border-emerald-300/40 hover:bg-emerald-400/[0.12]'
      : active
        ? 'border-sky-300/40 bg-sky-400/[0.16] text-sky-50 shadow-[0_12px_30px_rgba(56,189,248,0.14)]'
        : 'border-sky-400/20 bg-sky-400/[0.06] text-sky-100 hover:border-sky-300/40 hover:bg-sky-400/[0.12]';

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition',
        classes
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function DrawerTabButton({
  label,
  accent,
  active,
  onClick
}: {
  label: string;
  accent: 'fuchsia' | 'emerald' | 'sky';
  active: boolean;
  onClick: () => void;
}) {
  const classes = accent === 'fuchsia'
    ? active
      ? 'border-fuchsia-300/35 bg-fuchsia-400/[0.14] text-fuchsia-50'
      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-fuchsia-300/25 hover:bg-fuchsia-400/[0.08] hover:text-fuchsia-50'
    : accent === 'emerald'
      ? active
        ? 'border-emerald-300/35 bg-emerald-400/[0.14] text-emerald-50'
        : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-emerald-300/25 hover:bg-emerald-400/[0.08] hover:text-emerald-50'
      : active
        ? 'border-sky-300/35 bg-sky-400/[0.14] text-sky-50'
        : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-sky-300/25 hover:bg-sky-400/[0.08] hover:text-sky-50';

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-2xl border px-3 py-2 text-sm font-medium transition',
        classes
      ].join(' ')}
    >
      {label}
    </button>
  );
}


function LayerList({
  objects,
  stagePlacements,
  stageMockupId,
  activeObjectId,
  activeStageMockupId,
  onSelect,
  onRename,
  onToggleVisibility,
  onToggleLock,
  onDuplicate,
  onDelete,
  compact = false
}: {
  objects: StudioObject[];
  stagePlacements?: StagePlacementMap;
  stageMockupId?: string;
  activeObjectId: string;
  activeStageMockupId?: string | null;
  onSelect: (objectId: string) => void;
  onRename: (objectId: string, nextName: string) => void;
  onToggleVisibility: (objectId: string) => void;
  onToggleLock: (objectId: string) => void;
  onDuplicate: (objectId: string) => void;
  onDelete: (objectId: string) => void;
  compact?: boolean;
}) {
  return (
    <div className="space-y-3">
      {objects.map((object, index) => {
        const active = object.id === activeObjectId;
        const protectedLayer = object.type === 'mockup';
        return (
          <div
            key={object.id}
            className={[
              'rounded-2xl border p-3 transition',
              active
                ? 'border-sky-400/40 bg-sky-400/15 text-white'
                : 'border-white/10 bg-slate-950/70 text-slate-300 hover:border-sky-400/25 hover:bg-sky-400/10 hover:text-white'
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-3">
              <button type="button" onClick={() => onSelect(object.id)} className="min-w-0 flex-1 text-left">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Layer {index + 1}</p>
                <p className="mt-1 truncate text-sm font-semibold">{object.name}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-slate-500">{object.type}</p>
              </button>
              <div className="text-right text-[11px] text-slate-400">
                <p>{object.visible === false ? 'hidden' : 'visible'}</p>
                <p>{object.locked ? 'locked' : `${object.width}×${object.height}`}</p>
                <p>{object.rotation ?? 0}°</p>
              </div>
            </div>

            <div className="mt-3">
              <input
                type="text"
                value={object.name}
                onChange={(event) => onRename(object.id, event.target.value)}
                disabled={protectedLayer}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm font-medium text-white outline-none transition focus:border-sky-400/40 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div className={["mt-3 grid gap-2", compact ? 'grid-cols-2' : 'grid-cols-5'].join(' ')}>
              <LayerActionButton
                label={object.visible === false ? 'Show' : 'Hide'}
                onClick={() => onToggleVisibility(object.id)}
                disabled={protectedLayer}
              />
              <LayerActionButton
                label={object.locked ? 'Unlock' : 'Lock'}
                onClick={() => onToggleLock(object.id)}
                disabled={protectedLayer}
              />
              <LayerActionButton
                label="Duplicate"
                onClick={() => onDuplicate(object.id)}
                disabled={protectedLayer}
              />
              <LayerActionButton
                label="Delete"
                onClick={() => onDelete(object.id)}
                disabled={protectedLayer}
              />
              {!compact && <div className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-center text-[11px] uppercase tracking-[0.2em] text-slate-500">{protectedLayer ? 'Protected' : 'Editable'}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LayerActionButton({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-sky-400/25 hover:bg-sky-400/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function LibrarySectionCard({
  kind,
  section,
  isOpen,
  onToggleOpen,
  assets,
  selectedIds,
  menuOpen,
  onToggleMenu,
  onToggleSectionSelection,
  onToggleSelection,
  onUpload,
  onSendSelected,
  onDuplicateSelected,
  onDeleteSelected,
  onSendSingle,
  accent,
  helperText
}: {
  kind: LibraryKind;
  section: LibrarySection;
  isOpen: boolean;
  onToggleOpen: () => void;
  assets: LibraryAsset[];
  selectedIds: string[];
  menuOpen: boolean;
  onToggleMenu: () => void;
  onToggleSectionSelection: () => void;
  onToggleSelection: (assetId: string) => void;
  onUpload: () => void;
  onSendSelected: () => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
  onSendSingle: (asset: LibraryAsset) => void;
  accent: 'fuchsia' | 'emerald';
  helperText: string;
}) {
  const { t } = useLocale();
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCount = useMemo(() => assets.reduce((count, asset) => count + (selectedIdSet.has(asset.id) ? 1 : 0), 0), [assets, selectedIdSet]);
  const accentClasses = accent === 'fuchsia'
    ? {
        shell: 'border-fuchsia-400/18 bg-fuchsia-400/[0.04]',
        pill: 'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-100',
        button: 'border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-100 hover:border-fuchsia-300/50 hover:bg-fuchsia-400/15',
        checkbox: 'accent-fuchsia-400'
      }
    : {
        shell: 'border-emerald-400/18 bg-emerald-400/[0.04]',
        pill: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100',
        button: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100 hover:border-emerald-300/50 hover:bg-emerald-400/15',
        checkbox: 'accent-emerald-400'
      };

  return (
    <div
      className={["overflow-hidden rounded-[24px] border p-4", accentClasses.shell].join(' ')}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '420px' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleOpen}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1 text-left transition hover:bg-white/[0.08]"
            >
              <span className="text-sm font-semibold text-white">{section.name}</span>
              <span className={["text-xs text-slate-300 transition", isOpen ? 'rotate-180' : ''].join(' ')}>⌄</span>
            </button>
            <span className={["rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]", accentClasses.pill].join(' ')}>
              {assets.length} {t('studioRecordCount')}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">{helperText}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-2.5 py-2">
            <input type="checkbox" checked={!!assets.length && selectedCount === assets.length} onChange={onToggleSectionSelection} className={["h-4 w-4 rounded border-white/20 bg-slate-950/60", accentClasses.checkbox].join(' ')} />
          </label>
          <div className="relative">
            <button type="button" onClick={onToggleMenu} className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.07]">
              {t('studioOptionsBtn')}
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-[calc(100%+10px)] z-30 w-56 rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-[0_18px_50px_rgba(2,6,23,0.45)] backdrop-blur-xl">
              <LibraryMenuButton label={t('studioUploadLabel')} onClick={onUpload} />
              <LibraryMenuButton label={kind === 'mockup' ? t('studioSendSelectedMockups') : t('studioSendSelectedDesigns')} onClick={onSendSelected} disabled={!selectedCount} />
              <LibraryMenuButton label={t('studioDuplicateSelected')} onClick={onDuplicateSelected} disabled={!selectedCount} />
              <LibraryMenuButton label={t('studioDeleteSelected')} onClick={onDeleteSelected} disabled={!selectedCount} danger />
            </div>
            ) : null}
          </div>
        </div>
      </div>

      {isOpen ? (
      <div className="mt-4 space-y-2">
        {!assets.length ? (
          <button type="button" onClick={onUpload} className={["w-full rounded-2xl border border-dashed px-4 py-4 text-left text-sm font-medium transition", accentClasses.button].join(' ')}>
            {t('studioEmptySectionLabel')}
          </button>
        ) : (
          assets.map((asset) => {
            const selected = selectedIdSet.has(asset.id);
            return (
              <div key={asset.id} className={["rounded-2xl border p-3 transition", selected ? 'border-sky-300/35 bg-sky-400/10' : 'border-white/10 bg-slate-950/70'].join(' ')}>
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={selected} onChange={() => onToggleSelection(asset.id)} className={["h-4 w-4 rounded border-white/20 bg-slate-950/60", accentClasses.checkbox].join(' ')} />
                  <div className="h-12 w-12 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90">
                    <img src={asset.src} alt={asset.name} className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{asset.name}</p>
                    <p className="mt-1 truncate text-[11px] uppercase tracking-[0.18em] text-slate-500">{asset.linkedObjectId ? t('studioAssetLinkedCanvas') : t('studioAssetLibraryReady')}</p>
                  </div>
                  <button type="button" onClick={() => onSendSingle(asset)} className={["rounded-xl border px-3 py-2 text-xs font-semibold transition", accentClasses.button].join(' ')}>
                    {t('studioSendBtn')}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      ) : null}
    </div>
  );
}

function LibraryMenuButton({ label, onClick, disabled = false, danger = false }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition',
        danger
          ? 'text-rose-100 hover:bg-rose-400/12 disabled:hover:bg-transparent'
          : 'text-slate-200 hover:bg-white/[0.05] disabled:hover:bg-transparent',
        disabled ? 'cursor-not-allowed opacity-40' : ''
      ].join(' ')}
    >
      <span>{label}</span>
    </button>
  );
}


function renderProjectedObject({
  object,
  sourceObjectId,
  projectedFrame,
  projectionTuning,
  activeObjectId,
  onSelect,
  onDragStart,
  onResizeStart,
  onRotateStart,
  sceneRef,
  printableArea,
  stageMockupId,
  activeStageMockupId,
  interactive,
  showSelectionChrome,
  resizingObjectId,
  resizeHandle,
  rotatingObjectId,
  onObjectContextMenu
}: {
  object: StudioObject;
  sourceObjectId: string;
  projectedFrame: { x: number; y: number; width: number; height: number };
  projectionTuning: ProjectionTuning;
  activeObjectId: string;
  activeStageMockupId?: string | null;
  onSelect: (id: string) => void;
  onDragStart: (payload: DragState) => void;
  onResizeStart: (payload: ResizeState) => void;
  onRotateStart: (payload: RotateState) => void;
  sceneRef: RefObject<HTMLDivElement | null>;
  printableArea: { x: number; y: number; width: number; height: number };
  stageMockupId?: string;
  interactive: boolean;
  showSelectionChrome: boolean;
  resizingObjectId: string | null;
  resizeHandle: ResizeHandle | null;
  rotatingObjectId: string | null;
  onObjectContextMenu?: (payload: { objectId: string; objectType: ObjectType; x: number; y: number }) => void;
}) {
  const active = sourceObjectId === activeObjectId && stageMockupId === activeStageMockupId && showSelectionChrome;
  const resizing = resizingObjectId === sourceObjectId;
  const rotating = rotatingObjectId === sourceObjectId;
  const swallowPreviewEvent = (event: SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const baseStyle = {
    left: `${projectedFrame.x}%`,
    top: `${projectedFrame.y}%`,
    width: `${projectedFrame.width}%`,
    height: `${projectedFrame.height}%`,
    ...getProjectedObjectShellStyle(object, projectionTuning)
  };

  return (
    <button
      key={`projection-${stageMockupId ?? 'stage'}-${sourceObjectId}`}
      type="button"
      data-projected-object="true"
      onClick={interactive ? (event) => {
        swallowPreviewEvent(event);
        onSelect(sourceObjectId);
      } : undefined}
      onContextMenu={interactive ? (event) => {
        swallowPreviewEvent(event);
        onSelect(sourceObjectId);
        onObjectContextMenu?.({
          objectId: sourceObjectId,
          objectType: object.type,
          x: event.clientX,
          y: event.clientY
        });
      } : undefined}
      onPointerDown={interactive ? (event) => {
        swallowPreviewEvent(event);
        onSelect(sourceObjectId);

        const sceneRect = sceneRef.current?.getBoundingClientRect();
        if (!sceneRect) {
  const { t } = useLocale();
          return;
        }

        const baseSceneScaleX = sceneRect.width / SCENE_BASE_WIDTH;
        const baseSceneScaleY = sceneRect.height / SCENE_BASE_HEIGHT;
        const pointerSceneX = ((event.clientX - sceneRect.left) / sceneRect.width) * SCENE_BASE_WIDTH;
        const pointerSceneY = ((event.clientY - sceneRect.top) / sceneRect.height) * SCENE_BASE_HEIGHT;

        onDragStart({
          objectId: sourceObjectId ?? object.id,
          sceneKind: 'preview',
          stageMockupId,
          pointerId: event.pointerId,
          pointerOffsetX: pointerSceneX - object.x,
          pointerOffsetY: pointerSceneY - object.y,
          sceneLeft: sceneRect.left,
          sceneTop: sceneRect.top,
          sceneWidth: SCENE_BASE_WIDTH,
          sceneHeight: SCENE_BASE_HEIGHT,
          sceneScaleX: baseSceneScaleX,
          sceneScaleY: baseSceneScaleY,
          coordinateSpace: 'projected',
          printableX: printableArea.x,
          printableY: printableArea.y,
          printableWidth: printableArea.width,
          printableHeight: printableArea.height
        });
      } : undefined}
      onPointerUp={interactive ? swallowPreviewEvent : undefined}
      className={[
        interactive ? 'pointer-events-auto' : 'pointer-events-none',
        'absolute z-20 overflow-visible rounded-[18px] text-left transition-[box-shadow,filter] duration-150',
        active
          ? 'shadow-[0_0_0_1px_rgba(236,72,153,0.9),0_0_0_4px_rgba(236,72,153,0.16),0_20px_50px_rgba(15,23,42,0.42)]'
          : 'hover:shadow-[0_0_0_1px_rgba(125,211,252,0.3),0_10px_30px_rgba(15,23,42,0.2)]'
      ].join(' ')}
      style={baseStyle}
    >
      {active ? (
        <>
          <span className="pointer-events-none absolute inset-0 rounded-[18px] border border-fuchsia-200/90" />
          <span className="pointer-events-none absolute inset-[6px] rounded-[14px] border border-white/30" />
          <span className="pointer-events-none absolute -inset-px rounded-[18px] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_42%),linear-gradient(135deg,rgba(244,114,182,0.12),transparent_48%,rgba(56,189,248,0.12))]" />
        </>
      ) : null}
      <span className="pointer-events-none absolute inset-0" style={getProjectedContentStyle(projectionTuning)}>
        {object.type === 'image' && object.imageSrc ? (
          <>
            <img
              src={object.imageSrc}
              alt={object.name}
              className="pointer-events-none absolute inset-0 h-full w-full object-contain"
              style={getProjectedImageStyle(projectionTuning)}
              draggable={false}
            />
          </>
        ) : null}
        {object.type === 'text' ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-2">
            <p
              className="w-full leading-tight"
              style={{
                fontSize: Math.max(10, Math.round((object.fontSize ?? 24) * 0.55)),
                fontWeight: object.fontWeight ?? 700,
                textAlign: object.textAlign ?? 'center',
                color: object.textColor ?? 'var(--studio-canvas-heading)',
                filter: `contrast(${1 + projectionTuning.depth * 0.12}) brightness(${1 - projectionTuning.depth * 0.06})`
              }}
            >
              {object.text}
            </p>
          </div>
        ) : null}
        {object.type === 'shape' ? (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              borderRadius: object.radius ?? 22,
              background: object.fill ?? 'rgba(255,255,255,0.16)',
              mixBlendMode: 'multiply',
              filter: `brightness(${1 - projectionTuning.depth * 0.05})`
            }}
          />
        ) : null}
      </span>
      {object.type === 'shape' ? (
        <span
          className="pointer-events-none absolute inset-0 rounded-[18px]"
          style={getProjectedOcclusionStyle(projectionTuning)}
        />
      ) : null}

      {active && interactive ? (
        <>
          <span
            onPointerDown={(event) => {
              swallowPreviewEvent(event);
              event.currentTarget.setPointerCapture?.(event.pointerId);
              const sceneRect = sceneRef.current?.getBoundingClientRect();
              if (!sceneRect) {
                return;
              }
              const objectRect = (event.currentTarget.parentElement as HTMLElement | null)?.getBoundingClientRect();
              const centerX = objectRect ? objectRect.left + objectRect.width / 2 : sceneRect.left + sceneRect.width / 2;
              const centerY = objectRect ? objectRect.top + objectRect.height / 2 : sceneRect.top + sceneRect.height / 2;
              const startPointerAngle = pointerAngleDegrees(event.clientX, event.clientY, centerX, centerY);
              onRotateStart({
                objectId: sourceObjectId ?? object.id,
                sceneKind: 'preview',
                stageMockupId,
                pointerId: event.pointerId,
                startObjectAngle: object.rotation ?? 0,
                startPointerAngle,
                pointerAngleOffset: (object.rotation ?? 0) - startPointerAngle,
                centerX,
                centerY
              });
            }}
            className={[
              'absolute left-1/2 top-0 grid h-5 w-5 -translate-x-1/2 -translate-y-10 place-items-center rounded-full border border-white/70 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.95),rgba(244,114,182,0.92)_55%,rgba(168,85,247,0.9))] shadow-[0_0_0_2px_rgba(15,23,42,0.92),0_0_0_5px_rgba(244,114,182,0.18),0_12px_28px_rgba(15,23,42,0.38)] cursor-grab transition-[transform,box-shadow,filter] duration-150',
              rotating ? 'scale-110 cursor-grabbing shadow-[0_0_0_2px_rgba(15,23,42,0.92),0_0_0_6px_rgba(244,114,182,0.28),0_14px_34px_rgba(15,23,42,0.46)]' : 'hover:scale-105 hover:brightness-110'
            ].join(' ')}
            aria-label="Rotate selected design"
          >
            <span className="pointer-events-none h-1.5 w-1.5 rounded-full bg-white/95 shadow-[0_0_12px_rgba(255,255,255,0.75)]" />
            <span className="pointer-events-none absolute left-1/2 top-5 h-8 w-px -translate-x-1/2 bg-gradient-to-b from-fuchsia-200/85 via-white/30 to-transparent" />
          </span>
          {(['nw', 'ne', 'sw', 'se'] as ResizeHandle[]).map((handle) => {
            const positions: Record<ResizeHandle, string> = {
              nw: '-left-2 -top-2 cursor-nwse-resize',
              ne: '-right-2 -top-2 cursor-nesw-resize',
              sw: '-left-2 -bottom-2 cursor-nesw-resize',
              se: '-right-2 -bottom-2 cursor-nwse-resize'
            };
            return (
              <span
                key={`${sourceObjectId}-${handle}`}
                onPointerDown={(event) => {
                  swallowPreviewEvent(event);
                  const sceneRect = sceneRef.current?.getBoundingClientRect();
                  if (!sceneRect) {
                    return;
                  }
                  const projectedScaleX = (sceneRect.width / SCENE_BASE_WIDTH) * (printableArea.width / SCENE_BASE_WIDTH);
                  const projectedScaleY = (sceneRect.height / SCENE_BASE_HEIGHT) * (printableArea.height / SCENE_BASE_HEIGHT);
                  onResizeStart({
                    objectId: sourceObjectId ?? object.id,
                    sceneKind: 'preview',
                    stageMockupId,
                    pointerId: event.pointerId,
                    handle,
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    startX: object.x,
                    startY: object.y,
                    startWidth: object.width,
                    startHeight: object.height,
                    sceneWidth: SCENE_BASE_WIDTH,
                    sceneHeight: SCENE_BASE_HEIGHT,
                    sceneScaleX: projectedScaleX,
                    sceneScaleY: projectedScaleY,
                    coordinateSpace: 'projected',
                    printableWidth: printableArea.width,
                    printableHeight: printableArea.height
                  });
                }}
                className={[
                  'absolute h-5 w-5 rounded-full border border-white/80 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.98),rgba(125,211,252,0.92)_58%,rgba(14,165,233,0.9))] shadow-[0_0_0_2px_rgba(15,23,42,0.92),0_0_0_5px_rgba(125,211,252,0.14),0_10px_24px_rgba(15,23,42,0.34)] transition-[background-color,transform,box-shadow,filter] duration-150',
                  positions[handle],
                  resizing && resizeHandle === handle
                    ? 'scale-110 shadow-[0_0_0_2px_rgba(15,23,42,0.92),0_0_0_6px_rgba(125,211,252,0.24),0_12px_28px_rgba(15,23,42,0.4)]'
                    : 'hover:scale-105 hover:brightness-110'
                ].join(' ')}
              >
                <span className="pointer-events-none absolute inset-[5px] rounded-full bg-white/90" />
              </span>
            );
          })}
        </>
      ) : null}
    </button>
  );
}

function getPrintableArea(mockupObject: StudioObject) {
  const tuning = getMockupProjectionTuning(mockupObject);
  const insetX = Math.round(mockupObject.width * tuning.insetXRatio);
  const insetY = Math.round(mockupObject.height * tuning.insetYRatio);
  const topInset = Math.round(insetY * 0.62);
  const bottomInset = Math.round(insetY * 1.38);
  return {
    x: mockupObject.x + insetX,
    y: mockupObject.y + topInset,
    width: Math.max(72, mockupObject.width - insetX * 2),
    height: Math.max(56, mockupObject.height - topInset - bottomInset)
  };
}

function inferMockupProjectionPreset(mockupObject: StudioObject): Exclude<MockupProjectionPresetId, 'auto'> {
  const source = `${mockupObject.name} ${mockupObject.srcLabel ?? ''}`.toLowerCase();
  if (source.includes('sleeve') || source.includes('kol') || source.includes('badge')) {
    return 'sleeve-badge';
  }
  if (source.includes('hoodie') || source.includes('kap') || source.includes('sweat')) {
    return 'hoodie-front';
  }
  if (source.includes('oversize') || source.includes('boxy')) {
    return 'oversize-front';
  }
  if (source.includes('flat') || source.includes('packshot') || source.includes('front flat')) {
    return 'flat-front';
  }
  return 'relaxed-front';
}

function getMockupProjectionPresetId(mockupObject: StudioObject): Exclude<MockupProjectionPresetId, 'auto'> {
  if (mockupObject.mockupProjectionPreset && mockupObject.mockupProjectionPreset !== 'auto') {
    return mockupObject.mockupProjectionPreset;
  }
  return inferMockupProjectionPreset(mockupObject);
}

function getMockupProjectionTuning(mockupObject: StudioObject): ProjectionTuning {
  const preset = MOCKUP_PROJECTION_PRESETS[getMockupProjectionPresetId(mockupObject)];
  return {
    insetXRatio: mockupObject.printInsetXRatio ?? preset.insetXRatio,
    insetYRatio: mockupObject.printInsetYRatio ?? preset.insetYRatio,
    curveX: mockupObject.projectionCurveX ?? preset.curveX,
    curveY: mockupObject.projectionCurveY ?? preset.curveY,
    depth: mockupObject.projectionDepth ?? preset.depth,
    softness: mockupObject.projectionSoftness ?? preset.softness
  };
}

function getProjectedObjectShellStyle(object: StudioObject, tuning: ProjectionTuning) {
  const rotation = object.rotation ?? 0;
  const depthScale = 1 - tuning.depth * 0.035;
  return {
    opacity: object.opacity ?? 1,
    transform: `rotate(${rotation}deg) perspective(1000px) rotateX(${tuning.curveY * 0.45}deg) skewX(${tuning.curveX * 0.35}deg) scaleY(${depthScale})`,
    transformOrigin: 'center center' as const
  };
}

function getProjectedImageStyle(tuning: ProjectionTuning) {
  return {
    mixBlendMode: 'normal' as const,
    filter: `saturate(${Math.max(0.94, 1 - tuning.softness * 0.12)}) contrast(${1 + tuning.depth * 0.05}) brightness(${1 - tuning.depth * 0.01})`
  };
}

function getProjectedOcclusionStyle(tuning: ProjectionTuning) {
  return {
    background: `radial-gradient(circle at 50% 12%, rgba(255,255,255,${0.03 + tuning.softness * 0.04}), transparent 34%), linear-gradient(180deg, rgba(15,23,42,${0.008 + tuning.depth * 0.02}) 0%, rgba(15,23,42,0) 28%, rgba(15,23,42,0) 66%, rgba(15,23,42,${0.03 + tuning.depth * 0.05}) 100%)`,
    mixBlendMode: 'multiply' as const,
    opacity: Math.min(0.35, 0.14 + tuning.depth * 0.16)
  };
}

function getProjectionSurfaceMetrics(tuning: ProjectionTuning) {
  const topInset = Math.max(0.8, 1.2 + tuning.depth * 4 + Math.max(0, tuning.curveY) * 0.18);
  const bottomInset = Math.max(1.2, 1.8 + tuning.depth * 5 + Math.abs(tuning.curveY) * 0.22);
  const sideInset = Math.max(0.8, 1.2 + Math.abs(tuning.curveX) * 0.28);
  const radius = Math.max(10, 14 + tuning.softness * 12 + tuning.depth * 10);
  return { topInset, bottomInset, sideInset, radius };
}

function getProjectedClipPath(tuning: ProjectionTuning) {
  const metrics = getProjectionSurfaceMetrics(tuning);
  return `inset(${metrics.topInset}% ${metrics.sideInset}% ${metrics.bottomInset}% ${metrics.sideInset}% round ${metrics.radius}px)`;
}

function getProjectedContentStyle(tuning: ProjectionTuning) {
  const metrics = getProjectionSurfaceMetrics(tuning);
  const scaleX = Math.max(0.94, 1 - Math.abs(tuning.curveX) * 0.004);
  const scaleY = Math.max(0.95, 1 - tuning.depth * 0.03);
  return {
    borderRadius: `${metrics.radius}px`,
    transform: `translateY(${tuning.depth * 2}px) scale(${scaleX}, ${scaleY})`,
    transformOrigin: 'center center' as const
  };
}

function prepareSnapshotForPersistence(snapshot: StudioSnapshot): StudioSnapshot {
  const assetIdsWithSrc = new Set<string>();
  for (const asset of snapshot.designAssets) {
    if (asset.id && asset.src) {
      assetIdsWithSrc.add(asset.id);
    }
  }
  for (const asset of snapshot.mockupAssets) {
    if (asset.id && asset.src) {
      assetIdsWithSrc.add(asset.id);
    }
  }

  const normalizedObjects = snapshot.objects.map((item) => {
    if (!item.libraryAssetId || !assetIdsWithSrc.has(item.libraryAssetId) || !item.imageSrc) {
      return item;
    }
    return {
      ...item,
      imageSrc: undefined
    };
  });

  return {
    ...snapshot,
    objects: normalizedObjects
  };
}

function snapshotHasLibraryOrCanvasData(snapshot: StudioSnapshot | null): boolean {
  if (!snapshot) {
    return false;
  }
  if (snapshot.mockupAssets.length > 0 || snapshot.designAssets.length > 0) {
    return true;
  }
  if (snapshot.mockupSections.length > 1 || snapshot.designSections.length > 1) {
    return true;
  }
  return snapshot.objects.some((item) => item.type !== 'mockup' || Boolean(item.imageSrc));
}

function traceProjectionSurfacePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  tuning: ProjectionTuning
) {
  const metrics = getProjectionSurfaceMetrics(tuning);
  const topInset = (metrics.topInset / 100) * height;
  const bottomInset = (metrics.bottomInset / 100) * height;
  const sideInset = (metrics.sideInset / 100) * width;
  roundRectPath(
    ctx,
    x + sideInset,
    y + topInset,
    Math.max(8, width - sideInset * 2),
    Math.max(8, height - topInset - bottomInset),
    metrics.radius
  );
}

function applyProjectionCanvasTransform(ctx: CanvasRenderingContext2D, tuning: ProjectionTuning, width: number, height: number) {
  const skewX = tuning.curveX * 0.005;
  const skewY = tuning.curveY * 0.0035;
  const scaleX = Math.max(0.95, 1 - Math.abs(tuning.curveX) * 0.004);
  const scaleY = Math.max(0.95, 1 - tuning.depth * 0.03);
  ctx.transform(scaleX, skewY, skewX, scaleY, 0, tuning.depth * height * 0.02);
}

function drawProjectionFabricEffect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  tuning: ProjectionTuning,
  alphaBound = false
) {
  ctx.save();
  traceProjectionSurfacePath(ctx, x, y, width, height, tuning);
  ctx.clip();

  if (alphaBound) {
    ctx.globalCompositeOperation = 'source-atop';
  }

  const shadow = ctx.createLinearGradient(x, y, x + width, y + height);
  shadow.addColorStop(0, `rgba(15,23,42,${0.04 + tuning.depth * 0.04})`);
  shadow.addColorStop(0.45, 'rgba(15,23,42,0.02)');
  shadow.addColorStop(1, `rgba(15,23,42,${0.03 + tuning.softness * 0.03})`);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = shadow;
  ctx.fillRect(x, y, width, height);

  const highlight = ctx.createLinearGradient(x + width * 0.15, y, x + width * 0.85, y + height);
  highlight.addColorStop(0, `rgba(255,255,255,${0.05 + tuning.softness * 0.05})`);
  highlight.addColorStop(0.35, 'rgba(255,255,255,0.01)');
  highlight.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = highlight;
  ctx.fillRect(x, y, width, height);

  const weave = ctx.createLinearGradient(x, y + height * 0.1, x + width, y + height * 0.9);
  weave.addColorStop(0, `rgba(255,255,255,${0.007 + tuning.softness * 0.008})`);
  weave.addColorStop(0.5, 'rgba(255,255,255,0)');
  weave.addColorStop(1, `rgba(15,23,42,${0.008 + tuning.depth * 0.01})`);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = weave;
  ctx.fillRect(x, y, width, height);

  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

function canTransformObjectInScene(object: StudioObject, sceneKind: SceneKind, renderMockupBinding: boolean) {
  if (object.locked) {
    return false;
  }

  if (object.type === 'mockup') {
    return sceneKind === 'preview';
  }

  return !renderMockupBinding && sceneKind === 'design';
}

function getSceneObjectStyle(object: StudioObject, renderMockupBinding: boolean) {
  const mockupBackground = object.imageSrc
    ? 'transparent'
    : 'var(--studio-canvas-mockup-bg)';

  return {
    left: `${(object.x / SCENE_BASE_WIDTH) * 100}%`,
    top: `${(object.y / SCENE_BASE_HEIGHT) * 100}%`,
    width: `${(object.width / SCENE_BASE_WIDTH) * 100}%`,
    height: `${(object.height / SCENE_BASE_HEIGHT) * 100}%`,
    zIndex: renderMockupBinding && object.type === 'mockup' ? 12 : 18,
    opacity: object.opacity ?? 1,
    background:
      object.type === 'shape'
        ? object.fill
        : object.type === 'mockup'
          ? mockupBackground
          : object.type === 'image'
            ? 'transparent'
            : 'transparent',
    borderRadius: object.type === 'mockup' ? 0 : object.radius ?? 22,
    transform: `rotate(${object.rotation ?? 0}deg)`,
    transformOrigin: 'center center' as const
  };
}


function sanitizeFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '') || 'printra-export';
}

function getStageName(stageMockupId: string, objects: StudioObject[]) {
  return objects.find((item) => item.id === stageMockupId)?.name || 'stage';
}


function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Canvas export blob üretmedi.'));
    }, type, quality);
  });
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Görsel yüklenemedi: ${src.slice(0, 32)}`));
    img.src = src;
  });
}

function drawContainedImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const imageRatio = image.width / image.height;
  const frameRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  let drawX = x;
  let drawY = y;

  if (imageRatio > frameRatio) {
    drawHeight = width / imageRatio;
    drawY = y + (height - drawHeight) / 2;
  } else {
    drawWidth = height * imageRatio;
    drawX = x + (width - drawWidth) / 2;
  }

  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const sourceLines = text.split(/\r?\n/);
  const wrapped: string[] = [];

  for (const sourceLine of sourceLines) {
    const words = sourceLine.split(/\s+/).filter(Boolean);
    if (!words.length) {
      wrapped.push('');
      continue;
    }

    let current = words[0];
    for (let i = 1; i < words.length; i += 1) {
      const candidate = `${current} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        wrapped.push(current);
        current = words[i];
      }
    }
    wrapped.push(current);
  }

  return wrapped;
}

async function renderStageExportCanvas({
  stageMockupId,
  objects,
  stagePlacements,
  size,
  transparent,
  imageCache
}: {
  stageMockupId: string;
  objects: StudioObject[];
  stagePlacements: StagePlacementMap;
  size: number;
  transparent: boolean;
  imageCache: Map<string, Promise<HTMLImageElement>>;
}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context alınamadı.');
  }

  const scale = size / SCENE_BASE_WIDTH;
  const mockupObject = objects.find((item) => item.id === stageMockupId && item.type === 'mockup' && item.visible !== false);
  if (!mockupObject) {
    throw new Error('Export stage bulunamadı.');
  }

  if (!transparent) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
  } else {
    ctx.clearRect(0, 0, size, size);
  }

  if (!transparent && mockupObject.imageSrc) {
    const cached = imageCache.get(mockupObject.imageSrc) ?? loadImageElement(mockupObject.imageSrc);
    imageCache.set(mockupObject.imageSrc, cached);
    const mockupImage = await cached;
    drawContainedImage(ctx, mockupImage, 0, 0, size, size);
  }

  const printableArea = getPrintableArea(mockupObject);
  const projectionTuning = getMockupProjectionTuning(mockupObject);
  const designObjects = objects.filter((item) => item.type !== 'mockup' && item.visible !== false);

  for (const baseObject of designObjects) {
    const placement = stagePlacements[stageMockupId]?.[baseObject.id] ?? null;
    const object = placement ? { ...baseObject, ...placement } : baseObject;

    const projectedX = object.x;
    const projectedY = object.y;
    const projectedWidth = Math.max(16, object.width);
    const projectedHeight = Math.max(16, object.height);

    const x = projectedX * scale;
    const y = projectedY * scale;
    const width = projectedWidth * scale;
    const height = projectedHeight * scale;
    const rotation = ((object.rotation ?? 0) * Math.PI) / 180;

    ctx.save();
    ctx.globalAlpha = object.opacity ?? 1;
    ctx.translate(x + width / 2, y + height / 2);
    ctx.rotate(rotation);
    const bleedX = width * 0.03;
    const bleedY = height * 0.03;
    ctx.beginPath();
    ctx.rect(-width / 2 - bleedX, -height / 2 - bleedY, width + bleedX * 2, height + bleedY * 2);
    ctx.clip();
    applyProjectionCanvasTransform(ctx, projectionTuning, width, height);

    if (object.type === 'shape') {
      ctx.fillStyle = object.fill ?? '#38bdf8';
      roundRectPath(ctx, -width / 2, -height / 2, width, height, (object.radius ?? 22) * scale);
      ctx.fill();
    }

    if (object.type === 'image' && object.imageSrc) {
      const cached = imageCache.get(object.imageSrc) ?? loadImageElement(object.imageSrc);
      imageCache.set(object.imageSrc, cached);
      const image = await cached;
      drawContainedImage(ctx, image, -width / 2, -height / 2, width, height);
    }

    if (object.type === 'text') {
      const fontSize = Math.max(24, (object.fontSize ?? 24) * scale);
      const fontWeight = object.fontWeight ?? 700;
      ctx.fillStyle = object.textColor ?? '#f8fafc';
      ctx.font = `${fontWeight} ${fontSize}px Inter, Arial, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.textAlign = object.textAlign ?? 'left';
      const lines = wrapCanvasText(ctx, object.text ?? '', Math.max(24, width - 24 * scale));
      const lineHeight = fontSize * 1.2;
      const blockHeight = Math.max(lineHeight, lines.length * lineHeight);
      const startY = -Math.min(height, blockHeight) / 2;
      const anchorX = object.textAlign === 'center' ? 0 : object.textAlign === 'right' ? width / 2 - 12 * scale : -width / 2 + 12 * scale;
      for (let index = 0; index < lines.length; index += 1) {
        ctx.fillText(lines[index] ?? '', anchorX, startY + index * lineHeight, Math.max(24, width - 24 * scale));
      }
      drawProjectionFabricEffect(ctx, -width / 2, -height / 2, width, height, projectionTuning, true);
    }

    if (object.type === 'shape') {
      drawProjectionFabricEffect(ctx, -width / 2, -height / 2, width, height, projectionTuning);
    }

    ctx.restore();
  }

  return canvas;
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function CanvasScene({
  title,
  sceneKind,
  objects,
  stagePlacements,
  stageMockupId,
  activeObjectId,
  activeStageMockupId,
  onSelect,
  onTextEditStart,
  editingObjectId,
  textDraft,
  onTextDraftChange,
  onTextDraftCommit,
  onTextDraftCancel,
  onDragStart,
  onResizeStart,
  onRotateStart,
  draggingObjectId,
  resizingObjectId,
  resizeHandle,
  rotatingObjectId,
  snapGuides,
  emphasizeMockup = false,
  renderMockupBinding = false,
  allowProjectedSelection = false,
  showSelectionChrome = true,
  onObjectContextMenu
}: {
  title: string;
  sceneKind: SceneKind;
  objects: StudioObject[];
  stagePlacements?: StagePlacementMap;
  stageMockupId?: string;
  activeObjectId: string;
  activeStageMockupId?: string | null;
  onSelect: (id: string, scene: SceneKind, stageMockupId?: string) => void;
  onTextEditStart: (id: string) => void;
  editingObjectId: string | null;
  textDraft: string;
  onTextDraftChange: (value: string) => void;
  onTextDraftCommit: () => void;
  onTextDraftCancel: () => void;
  onDragStart: (payload: DragState) => void;
  onResizeStart: (payload: ResizeState) => void;
  onRotateStart: (payload: RotateState) => void;
  draggingObjectId: string | null;
  resizingObjectId: string | null;
  resizeHandle: ResizeHandle | null;
  rotatingObjectId: string | null;
  snapGuides: SnapGuide[];
  emphasizeMockup?: boolean;
  renderMockupBinding?: boolean;
  allowProjectedSelection?: boolean;
  showSelectionChrome?: boolean;
  onObjectContextMenu?: (payload: { objectId: string; objectType: ObjectType; x: number; y: number }) => void;
}) {
  const mockupObject = useMemo(() => {
    if (stageMockupId) {
      return objects.find((item) => item.id === stageMockupId && item.type === 'mockup' && item.visible !== false) ?? null;
    }

    return [...objects].reverse().find((item) => item.type === 'mockup' && item.visible !== false) ?? null;
  }, [objects, stageMockupId]);
  const printableArea = useMemo(() => (mockupObject ? getPrintableArea(mockupObject) : null), [mockupObject]);
  const projectionTuning = useMemo(
    () => (mockupObject ? getMockupProjectionTuning(mockupObject) : null),
    [mockupObject]
  );
  const sceneObjects = useMemo(() => {
    if (renderMockupBinding) {
      return mockupObject ? [mockupObject] : [];
    }

    if (sceneKind === 'design') {
      return objects.filter((item) => item.type !== 'mockup' && item.visible !== false);
    }

    return objects.filter((item) => item.visible !== false);
  }, [mockupObject, objects, renderMockupBinding, sceneKind]);

  const projectedObjects = useMemo(() => {
    if (!mockupObject || !printableArea || !renderMockupBinding) {
      return [];
    }

    return objects
      .filter((item) => item.type !== 'mockup' && item.visible !== false)
      .map((item) => {
        const placement = stageMockupId ? (stagePlacements?.[stageMockupId]?.[item.id] ?? null) : null;
        const placedObject = placement ? { ...item, ...placement } : item;
        const projectedX = placedObject.x;
        const projectedY = placedObject.y;
        const projectedWidth = Math.max(16, placedObject.width);
        const projectedHeight = Math.max(16, placedObject.height);

        return {
          object: placedObject,
          sourceObjectId: item.id,
          frame: {
            x: (projectedX / SCENE_BASE_WIDTH) * 100,
            y: (projectedY / SCENE_BASE_HEIGHT) * 100,
            width: (projectedWidth / SCENE_BASE_WIDTH) * 100,
            height: (projectedHeight / SCENE_BASE_HEIGHT) * 100
          }
        };
      });
  }, [mockupObject, objects, printableArea, renderMockupBinding, stageMockupId, stagePlacements]);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const showPrintableGuide = Boolean(renderMockupBinding && printableArea && activeObjectId && activeObjectId !== mockupObject?.id);

  return (
    <div className="p-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.25em]" style={{ color: "var(--studio-canvas-label)" }}>Preview lane</p>
          <h4 className="mt-2 text-sm font-semibold" style={{ color: "var(--studio-canvas-heading)" }}>{title}</h4>
        </div>
        <Badge>{sceneObjects.find((item) => item.id === activeObjectId)?.name ?? objects.find((item) => item.id === activeObjectId)?.name ?? '-'}</Badge>
      </div>
      <div className="mt-4 flex min-h-[460px] items-center justify-center p-4">
        <div
          ref={sceneRef}
          className="relative aspect-square w-full max-w-[460px] overflow-hidden touch-none" style={{ background: "var(--studio-canvas-stage)" }}
          onPointerDown={(event) => {
            if (!renderMockupBinding) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest('[data-projected-object="true"]')) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerUp={(event) => {
            if (!renderMockupBinding) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest('[data-projected-object="true"]')) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            if (!renderMockupBinding) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest('[data-projected-object="true"]')) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {showPrintableGuide && printableArea && (
            <div
              className="pointer-events-none absolute z-10 border border-dashed border-fuchsia-300/55"
              style={{
                left: `${(printableArea.x / SCENE_BASE_WIDTH) * 100}%`,
                top: `${(printableArea.y / SCENE_BASE_HEIGHT) * 100}%`,
                width: `${(printableArea.width / SCENE_BASE_WIDTH) * 100}%`,
                height: `${(printableArea.height / SCENE_BASE_HEIGHT) * 100}%`
              }}
            >
              <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-fuchsia-300/35" />
              <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-fuchsia-300/35" />
            </div>
          )}
          {snapGuides.map((guide, index) => (
            <span
              key={`${guide.orientation}-${guide.position}-${index}`}
              className={[
                'pointer-events-none absolute z-30',
                guide.orientation === 'vertical'
                  ? 'top-0 h-full w-[3px] bg-gradient-to-b from-transparent via-white to-transparent'
                  : 'left-0 h-[3px] w-full bg-gradient-to-r from-transparent via-white to-transparent',
                guide.kind === 'scene-center'
                  ? 'shadow-[0_0_0_1px_rgba(244,114,182,0.5),0_0_24px_rgba(244,114,182,0.9)]'
                  : 'shadow-[0_0_0_1px_rgba(56,189,248,0.45),0_0_24px_rgba(56,189,248,0.8)]'
              ].join(' ')}
              style={guide.orientation === 'vertical' ? { left: guide.position } : { top: guide.position }}
            />
          ))}
          {renderMockupBinding && printableArea && projectionTuning
            ? projectedObjects.map(({ object, sourceObjectId, frame }) =>
                renderProjectedObject({
                  object,
                  sourceObjectId,
                  projectedFrame: frame,
                  projectionTuning,
                  activeObjectId,
                  onSelect: (id) => onSelect(id, 'preview', stageMockupId),
                  onDragStart,
                  onResizeStart,
                  onRotateStart,
                  sceneRef,
                  printableArea,
                  stageMockupId,
                  activeStageMockupId,
                  interactive: allowProjectedSelection,
                  showSelectionChrome,
                  resizingObjectId,
                  resizeHandle,
                  rotatingObjectId,
                  onObjectContextMenu
                })
              )
            : null}
          {sceneObjects.map((object) => {
            const active = object.id === activeObjectId && (!renderMockupBinding || stageMockupId === activeStageMockupId) && showSelectionChrome;
            const dragging = draggingObjectId === object.id;
            const resizing = resizingObjectId === object.id;
            const rotating = rotatingObjectId === object.id;
            const canTransform = canTransformObjectInScene(object, sceneKind, renderMockupBinding);
            return (
              <div
                key={object.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(object.id, sceneKind, stageMockupId)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onSelect(object.id, sceneKind, stageMockupId);
                  onObjectContextMenu?.({
                    objectId: object.id,
                    objectType: object.type,
                    x: event.clientX,
                    y: event.clientY
                  });
                }}
                onDoubleClick={() => {
                  if (object.type === 'text' && !object.locked) {
                    onTextEditStart(object.id);
                  }
                }}
                onPointerDown={(event) => {
                  if (!canTransform || resizing) {
                    return;
                  }

                  event.preventDefault();
                  event.stopPropagation();
                  onSelect(object.id, sceneKind, stageMockupId);
                  const target = event.currentTarget.getBoundingClientRect();
                  const sceneRect = sceneRef.current?.getBoundingClientRect();
                  if (!sceneRect) {
                    return;
                  }

                  const sceneScaleX = sceneRect.width / SCENE_BASE_WIDTH;
                  const sceneScaleY = sceneRect.height / SCENE_BASE_HEIGHT;

                  onDragStart({
                    objectId: object.id,
                    sceneKind,
                    pointerId: event.pointerId,
                    pointerOffsetX: (event.clientX - target.left) / sceneScaleX,
                    pointerOffsetY: (event.clientY - target.top) / sceneScaleY,
                    sceneLeft: sceneRect.left,
                    sceneTop: sceneRect.top,
                    sceneWidth: SCENE_BASE_WIDTH,
                    sceneHeight: SCENE_BASE_HEIGHT,
                    sceneScaleX,
                    sceneScaleY
                  });
                }}
                className={[
                  'absolute text-left select-none transition-[border-color,box-shadow,background-color] duration-150',
                  object.type === 'mockup' ? '' : 'rounded-[22px]',
                  dragging || rotating
                    ? 'cursor-grabbing border border-sky-200 shadow-[0_0_0_1px_rgba(186,230,253,0.85),0_0_30px_rgba(56,189,248,0.22)]'
                    : canTransform
                      ? 'cursor-grab'
                      : object.locked
                        ? 'cursor-not-allowed'
                        : 'cursor-default',
                  active ? 'border border-sky-300/70 shadow-[0_0_0_1px_rgba(125,211,252,0.55)]' : 'border border-transparent'
                ].join(' ')}
                style={getSceneObjectStyle(object, renderMockupBinding)}
              >
                <div className={["absolute inset-0 overflow-hidden", object.type === 'mockup' ? '' : 'rounded-[22px]'].join(' ')}>
                {object.type === 'mockup' ? (
                  object.imageSrc ? (
                    <img
                      src={object.imageSrc}
                      alt={object.name}
                      className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                      draggable={false}
                    />
                  ) : null
                ) : null}
                {object.type === 'image' && object.imageSrc ? (
                  <img
                    src={object.imageSrc}
                    alt={object.name}
                    className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                    draggable={false}
                  />
                ) : null}
                {object.type !== 'mockup' ? (
                <div className="relative z-10 flex h-full flex-col justify-between p-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.28em]" style={{ color: "var(--studio-canvas-label)" }}>{object.type}</p>
                    <p className="mt-2 text-sm font-semibold" style={{ color: "var(--studio-canvas-heading)" }}>{object.name}</p>
                  </div>
                  <div>
                    {object.type === 'text' ? (
                      editingObjectId === object.id ? (
                        <textarea
                          value={textDraft}
                          autoFocus
                          onChange={(event) => onTextDraftChange(event.target.value)}
                          onBlur={onTextDraftCommit}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              onTextDraftCancel();
                            }
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault();
                              onTextDraftCommit();
                            }
                          }}
                          onPointerDown={(event) => event.stopPropagation()}
                          className="min-h-[84px] w-full resize-none rounded-xl border border-sky-400/30 px-3 py-2 text-sm leading-6 outline-none focus:border-sky-300"
                          style={{
                            background: 'var(--studio-canvas-input-bg)',
                            fontSize: object.fontSize ?? 24,
                            fontWeight: object.fontWeight ?? 700,
                            textAlign: object.textAlign ?? 'left',
                            color: object.textColor ?? 'var(--studio-canvas-input-text)'
                          }}
                        />
                      ) : (
                        <p
                          className="leading-5"
                          style={{
                            fontSize: object.fontSize ?? 24,
                            fontWeight: object.fontWeight ?? 700,
                            textAlign: object.textAlign ?? 'left',
                            color: object.textColor ?? 'var(--studio-canvas-heading)'
                          }}
                        >
                          {object.text}
                        </p>
                      )
                    ) : null}
                    {object.srcLabel && <p className="text-xs" style={{ color: "var(--studio-canvas-text-muted)" }}>{object.srcLabel}</p>}
                    <p className="mt-3 text-[11px] uppercase tracking-[0.22em]" style={{ color: "var(--studio-canvas-label)" }}>{object.width}×{object.height}</p>
                  </div>
                </div>
                ) : null}
                </div>

                {active && canTransform && (
                  <>
                    <RotateKnob object={object} sceneKind={sceneKind} sceneRef={sceneRef} onRotateStart={onRotateStart} rotating={rotating} />
                    <ResizeKnob handle="nw" sceneKind={sceneKind} onResizeStart={onResizeStart} object={object} sceneRef={sceneRef} activeHandle={resizeHandle} resizing={resizing} />
                    <ResizeKnob handle="ne" sceneKind={sceneKind} onResizeStart={onResizeStart} object={object} sceneRef={sceneRef} activeHandle={resizeHandle} resizing={resizing} />
                    <ResizeKnob handle="sw" sceneKind={sceneKind} onResizeStart={onResizeStart} object={object} sceneRef={sceneRef} activeHandle={resizeHandle} resizing={resizing} />
                    <ResizeKnob handle="se" sceneKind={sceneKind} onResizeStart={onResizeStart} object={object} sceneRef={sceneRef} activeHandle={resizeHandle} resizing={resizing} />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ResizeKnob({
  handle,
  sceneKind,
  onResizeStart,
  object,
  sourceObjectId,
  sceneRef,
  activeHandle,
  resizing
}: {
  handle: ResizeHandle;
  sceneKind: SceneKind;
  onResizeStart: (payload: ResizeState) => void;
  object: StudioObject;
  sourceObjectId?: string;
  sceneRef: RefObject<HTMLDivElement | null>;
  activeHandle: ResizeHandle | null;
  resizing: boolean;
}) {
  const positions: Record<ResizeHandle, string> = {
    nw: '-left-2 -top-2 cursor-nwse-resize',
    ne: '-right-2 -top-2 cursor-nesw-resize',
    sw: '-left-2 -bottom-2 cursor-nesw-resize',
    se: '-right-2 -bottom-2 cursor-nwse-resize'
  };

  return (
    <span
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture?.(event.pointerId);

        const sceneRect = sceneRef.current?.getBoundingClientRect();
        if (!sceneRect) {
          return;
        }

        const sceneScaleX = object.type === 'mockup' ? sceneRect.width / SCENE_BASE_WIDTH : 1;
        const sceneScaleY = object.type === 'mockup' ? sceneRect.height / SCENE_BASE_HEIGHT : 1;

        onResizeStart({
          objectId: sourceObjectId ?? object.id,
          sceneKind,
          pointerId: event.pointerId,
          handle,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startX: object.x,
          startY: object.y,
          startWidth: object.width,
          startHeight: object.height,
          sceneWidth: object.type === 'mockup' ? SCENE_BASE_WIDTH : sceneRect.width,
          sceneHeight: object.type === 'mockup' ? SCENE_BASE_HEIGHT : sceneRect.height,
          sceneScaleX,
          sceneScaleY
        });
      }}
      className={[
        'absolute h-5 w-5 rounded-full border border-white/80 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.98),rgba(125,211,252,0.92)_58%,rgba(14,165,233,0.9))] shadow-[0_0_0_2px_rgba(15,23,42,0.92),0_0_0_5px_rgba(125,211,252,0.14),0_10px_24px_rgba(15,23,42,0.34)] transition-[background-color,transform,box-shadow,filter] duration-150',
        positions[handle],
        resizing && activeHandle === handle
          ? 'scale-110 shadow-[0_0_0_2px_rgba(15,23,42,0.92),0_0_0_6px_rgba(125,211,252,0.24),0_12px_28px_rgba(15,23,42,0.4)]'
          : 'hover:scale-105 hover:brightness-110'
      ].join(' ')}
    >
      <span className="pointer-events-none absolute inset-[5px] rounded-full bg-white/90" />
    </span>
  );
}

function RotateKnob({
  object,
  sourceObjectId,
  sceneKind,
  sceneRef,
  onRotateStart,
  rotating
}: {
  object: StudioObject;
  sourceObjectId?: string;
  sceneKind: SceneKind;
  sceneRef: RefObject<HTMLDivElement | null>;
  onRotateStart: (payload: RotateState) => void;
  rotating: boolean;
}) {
  return (
    <span
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture?.(event.pointerId);

        const sceneRect = sceneRef.current?.getBoundingClientRect();
        if (!sceneRect) {
          return;
        }

        const objectRect = (event.currentTarget.parentElement as HTMLElement | null)?.getBoundingClientRect();
        const centerX = objectRect ? objectRect.left + objectRect.width / 2 : sceneRect.left + object.x + object.width / 2;
        const centerY = objectRect ? objectRect.top + objectRect.height / 2 : sceneRect.top + object.y + object.height / 2;

        const startPointerAngle = pointerAngleDegrees(event.clientX, event.clientY, centerX, centerY);

        onRotateStart({
          objectId: sourceObjectId ?? object.id,
          sceneKind,
          pointerId: event.pointerId,
          startObjectAngle: object.rotation ?? 0,
          startPointerAngle,
          pointerAngleOffset: (object.rotation ?? 0) - startPointerAngle,
          centerX,
          centerY
        });
      }}
      className={[
        'absolute left-1/2 top-0 grid h-5 w-5 -translate-x-1/2 -translate-y-10 place-items-center rounded-full border border-white/70 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.95),rgba(244,114,182,0.92)_55%,rgba(168,85,247,0.9))] shadow-[0_0_0_2px_rgba(15,23,42,0.92),0_0_0_5px_rgba(244,114,182,0.18),0_12px_28px_rgba(15,23,42,0.38)] cursor-grab transition-[transform,box-shadow,filter] duration-150',
        rotating ? 'scale-110 cursor-grabbing shadow-[0_0_0_2px_rgba(15,23,42,0.92),0_0_0_6px_rgba(244,114,182,0.28),0_14px_34px_rgba(15,23,42,0.46)]' : 'hover:scale-105 hover:brightness-110'
      ].join(' ')}
      aria-label="Rotate selected object"
    >
      <span className="pointer-events-none h-1.5 w-1.5 rounded-full bg-white/95 shadow-[0_0_12px_rgba(255,255,255,0.75)]" />
      <span className="pointer-events-none absolute left-1/2 top-5 h-8 w-px -translate-x-1/2 bg-gradient-to-b from-fuchsia-200/85 via-white/30 to-transparent" />
    </span>
  );
}

function ObjectInspector({
  object,
  modeLabel,
  toolLabel,
  isDragging,
  isResizing,
  isRotating,
  canEditGeometry,
  onUpdateObject,
  onUpdateText,
  onStartTextEdit,
  inlineEditing,
  onUploadNewImage,
  onReplaceImage
}: {
  object: StudioObject;
  modeLabel: string;
  toolLabel: string;
  isDragging: boolean;
  isResizing: boolean;
  isRotating: boolean;
  canEditGeometry: boolean;
  onUpdateObject: (
    patch: Partial<
      Pick<
        StudioObject,
        | 'x'
        | 'y'
        | 'width'
        | 'height'
        | 'rotation'
        | 'mockupProjectionPreset'
        | 'printInsetXRatio'
        | 'printInsetYRatio'
        | 'projectionCurveX'
        | 'projectionCurveY'
        | 'projectionDepth'
        | 'projectionSoftness'
      >
    >
  ) => void;
  onUpdateText: (patch: Partial<Pick<StudioObject, 'text' | 'fontSize' | 'fontWeight' | 'textAlign' | 'textColor'>>, options?: { recordHistory?: boolean }) => void;
  onStartTextEdit: () => void;
  inlineEditing: boolean;
  onUploadNewImage: () => void;
  onReplaceImage: () => void;
}) {
  const { t } = useLocale();
  const disabled = Boolean(object.locked);
  const geometryDisabled = disabled || !canEditGeometry;
  const projectionTuning = object.type === 'mockup' ? getMockupProjectionTuning(object) : null;

  const updateNumberField =
    (field: 'x' | 'y' | 'width' | 'height' | 'rotation') => (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = Number(event.target.value);
      if (Number.isNaN(nextValue)) {
        return;
      }

      if ((field === 'width' || field === 'height') && object.type !== 'mockup') {
        const widthBase = Math.max(MIN_OBJECT_WIDTH, object.width);
        const heightBase = Math.max(MIN_OBJECT_HEIGHT, object.height);
        const ratio = widthBase / Math.max(1, heightBase);

        if (field === 'width') {
          const nextWidth = Math.max(MIN_OBJECT_WIDTH, nextValue);
          const nextHeight = Math.max(MIN_OBJECT_HEIGHT, Math.round(nextWidth / ratio));
          onUpdateObject({ width: nextWidth, height: nextHeight });
          return;
        }

        const nextHeight = Math.max(MIN_OBJECT_HEIGHT, nextValue);
        const nextWidth = Math.max(MIN_OBJECT_WIDTH, Math.round(nextHeight * ratio));
        onUpdateObject({ width: nextWidth, height: nextHeight });
        return;
      }

      onUpdateObject({ [field]: nextValue } as Partial<Pick<StudioObject, 'x' | 'y' | 'width' | 'height' | 'rotation'>>);
    };

  const updateTextField =
    (field: 'text' | 'fontSize' | 'fontWeight' | 'textAlign' | 'textColor') =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const rawValue = event.target.value;

      if (field === 'text') {
        onUpdateText({ text: rawValue });
        return;
      }

      if (field === 'fontSize') {
        const nextValue = Number(rawValue);
        if (!Number.isNaN(nextValue)) {
          onUpdateText({ fontSize: nextValue });
        }
        return;
      }

      if (field === 'fontWeight') {
        onUpdateText({ fontWeight: Number(rawValue) as 400 | 500 | 600 | 700 });
        return;
      }

      if (field === 'textAlign') {
        onUpdateText({ textAlign: rawValue as TextAlign });
        return;
      }

      if (field === 'textColor') {
        onUpdateText({ textColor: rawValue });
      }
    };

  const updateProjectionField =
    (field: 'printInsetXRatio' | 'printInsetYRatio' | 'projectionCurveX' | 'projectionCurveY' | 'projectionDepth' | 'projectionSoftness') =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = Number(event.target.value);
      if (Number.isNaN(nextValue)) {
        return;
      }
      onUpdateObject({ [field]: nextValue } as Partial<StudioObject>);
    };

  return (
    <div className="space-y-4">
      <InspectorRow label={t('studioStatusActiveTool')} value={toolLabel} />
      <InspectorRow label={t('studioStatusSelectedObject')} value={object.name} />
      <InspectorRow label="Mode" value={modeLabel} />
      <InspectorRow label="Type" value={object.type} />

      <div className="grid gap-3 sm:grid-cols-2">
        <InspectorInput label="X" value={object.x} onChange={updateNumberField('x')} disabled={geometryDisabled} />
        <InspectorInput label="Y" value={object.y} onChange={updateNumberField('y')} disabled={geometryDisabled} />
        <InspectorInput label="Width" value={object.width} onChange={updateNumberField('width')} disabled={geometryDisabled} min={MIN_OBJECT_WIDTH} />
        <InspectorInput label="Height" value={object.height} onChange={updateNumberField('height')} disabled={geometryDisabled} min={MIN_OBJECT_HEIGHT} />
        <InspectorInput label="Rotation" value={object.rotation ?? 0} onChange={updateNumberField('rotation')} disabled={geometryDisabled} />
        <InspectorRow label="Durum" value={object.type === 'mockup' ? (canEditGeometry ? 'Mockup transform aktif' : 'Mockup sadece preview panelinden düzenlenir') : object.locked ? 'Kilitli obje' : 'Düzenlenebilir obje'} compact />
      </div>

      {object.type === 'text' && (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-white">Text controls</p>
            <button
              type="button"
              onClick={onStartTextEdit}
              disabled={disabled}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-sky-400/25 hover:bg-sky-400/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {inlineEditing ? 'Canvas editing' : 'Çift tık düzenle'}
            </button>
          </div>
          <label className="block">
            <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Content</p>
            <textarea
              value={object.text ?? ''}
              onChange={updateTextField('text')}
              disabled={disabled}
              className="mt-2 min-h-[96px] w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm font-medium text-white outline-none transition focus:border-sky-400/40 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <InspectorInput label="Font size" value={object.fontSize ?? 24} onChange={updateTextField('fontSize') as (event: ChangeEvent<HTMLInputElement>) => void} disabled={disabled} min={12} />
            <InspectorSelect label="Weight" value={String(object.fontWeight ?? 700)} onChange={updateTextField('fontWeight')} disabled={disabled} options={[['400', 'Regular'], ['500', 'Medium'], ['600', 'Semibold'], ['700', 'Bold']]} />
            <InspectorColorInput label="Text color" value={object.textColor ?? '#f8fafc'} onChange={updateTextField('textColor') as (event: ChangeEvent<HTMLInputElement>) => void} disabled={disabled} />
            <InspectorSelect label="Align" value={object.textAlign ?? 'left'} onChange={updateTextField('textAlign')} disabled={disabled} options={[['left', 'Left'], ['center', 'Center'], ['right', 'Right']]} />
          </div>
        </div>
      )}

      {object.type === 'image' && (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onUploadNewImage}
              className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-300/50 hover:bg-emerald-400/15"
            >
              Yeni görsel yükle
            </button>
            <button
              type="button"
              onClick={onReplaceImage}
              disabled={disabled}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-sky-400/25 hover:bg-sky-400/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Görseli değiştir
            </button>
          </div>
          <InspectorRow label="Önizleme" value={object.imageSrc ? 'Görsel yüklü' : 'Henüz görsel yok'} compact />
        </div>
      )}

      {object.type === 'mockup' && projectionTuning ? (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-white">Projection controls</p>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">
              {getMockupProjectionPresetId(object)}
            </span>
          </div>
          <InspectorSelect
            label="Preset"
            value={object.mockupProjectionPreset ?? 'auto'}
            onChange={(event) => onUpdateObject({ mockupProjectionPreset: event.target.value as MockupProjectionPresetId })}
            disabled={disabled}
            options={MOCKUP_PRESET_OPTIONS}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <InspectorInput label="Inset X" value={Number(projectionTuning.insetXRatio.toFixed(2))} onChange={updateProjectionField('printInsetXRatio')} disabled={disabled} min={0.05} step={0.01} />
            <InspectorInput label="Inset Y" value={Number(projectionTuning.insetYRatio.toFixed(2))} onChange={updateProjectionField('printInsetYRatio')} disabled={disabled} min={0.05} step={0.01} />
            <InspectorInput label="Curve X" value={Number(projectionTuning.curveX.toFixed(2))} onChange={updateProjectionField('projectionCurveX')} disabled={disabled} step={0.1} />
            <InspectorInput label="Curve Y" value={Number(projectionTuning.curveY.toFixed(2))} onChange={updateProjectionField('projectionCurveY')} disabled={disabled} step={0.1} />
            <InspectorInput label="Depth" value={Number(projectionTuning.depth.toFixed(2))} onChange={updateProjectionField('projectionDepth')} disabled={disabled} min={0} step={0.01} />
            <InspectorInput label="Softness" value={Number(projectionTuning.softness.toFixed(2))} onChange={updateProjectionField('projectionSoftness')} disabled={disabled} min={0} step={0.01} />
          </div>
          <InspectorRow label="Print area" value={`${Math.round((1 - projectionTuning.insetXRatio * 2) * 100)}% × ${Math.round((1 - projectionTuning.insetYRatio * 2) * 100)}%`} compact />
        </div>
      ) : null}

      <InspectorRow label="Konum" value={`${object.x}, ${object.y}`} />
      <InspectorRow label="Boyut" value={`${object.width} × ${object.height}`} />
      <InspectorRow label="Açı" value={`${object.rotation ?? 0}°`} />
      <InspectorRow label="Drag durumu" value={isDragging ? 'Sürükleniyor' : 'Hazır'} />
      <InspectorRow label="Resize durumu" value={isResizing ? 'Boyutlanıyor' : 'Hazır'} />
      <InspectorRow label="Rotate durumu" value={isRotating ? 'Döndürülüyor' : 'Hazır'} />
      {object.text && <InspectorRow label="Metin" value={object.text} />}
      {object.fill && <InspectorRow label="Dolgu" value={object.fill} />}
      {object.srcLabel && <InspectorRow label="Kaynak etiketi" value={object.srcLabel} />}
    </div>
  );
}

function InspectorInput({
  label,
  value,
  onChange,
  disabled,
  min,
  step
}: {
  label: string;
  value: number;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  min?: number;
  step?: number;
}) {
  return (
    <label className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={onChange}
        disabled={disabled}
        min={min}
        step={step}
        className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm font-semibold text-white outline-none transition focus:border-sky-400/40 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

function InspectorSelect({
  label,
  value,
  onChange,
  disabled,
  options
}: {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
  options: Array<[string, string]>;
}) {
  return (
    <label className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm font-semibold text-white outline-none transition focus:border-sky-400/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function InspectorColorInput({
  label,
  value,
  onChange,
  disabled
}: {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}) {
  return (
    <label className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <div className="mt-2 flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="h-10 w-14 cursor-pointer rounded-xl border border-white/10 bg-slate-950 p-1 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <input
          type="text"
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm font-semibold text-white outline-none transition focus:border-sky-400/40 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
    </label>
  );
}

function InspectorRow({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-slate-950/70 px-4 ${compact ? 'py-3' : 'py-3'}`}>
      <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function computeSnapResult({
  object,
  x,
  y,
  sceneWidth,
  sceneHeight,
  objects,
  threshold = SNAP_THRESHOLD
}: {
  object: StudioObject;
  x: number;
  y: number;
  sceneWidth: number;
  sceneHeight: number;
  objects: StudioObject[];
  threshold?: number;
}) {
  let nextX = x;
  let nextY = y;
  let bestVerticalDistance = threshold + 1;
  let bestHorizontalDistance = threshold + 1;
  const guides: SnapGuide[] = [];

  const candidateVerticals = [
    { position: 0, kind: 'object-align' as const },
    { position: sceneWidth / 2, kind: 'scene-center' as const },
    { position: sceneWidth, kind: 'object-align' as const }
  ];

  const candidateHorizontals = [
    { position: 0, kind: 'object-align' as const },
    { position: sceneHeight / 2, kind: 'scene-center' as const },
    { position: sceneHeight, kind: 'object-align' as const }
  ];

  for (const other of objects) {
    if (other.id === object.id || other.visible === false) continue;
    candidateVerticals.push(
      { position: other.x, kind: 'object-align' },
      { position: other.x + other.width / 2, kind: 'object-align' },
      { position: other.x + other.width, kind: 'object-align' }
    );
    candidateHorizontals.push(
      { position: other.y, kind: 'object-align' },
      { position: other.y + other.height / 2, kind: 'object-align' },
      { position: other.y + other.height, kind: 'object-align' }
    );
  }

  const verticalEdges = [
    { edge: 'left', position: nextX },
    { edge: 'center', position: nextX + object.width / 2 },
    { edge: 'right', position: nextX + object.width }
  ] as const;

  const horizontalEdges = [
    { edge: 'top', position: nextY },
    { edge: 'center', position: nextY + object.height / 2 },
    { edge: 'bottom', position: nextY + object.height }
  ] as const;

  let chosenVertical: SnapGuide | null = null;
  let chosenHorizontal: SnapGuide | null = null;

  for (const candidate of candidateVerticals) {
    for (const edge of verticalEdges) {
      const distance = Math.abs(candidate.position - edge.position);
      if (distance <= threshold && distance < bestVerticalDistance) {
        bestVerticalDistance = distance;
        if (edge.edge === 'left') nextX = candidate.position;
        if (edge.edge === 'center') nextX = candidate.position - object.width / 2;
        if (edge.edge === 'right') nextX = candidate.position - object.width;
        chosenVertical = { orientation: 'vertical', position: candidate.position, kind: candidate.kind };
      }
    }
  }

  for (const candidate of candidateHorizontals) {
    for (const edge of horizontalEdges) {
      const distance = Math.abs(candidate.position - edge.position);
      if (distance <= threshold && distance < bestHorizontalDistance) {
        bestHorizontalDistance = distance;
        if (edge.edge === 'top') nextY = candidate.position;
        if (edge.edge === 'center') nextY = candidate.position - object.height / 2;
        if (edge.edge === 'bottom') nextY = candidate.position - object.height;
        chosenHorizontal = { orientation: 'horizontal', position: candidate.position, kind: candidate.kind };
      }
    }
  }

  nextX = clamp(nextX, 0, sceneWidth - object.width);
  nextY = clamp(nextY, 0, sceneHeight - object.height);

  if (chosenVertical) guides.push(chosenVertical);
  if (chosenHorizontal) guides.push(chosenHorizontal);

  return { x: nextX, y: nextY, guides };
}

function resolveToolFromObject(type: ObjectType | undefined): ToolKey {
  switch (type) {
    case 'text':
      return 'text';
    case 'image':
      return 'image';
    case 'shape':
      return 'shape';
    case 'mockup':
      return 'mockup';
    default:
      return 'select';
  }
}


function pointerAngleDegrees(pointerX: number, pointerY: number, centerX: number, centerY: number) {
  return (Math.atan2(pointerY - centerY, pointerX - centerX) * 180) / Math.PI;
}

function shortestAngleDelta(fromAngle: number, toAngle: number) {
  let delta = toAngle - fromAngle;

  if (delta > 180) {
    delta -= 360;
  }

  if (delta < -180) {
    delta += 360;
  }

  return delta;
}

function normalizeRotation(value: number) {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
