import './globals.css';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { LocaleProvider } from '@printra/i18n';
import { ThemeProvider } from '@printra/ui';

export const metadata: Metadata = {
  title: 'Printra',
  description: 'Premium mini SaaS core for design, mockups, analytics, and create-a-list.',
  other: {
    google: 'notranslate'
  }
};

const THEME_COOKIE_KEY = 'printra_theme_mode';
const BRIGHTNESS_COOKIE_KEY = 'printra_theme_brightness';

function clampBrightness(value: number) {
  if (!Number.isFinite(value)) return 100;
  return Math.min(115, Math.max(85, Math.round(value)));
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const cookieTheme = cookieStore.get(THEME_COOKIE_KEY)?.value === 'light' ? 'light' : 'dark';
  const cookieBrightness = clampBrightness(Number(cookieStore.get(BRIGHTNESS_COOKIE_KEY)?.value ?? '100'));

  return (
    <html
      lang="tr"
      translate="no"
      className="notranslate"
      data-printra-theme={cookieTheme}
      style={{
        colorScheme: cookieTheme,
        ['--app-bg' as string]: cookieTheme === 'light' ? '#F9FAFB' : '#07111f',
        ['--app-brightness' as string]: `${cookieBrightness}%`
      }}
    >
      <body translate="no" className="notranslate">
        <ThemeProvider initialTheme={cookieTheme} initialBrightness={cookieBrightness}>
          <LocaleProvider>{children}</LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
