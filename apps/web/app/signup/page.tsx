'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { persistAuthSession, signupWithEmail } from '../../lib/auth-client';

function resolveNextTarget(value: string | null) {
  if (!value || !value.startsWith('/')) {
    return '/dashboard';
  }
  if (value === '/login' || value.startsWith('/login?') || value === '/signup' || value.startsWith('/signup?')) {
    return '/dashboard';
  }
  return value;
}

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextTarget = useMemo(() => resolveNextTarget(searchParams.get('next')), [searchParams]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const session = await signupWithEmail({ name, email, password });
      persistAuthSession(session);
      router.replace(nextTarget);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Signup request failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.16),transparent_42%),linear-gradient(180deg,#020617,#030B1A)] px-4 py-10 text-slate-200">
      <div className="mx-auto w-full max-w-3xl rounded-[30px] border border-white/10 bg-slate-950/88 p-8 shadow-[0_30px_90px_rgba(2,6,23,0.5)]">
        <div className="flex items-center gap-3">
          <img src="/brand/printra-logo.png" alt="Printra logo" className="h-12 w-12 rounded-2xl border border-emerald-300/35 bg-slate-950/80 p-1.5 object-contain" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.32em] text-emerald-200/80">Printra</p>
            <h1 className="mt-1 text-2xl font-semibold text-white">Create member account</h1>
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-400">
          New registrations are created as <span className="font-semibold text-emerald-200">user</span> accounts.
          Admin accounts are managed separately.
        </p>

        <form className="mt-8 grid gap-4" onSubmit={handleSubmit}>
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.24em] text-slate-400">Full name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoComplete="name"
              className="w-full rounded-2xl border border-white/12 bg-slate-900/85 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-300/45"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.24em] text-slate-400">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-2xl border border-white/12 bg-slate-900/85 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-300/45"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.24em] text-slate-400">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-2xl border border-white/12 bg-slate-900/85 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-300/45"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.24em] text-slate-400">Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-2xl border border-white/12 bg-slate-900/85 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-300/45"
              />
            </label>
          </div>

          {error ? (
            <p className="rounded-2xl border border-rose-300/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl border border-emerald-300/35 bg-emerald-400/20 px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-400">
          Already registered?{' '}
          <Link href={`/login?next=${encodeURIComponent(nextTarget)}`} className="font-semibold text-emerald-200 hover:text-white">
            Go to login
          </Link>
        </p>
      </div>
    </div>
  );
}
