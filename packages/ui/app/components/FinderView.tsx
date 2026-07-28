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
import { SETTINGS_PROVIDERS } from '../lib/platforms';
import {
  formatContext,
  modelValue,
  type ModelItem,
  type ModelQuotaSnapshot,
  type ProviderFailure,
  type QuotaWindow,
} from '../lib/models';
import { classNames, GATEWAY } from '../lib/utils';

type SortMode = 'capability' | 'provider' | 'context' | 'name';

const PROVIDER_MARKS = [
  'bg-emerald-500',
  'bg-blue-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
] as const;

function providerLabel(id: string): string {
  return SETTINGS_PROVIDERS.find((provider) => provider.id === id)?.label ?? id;
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
          providerLabel(model.provider),
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
          providerLabel(a.provider).localeCompare(providerLabel(b.provider)) ||
          (a.display_name ?? a.id).localeCompare(b.display_name ?? b.id)
        );
      });
  }, [models, provider, query, sort]);

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
              Live catalog
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground md:text-4xl">
              只看真正能免费调用的模型
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              列表来自已配置 provider
              的实时接口，并经过零价格、官方免费层白名单和文本生成能力三重筛选。
              试用赠金或明确收费的模型不会出现在这里。
            </p>
          </div>

          <div className="grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-surface">
            <Metric label="免费模型" value={loading ? '—' : String(models.length)} />
            <Metric label="可用来源" value={loading ? '—' : String(providers.length)} />
            <Metric
              label="最大上下文"
              value={largestContext ? formatContext(largestContext).split(' ')[0]! : '—'}
            />
          </div>
        </div>
      </section>

      {gatewayReachable === false && (
        <Notice
          tone="error"
          title="本地网关没有响应"
          body={`请先启动 fmf serve。当前地址：${GATEWAY}`}
          action="打开设置"
          onAction={onOpenSettings}
        />
      )}

      {gatewayReachable === true && models.length === 0 && !loading && (
        <Notice
          tone="neutral"
          title="还没有可用的免费模型"
          body="添加至少一个 provider key；如果已经添加，请检查下方的连接错误。"
          action={onStartOnboarding ? '连接第一个 Provider' : '配置来源'}
          onAction={onStartOnboarding ?? onOpenSettings}
        />
      )}

      {failures.length > 0 && (
        <div className="mt-5 rounded-2xl border border-warning/30 bg-warning/5 px-4 py-3">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 shrink-0 text-warning" size={17} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {failures.length} 个来源本次同步失败
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {failures
                  .map((failure) => `${providerLabel(failure.id)}：${failure.error}`)
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
            <span className="sr-only">搜索模型</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索模型、来源或用途"
              className="h-11 w-full rounded-xl border border-input bg-surface pl-10 pr-4 text-sm shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-4 focus:ring-ring/10"
            />
          </label>

          <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
            <select
              aria-label="按来源筛选"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              className="h-11 min-w-[148px] rounded-xl border border-input bg-surface px-3 text-sm outline-none focus:border-ring focus:ring-4 focus:ring-ring/10"
            >
              <option value="all">全部来源</option>
              {providers.map((id) => (
                <option key={id} value={id}>
                  {providerLabel(id)}
                </option>
              ))}
            </select>
            <label className="relative">
              <SlidersHorizontal
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                size={15}
              />
              <span className="sr-only">排序方式</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortMode)}
                className="h-11 min-w-[148px] rounded-xl border border-input bg-surface pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-4 focus:ring-ring/10"
              >
                <option value="provider">按来源排序</option>
                <option value="capability">能力优先</option>
                <option value="context">上下文优先</option>
                <option value="name">按名称排序</option>
              </select>
            </label>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-surface-muted disabled:opacity-60"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />
              同步
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            显示 {visibleModels.length} / {models.length} 个模型
          </span>
          <span className="hidden sm:inline">最近一次请求结果 · 不展示推测价格</span>
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
                        {providerLabel(item.provider)}
                      </div>
                      <h2 className="mt-2 line-clamp-2 text-base font-semibold leading-6 tracking-[-0.02em] text-foreground">
                        {item.display_name ?? item.id}
                      </h2>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-[11px] font-semibold text-success">
                      <Check size={11} strokeWidth={2.5} />
                      免费
                    </span>
                  </div>

                  <code
                    className="mt-2 line-clamp-1 text-[11px] text-muted-foreground"
                    title={item.id}
                  >
                    {item.id}
                  </code>

                  <p className="mt-3 line-clamp-2 flex-1 text-xs leading-5 text-muted-foreground">
                    {item.description || '已通过该来源的免费模型规则，可用于文本对话。'}
                  </p>

                  <QuotaPanel
                    quota={item.quota}
                    probing={probing}
                    onProbe={() => onProbeModel(value)}
                  />

                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                    <span className="text-xs font-medium text-foreground">
                      {formatContext(item.context_window)}
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
                      {selected ? '继续测试' : '用它测试'}
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
            <p className="mt-3 text-sm font-medium text-foreground">没有匹配的模型</p>
            <p className="mt-1 text-xs text-muted-foreground">换一个关键词或来源试试。</p>
          </div>
        )}
      </section>
    </div>
  );
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

function formatReset(resetAt?: number): string {
  if (!resetAt) return '未知';
  const date = new Date(resetAt);
  const sameDay = date.toDateString() === new Date().toDateString();
  return date.toLocaleString(
    'zh-CN',
    sameDay
      ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
      : { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' },
  );
}

function windowName(window: QuotaWindow): string {
  const resource =
    window.resource === 'requests' ? '请求' : window.resource === 'tokens' ? 'Token' : 'Neuron';
  const seconds = window.windowSeconds;
  if (!seconds) return `${resource}额度`;
  if (seconds === 1) return `每秒${resource}`;
  if (seconds === 60) return `每分钟${resource}`;
  if (seconds === 3_600) return `每小时${resource}`;
  if (seconds === 86_400) return `每天${resource}`;
  if (seconds === 2_592_000) return `每月${resource}`;
  if (seconds % 3_600 === 0) return `每 ${seconds / 3_600} 小时${resource}`;
  if (seconds % 60 === 0) return `每 ${seconds / 60} 分钟${resource}`;
  return `${seconds} 秒${resource}`;
}

function QuotaPanel({
  quota,
  probing,
  onProbe,
}: {
  quota?: ModelQuotaSnapshot;
  probing: boolean;
  onProbe: () => void;
}) {
  const status = quota?.availability ?? 'untested';
  const statusCopy = {
    untested: '未检测',
    available: '可用',
    limited: '已限流',
    error: '检测失败',
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
          {probing ? '检测中' : '检测额度'}
        </button>
      </div>

      <div className="mt-2 grid gap-1.5 text-[11px] text-muted-foreground sm:grid-cols-2">
        <div className="flex items-center gap-1.5">
          <Gauge size={12} />
          <span>
            本地会话已用{' '}
            <b className="font-semibold text-foreground">
              {compactNumber(quota?.session.totalTokens ?? 0)}
            </b>{' '}
            tokens
            {' · '}
            {quota?.session.requests ?? 0} 次
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock3 size={12} />
          <span>最近额度重置：{formatReset(quota?.session.resetAt)}</span>
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
                  {windowName(window)} · {window.scope === 'provider' ? '共享' : '模型'}
                </span>
                <span>{window.source === 'upstream' ? '上游' : '本地估算'}</span>
              </div>
              <div className="mt-0.5 text-xs font-semibold text-foreground">
                {window.remaining !== undefined
                  ? `剩余 ${compactNumber(window.remaining)}`
                  : '剩余额度未知'}
                {window.limit !== undefined ? ` / ${compactNumber(window.limit)}` : ''}
              </div>
              {window.resetAt && (
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {formatReset(window.resetAt)} 重置
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
          上游尚未返回精确的 RPM / RPH / RPD 信息；点击检测可读取响应头。
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
