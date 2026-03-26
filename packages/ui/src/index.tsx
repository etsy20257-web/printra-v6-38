'use client';

import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from 'react';
import { startTransition, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ADMIN_ONLY_PATH_PREFIXES,
  AUTH_COOKIE_KEY,
  AUTH_STORAGE_KEY,
  adminNavigation,
  appNavigation,
  type AppNavItem,
  type AuthSession,
  type AuthUser
} from '@printra/shared';
import { localeLabels, supportedLocales, useLocale, type SupportedLocale } from '@printra/i18n';

export type ThemeMode = 'dark' | 'light';

const THEME_COOKIE_KEY = 'printra_theme_mode';
const BRIGHTNESS_COOKIE_KEY = 'printra_theme_brightness';
const AUTH_API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? '').trim().replace(/\/$/, '');
const AUTH_REQUEST_TIMEOUT_MS = 6500;

type AuthSessionResponse = {
  ok: boolean;
  session?: {
    expiresAt?: string;
    user?: AuthUser;
  };
};

function clampBrightness(value: number) {
  return Math.min(115, Math.max(85, Math.round(value)));
}

function writeCookie(key: string, value: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${key}=${value}; path=/; max-age=31536000; samesite=lax`;
}

function applyThemeToDocument(theme: ThemeMode, brightness: number) {
  if (typeof document === 'undefined') return;
  const normalizedBrightness = clampBrightness(brightness);
  document.documentElement.dataset.printraTheme = theme;
  document.documentElement.style.colorScheme = theme;
  document.documentElement.style.setProperty('--app-brightness', `${normalizedBrightness}%`);
  document.documentElement.style.setProperty('--app-bg', theme === 'light' ? '#F9FAFB' : '#07111f');
  writeCookie(THEME_COOKIE_KEY, theme);
  writeCookie(BRIGHTNESS_COOKIE_KEY, String(normalizedBrightness));
}

function scheduleUiIdleWork(callback: () => void) {
  if (typeof window === 'undefined') {
    callback();
    return () => undefined;
  }

  const idleWindow = window as Window & typeof globalThis & {
    requestIdleCallback?: (handler: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (typeof idleWindow.requestIdleCallback === 'function') {
    const idleId = idleWindow.requestIdleCallback(() => callback(), { timeout: 900 });
    return () => idleWindow.cancelIdleCallback?.(idleId);
  }

  const timeoutId = window.setTimeout(callback, 80);
  return () => window.clearTimeout(timeoutId);
}

function parseAuthSession(input: unknown): AuthSession | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const source = input as Record<string, unknown>;
  const token = typeof source.token === 'string' ? source.token : '';
  const expiresAt = typeof source.expiresAt === 'string' ? source.expiresAt : '';
  const user = source.user as Record<string, unknown> | undefined;
  if (!token || !expiresAt || !user) {
    return null;
  }
  const role = typeof user.role === 'string' ? user.role : '';
  if (role !== 'admin' && role !== 'user') {
    return null;
  }
  const id = typeof user.id === 'string' ? user.id : '';
  const name = typeof user.name === 'string' ? user.name : '';
  const email = typeof user.email === 'string' ? user.email : '';
  if (!id || !name || !email) {
    return null;
  }
  return {
    token,
    expiresAt,
    user: {
      id,
      name,
      email,
      role,
      createdAt: typeof user.createdAt === 'string' ? user.createdAt : undefined,
      updatedAt: typeof user.updatedAt === 'string' ? user.updatedAt : undefined,
      lastLoginAt: typeof user.lastLoginAt === 'string' || user.lastLoginAt === null ? (user.lastLoginAt as string | null) : undefined
    }
  };
}

function readStoredAuthSession() {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return parseAuthSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeAuthCookie(token: string, expiresAt: string) {
  if (typeof document === 'undefined') {
    return;
  }
  const expiresAtMs = Date.parse(expiresAt);
  const maxAge = Number.isFinite(expiresAtMs) ? Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000)) : 0;
  document.cookie = `${AUTH_COOKIE_KEY}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; samesite=lax`;
}

function persistAuthSession(session: AuthSession) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  writeAuthCookie(session.token, session.expiresAt);
}

function clearAuthSession() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }
  if (typeof document !== 'undefined') {
    document.cookie = `${AUTH_COOKIE_KEY}=; path=/; max-age=0; samesite=lax`;
  }
}

function isAdminOnlyPath(pathname: string) {
  return ADMIN_ONLY_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function readFallbackSession(token: string) {
  const session = readStoredAuthSession();
  if (!session || session.token !== token) {
    return null;
  }
  const expiresAtMs = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    return null;
  }
  return session;
}

function shouldUseRemoteAuthApi() {
  if (!AUTH_API_BASE) {
    return false;
  }
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    const target = new URL(AUTH_API_BASE, window.location.origin);
    const targetHost = target.hostname.toLowerCase();
    const currentHost = window.location.hostname.toLowerCase();
    const targetLoopback = targetHost === 'localhost' || targetHost === '127.0.0.1';
    const currentLoopback = currentHost === 'localhost' || currentHost === '127.0.0.1';
    if (targetLoopback && !currentLoopback) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function validateAuthSession(token: string) {
  if (!token) {
    return null;
  }
  const fallbackSession = readFallbackSession(token);
  if (!shouldUseRemoteAuthApi()) {
    return fallbackSession;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${AUTH_API_BASE}/auth/session`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      signal: controller.signal
    });
  } catch {
    return fallbackSession;
  } finally {
    window.clearTimeout(timeoutId);
  }

  const payload = (await response.json().catch(() => ({}))) as AuthSessionResponse;
  if (!response.ok || !payload?.ok) {
    if (response.status === 404 || response.status >= 500) {
      return fallbackSession;
    }
    return null;
  }
  const parsed = parseAuthSession({
    token,
    expiresAt: payload.session?.expiresAt,
    user: payload.session?.user
  });
  return parsed ?? fallbackSession;
}

type ThemeContextValue = {
  theme: ThemeMode;
  brightness: number;
  setTheme: Dispatch<SetStateAction<ThemeMode>>;
  setBrightness: Dispatch<SetStateAction<number>>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  initialTheme,
  initialBrightness,
  children
}: {
  initialTheme: ThemeMode;
  initialBrightness: number;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);
  const [brightness, setBrightness] = useState(() => clampBrightness(initialBrightness));

  useEffect(() => {
    applyThemeToDocument(theme, brightness);
  }, [theme, brightness]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    brightness,
    setTheme,
    setBrightness
  }), [theme, brightness]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider.');
  }
  return context;
}

function themeGlowClass(theme: ThemeMode, active = false) {
  if (theme === 'dark') {
    return active
      ? 'border-sky-400/35 bg-sky-400/14 text-sky-100 shadow-[0_0_0_1px_rgba(56,189,248,0.18),0_0_18px_rgba(56,189,248,0.16),0_10px_28px_rgba(14,165,233,0.12)]'
      : 'border-white/10 bg-white/[0.03] text-slate-200 shadow-[0_0_0_1px_rgba(56,189,248,0.06),0_0_16px_rgba(56,189,248,0.07)] hover:border-sky-400/28 hover:bg-sky-400/10 hover:shadow-[0_0_0_1px_rgba(56,189,248,0.14),0_0_18px_rgba(56,189,248,0.12)]';
  }
  return active
    ? 'border-sky-500/30 bg-white text-sky-700 shadow-[0_0_0_1px_rgba(59,130,246,0.14),0_0_18px_rgba(59,130,246,0.14),0_14px_32px_rgba(59,130,246,0.10)]'
    : 'border-sky-200/70 bg-white/95 text-slate-700 shadow-[0_0_0_1px_rgba(96,165,250,0.10),0_0_18px_rgba(96,165,250,0.14),0_12px_30px_rgba(148,163,184,0.12)] hover:border-sky-300/80 hover:bg-white';
}

function NavSection({ title, items, theme }: { title: string; items: AppNavItem[]; theme: ThemeMode }) {
  const { t } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const isStudioRoute = pathname?.startsWith('/studio');
  const [lastStudioProjectId, setLastStudioProjectId] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncLastProject = () => {
      const value = window.sessionStorage.getItem('printra-last-project-id') ?? '';
      setLastStudioProjectId(value);
    };
    syncLastProject();
    window.addEventListener('storage', syncLastProject);
    window.addEventListener('printra:project-saved', syncLastProject as EventListener);
    return () => {
      window.removeEventListener('storage', syncLastProject);
      window.removeEventListener('printra:project-saved', syncLastProject as EventListener);
    };
  }, []);

  useEffect(() => {
    const uniqueRoutes = Array.from(new Set(items.map((item) => item.href).concat('/studio')));
    return scheduleUiIdleWork(() => {
      uniqueRoutes.forEach((route) => router.prefetch(route));
    });
  }, [items, router]);

  const handleStudioPanelClick = (tab: 'mockups' | 'designs' | 'tools') => {
    if (typeof window === 'undefined') return;
    const currentHash = window.location.hash.replace('#', '');
    if (pathname?.startsWith('/studio')) {
      window.dispatchEvent(new CustomEvent('printra:studio-panel-toggle', { detail: { tab, sameTab: currentHash === tab } }));
      if (currentHash !== tab) window.history.replaceState(null, '', `/studio#${tab}`);
      return;
    }
    startTransition(() => {
      router.push(`/studio#${tab}`);
    });
  };

  return (
    <div className="space-y-2">
      <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--shell-label)]">{title}</p>
      <div className="space-y-1">
        {items.map((item) => {
          const resolvedHref =
            item.key === 'studio' && lastStudioProjectId
              ? `/studio?projectId=${encodeURIComponent(lastStudioProjectId)}`
              : item.href;
          const active = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
          const isStudioItem = item.key === 'studio' && isStudioRoute;
          const keyBase = `nav_${item.key.replace(/-/g, '_')}`;

          return (
            <div key={item.key} className="space-y-2">
              <Link
                href={resolvedHref}
                onClick={async (event) => {
                  if (typeof window === 'undefined') return;
                  const isInternalRoute = resolvedHref.startsWith('/');
                  if (!isInternalRoute) return;
                  const flushStudioDraft = (window as Window & { __printraFlushStudioDraft?: () => Promise<void> }).__printraFlushStudioDraft;
                  if (!flushStudioDraft) return;
                  event.preventDefault();
                  try {
                    await flushStudioDraft();
                  } finally {
                    startTransition(() => {
                      router.push(resolvedHref);
                    });
                  }
                }}
                className={[
                  'group flex items-start rounded-2xl border px-3 py-3 transition duration-200',
                  themeGlowClass(theme, Boolean(active))
                ].join(' ')}
                translate="no"
                prefetch
              >
                <div>
                  <p className="text-sm font-medium text-[var(--shell-heading)]">{t(keyBase)}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--shell-text-muted)] group-hover:text-[var(--shell-text)]">{t(`${keyBase}_desc`)}</p>
                </div>
              </Link>
              {isStudioItem ? (
                <div className="ml-3 space-y-2 border-l border-[var(--shell-border-soft)] pl-3">
                  <button type="button" onClick={() => handleStudioPanelClick('mockups')} className={[ 'block w-full rounded-2xl border px-3 py-2.5 text-left text-sm font-medium transition duration-200', theme === 'dark' ? 'border-fuchsia-400/20 bg-fuchsia-400/8 text-fuchsia-100 shadow-[0_0_14px_rgba(217,70,239,0.10)] hover:border-fuchsia-300/40 hover:bg-fuchsia-400/14' : 'border-fuchsia-200 bg-white text-fuchsia-700 shadow-[0_0_14px_rgba(217,70,239,0.10)] hover:border-fuchsia-300 hover:bg-fuchsia-50' ].join(' ')}>{t('mockupLibrary')}</button>
                  <button type="button" onClick={() => handleStudioPanelClick('designs')} className={[ 'block w-full rounded-2xl border px-3 py-2.5 text-left text-sm font-medium transition duration-200', theme === 'dark' ? 'border-emerald-400/20 bg-emerald-400/8 text-emerald-100 shadow-[0_0_14px_rgba(16,185,129,0.10)] hover:border-emerald-300/40 hover:bg-emerald-400/14' : 'border-emerald-200 bg-white text-emerald-700 shadow-[0_0_14px_rgba(16,185,129,0.10)] hover:border-emerald-300 hover:bg-emerald-50' ].join(' ')}>{t('designLibrary')}</button>
                  <button type="button" onClick={() => handleStudioPanelClick('tools')} className={[ 'block w-full rounded-2xl border px-3 py-2.5 text-left text-sm font-medium transition duration-200', theme === 'dark' ? 'border-sky-400/20 bg-sky-400/8 text-sky-100 shadow-[0_0_14px_rgba(56,189,248,0.10)] hover:border-sky-300/40 hover:bg-sky-400/14' : 'border-sky-200 bg-white text-sky-700 shadow-[0_0_14px_rgba(56,189,248,0.12)] hover:border-sky-300 hover:bg-sky-50' ].join(' ')}>{t('studioTools')}</button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LocaleSwitcher({ theme }: { theme: ThemeMode }) {
  const { locale, setLocale, t } = useLocale();
  return (
    <label className={[
      'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-[0_0_14px_rgba(56,189,248,0.10)]',
      theme === 'dark' ? 'border-white/10 bg-white/[0.04] text-slate-200' : 'border-sky-200/70 bg-white/92 text-slate-700'
    ].join(' ')}>
      <span className="uppercase tracking-[0.22em] text-[var(--shell-label)]">{t('language')}</span>
      <select value={locale} onChange={(event) => setLocale(event.target.value as SupportedLocale)} className="bg-transparent text-xs text-[var(--shell-heading)] outline-none">
        {supportedLocales.map((entry) => (
          <option key={entry} value={entry} className={theme === 'dark' ? 'bg-slate-900' : 'bg-white'}>
            {localeLabels[entry]}
          </option>
        ))}
      </select>
    </label>
  );
}

function ThemeControls({ theme, onThemeChange, brightness, onBrightnessChange }: {
  theme: ThemeMode;
  onThemeChange: (value: ThemeMode) => void;
  brightness: number;
  onBrightnessChange: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={[
          'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition duration-200',
          theme === 'dark'
            ? 'border-sky-400/30 bg-sky-400/12 text-sky-100 shadow-[0_0_0_1px_rgba(56,189,248,0.16),0_0_18px_rgba(56,189,248,0.14),0_10px_24px_rgba(14,165,233,0.14)] hover:bg-sky-400/18'
            : 'border-sky-300/70 bg-white/95 text-sky-700 shadow-[0_0_0_1px_rgba(96,165,250,0.12),0_0_18px_rgba(96,165,250,0.18),0_10px_24px_rgba(59,130,246,0.10)] hover:bg-white'
        ].join(' ')}
      >
        <span className="uppercase tracking-[0.22em]">Theme color</span>
        <span className={[
          'rounded-full border px-2 py-0.5 text-[10px]',
          theme === 'dark' ? 'border-white/10 bg-white/10' : 'border-sky-200 bg-sky-50'
        ].join(' ')}>{theme}</span>
      </button>

      {open ? (
        <div className={[
          'absolute right-0 top-[calc(100%+0.75rem)] z-[160] w-[320px] rounded-[24px] border p-4 backdrop-blur-xl',
          theme === 'dark'
            ? 'border-white/12 bg-slate-950/95 shadow-[0_0_0_1px_rgba(56,189,248,0.10),0_0_24px_rgba(56,189,248,0.10),0_24px_80px_rgba(2,6,23,0.44)]'
            : 'border-sky-200/80 bg-white/98 shadow-[0_0_0_1px_rgba(96,165,250,0.10),0_0_22px_rgba(96,165,250,0.14),0_24px_80px_rgba(148,163,184,0.22)]'
        ].join(' ')}>
          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--shell-label)]">Theme</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(['dark', 'light'] as ThemeMode[]).map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    onClick={() => onThemeChange(entry)}
                    className={[
                      'rounded-2xl border px-3 py-2.5 text-sm font-semibold transition duration-200',
                      themeGlowClass(theme, theme === entry)
                    ].join(' ')}
                  >
                    {entry === 'dark' ? 'Dark theme' : 'Light theme'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--shell-label)]">Brightness</p>
                <span className="text-xs font-medium text-[var(--shell-text)]">{brightness}%</span>
              </div>
              <input
                type="range"
                min={85}
                max={115}
                step={1}
                value={brightness}
                onChange={(event) => onBrightnessChange(Number(event.target.value))}
                className="printra-theme-range mt-3 h-2 w-full cursor-ew-resize appearance-none bg-transparent"
                aria-label="Theme brightness"
              />
              <p className="mt-2 text-xs leading-5 text-[var(--shell-text-muted)]">Drag left to decrease brightness, drag right to increase brightness.</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({ title, subtitle, topSlot, children }: { title: string; subtitle: string; topSlot?: ReactNode; children: ReactNode }) {
  const { t, isRTL } = useLocale();
  const { theme, brightness, setTheme, setBrightness } = useTheme();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const isAuthRoute = pathname?.startsWith('/login') || pathname?.startsWith('/signup');

  useEffect(() => {
    let cancelled = false;

    const redirectToLogin = () => {
      if (!pathname) {
        return;
      }
      const query = searchParams.toString();
      const nextTarget = `${pathname}${query ? `?${query}` : ''}`;
      startTransition(() => {
        router.replace(`/login?next=${encodeURIComponent(nextTarget)}`);
      });
    };

    const verify = async () => {
      try {
        if (!pathname || isAuthRoute) {
          if (!cancelled) {
            setAuthReady(true);
          }
          return;
        }

        const stored = readStoredAuthSession();
        if (!stored?.token) {
          clearAuthSession();
          if (!cancelled) {
            setAuthUser(null);
            setAuthReady(false);
          }
          redirectToLogin();
          return;
        }

        const session = await validateAuthSession(stored.token);
        if (!session) {
          clearAuthSession();
          if (!cancelled) {
            setAuthUser(null);
            setAuthReady(false);
          }
          redirectToLogin();
          return;
        }

        if (isAdminOnlyPath(pathname) && session.user.role !== 'admin') {
          if (!cancelled) {
            setAuthUser(session.user);
            setAuthReady(true);
          }
          startTransition(() => {
            router.replace('/dashboard');
          });
          return;
        }

        persistAuthSession(session);
        if (!cancelled) {
          setAuthUser(session.user);
          setAuthReady(true);
        }
      } catch {
        clearAuthSession();
        if (!cancelled) {
          setAuthUser(null);
          setAuthReady(false);
        }
        redirectToLogin();
      }
    };

    if (!isAuthRoute) {
      setAuthReady(false);
    }
    void verify();

    return () => {
      cancelled = true;
    };
  }, [isAuthRoute, pathname, router, searchParams]);

  const handleLogout = () => {
    clearAuthSession();
    setAuthUser(null);
    setAuthReady(false);
    startTransition(() => {
      router.replace('/login');
    });
  };

  const themeStyle = useMemo<CSSProperties>(() => {
    const light = theme === 'light';
    return {
      ['--app-brightness' as string]: `${brightness}%`,
      ['--app-bg' as string]: light ? '#F9FAFB' : '#07111f',
      ['--app-bg-gradient' as string]: light
        ? 'radial-gradient(circle at top, rgba(59,130,246,0.12), transparent 34%), linear-gradient(180deg, #F9FAFB 0%, #EEF5FF 58%, #F9FAFB 100%)'
        : 'radial-gradient(circle at top, rgba(92,167,255,0.16), transparent 34%), linear-gradient(180deg, #07111f 0%, #08101b 100%)',
      ['--shell-surface' as string]: light ? 'rgba(255,255,255,0.92)' : 'rgba(2,6,23,0.70)',
      ['--shell-surface-strong' as string]: light ? 'rgba(255,255,255,0.98)' : 'rgba(2,6,23,0.78)',
      ['--shell-surface-soft' as string]: light ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.04)',
      ['--shell-surface-muted' as string]: light ? 'rgba(248,250,252,0.95)' : 'rgba(15,23,42,0.74)',
      ['--shell-border' as string]: light ? 'rgba(148,163,184,0.24)' : 'rgba(255,255,255,0.10)',
      ['--shell-border-soft' as string]: light ? 'rgba(148,163,184,0.18)' : 'rgba(255,255,255,0.08)',
      ['--shell-heading' as string]: light ? '#1E40AF' : '#F8FBFF',
      ['--shell-text' as string]: light ? '#1E40AF' : '#DCEBFF',
      ['--shell-text-muted' as string]: light ? '#3358B6' : '#94A3B8',
      ['--shell-text-soft' as string]: light ? '#5B7BD1' : '#64748B',
      ['--shell-label' as string]: '#64748B',
      ['--shell-danger' as string]: '#B91C1C',
      ['--shell-danger-bg' as string]: light ? 'rgba(185,28,28,0.08)' : 'rgba(248,113,113,0.10)',
      ['--shell-danger-border' as string]: light ? 'rgba(185,28,28,0.24)' : 'rgba(248,113,113,0.22)',
      ['--shell-select-bg' as string]: light ? '#ffffff' : '#0f172a',
      ['--shell-popover' as string]: light ? 'rgba(255,255,255,0.98)' : 'rgba(2,6,23,0.95)',
      ['--shell-button-glow' as string]: light ? '0 0 0 1px rgba(96,165,250,0.12), 0 0 18px rgba(96,165,250,0.16), 0 12px 28px rgba(59,130,246,0.08)' : '0 0 0 1px rgba(56,189,248,0.10), 0 0 18px rgba(56,189,248,0.10), 0 10px 24px rgba(14,165,233,0.10)',
      ['--studio-canvas-shell' as string]: light ? 'radial-gradient(circle at top, rgba(59,130,246,0.10), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(239,246,255,0.98))' : 'radial-gradient(circle at top, rgba(56,189,248,0.12), transparent 36%), linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.96))',
      ['--studio-canvas-stage' as string]: light ? 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))' : 'transparent',
      ['--studio-canvas-mockup-bg' as string]: light ? 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,245,249,0.98))' : 'linear-gradient(180deg, rgba(30,41,59,0.86), rgba(15,23,42,0.96))',
      ['--studio-canvas-heading' as string]: light ? '#1E40AF' : '#F8FBFF',
      ['--studio-canvas-label' as string]: '#64748B',
      ['--studio-canvas-text-muted' as string]: light ? '#3358B6' : '#CBD5E1',
      ['--studio-canvas-input-bg' as string]: light ? 'rgba(255,255,255,0.98)' : 'rgba(2,6,23,0.90)',
      ['--studio-canvas-input-text' as string]: light ? '#1E40AF' : '#FFFFFF'
    };
  }, [brightness, theme]);

  if (!authReady) {
    return (
      <div data-printra-theme={theme} style={themeStyle} className="flex min-h-screen items-center justify-center bg-[var(--app-bg-gradient)] px-4 text-[var(--shell-text)]">
        <div className="rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface)] px-5 py-3 text-sm shadow-[var(--shell-button-glow)]">
          Checking secure session...
        </div>
      </div>
    );
  }

  return (
    <div data-printra-theme={theme} style={themeStyle} className="printra-theme-root min-h-screen lg:h-screen lg:overflow-hidden">
      <div className="min-h-screen bg-[var(--app-bg-gradient)] text-[var(--shell-text)] lg:h-screen lg:overflow-hidden">
        <div dir={isRTL ? 'rtl' : 'ltr'} className="grid min-h-screen grid-cols-1 gap-6 px-3 py-3 lg:h-screen lg:min-h-0 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-4 lg:py-4">
          <aside className="rounded-[28px] border border-[var(--shell-border)] bg-[var(--shell-surface)] p-4 shadow-2xl backdrop-blur-xl scrollbar-thin scrollbar-track-transparent scrollbar-thumb-sky-400/30 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:overflow-y-auto lg:self-start">
            <div className={[
              'mb-6 rounded-3xl border p-4',
              theme === 'dark' ? 'border-sky-400/20 bg-sky-400/10 shadow-[0_0_24px_rgba(56,189,248,0.10)]' : 'border-sky-200/80 bg-white shadow-[0_0_20px_rgba(96,165,250,0.14)]'
            ].join(' ')}>
              <div className="flex items-center gap-3">
                <img
                  src="/brand/printra-logo.png"
                  alt="Printra logo"
                  className="h-12 w-12 rounded-2xl border border-sky-300/35 bg-slate-950/75 p-1.5 object-contain"
                />
                <div>
                  <p className={['text-[11px] uppercase tracking-[0.35em]', theme === 'dark' ? 'text-sky-200/80' : 'text-sky-600'].join(' ')}>Printra</p>
                  <h1 className="mt-1 text-xl font-semibold text-[var(--shell-heading)]">{t('shellBrandTitle')}</h1>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--shell-text-muted)]">{t('shellBrandDesc')}</p>
            </div>
            <div className="space-y-6 pb-2">
              <NavSection title={t('workspace')} items={appNavigation} theme={theme} />
              <NavSection title={t('operations')} items={adminNavigation} theme={theme} />
            </div>
          </aside>

          <div className="min-h-0 space-y-6 lg:flex lg:h-[calc(100vh-3rem)] lg:flex-col lg:overflow-hidden">
            <header className="relative z-[120] overflow-visible rounded-[28px] border border-[var(--shell-border)] bg-[var(--shell-surface)] px-5 py-4 shadow-2xl backdrop-blur-xl">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.35em] text-[var(--shell-label)]">{t('unifiedShell')}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-semibold text-[var(--shell-heading)]">{title}</h2>
                    <div className="flex flex-wrap gap-2 text-[11px] text-[var(--shell-text-muted)]">
                      <MetricCard label={t('stack')} value="Next + API" compact />
                      <MetricCard label={t('studio')} value="Unified" compact />
                      <MetricCard label={t('render')} value="Worker" compact />
                      <MetricCard label={t('locales')} value="12" compact />
                    </div>
                  </div>
                  <p className="mt-2 max-w-4xl text-xs leading-5 text-[var(--shell-text-muted)]">{subtitle}</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 self-start xl:self-center">
                  {authUser ? (
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-[var(--shell-text)] shadow-[var(--shell-button-glow)]">
                      <span className="uppercase tracking-[0.2em] text-[var(--shell-label)]">{authUser.role}</span>
                      <span className="max-w-[200px] truncate font-medium">{authUser.email}</span>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="rounded-full border border-rose-300/35 bg-rose-400/12 px-2.5 py-1 text-[11px] font-semibold text-rose-100 transition hover:bg-rose-400/20"
                      >
                        Logout
                      </button>
                    </div>
                  ) : null}
                  <ThemeControls
                    theme={theme}
                    onThemeChange={setTheme}
                    brightness={brightness}
                    onBrightnessChange={(value) => setBrightness(clampBrightness(value))}
                  />
                  <LocaleSwitcher theme={theme} />
                </div>
              </div>
              {topSlot ? <div className="mt-3 border-t border-[var(--shell-border-soft)] pt-3">{topSlot}</div> : null}
            </header>
            <main className="relative z-0 min-h-0 space-y-6 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-2">{children}</main>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MetricCard({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  if (compact) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] px-3 py-1.5 text-left shadow-[var(--shell-button-glow)]">
        <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--shell-label)]">{label}</p>
        <p className="text-xs font-semibold text-[var(--shell-heading)]">{value}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface-soft)] px-3 py-3 text-left shadow-[var(--shell-button-glow)]">
      <p className="text-[11px] uppercase tracking-[0.25em] text-[var(--shell-label)]">{label}</p>
      <p className="mt-2 text-sm font-semibold text-[var(--shell-heading)]">{value}</p>
    </div>
  );
}

export function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-[26px] border border-[var(--shell-border)] bg-[var(--shell-surface)] p-5 shadow-2xl backdrop-blur-xl">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-[var(--shell-heading)]">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--shell-text-muted)]">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="inline-flex rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-200 shadow-[var(--shell-button-glow)]">{children}</span>;
}

