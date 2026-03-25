export type AppNavItem = {
  key: string;
  label: string;
  href: string;
  description: string;
};

export type StudioMode = 'design' | 'mockup' | 'split';

export const appNavigation: AppNavItem[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', description: 'System overview and recent activity.' },
  { key: 'projects', label: 'Projects', href: '/projects', description: 'Manage creative workspaces and saved outputs.' },
  { key: 'studio', label: 'Studio', href: '/studio', description: 'Unified Canva-style design and mockup workspace.' },
  { key: 'library', label: 'Library', href: '/library', description: 'Templates, mockups, assets, and brand kits.' },
  { key: 'analytics', label: 'Analytics', href: '/analytics', description: 'Internal usage and render performance insights.' },
  { key: 'automatic-analysis', label: 'Automatic Analysis', href: '/automatic-analysis', description: 'Competitor intelligence for listing, keyword, and store analysis.' },
  { key: 'market-intelligence', label: 'Create a List', href: '/market-intelligence', description: 'SEO GEO AEO title, description, and keyword builder.' },
  { key: 'settings', label: 'Settings', href: '/settings', description: 'Workspace, account, and localization settings.' },
  { key: 'billing', label: 'Billing', href: '/billing', description: 'Plans, usage, and future subscription management.' }
];

export const adminNavigation: AppNavItem[] = [
  { key: 'admin', label: 'Admin', href: '/admin', description: 'Users, plans, subscriptions, and access.' },
  { key: 'platform', label: 'Platform', href: '/platform', description: 'Queues, workers, storage, and system health.' }
];

export type AuthRole = 'admin' | 'user';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: AuthRole;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
};

export type AuthSession = {
  token: string;
  expiresAt: string;
  user: AuthUser;
};

export const AUTH_STORAGE_KEY = 'printra-auth-session-v1';
export const AUTH_COOKIE_KEY = 'printra-auth-token';
export const ADMIN_ONLY_PATH_PREFIXES = ['/admin'] as const;
