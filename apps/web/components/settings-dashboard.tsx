'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell, Badge, MetricCard, Panel, useTheme, type ThemeMode } from '@printra/ui';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const SETTINGS_CACHE_KEY = 'printra-settings-cache-v1';

type SettingsPayload = {
  profile: {
    displayName: string;
    brandName: string;
    supportEmail: string;
    supportSignature: string;
  };
  workspace: {
    workspaceName: string;
    organizationId: string;
    defaultProjectPrefix: string;
    archiveCompletedProjects: boolean;
  };
  localization: {
    locale: string;
    timezone: string;
    dateFormat: string;
    measurementUnit: string;
  };
  studio: {
    autosaveDrafts: boolean;
    reopenLastProject: boolean;
    saveLibrarySelections: boolean;
    defaultMockupFit: string;
    defaultExportFormat: string;
  };
  appearance: {
    defaultTheme: ThemeMode;
    brightness: number;
    compactSidebar: boolean;
    accentMode: string;
  };
  updatedAt?: string;
  foundation?: string;
};

type SettingsResponse = {
  ok: true;
  settings: SettingsPayload;
  summary: {
    foundation: string;
    locale: string;
    timezone: string;
    defaultTheme: string;
    autosaveDrafts: boolean;
    workspaceName: string;
  };
};

function createLocalDefaultSettings(theme: ThemeMode, brightness: number): SettingsResponse {
  return {
    ok: true,
    settings: {
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
        locale: 'tr',
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
        defaultTheme: theme,
        brightness: normalizeBrightness(brightness),
        compactSidebar: false,
        accentMode: 'sky'
      },
      updatedAt: new Date().toISOString(),
      foundation: 'local-browser-settings'
    },
    summary: {
      foundation: 'local-browser-settings',
      locale: 'tr',
      timezone: 'Europe/Istanbul',
      defaultTheme: theme,
      autosaveDrafts: true,
      workspaceName: 'Main Workspace'
    }
  };
}

function readCachedSettings(): SettingsResponse | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SETTINGS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed?.settings || !parsed?.summary) return null;
    return parsed as SettingsResponse;
  } catch {
    return null;
  }
}

function writeCachedSettings(payload: SettingsResponse) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(payload));
}

type SaveState = 'idle' | 'saving' | 'resetting';

type FieldProps = {
  label: string;
  children: ReactNode;
  hint?: string;
};

const fieldLabelClassName = 'mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-[var(--shell-label)]';
const controlBaseClassName = 'w-full rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface-muted)] px-4 py-3 text-sm text-[var(--shell-heading)] outline-none transition focus:border-sky-300/50 focus:bg-[var(--shell-surface-strong)]';
const mutedTextClassName = 'text-sm leading-6 text-[var(--shell-text-muted)]';

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    let message = fallbackMessage;
    try {
      const payload = (await response.json()) as { error?: string; message?: string };
      message = payload.error ?? payload.message ?? fallbackMessage;
    } catch {
      // response body is not JSON; keep fallback message
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

async function getSettings(): Promise<SettingsResponse> {
  const response = await fetch(`${API_BASE}/settings`);
  const data = await readJson<SettingsResponse>(response, 'Settings service is temporarily unavailable.');
  writeCachedSettings(data);
  return data;
}

async function saveSettings(payload: SettingsPayload): Promise<SettingsResponse> {
  try {
    const response = await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await readJson<SettingsResponse>(response, 'Settings could not be saved.');
    writeCachedSettings(data);
    return data;
  } catch {
    const local: SettingsResponse = {
      ok: true,
      settings: { ...payload, foundation: 'local-browser-settings', updatedAt: new Date().toISOString() },
      summary: {
        foundation: 'local-browser-settings',
        locale: payload.localization.locale,
        timezone: payload.localization.timezone,
        defaultTheme: payload.appearance.defaultTheme,
        autosaveDrafts: payload.studio.autosaveDrafts,
        workspaceName: payload.workspace.workspaceName
      }
    };
    writeCachedSettings(local);
    return local;
  }
}

async function restoreSettings(): Promise<SettingsResponse> {
  try {
    const response = await fetch(`${API_BASE}/settings/reset`, { method: 'POST' });
    const data = await readJson<SettingsResponse>(response, 'Settings could not be reset.');
    writeCachedSettings(data);
    return data;
  } catch {
    const cached = readCachedSettings();
    if (cached) {
      return cached;
    }
    const localDefault = createLocalDefaultSettings('dark', 100);
    writeCachedSettings(localDefault);
    return localDefault;
  }
}

function updateSettings<T extends keyof SettingsPayload>(
  draft: SettingsPayload,
  section: T,
  nextSection: SettingsPayload[T]
): SettingsPayload {
  return {
    ...draft,
    [section]: nextSection
  };
}

function normalizeBrightness(value: number) {
  if (!Number.isFinite(value)) return 100;
  return Math.min(115, Math.max(85, Math.round(value)));
}

function withCurrentAppearance(
  settings: SettingsPayload,
  theme: ThemeMode,
  brightness: number
): SettingsPayload {
  return {
    ...settings,
    appearance: {
      ...settings.appearance,
      defaultTheme: theme,
      brightness: normalizeBrightness(brightness)
    }
  };
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="block">
      <span className={fieldLabelClassName}>{label}</span>
      {children}
      {hint ? <span className="mt-2 block text-xs leading-5 text-[var(--shell-text-soft)]">{hint}</span> : null}
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  type = 'text'
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  type?: 'text' | 'email';
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={controlBaseClassName}
      />
    </Field>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  hint
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={controlBaseClassName}>
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[var(--shell-select-bg)] text-[var(--shell-heading)]">
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className="flex w-full items-center justify-between rounded-3xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] p-4 text-left transition hover:border-sky-300/40 hover:bg-[var(--shell-surface-strong)]"
    >
      <div className="pr-4">
        <p className="text-sm font-semibold text-[var(--shell-heading)]">{label}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--shell-text-muted)]">{description}</p>
      </div>
      <span
        className={[
          'inline-flex min-w-[88px] justify-center rounded-full border px-3 py-1 text-xs font-semibold',
          checked
            ? 'border-emerald-400/35 bg-emerald-400/10 text-[var(--shell-heading)]'
            : 'border-[var(--shell-border)] bg-[var(--shell-surface)] text-[var(--shell-text-muted)]'
        ].join(' ')}
      >
        {checked ? 'Enabled' : 'Disabled'}
      </span>
    </button>
  );
}

export function SettingsDashboard() {
  const { theme, brightness, setTheme, setBrightness } = useTheme();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [draft, setDraft] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const initialAppearanceRef = useRef({
    theme,
    brightness: normalizeBrightness(brightness)
  });

  const applyAppearance = useCallback((appearance: SettingsPayload['appearance']) => {
    setTheme(appearance.defaultTheme);
    setBrightness(normalizeBrightness(appearance.brightness));
  }, [setBrightness, setTheme]);

  const syncDraftAppearanceWithActiveTheme = useCallback((currentDraft: SettingsPayload | null) => {
    if (!currentDraft) return currentDraft;

    const normalizedBrightness = normalizeBrightness(brightness);
    if (
      currentDraft.appearance.defaultTheme === theme &&
      normalizeBrightness(currentDraft.appearance.brightness) === normalizedBrightness
    ) {
      return currentDraft;
    }

    return updateSettings(currentDraft, 'appearance', {
      ...currentDraft.appearance,
      defaultTheme: theme,
      brightness: normalizedBrightness
    });
  }, [brightness, theme]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const next = await getSettings();
      setData(next);
      setDraft(
        withCurrentAppearance(
          next.settings,
          initialAppearanceRef.current.theme,
          initialAppearanceRef.current.brightness
        )
      );
    } catch (requestError) {
      const cached = readCachedSettings() ?? createLocalDefaultSettings(initialAppearanceRef.current.theme, initialAppearanceRef.current.brightness);
      setData(cached);
      setDraft(
        withCurrentAppearance(
          cached.settings,
          initialAppearanceRef.current.theme,
          initialAppearanceRef.current.brightness
        )
      );
      setMessage('Settings offline fallback aktif: local ayarlar ile devam ediliyor.');
      setError(requestError instanceof Error ? requestError.message : 'Settings could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setDraft((currentDraft) => syncDraftAppearanceWithActiveTheme(currentDraft));
  }, [syncDraftAppearanceWithActiveTheme]);

  const summaryMetrics = useMemo(() => {
    const settings = draft ?? data?.settings;
    return [
      { label: 'Foundation', value: data?.summary.foundation ?? 'loading' },
      { label: 'Theme', value: settings?.appearance.defaultTheme ?? '—' },
      { label: 'Locale', value: settings?.localization.locale ?? '—' },
      { label: 'Autosave', value: settings?.studio.autosaveDrafts ? 'On' : 'Off' }
    ];
  }, [data, draft]);

  const hasDraft = Boolean(draft);
  const hasUnsavedChanges = useMemo(() => {
    if (!data || !draft) return false;
    return JSON.stringify(draft) !== JSON.stringify(data.settings);
  }, [data, draft]);

  const appearanceChanged = draft
    ? draft.appearance.defaultTheme !== theme || normalizeBrightness(draft.appearance.brightness) !== normalizeBrightness(brightness)
    : false;

  async function handleSave() {
    if (!draft) return;

    setSaveState('saving');
    setError('');
    setMessage('Saving settings…');

    try {
      const saved = await saveSettings(draft);
      setData(saved);
      setDraft(saved.settings);
      applyAppearance(saved.settings.appearance);
      setMessage('Settings saved and applied.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Settings could not be saved.');
      setMessage('');
    } finally {
      setSaveState('idle');
    }
  }

  async function handleReset() {
    setSaveState('resetting');
    setError('');
    setMessage('Restoring defaults…');

    try {
      const restored = await restoreSettings();
      setData(restored);
      setDraft(restored.settings);
      applyAppearance(restored.settings.appearance);
      setMessage('Default settings restored.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Settings could not be reset.');
      setMessage('');
    } finally {
      setSaveState('idle');
    }
  }

  return (
    <AppShell
      title="Settings"
      subtitle="Profile, workspace, appearance, localization, and studio defaults with customer-owned infrastructure friendly local foundation."
    >
      <div className="grid gap-6 xl:grid-cols-[1.15fr_minmax(0,0.85fr)]">
        <Panel
          title="Settings control center"
          description="Real save and reset actions are wired to the local settings foundation and applied through the shared theme system."
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summaryMetrics.map((metric) => (
              <MetricCard key={metric.label} label={metric.label} value={metric.value} />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saveState !== 'idle' || !hasDraft || !hasUnsavedChanges}
              className="rounded-2xl border border-sky-300/30 bg-sky-400/12 px-4 py-2.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/18 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveState === 'saving' ? 'Saving…' : 'Save settings'}
            </button>
            <button
              type="button"
              onClick={() => void handleReset()}
              disabled={saveState !== 'idle'}
              className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/16 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveState === 'resetting' ? 'Restoring…' : 'Restore defaults'}
            </button>
            <button
              type="button"
              onClick={() => draft && applyAppearance(draft.appearance)}
              disabled={!draft || !appearanceChanged}
              className="rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/16 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Apply appearance now
            </button>
          </div>

          {!hasUnsavedChanges && draft ? <p className="mt-4 text-sm text-[var(--shell-text-muted)]">Settings are in sync with the saved foundation.</p> : null}
          {error ? <p className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
          {message ? <p className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
        </Panel>

        <Panel
          title="Delivery model"
          description="These defaults stay safe in development and remain ready to hand off to customer-owned live infrastructure later."
        >
          <div className={`space-y-4 ${mutedTextClassName}`}>
            <div className="rounded-3xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] p-4">
              <Badge>Local foundation</Badge>
              <p className="mt-3">Settings persist in the local foundation during development so the app stays usable before external infrastructure is connected.</p>
            </div>
            <div className="rounded-3xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] p-4">
              <Badge>Customer-owned activation</Badge>
              <p className="mt-3">After purchase, the customer can replace these defaults with live credentials and operational preferences from their own environment.</p>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Profile and workspace" description="Operator identity, workspace naming, and project defaults used throughout the app.">
          {loading || !draft ? (
            <p className={mutedTextClassName}>Loading settings…</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Display name" value={draft.profile.displayName} onChange={(value) => setDraft(updateSettings(draft, 'profile', { ...draft.profile, displayName: value }))} />
              <TextField label="Brand name" value={draft.profile.brandName} onChange={(value) => setDraft(updateSettings(draft, 'profile', { ...draft.profile, brandName: value }))} />
              <TextField label="Support email" type="email" value={draft.profile.supportEmail} onChange={(value) => setDraft(updateSettings(draft, 'profile', { ...draft.profile, supportEmail: value }))} placeholder="support@example.com" />
              <TextField label="Support signature" value={draft.profile.supportSignature} onChange={(value) => setDraft(updateSettings(draft, 'profile', { ...draft.profile, supportSignature: value }))} />
              <TextField label="Workspace name" value={draft.workspace.workspaceName} onChange={(value) => setDraft(updateSettings(draft, 'workspace', { ...draft.workspace, workspaceName: value }))} />
              <TextField label="Organization id" value={draft.workspace.organizationId} onChange={(value) => setDraft(updateSettings(draft, 'workspace', { ...draft.workspace, organizationId: value }))} />
              <TextField label="Default project prefix" value={draft.workspace.defaultProjectPrefix} onChange={(value) => setDraft(updateSettings(draft, 'workspace', { ...draft.workspace, defaultProjectPrefix: value }))} />
              <div className="md:col-span-2">
                <Toggle
                  checked={draft.workspace.archiveCompletedProjects}
                  onChange={(value) => setDraft(updateSettings(draft, 'workspace', { ...draft.workspace, archiveCompletedProjects: value }))}
                  label="Archive completed projects by default"
                  description="Keep finished work out of the main active lane unless reopened."
                />
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Localization and appearance" description="Default locale, timezone, theme, and brightness settings applied across the shell.">
          {loading || !draft ? (
            <p className={mutedTextClassName}>Loading settings…</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="Locale"
                value={draft.localization.locale}
                onChange={(value) => setDraft(updateSettings(draft, 'localization', { ...draft.localization, locale: value }))}
                options={[{ value: 'en', label: 'English' }, { value: 'tr', label: 'Türkçe' }, { value: 'de', label: 'Deutsch' }]}
              />
              <TextField label="Timezone" value={draft.localization.timezone} onChange={(value) => setDraft(updateSettings(draft, 'localization', { ...draft.localization, timezone: value }))} />
              <SelectField
                label="Date format"
                value={draft.localization.dateFormat}
                onChange={(value) => setDraft(updateSettings(draft, 'localization', { ...draft.localization, dateFormat: value }))}
                options={[{ value: 'dd.MM.yyyy', label: 'dd.MM.yyyy' }, { value: 'MM/dd/yyyy', label: 'MM/dd/yyyy' }, { value: 'yyyy-MM-dd', label: 'yyyy-MM-dd' }]}
              />
              <SelectField
                label="Measurement unit"
                value={draft.localization.measurementUnit}
                onChange={(value) => setDraft(updateSettings(draft, 'localization', { ...draft.localization, measurementUnit: value }))}
                options={[{ value: 'px', label: 'Pixels' }, { value: 'mm', label: 'Millimeters' }, { value: 'in', label: 'Inches' }]}
              />
              <SelectField
                label="Default theme"
                value={draft.appearance.defaultTheme}
                onChange={(value) => setDraft(updateSettings(draft, 'appearance', { ...draft.appearance, defaultTheme: value as ThemeMode }))}
                options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]}
              />
              <SelectField
                label="Accent mode"
                value={draft.appearance.accentMode}
                onChange={(value) => setDraft(updateSettings(draft, 'appearance', { ...draft.appearance, accentMode: value }))}
                options={[{ value: 'sky', label: 'Sky' }, { value: 'indigo', label: 'Indigo' }, { value: 'emerald', label: 'Emerald' }]}
              />
              <Field label={`Brightness · ${draft.appearance.brightness}%`} hint="Applied through the shared theme provider.">
                <input
                  type="range"
                  min={85}
                  max={115}
                  step={1}
                  value={draft.appearance.brightness}
                  onChange={(event) => setDraft(updateSettings(draft, 'appearance', { ...draft.appearance, brightness: Number(event.target.value) }))}
                  className="printra-theme-range h-2 w-full cursor-ew-resize appearance-none bg-transparent"
                />
              </Field>
              <div className="md:col-span-2">
                <Toggle
                  checked={draft.appearance.compactSidebar}
                  onChange={(value) => setDraft(updateSettings(draft, 'appearance', { ...draft.appearance, compactSidebar: value }))}
                  label="Compact sidebar"
                  description="Reserve space for denser dashboards and editing flows."
                />
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Studio defaults" description="Baseline autosave and working preferences used when the editor opens a fresh project.">
        {loading || !draft ? (
          <p className={mutedTextClassName}>Loading settings…</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Toggle
              checked={draft.studio.autosaveDrafts}
              onChange={(value) => setDraft(updateSettings(draft, 'studio', { ...draft.studio, autosaveDrafts: value }))}
              label="Autosave drafts"
              description="Keep local draft persistence active while working in Studio."
            />
            <Toggle
              checked={draft.studio.reopenLastProject}
              onChange={(value) => setDraft(updateSettings(draft, 'studio', { ...draft.studio, reopenLastProject: value }))}
              label="Reopen last project"
              description="Bring the most recent studio project back on the next editor visit."
            />
            <Toggle
              checked={draft.studio.saveLibrarySelections}
              onChange={(value) => setDraft(updateSettings(draft, 'studio', { ...draft.studio, saveLibrarySelections: value }))}
              label="Persist library selections"
              description="Keep selected library groups ready between project hops."
            />
            <SelectField
              label="Default mockup fit"
              value={draft.studio.defaultMockupFit}
              onChange={(value) => setDraft(updateSettings(draft, 'studio', { ...draft.studio, defaultMockupFit: value }))}
              options={[{ value: 'contain', label: 'Contain' }, { value: 'cover', label: 'Cover' }, { value: 'stretch', label: 'Stretch' }]}
            />
            <SelectField
              label="Default export format"
              value={draft.studio.defaultExportFormat}
              onChange={(value) => setDraft(updateSettings(draft, 'studio', { ...draft.studio, defaultExportFormat: value }))}
              options={[{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'webp', label: 'WEBP' }]}
            />
          </div>
        )}
      </Panel>
    </AppShell>
  );
}
