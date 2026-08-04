'use client';

import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Activity,
  Check,
  CircleAlert,
  Clock3,
  Gauge,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkle,
} from 'lucide-react';
import { SETTINGS_PROVIDERS, providerLabelKey } from '../lib/platforms';
import {
  formatContext,
  modelValue,
  type ModelItem,
  type ModelQuotaSnapshot,
  type ProviderFailure,
  type QuotaWindow,
} from '../lib/models';
import { classNames, GATEWAY } from '../lib/utils';
import { useI18n } from '../i18n';

type SortMode = 'capability' | 'provider' | 'context' | 'name';

type Translator = (key: string, params?: Record<string, string | number>) => string;

const PROVIDER_MARKS = [
  'bg-emerald-500',
  'bg-blue-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
] as const;

function providerLabel(id: string, t: Translator): string {
  const entry = SETTINGS_PROVIDERS.find((provider) => provider.id === id);
  if (!entry) return id;
  const key = providerLabelKey(id);
  if (key) {
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }
  return entry.label;
}

function providerMark(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PROVIDER_MARKS[hash % PROVIDER_MARKS.length]!;
}

export function FinderView({
  models,
  selectedModel,
  gatewayReachable,
  loading,
  failures,
  onSelectModel,
  onOpenTester,
  onOpenSettings,
  onStartOnboarding,
  onRefresh,
  onProbeModel,
  probingModels,
}: {
  models: ModelItem[];
  selectedModel: string;
  gatewayReachable: boolean | null;
  loading: boolean;
  failures: ProviderFailure[];
  onSelectModel: (model: string) => void;
  onOpenTester: () => void;
  onOpenSettings: () => void;
  onStartOnboarding?: () => void;
  onRefresh: () => void;
  onProbeModel: (model: string) => void;
  probingModels: string[];
}) {
  const { t, language } = useI18n();
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState('all');
  const [sort, setSort] = useState<SortMode>('provider');

  const providers = useMemo(
    () => Array.from(new Set(models.map((model) => model.provider))).sort(),
    [models],
  );

  const visibleModels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return models
      .filter((model) => provider === 'all' || model.provider === provider)
      .filter((model) => {
        if (!normalizedQuery) return true;
        return [
          model.id,
          model.display_name,
          model.description,
          providerLabel(model.provider, t),
        ].some((value) => value?.toLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) => {
        if (sort === 'context') {
          return (b.context_window ?? 0) - (a.context_window ?? 0);
        }
        if (sort === 'capability') {
          return (
            (b.capability_score ?? 0) - (a.capability_score ?? 0) ||
            (b.context_window ?? 0) - (a.context_window ?? 0) ||
            (a.display_name ?? a.id).localeCompare(b.display_name ?? b.id)
          );
        }
        if (sort === 'name') {
          return (a.display_name ?? a.id).localeCompare(b.display_name ?? b.id);
        }
        return (
          providerLabel(a.provider, t).localeCompare(providerLabel(b.provider, t)) ||
          (a.display_name ?? a.id).localeCompare(b.display_name ?? b.id)
        );
      });
  }, [models, provider, query, sort, t]);

  const largestContext = useMemo(
    () => models.reduce((largest, model) => Math.max(largest, model.context_window ?? 0), 0),
    [models],
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-7 md:px-8 md:py-10">
      <section className="border-b border-border pb-7">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <span className="h-px w-6 bg-primary" />
              {t('finder.eyebrow')}
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground md:text-4xl">
              {t('finder.title')}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              {t('finder.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-surface">
            <Metric label={t('finder.metric.free')} value={loading ? '—' : String(models.length)} />
            <Metric
              label={t('finder.metric.sources')}
              value={loading ? '—' : String(providers.length)}
            />
            <Metric
              label={t('finder.metric.ctx')}
              value={largestContext ? formatContext(largestContext, t).split(' ')[0]! : '—'}
            />
          </div>
        </div>
      </section>

      {gatewayReachable === false && (
        <Notice
          tone="error"
          title={t('finder.notice.error.title')}
          body={t('finder.notice.error.body', { gateway: GATEWAY })}
          action={t('finder.notice.error.action')}
          onAction={onOpenSettings}
        />
      )}

      {gatewayReachable === true && models.length === 0 && !loading && (
        <Notice
          tone="neutral"
          title={t('finder.notice.empty.title')}
          body={t('finder.notice.empty.body')}
          action={
            onStartOnboarding
              ? t('finder.notice.empty.actionConnect')
              : t('finder.notice.empty.actionSettings')
          }
          onAction={onStartOnboarding ?? onOpenSettings}
        />
      )}

      {failures.length > 0 && (
        <div className="mt-5 rounded-2xl border border-warning/30 bg-warning/5 px-4 py-3">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 shrink-0 text-warning" size={17} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {t('finder.failures.title', { count: failures.length })}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {failures
                  .map((failure) => `${providerLabel(failure.id, t)}：${failure.error}`)
                  .join('　·　')}
              </p>
            </div>
          </div>
        </div>
      )}

      <section className="mt-7">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={16}
            />
            <span className="sr-only">{t('finder.search.label')}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('finder.search.placeholder')}
              className="h-11 w-full rounded-xl border border-input bg-surface pl-10 pr-4 text-sm shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-4 focus:ring-ring/10"
            />
          </label>

          <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
            <select
              aria-label={t('finder.filter.label')}
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              className="h-11 min-w-[148px] rounded-xl border border-input bg-surface px-3 text-sm outline-none focus:border-ring focus:ring-4 focus:ring-ring/10"
            >
              <option value="all">{t('finder.filter.all')}</option>
              {providers.map((id) => (
                <option key={id} value={id}>
                  {providerLabel(id, t)}
                </option>
              ))}
            </select>
            <label className="relative">
              <SlidersHorizontal
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                size={15}
              />
              <span className="sr-only">{t('finder.sort.label')}</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortMode)}
                className="h-11 min-w-[148px] rounded-xl border border-input bg-surface pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-4 focus:ring-ring/10"
              >
                <option value="provider">{t('finder.sort.provider')}</option>
                <option value="capability">{t('finder.sort.capability')}</option>
                <option value="context">{t('finder.sort.context')}</option>
                <option value="name">{t('finder.sort.name')}</option>
              </select>
            </label>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-surface-muted disabled:opacity-60"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />
              {t('finder.sync')}
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {t('finder.counter', { visible: visibleModels.length, total: models.length })}
          </span>
          <span className="hidden sm:inline">{t('finder.footer')}</span>
        </div>

        {loading && models.length === 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="h-44 animate-pulse rounded-2xl border border-border bg-surface-muted/60"
              />
            ))}
          </div>
        ) : visibleModels.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {visibleModels.map((item) => {
              const value = modelValue(item);
              const selected = value === selectedModel;
              const probing = probingModels.includes(value);
              return (
                <article
                  key={value}
                  className={classNames(
                    'group flex min-h-44 flex-col rounded-2xl border bg-surface p-5 transition',
                    selected
                      ? 'border-primary/50 shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]'
                      : 'border-border hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md',
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <span
                          className={classNames(
                            'h-2 w-2 rounded-full',
                            providerMark(item.provider),
                          )}
                        />
                        {providerLabel(item.provider, t)}
                      </div>
                      <h2 className="mt-2 line-clamp-2 text-base font-semibold leading-6 tracking-[-0.02em] text-foreground">
                        {item.display_name ?? item.id}
                      </h2>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-[11px] font-semibold text-success">
                      <Check size={11} strokeWidth={2.5} />
                      {t('finder.card.free')}
                    </span>
                  </div>

                  <code
                    className="mt-2 line-clamp-1 text-[11px] text-muted-foreground"
                    title={item.id}
                  >
                    {item.id}
                  </code>

                  <p className="mt-3 line-clamp-2 flex-1 text-xs leading-5 text-muted-foreground">
                    {item.description || t('finder.card.desc.default')}
                  </p>

                  <QuotaPanel
                    quota={item.quota}
                    probing={probing}
                    onProbe={() => onProbeModel(value)}
                    t={t}
                    language={language}
                  />

                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                    <span className="text-xs font-medium text-foreground">
                      {formatContext(item.context_window, t)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectModel(value);
                        onOpenTester();
                      }}
                      className={classNames(
                        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
                        selected
                          ? 'bg-primary text-primary-foreground'
                          : 'text-foreground hover:bg-surface-muted',
                      )}
                    >
                      {selected ? t('finder.card.continueTest') : t('finder.card.useToTest')}
                      <ArrowUpRight size={13} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
            <Search className="mx-auto text-muted-foreground/60" size={24} />
            <p className="mt-3 text-sm font-medium text-foreground">{t('finder.empty.title')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('finder.empty.body')}</p>
          </div>
        )}
      </section>
    </div>
  );
}

function compactNumber(value: number, language: 'zh' | 'en'): string {
  return new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatReset(resetAt: number | undefined, language: 'zh' | 'en', t: Translator): string {
  if (!resetAt) return t('finder.reset.unknown');
  const date = new Date(resetAt);
  const sameDay = date.toDateString() === new Date().toDateString();
  const locale = language === 'zh' ? 'zh-CN' : 'en-US';
  return date.toLocaleString(
    locale,
    sameDay
      ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
      : { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' },
  );
}

function windowName(window: QuotaWindow, t: Translator): string {
  const resourceKey =
    window.resource === 'requests'
      ? 'finder.quota.resource.requests'
      : window.resource === 'tokens'
        ? 'finder.quota.resource.tokens'
        : 'finder.quota.resource.neurons';
  const resource = t(resourceKey);
  const seconds = window.windowSeconds;
  if (!seconds) return t('finder.quota.win.generic', { resource });
  if (seconds === 1) return t('finder.quota.win.perSecond', { resource });
  if (seconds === 60) return t('finder.quota.win.perMinute', { resource });
  if (seconds === 3_600) return t('finder.quota.win.perHour', { resource });
  if (seconds === 86_400) return t('finder.quota.win.perDay', { resource });
  if (seconds === 2_592_000) return t('finder.quota.win.perMonth', { resource });
  if (seconds % 3_600 === 0)
    return t('finder.quota.win.perHours', { n: seconds / 3_600, resource });
  if (seconds % 60 === 0) return t('finder.quota.win.perMinutes', { n: seconds / 60, resource });
  return t('finder.quota.win.perSeconds', { n: seconds, resource });
}

function QuotaPanel({
  quota,
  probing,
  onProbe,
  t,
  language,
}: {
  quota?: ModelQuotaSnapshot;
  probing: boolean;
  onProbe: () => void;
  t: Translator;
  language: 'zh' | 'en';
}) {
  const status = quota?.availability ?? 'untested';
  const statusCopy = {
    untested: t('finder.quota.untested'),
    available: t('finder.quota.available'),
    limited: t('finder.quota.limited'),
    error: t('finder.quota.error'),
  }[status];
  const statusTone =
    status === 'available'
      ? 'text-success'
      : status === 'limited' || status === 'error'
        ? 'text-destructive'
        : 'text-muted-foreground';

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface-muted/45 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[11px] font-medium">
          <Activity size={13} className={statusTone} />
          <span className={statusTone}>{statusCopy}</span>
          {quota?.latencyMs !== undefined && (
            <span className="text-muted-foreground">· {quota.latencyMs} ms</span>
          )}
        </div>
        <button
          type="button"
          onClick={onProbe}
          disabled={probing}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/10 disabled:opacity-60"
        >
          {probing ? <LoaderCircle size={11} className="animate-spin" /> : <Gauge size={11} />}
          {probing ? t('finder.quota.probing') : t('finder.quota.probe')}
        </button>
      </div>

      <div className="mt-2 grid gap-1.5 text-[11px] text-muted-foreground sm:grid-cols-2">
        <div className="flex items-center gap-1.5">
          <Gauge size={12} />
          <span>
            {t('finder.quota.sessionUsed')}{' '}
            <b className="font-semibold text-foreground">
              {compactNumber(quota?.session.totalTokens ?? 0, language)}
            </b>{' '}
            {t('finder.quota.tokens')}
            {' · '}
            {quota?.session.requests ?? 0} {t('finder.quota.requestsSuffix')}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock3 size={12} />
          <span>{t('finder.quota.lastReset', { time: formatReset(quota?.session.resetAt, language, t) })}</span>
        </div>
      </div>

      {quota?.windows.length ? (
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {quota.windows.map((window, index) => (
            <div
              key={`${window.resource}:${window.windowSeconds ?? 'unknown'}:${window.scope}:${index}`}
              className="rounded-lg border border-border/70 bg-surface px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span>
                  {windowName(window, t)} ·{' '}
                  {window.scope === 'provider' ? t('finder.quota.shared') : t('finder.quota.model')}
                </span>
                <span>
                  {window.source === 'upstream'
                    ? t('finder.quota.upstream')
                    : t('finder.quota.local')}
                </span>
              </div>
              <div className="mt-0.5 text-xs font-semibold text-foreground">
                {window.remaining !== undefined
                  ? t('finder.quota.remaining', { value: compactNumber(window.remaining, language) })
                  : t('finder.quota.remainingUnknown')}
                {window.limit !== undefined ? ` / ${compactNumber(window.limit, language)}` : ''}
              </div>
              {window.resetAt && (
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {formatReset(window.resetAt, language, t)} {t('finder.quota.resetSuffix')}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
          {t('finder.quota.noWindows')}
        </p>
      )}

      {quota?.error && (
        <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-destructive" title={quota.error}>
          {quota.error}
        </p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[94px] px-4 py-3.5 text-center">
      <div className="text-lg font-semibold tracking-[-0.03em] text-foreground">{value}</div>
      <div className="mt-0.5 whitespace-nowrap text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Notice({
  tone,
  title,
  body,
  action,
  onAction,
}: {
  tone: 'error' | 'neutral';
  title: string;
  body: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div
      className={classNames(
        'mt-5 flex flex-col justify-between gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center',
        tone === 'error' ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-surface',
      )}
    >
      <div className="flex items-start gap-3">
        {tone === 'error' ? (
          <CircleAlert className="mt-0.5 shrink-0 text-destructive" size={17} />
        ) : (
          <KeyRound className="mt-0.5 shrink-0 text-primary" size={17} />
        )}
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{body}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onAction}
        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background transition hover:opacity-85"
      >
        {action}
        <Sparkle size={12} />
      </button>
    </div>
  );
}
