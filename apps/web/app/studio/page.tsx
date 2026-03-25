'use client';

import { useState } from 'react';
import { AppShell } from '@printra/ui';
import { StudioWorkspace } from '../../components/studio-workspace';

export default function Page() {
  const [shellPanelsOpen, setShellPanelsOpen] = useState(false);

  return (
    <AppShell
      title="Studio"
      subtitle="Unified Canva-style design and mockup workspace. This version extends the real Studio shell with object transforms, text edit, upload flow, guides, and first mockup binding preview."
      topSlot={
        <div className="relative space-y-2 pr-10">
          <button
            type="button"
            onClick={() => setShellPanelsOpen((current) => !current)}
            aria-expanded={shellPanelsOpen}
            className="absolute right-0 top-0 inline-flex h-7 w-7 items-center justify-center rounded-full border border-sky-300/30 bg-sky-400/12 text-sky-100 shadow-[0_10px_24px_rgba(14,165,233,0.16)] transition hover:border-sky-200/45 hover:bg-sky-400/18"
            title={shellPanelsOpen ? 'Unified shell panellerini kapat' : 'Unified shell panellerini aç'}
          >
            <span className={["text-[10px] transition", shellPanelsOpen ? 'rotate-45' : ''].join(' ')}>✦</span>
          </button>

          {shellPanelsOpen ? (
            <>
              <details className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-sky-100/90 marker:content-none">
                  <span>What is real in this build</span>
                  <span className="text-[10px] text-slate-400 transition group-open:rotate-180">⌄</span>
                </summary>
                <div className="grid gap-3 border-t border-white/10 px-4 py-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-slate-300">
                    <p className="font-semibold text-white">Studio layout spine</p>
                    <p className="mt-2">Left tool rail, center canvas lane, right inspector, and separate layer lane are all connected in one route.</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-slate-300">
                    <p className="font-semibold text-white">Interactive shell state</p>
                    <p className="mt-2">Mode switching, active tool selection, inspector tabs, and layer selection are live client-side state in this version.</p>
                  </div>
                </div>
              </details>
              <details className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-fuchsia-100/90 marker:content-none">
                  <span>Still not built yet</span>
                  <span className="text-[10px] text-slate-400 transition group-open:rotate-180">⌄</span>
                </summary>
                <div className="grid gap-3 border-t border-white/10 px-4 py-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['Canvas engine', 'Not built'],
                    ['Mockup binding', 'V1 active'],
                    ['Transform math', 'Drag / resize / rotate'],
                    ['Preview/export parity', 'Not built']
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-left">
                      <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">{label}</p>
                      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
                    </div>
                  ))}
                </div>
              </details>
            </>
          ) : null}

          <div id="studio-command-bar-slot" className={shellPanelsOpen ? 'min-h-0' : 'hidden'} />
        </div>
      }
    >
      <StudioWorkspace />
    </AppShell>
  );
}
