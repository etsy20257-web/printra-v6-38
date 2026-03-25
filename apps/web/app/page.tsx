import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_14%_12%,rgba(56,189,248,0.2),transparent_34%),radial-gradient(circle_at_88%_14%,rgba(99,102,241,0.2),transparent_34%),linear-gradient(180deg,#020617,#050E1F_52%,#071125)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl items-center px-6 py-10 lg:px-12">
        <div className="grid w-full items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <section className="space-y-8">
            <div className="inline-flex items-center gap-4 rounded-2xl border border-white/15 bg-white/[0.03] px-4 py-3 shadow-[0_0_0_1px_rgba(56,189,248,0.08),0_20px_60px_rgba(2,6,23,0.4)]">
              <img
                src="/brand/printra-logo.png"
                alt="Printra logo"
                className="h-16 w-16 rounded-2xl border border-sky-300/30 bg-slate-950/70 p-1.5 object-contain"
              />
              <div>
                <p className="text-[11px] uppercase tracking-[0.36em] text-sky-200/80">PRINTRA</p>
                <h1 className="mt-1 text-3xl font-semibold text-white sm:text-4xl">Printra</h1>
              </div>
            </div>

            <div className="space-y-5">
              <h2 className="max-w-2xl text-3xl font-semibold leading-tight text-white sm:text-5xl">
                Premium mini SaaS core
              </h2>
              <p className="max-w-2xl text-lg leading-8 text-slate-300">
                Clean shell for Studio, Library, Analytics, Create a List, Admin, and Platform.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/login?next=%2Fdashboard"
                className="inline-flex items-center justify-center rounded-2xl border border-sky-300/35 bg-sky-400/20 px-8 py-4 text-sm font-semibold uppercase tracking-[0.24em] text-sky-100 shadow-[0_0_0_1px_rgba(56,189,248,0.16),0_18px_50px_rgba(14,165,233,0.2)] transition hover:border-sky-200/55 hover:bg-sky-400/28"
              >
                START BUTTON
              </Link>
            </div>
          </section>

          <section className="rounded-[36px] border border-white/12 bg-white/[0.03] p-6 shadow-[0_32px_100px_rgba(2,6,23,0.5)] backdrop-blur-xl sm:p-8">
            <div className="space-y-5 rounded-[28px] border border-sky-400/20 bg-sky-400/10 p-6">
              <p className="text-[11px] uppercase tracking-[0.32em] text-sky-100/80">Unified shell</p>
              <h3 className="text-2xl font-semibold text-white">Premium login entry</h3>
              <p className="text-sm leading-7 text-slate-200/90">
                Click <span className="font-semibold text-sky-100">START BUTTON</span>, go to the member login page,
                sign in with email and password, then continue directly to the system dashboard.
              </p>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 p-4 text-sm">
                <p className="font-semibold text-emerald-100">Admin access</p>
                <p className="mt-2 text-emerald-100/90">admin@printra.local</p>
                <p className="text-emerald-100/90">Admin123!</p>
              </div>
              <div className="rounded-2xl border border-sky-300/25 bg-sky-400/10 p-4 text-sm">
                <p className="font-semibold text-sky-100">Member access</p>
                <p className="mt-2 text-sky-100/90">user@printra.local</p>
                <p className="text-sky-100/90">User12345!</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
