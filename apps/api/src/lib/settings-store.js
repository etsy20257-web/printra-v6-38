import { promises as fs } from 'fs';
import path from 'path';

const dataDir = path.resolve(process.cwd(), 'data');
const settingsFile = path.join(dataDir, 'settings.json');

const allowedThemes = new Set(['dark', 'light']);
const allowedLocales = new Set(['en', 'tr', 'de']);
const allowedDateFormats = new Set(['dd.MM.yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd']);
const allowedMeasurementUnits = new Set(['px', 'mm', 'in']);
const allowedMockupFits = new Set(['contain', 'cover', 'stretch']);
const allowedExportFormats = new Set(['png', 'jpg', 'webp']);
const allowedAccentModes = new Set(['sky', 'indigo', 'emerald']);

function isoNow() {
  return new Date().toISOString();
}

function createDefaultSettings() {
  const now = isoNow();
  return {
    profile: {
      displayName: 'Printra Operator',
      brandName: 'Printra Workspace',
      supportEmail: '',
      supportSignature: 'Prepared in Printra'
    },
    workspace: {
      workspaceName: 'Main Workspace',
      organizationId: 'demo-org',
      defaultProjectPrefix: 'Creative',
      archiveCompletedProjects: false
    },
    localization: {
      locale: 'en',
      timezone: 'Europe/Istanbul',
      dateFormat: 'dd.MM.yyyy',
      measurementUnit: 'px'
    },
    studio: {
      autosaveDrafts: true,
      reopenLastProject: true,
      saveLibrarySelections: true,
      defaultMockupFit: 'contain',
      defaultExportFormat: 'png'
    },
    appearance: {
      defaultTheme: 'dark',
      brightness: 100,
      compactSidebar: false,
      accentMode: 'sky'
    },
    updatedAt: now,
    createdAt: now,
    foundation: 'local-json-settings'
  };
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(settingsFile);
  } catch {
    await fs.writeFile(settingsFile, JSON.stringify(createDefaultSettings(), null, 2), 'utf8');
  }
}

function normalizeText(value, fallback = '', maxLength = 140) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : fallback;
}

function normalizeBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeBrightness(value, fallback = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(115, Math.max(85, Math.round(parsed)));
}

function normalizeChoice(value, allowedValues, fallback) {
  return typeof value === 'string' && allowedValues.has(value) ? value : fallback;
}

function normalizeEmail(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const next = value.trim().toLowerCase().slice(0, 140);
  if (next.length === 0) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next) ? next : fallback;
}

function sanitizeSettings(source = {}, fallback = createDefaultSettings()) {
  return {
    profile: {
      displayName: normalizeText(source.profile?.displayName, fallback.profile.displayName),
      brandName: normalizeText(source.profile?.brandName, fallback.profile.brandName),
      supportEmail: normalizeEmail(source.profile?.supportEmail, fallback.profile.supportEmail),
      supportSignature: normalizeText(source.profile?.supportSignature, fallback.profile.supportSignature)
    },
    workspace: {
      workspaceName: normalizeText(source.workspace?.workspaceName, fallback.workspace.workspaceName),
      organizationId: normalizeText(source.workspace?.organizationId, fallback.workspace.organizationId),
      defaultProjectPrefix: normalizeText(source.workspace?.defaultProjectPrefix, fallback.workspace.defaultProjectPrefix),
      archiveCompletedProjects: normalizeBoolean(source.workspace?.archiveCompletedProjects, fallback.workspace.archiveCompletedProjects)
    },
    localization: {
      locale: normalizeChoice(source.localization?.locale, allowedLocales, fallback.localization.locale),
      timezone: normalizeText(source.localization?.timezone, fallback.localization.timezone),
      dateFormat: normalizeChoice(source.localization?.dateFormat, allowedDateFormats, fallback.localization.dateFormat),
      measurementUnit: normalizeChoice(source.localization?.measurementUnit, allowedMeasurementUnits, fallback.localization.measurementUnit)
    },
    studio: {
      autosaveDrafts: normalizeBoolean(source.studio?.autosaveDrafts, fallback.studio.autosaveDrafts),
      reopenLastProject: normalizeBoolean(source.studio?.reopenLastProject, fallback.studio.reopenLastProject),
      saveLibrarySelections: normalizeBoolean(source.studio?.saveLibrarySelections, fallback.studio.saveLibrarySelections),
      defaultMockupFit: normalizeChoice(source.studio?.defaultMockupFit, allowedMockupFits, fallback.studio.defaultMockupFit),
      defaultExportFormat: normalizeChoice(source.studio?.defaultExportFormat, allowedExportFormats, fallback.studio.defaultExportFormat)
    },
    appearance: {
      defaultTheme: normalizeChoice(source.appearance?.defaultTheme, allowedThemes, fallback.appearance.defaultTheme),
      brightness: normalizeBrightness(source.appearance?.brightness, fallback.appearance.brightness),
      compactSidebar: normalizeBoolean(source.appearance?.compactSidebar, fallback.appearance.compactSidebar),
      accentMode: normalizeChoice(source.appearance?.accentMode, allowedAccentModes, fallback.appearance.accentMode)
    },
    createdAt: normalizeText(source.createdAt, fallback.createdAt, 40),
    updatedAt: normalizeText(source.updatedAt, fallback.updatedAt, 40),
    foundation: 'local-json-settings'
  };
}

async function writeSettings(settings) {
  await ensureStore();
  await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
}

export function summarizeSettings(settings) {
  return {
    foundation: settings.foundation,
    locale: settings.localization.locale,
    timezone: settings.localization.timezone,
    defaultTheme: settings.appearance.defaultTheme,
    autosaveDrafts: settings.studio.autosaveDrafts,
    workspaceName: settings.workspace.workspaceName
  };
}

export async function readSettings() {
  await ensureStore();
  const defaults = createDefaultSettings();

  try {
    const raw = await fs.readFile(settingsFile, 'utf8');
    const parsed = JSON.parse(raw);
    return sanitizeSettings(parsed, defaults);
  } catch {
    await writeSettings(defaults);
    return defaults;
  }
}

export async function updateSettings(payload = {}) {
  const current = await readSettings();
  const next = sanitizeSettings(payload, current);
  next.createdAt = current.createdAt;
  next.updatedAt = isoNow();
  await writeSettings(next);
  return next;
}

export async function resetSettings() {
  const next = createDefaultSettings();
  await writeSettings(next);
  return next;
}
