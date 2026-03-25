'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loginWithEmail, persistAuthSession, readStoredAuthSession, validateAuthSession } from '../../lib/auth-client';

function resolveNextTarget(value: string | null) {
  if (!value || !value.startsWith('/')) {
    return '/dashboard';
  }
  return value;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextTarget = useMemo(() => resolveNextTarget(searchParams.get('next')), [searchParams]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const checkExistingSession = async () => {
      const session = readStoredAuthSession();
      if (!session) {
        if (!cancelled) setChecking(false);
        return;
      }

      const validated = await validateAuthSession(session.token);
      if (!validated) {
        if (!cancelled) setChecking(false);
        return;
      }

      persistAuthSession(validated);
      if (!cancelled) {
        router.replace(nextTarget);
      }
    };

    void checkExistingSession();
    return () => {
      cancelled = true;
    };
  }, [nextTarget, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const session = await loginWithEmail({ email, password });
      persistAuthSession(session);
      router.replace(nextTarget);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Login request failed.');
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_42%),linear-gradient(180deg,#020617,#030B1A)] px-4 text-slate-200">
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm">Checking active session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_42%),linear-gradient(180deg,#020617,#030B1A)] px-4 py-10 text-slate-200">
      <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[0.95fr_minmax(0,1.05fr)]">
        <section className="rounded-[30px] border border-sky-400/20 bg-sky-400/10 p-8 shadow-[0_30px_90px_rgba(2,6,23,0.45)]">
          <div className="flex items-center gap-3">
            <img src="/brand/printra-logo.png" alt="Printra logo" className="h-14 w-14 rounded-2xl border border-sky-300/35 bg-slate-950/80 p-1.5 object-contain" />
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-sky-200/80">Printra</p>
              <h1 className="mt-1 text-2xl font-semibold text-white">Secure workspace login</h1>
            </div>
          </div>

          <p className="mt-6 text-sm leading-7 text-slate-200/90">
            Login with your email and password to access the studio, admin, and workspace modules.
          </p>

          <div className="mt-6 space-y-4 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 p-4 text-sm">
            <p className="font-semibold text-emerald-100">Default admin account</p>
            <p className="text-emerald-100/90">Email: <span className="font-semibold">admin@printra.local</span></p>
            <p className="text-emerald-100/90">Password: <span className="font-semibold">Admin123!</span></p>
          </div>

          <div className="mt-4 space-y-4 rounded-2xl border border-sky-300/25 bg-sky-400/10 p-4 text-sm">
            <p className="font-semibold text-sky-100">Default user account</p>
            <p className="text-sky-100/90">Email: <span className="font-semibold">user@printra.local</span></p>
            <p className="text-sky-100/90">Password: <span className="font-semibold">User12345!</span></p>
          </div>
        </section>

        <section className="rounded-[30px] border border-white/10 bg-slate-950/85 p-8 shadow-[0_30px_90px_rgba(2,6,23,0.5)]">
          <p className="text-[11px] uppercase tracking-[0.32em] text-slate-400">Account</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Sign in</h2>
          <p className="mt-2 text-sm text-slate-400">Use the same email/password you registered with.</p>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.24em] text-slate-400">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-2xl border border-white/12 bg-slate-900/85 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-300/40"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.24em] text-slate-400">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-2xl border border-white/12 bg-slate-900/85 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-300/40"
              />
            </label>

            {error ? (
              <p className="rounded-2xl border border-rose-300/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl border border-sky-300/35 bg-sky-400/20 px-4 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-400">
            Need a member account?{' '}
            <Link href={`/signup?next=${encodeURIComponent(nextTarget)}`} className="font-semibold text-sky-200 hover:text-white">
              Create one now
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
