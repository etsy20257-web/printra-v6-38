'use client';

import { useMemo, useRef, useState } from 'react';
import { AppShell, MetricCard, Panel } from '@printra/ui';
import { useLocale } from '@printra/i18n';

type CreateListResponse = {
  input: string;
  title: string;
  description: string;
  keywords: string;
  keywordList: string[];
  seoScore: number;
  geoScore: number;
  aeoScore: number;
  score: number;
  status: string;
  notes: string[];
  engineMode: 'rule-based' | 'ai-assisted';
  aiConfigured: boolean;
  aiError: string | null;
  diagnostics: {
    titleLength: number;
    titleFirstForty: string;
    descriptionOpening: string;
    keywordCount: number;
    keywordLengths: number[];
  };
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');

function buildLocalCreateListResponse(input: string): CreateListResponse {
  const clean = input.trim().replace(/\s+/g, ' ');
  const words = clean.split(' ').filter(Boolean);
  const core = words.slice(0, 6).join(' ') || 'Product Listing';
  const title = `${core} | Ready-to-use Product Copy`.slice(0, 140);
  const keywordList = Array.from({ length: 13 }, (_, index) => {
    const base = words[index % Math.max(1, words.length)] ?? `keyword${index + 1}`;
    return `${base.toLowerCase()} listing`.slice(0, 20);
  });
  const keywords = keywordList.join(', ');
  const description = [
    `${core} is prepared with a clear buyer-first tone and practical details.`,
    'Use this copy as a stable base, then adjust size, material, or delivery details for your store.',
    'The wording is designed to stay readable, natural, and publish-ready.'
  ].join(' ');
  const seed = clean.length || 42;
  const seoScore = Math.max(55, Math.min(92, 62 + (seed % 18)));
  const geoScore = Math.max(55, Math.min(92, 60 + (seed % 16)));
  const aeoScore = Math.max(55, Math.min(92, 58 + (seed % 20)));
  const score = Math.round(seoScore * 0.4 + geoScore * 0.3 + aeoScore * 0.3);

  return {
    input,
    title,
    description,
    keywords,
    keywordList,
    seoScore,
    geoScore,
    aeoScore,
    score,
    status: score >= 80 ? 'Strong List' : score >= 65 ? 'Medium' : 'Needs Improvement',
    notes: [
      'Offline fallback mode aktif: API olmasa da üretim devam eder.',
      'Başlık 140 karakter sınırında tutuldu.',
      '13 anahtar kelime üretildi ve 20 karakter sınırına uyarlandı.'
    ],
    engineMode: 'rule-based',
    aiConfigured: false,
    aiError: 'API offline fallback: local generator used.',
    diagnostics: {
      titleLength: title.length,
      titleFirstForty: title.slice(0, 40),
      descriptionOpening: description.slice(0, 40),
      keywordCount: keywordList.length,
      keywordLengths: keywordList.map((entry) => entry.length)
    }
  };
}

function statusTone(status: string) {
  if (status === 'Strong List') return 'border-emerald-400/30 bg-emerald-400/12 text-emerald-100';
  if (status === 'Medium') return 'border-sky-400/30 bg-sky-400/12 text-sky-100';
  if (status === 'Needs Improvement') return 'border-amber-400/30 bg-amber-400/12 text-amber-100';
  return 'border-rose-400/30 bg-rose-400/12 text-rose-100';
}

async function postCreateList(input: string): Promise<CreateListResponse> {
  try {
    const response = await fetch(`${API_BASE}/market-intelligence/create-list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Create list request failed');
    }

    return response.json() as Promise<CreateListResponse>;
  } catch {
    return buildLocalCreateListResponse(input);
  }
}

export function CreateAListDashboard() {
  const { t } = useLocale();
  const [input, setInput] = useState('');
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const [result, setResult] = useState<CreateListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<'title' | 'description' | 'keywords' | null>(null);

  const firstFortyPreview = useMemo(() => result?.title.slice(0, 40) ?? 'Waiting for title output', [result]);


  function resizePromptArea(nextValue?: string) {
    const element = promptRef.current;
    if (!element) return;
    element.style.height = "0px";
    const computed = window.getComputedStyle(element);
    const lineHeight = Number.parseFloat(computed.lineHeight || '24');
    const maxHeight = lineHeight * 14;
    const nextHeight = Math.min(element.scrollHeight, maxHeight);
    element.style.height = `${Math.max(nextHeight, 160)}px`;
    element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  async function handleCreate() {
    if (!input.trim()) {
      setError(t('typePromptFirst'));
      return;
    }
    setLoading(true);
    setError('');
    setCopied(null);
    try {
      const data = await postCreateList(input);
      setResult(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Create list failed');
    } finally {
      setLoading(false);
    }
  }

  async function copyValue(kind: 'title' | 'description' | 'keywords', value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setError(t('copyFailed'));
    }
  }

  return (
    <AppShell title={t('createListTitle')} subtitle={t('createListSubtitle')}>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_minmax(0,0.8fr)]">
        <Panel title={t('createInput')} description={t('createInputDesc')}>
          <div className="space-y-4">
            <label className="block text-xs uppercase tracking-[0.28em] text-slate-500">{t('aiPrompt')}</label>
            <div className="flex flex-col gap-3">
              <textarea
                ref={promptRef}
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  resizePromptArea(event.target.value);
                }}
                onInput={() => resizePromptArea()}
                placeholder="Describe your product, audience, tone, and the title, description, and keywords you want."
                className="min-h-[160px] w-full resize-none rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm leading-6 text-white outline-none"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={loading}
                className="self-start rounded-2xl border border-sky-400/30 bg-sky-400/15 px-5 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/20 disabled:opacity-60"
              >
                {loading ? t('runningAi') : t('aiButton')}
              </button>
            </div>
            {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100 whitespace-pre-wrap">{error}</div> : null}
          </div>
        </Panel>

        <Panel title={t('liveRules')} description={t('liveRulesDesc')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard label={t('titleMax')} value="140" />
            <MetricCard label={t('first40')} value={t('priority')} />
            <MetricCard label={t('keywords')} value="13" />
            <MetricCard label={t('keywordMax')} value="20 chars" />
          </div>
          <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-slate-300">
            The output now scores SEO, GEO, and AEO separately, then applies a stricter total score so repeated or synthetic wording does not get inflated scores. AI drafting is optional and only activates when the API has a live OpenAI key.
          </div>
        </Panel>
      </div>

      <div className="grid gap-6">
        <Panel title={t('title')} description="The generated title is built to place the strongest search wording early.">
          <div className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-slate-100 min-h-[84px]">
              {result?.title ?? t('generatedTitleWaiting')}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={!result?.title} onClick={() => result?.title && copyValue('title', result.title)} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-100 transition hover:bg-white/[0.06] disabled:opacity-50">{copied === 'title' ? t('copied') : t('copyTitle')}</button>
              <MetricCard label={t('length')} value={String(result?.diagnostics.titleLength ?? 0)} compact />
              <MetricCard label={t('first40')} value={firstFortyPreview} compact />
            </div>
          </div>
        </Panel>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_minmax(0,0.85fr)]">
          <Panel title={t('description')} description="The opening stays strong first, then the full copy stays easy to scan and easy to reuse.">
            <div className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-slate-100 min-h-[220px] whitespace-pre-wrap">
                {result?.description ?? t('generatedDescriptionWaiting')}
              </div>
              <button type="button" disabled={!result?.description} onClick={() => result?.description && copyValue('description', result.description)} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-100 transition hover:bg-white/[0.06] disabled:opacity-50">{copied === 'description' ? t('copied') : t('copyDescription')}</button>
            </div>
          </Panel>

          <Panel title={t('keywords')} description="The output returns 13 long-tail keywords in one line, comma separated.">
            <div className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-slate-100 min-h-[220px] whitespace-pre-wrap">
                {result?.keywords ?? t('generatedKeywordsWaiting')}
              </div>
              <button type="button" disabled={!result?.keywords} onClick={() => result?.keywords && copyValue('keywords', result.keywords)} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-100 transition hover:bg-white/[0.06] disabled:opacity-50">{copied === 'keywords' ? t('copied') : t('copyKeywords')}</button>
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard label={t('count')} value={String(result?.diagnostics.keywordCount ?? 0)} />
                <MetricCard label={t('format')} value={t('commaSeparated')} />
              </div>
            </div>
          </Panel>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.8fr_minmax(0,1.2fr)]">
          <Panel title={t('engineMode')} description="The builder can stay rule-based or switch to AI-assisted drafting when a live API key is configured.">
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label={t('mode')} value={result ? result.engineMode : '—'} />
              <MetricCard label={t('aiConfigured')} value={result ? (result.aiConfigured ? t('yes') : t('no')) : '—'} />
              <MetricCard label={t('aiStatus')} value={result ? (result.aiError ? t('fallback') : t('stable')) : '—'} />
            </div>
            {result?.aiError ? (
              <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                {result.aiError}
              </div>
            ) : null}
          </Panel>


          <Panel title={t('score')} description="The total score now comes from separate SEO, GEO, and AEO engines with stricter penalties for repetition and synthetic wording.">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label={t('score')} value={result ? `${result.score}/100` : '—'} />
                <MetricCard label="SEO" value={result ? `${result.seoScore}/100` : '—'} />
                <MetricCard label="GEO" value={result ? `${result.geoScore}/100` : '—'} />
                <MetricCard label="AEO" value={result ? `${result.aeoScore}/100` : '—'} />
              </div>
              <div className={["rounded-3xl border px-4 py-4 text-sm font-medium", statusTone(result?.status ?? '')].join(' ')}>
                {result?.status ?? 'Create a list to see the current status.'}
              </div>
            </div>
          </Panel>

          <Panel title={t('improvementNotes')} description="Clear guidance explains whether the list is strong, medium, needs improvement, or should be refreshed.">
            <div className="grid gap-3">
              {(result?.notes ?? ['Your improvement notes will appear here after the first creation pass.']).map((note) => (
                <div key={note} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-200">
                  {note}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
