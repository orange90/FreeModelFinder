'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  Cpu,
  ExternalLink,
  Filter,
  Gauge,
  Key,
  ListFilter,
  RotateCcw,
  Search,
  Sparkles,
  Timer,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge, Dot } from './Badge';
import { StatCard } from './StatCard';
import { Drawer } from './Drawer';
import { classNames, formatK, formatNumber, GATEWAY } from '../lib/utils';
import {
  MODALITY_LABEL,
  PLATFORMS,
  getAllEnrichedRows,
  type EnrichedModel,
  type Modality,
} from '../lib/platforms';

type SortKey =
  | 'name'
  | 'provider'
  | 'family'
  | 'modality'
  | 'contextK'
  | 'reqPerMin'
  | 'reqPerDay'
  | 'throughputTps'
  | 'intelligenceIndex'
  | 'arenaElo';
type SortDir = 'asc' | 'desc';

type QuickFilter = 'high-capability' | 'fast' | 'long-context';

const QUICK_FILTERS: { key: QuickFilter; label: string; Icon: LucideIcon; desc: string }[] = [
  { key: 'high-capability', label: '高能力', Icon: Sparkles, desc: 'Intelligence ≥ 70' },
  { key: 'fast', label: '速度优先', Icon: Zap, desc: '吞吐 ≥ 150 tps' },
  { key: 'long-context', label: '长上下文', Icon: BookOpen, desc: '上下文 ≥ 128K' },
];

const PROVIDER_TONE: Record<string, 'primary' | 'purple' | 'sky'> = {
  openrouter: 'purple',
  gemini: 'sky',
};

const MODALITY_TONE: Record<Modality, 'neutral' | 'success' | 'purple'> = {
  text: 'neutral',
  vision: 'success',
  reasoning: 'purple',
};

export function FinderView({
  gatewayReachable,
  hasModels,
  configuredProviderCount,
}: {
  gatewayReachable: boolean | null;
  hasModels: boolean;
  configuredProviderCount: number;
}) {
  const allRows = useMemo(() => getAllEnrichedRows(), []);
  const allFamilies = useMemo(
    () =>
      Array.from(
        new Set(allRows.map((r) => r.family).filter((f): f is string => !!f)),
      ).sort(),
    [allRows],
  );

  const [query, setQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState<Set<string>>(
    new Set(PLATFORMS.map((p) => p.id)),
  );
  const [modalityFilter, setModalityFilter] = useState<Set<Modality>>(
    new Set(['text', 'vision', 'reasoning']),
  );
  const [familyFilter, setFamilyFilter] = useState<Set<string>>(new Set(allFamilies));
  const [quickFilter, setQuickFilter] = useState<Set<QuickFilter>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('intelligenceIndex');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [moreFilterOpen, setMoreFilterOpen] = useState(false);
  const [platformGuideId, setPlatformGuideId] = useState<string | null>(null);

  function toggle<T>(set: Set<T>, key: T): Set<T> {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }

  const rows = useMemo(() => {
    return allRows
      .filter((r) => providerFilter.has(r.providerId))
      .filter((r) => !r.modality || modalityFilter.has(r.modality))
      .filter((r) => !r.family || familyFilter.has(r.family))
      .filter((r) => {
        if (!quickFilter.size) return true;
        if (
          quickFilter.has('high-capability') &&
          (r.intelligenceIndex == null || r.intelligenceIndex < 70)
        )
          return false;
        if (
          quickFilter.has('fast') &&
          (r.throughputTps == null || r.throughputTps < 150)
        )
          return false;
        if (
          quickFilter.has('long-context') &&
          (r.contextK == null || r.contextK < 128)
        )
          return false;
        return true;
      })
      .filter((r) => {
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return (
          r.name.toLowerCase().includes(q) ||
          (r.note?.toLowerCase().includes(q) ?? false) ||
          r.providerLabel.toLowerCase().includes(q) ||
          (r.family?.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1;
        const field: keyof EnrichedModel =
          sortKey === 'provider' ? 'providerLabel' : (sortKey as keyof EnrichedModel);
        const av = a[field];
        const bv = b[field];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
  }, [allRows, providerFilter, modalityFilter, familyFilter, quickFilter, query, sortKey, sortDir]);

  const stats = useMemo(() => {
    const smart = allRows.reduce<EnrichedModel | null>((acc, r) => {
      if (r.intelligenceIndex == null) return acc;
      if (!acc || (acc.intelligenceIndex ?? 0) < r.intelligenceIndex) return r;
      return acc;
    }, null);
    const fastest = allRows.reduce<EnrichedModel | null>((acc, r) => {
      if (r.throughputTps == null) return acc;
      if (!acc || (acc.throughputTps ?? 0) < r.throughputTps) return r;
      return acc;
    }, null);
    return { smart, fastest };
  }, [allRows]);

  const filtersActive =
    query.trim() !== '' ||
    providerFilter.size !== PLATFORMS.length ||
    modalityFilter.size !== 3 ||
    familyFilter.size !== allFamilies.length ||
    quickFilter.size > 0;

  function resetFilters() {
    setQuery('');
    setProviderFilter(new Set(PLATFORMS.map((p) => p.id)));
    setModalityFilter(new Set(['text', 'vision', 'reasoning']));
    setFamilyFilter(new Set(allFamilies));
    setQuickFilter(new Set());
    setSortKey('intelligenceIndex');
    setSortDir('desc');
  }

  function onSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'provider' || key === 'family' ? 'asc' : 'desc');
    }
  }

  const platformGuide = PLATFORMS.find((p) => p.id === platformGuideId) ?? null;

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-10 pt-5 md:px-6 lg:px-8">
      {gatewayReachable === false && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
          <Dot tone="danger" />
          <span>
            未能连接到本地网关（<code className="font-mono text-xs">{GATEWAY}</code>）。请确认已启动
            <code className="mx-1 font-mono text-xs">fmf serve</code>或桌面端已运行。
          </span>
        </div>
      )}
      {gatewayReachable && !hasModels && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-primary/25 bg-primary/5 px-3.5 py-2.5 text-sm text-primary">
          <Dot tone="primary" />
          <span>
            网关已连接，但你还没有配置任何 API Key。
            <a href="/settings" className="ml-1 underline underline-offset-2">
              前往设置页
            </a>
            粘贴 Key 后即可使用。
          </span>
        </div>
      )}

      <section
        aria-label="概览"
        className="mb-5 rounded-lg border border-border/60 bg-section-a px-3 py-4 md:px-4"
      >
        <div className="mb-2 flex items-end justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">免费模型寻找</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              汇总当前可用的免费大模型，按能力、速度和上下文快速筛选。
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="可发现模型"
            value={String(allRows.length)}
            hint={`来自 ${PLATFORMS.length} 个平台`}
            tone="ok"
            icon={<Cpu size={14} strokeWidth={1.75} />}
          />
          <StatCard
            label="已配置平台"
            value={`${configuredProviderCount} / ${PLATFORMS.length}`}
            hint={configuredProviderCount > 0 ? '至少启用了一个' : '尚未配置 Key'}
            tone={configuredProviderCount > 0 ? 'ok' : 'warn'}
            icon={<Key size={14} strokeWidth={1.75} />}
          />
          <StatCard
            label="最高能力模型"
            value={stats.smart?.name ?? '—'}
            hint={
              stats.smart?.intelligenceIndex != null
                ? `Intelligence Index ${stats.smart.intelligenceIndex}`
                : undefined
            }
            tone="ok"
            icon={<Sparkles size={14} strokeWidth={1.75} />}
          />
          <StatCard
            label="最快响应"
            value={stats.fastest?.name ?? '—'}
            hint={
              stats.fastest?.throughputTps != null
                ? `${stats.fastest.throughputTps} tokens/s`
                : undefined
            }
            tone="ok"
            icon={<Zap size={14} strokeWidth={1.75} />}
          />
        </div>
      </section>

      <section
        aria-label="筛选"
        className="mb-4 space-y-3 rounded-lg border border-border/60 bg-section-b px-3 py-3 md:px-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search
              size={14}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              className="w-full rounded-md border border-input bg-surface py-2 pl-9 pr-9 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="搜索模型名 / 平台 / 系列…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="搜索模型"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="清空搜索"
                className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              >
                <X size={12} strokeWidth={2} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMoreFilterOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:border-border-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ListFilter size={14} strokeWidth={1.75} />
            更多筛选
            {(providerFilter.size !== PLATFORMS.length ||
              modalityFilter.size !== 3 ||
              familyFilter.size !== allFamilies.length) && (
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {providerFilter.size !== PLATFORMS.length ? 1 : 0}
                {modalityFilter.size !== 3 ? 1 : 0}
                {familyFilter.size !== allFamilies.length ? 1 : 0}
              </span>
            )}
          </button>

          {filtersActive && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RotateCcw size={13} strokeWidth={1.75} />
              重置
            </button>
          )}

          <div className="ml-auto text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{rows.length}</span>
            <span className="mx-1 text-muted-foreground/60">/</span>
            <span>{allRows.length}</span>
            <span className="ml-1">个模型</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterLabel icon={Filter}>快捷筛选</FilterLabel>
          {QUICK_FILTERS.map((qf) => {
            const active = quickFilter.has(qf.key);
            return (
              <button
                key={qf.key}
                type="button"
                aria-pressed={active}
                onClick={() => setQuickFilter((s) => toggle(s, qf.key))}
                title={qf.desc}
                className={classNames(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
                )}
              >
                <qf.Icon size={13} strokeWidth={1.75} />
                {qf.label}
              </button>
            );
          })}

          <span className="mx-2 hidden h-4 w-px bg-border sm:inline-block" aria-hidden />

          <FilterLabel>平台</FilterLabel>
          <MultiSelectDropdown
            label="平台"
            options={PLATFORMS.map((p) => ({ value: p.id, label: p.label }))}
            selected={providerFilter}
            onChange={setProviderFilter}
          />

          <span className="mx-2 hidden h-4 w-px bg-border sm:inline-block" aria-hidden />

          <FilterLabel>模态</FilterLabel>
          {(['text', 'vision', 'reasoning'] as Modality[]).map((m) => {
            const active = modalityFilter.has(m);
            return (
              <button
                key={m}
                type="button"
                aria-pressed={active}
                onClick={() => setModalityFilter((s) => toggle(s, m))}
                className={classNames(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
                )}
              >
                {MODALITY_LABEL[m]}
              </button>
            );
          })}
        </div>
      </section>

      <section
        aria-label="模型列表"
        className="overflow-hidden rounded-lg border border-border bg-surface"
      >
        <div className="hidden grid-cols-[minmax(0,3fr)_120px_88px_96px_100px_120px] gap-3 border-b border-border bg-surface-muted/60 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
          <SortHeader onClick={() => onSort('name')} active={sortKey === 'name'} dir={sortDir}>
            模型
          </SortHeader>
          <SortHeader onClick={() => onSort('provider')} active={sortKey === 'provider'} dir={sortDir}>
            平台
          </SortHeader>
          <SortHeader onClick={() => onSort('modality')} active={sortKey === 'modality'} dir={sortDir}>
            模态
          </SortHeader>
          <SortHeader
            onClick={() => onSort('contextK')}
            active={sortKey === 'contextK'}
            dir={sortDir}
            align="right"
          >
            上下文
          </SortHeader>
          <SortHeader
            onClick={() => onSort('throughputTps')}
            active={sortKey === 'throughputTps'}
            dir={sortDir}
            align="right"
          >
            速度
          </SortHeader>
          <SortHeader
            onClick={() => onSort('intelligenceIndex')}
            active={sortKey === 'intelligenceIndex'}
            dir={sortDir}
            align="right"
            title="综合能力评分：Artificial Analysis Intelligence Index（0–100，越高越强，参考 LMSYS Chatbot Arena Elo）"
          >
            能力
          </SortHeader>
        </div>

        {rows.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Filter size={20} strokeWidth={1.5} />
            <p>没有匹配的模型 —— 试试放宽筛选条件。</p>
            {filtersActive && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-3 py-1 text-xs text-foreground hover:border-border-strong"
              >
                <RotateCcw size={12} strokeWidth={1.75} />
                重置筛选
              </button>
            )}
          </div>
        )}

        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const key = `${r.providerId}:${r.name}`;
            const isOpen = expanded === key;
            return (
              <li key={key}>
                <ModelRow
                  row={r}
                  isOpen={isOpen}
                  onToggle={() => setExpanded(isOpen ? null : key)}
                  onOpenGuide={() => setPlatformGuideId(r.providerId)}
                />
                {isOpen && (
                  <div className="border-t border-border bg-surface-muted/40 px-4 py-4 md:px-6">
                    <ExpandedDetail row={r} onOpenGuide={() => setPlatformGuideId(r.providerId)} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <p>
          能力评分参考{' '}
          <span className="font-medium text-foreground">Artificial Analysis Intelligence Index</span>{' '}
          与 LMSYS Chatbot Arena Elo，仅供横向参考。
        </p>
        <button
          type="button"
          onClick={() => setPlatformGuideId(PLATFORMS[0]!.id)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm hover:border-border-strong"
        >
          <BookOpen size={13} strokeWidth={1.75} />
          平台注册指引
        </button>
      </div>

      <Drawer
        open={moreFilterOpen}
        onClose={() => setMoreFilterOpen(false)}
        title="更多筛选"
        description="按模型系列细化筛选。"
      >
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              模型系列
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allFamilies.map((f) => {
                const active = familyFilter.has(f);
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFamilyFilter((s) => toggle(s, f))}
                    className={classNames(
                      'rounded-full border px-2.5 py-1 text-xs font-medium transition',
                      active
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
                    )}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="border-t border-border pt-4 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => {
                setFamilyFilter(new Set(allFamilies));
              }}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-border-strong"
            >
              <RotateCcw size={12} strokeWidth={1.75} />
              重置系列筛选
            </button>
          </div>
        </div>
      </Drawer>

      <Drawer
        open={platformGuide !== null}
        onClose={() => setPlatformGuideId(null)}
        title="平台注册指引"
        description="选择一个平台查看注册流程与获取 API Key 的方法。"
      >
        {platformGuide && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlatformGuideId(p.id)}
                  className={classNames(
                    'rounded-full border px-2.5 py-1 text-xs font-medium transition',
                    platformGuide.id === p.id
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
              <p className="text-sm leading-relaxed text-foreground/90">{platformGuide.summary}</p>
              <div>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  需要准备
                </h4>
                <ul className="space-y-1 text-sm text-foreground/90">
                  {platformGuide.requirements.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-muted-foreground" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  注册步骤
                </h4>
                <ol className="space-y-2 text-sm text-foreground/90">
                  {platformGuide.registerSteps.map((s, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-border bg-surface-muted text-xs font-medium text-muted-foreground">
                        {i + 1}
                      </span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
              {platformGuide.limits && (
                <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">额度说明：</span>
                  {platformGuide.limits}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <a
                  href={platformGuide.registerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                >
                  注册账号
                  <ExternalLink size={12} strokeWidth={2} />
                </a>
                <a
                  href={platformGuide.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:border-border-strong"
                >
                  获取 API Key
                  <ExternalLink size={12} strokeWidth={2} />
                </a>
                <a
                  href={platformGuide.homepage}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  官网
                  <ExternalLink size={12} strokeWidth={2} />
                </a>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function FilterLabel({
  icon: Icon,
  children,
}: {
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      {Icon && <Icon size={12} strokeWidth={1.75} />}
      {children}
    </span>
  );
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const total = options.length;
  const count = selected.size;
  const allSelected = count === total;
  const noneSelected = count === 0;

  const summary = allSelected
    ? '全部'
    : noneSelected
      ? '未选择'
      : count === 1
        ? (options.find((o) => selected.has(o.value))?.label ?? `${count} 项`)
        : `${count} 项`;

  function toggleValue(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  function selectAll() {
    onChange(new Set(options.map((o) => o.value)));
  }

  function clearAll() {
    onChange(new Set());
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={classNames(
          'inline-flex max-w-[220px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          !allSelected && !noneSelected
            ? 'border-primary/30 bg-primary/10 text-primary'
            : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
        )}
      >
        <span className="truncate">{summary}</span>
        {!allSelected && !noneSelected && (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {count}
          </span>
        )}
        <ChevronDown
          size={13}
          strokeWidth={1.75}
          className={classNames('transition', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          aria-multiselectable="true"
          className="absolute left-0 top-full z-30 mt-1.5 w-64 overflow-hidden rounded-md border border-border bg-surface shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border bg-surface-muted/60 px-2.5 py-1.5 text-xs">
            <span className="text-muted-foreground">
              已选 <span className="font-medium text-foreground">{count}</span> / {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-primary transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                全选
              </button>
              <span className="text-border">|</span>
              <button
                type="button"
                onClick={clearAll}
                className="text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                清空
              </button>
            </div>
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {options.map((opt) => {
              const active = selected.has(opt.value);
              return (
                <li key={opt.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => toggleValue(opt.value)}
                    className={classNames(
                      'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'bg-primary/5 text-foreground'
                        : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
                    )}
                  >
                    <span
                      className={classNames(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-surface',
                      )}
                    >
                      {active && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function SortHeader({
  children,
  onClick,
  active,
  dir,
  align = 'left',
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: SortDir;
  align?: 'left' | 'right';
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={classNames(
        'inline-flex select-none items-center gap-1 transition hover:text-foreground focus-visible:outline-none',
        align === 'right' ? 'justify-end text-right' : 'text-left',
        active && 'text-foreground',
      )}
    >
      <span>{children}</span>
      <span className="text-[10px] opacity-70">
        {active ? (dir === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </button>
  );
}

function ModelRow({
  row,
  isOpen,
  onToggle,
  onOpenGuide,
}: {
  row: EnrichedModel;
  isOpen: boolean;
  onToggle: () => void;
  onOpenGuide: () => void;
}) {
  const providerTone = PROVIDER_TONE[row.providerId] ?? 'neutral';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      className={classNames(
        'grid w-full grid-cols-1 gap-x-3 gap-y-2 px-4 py-3 text-left transition md:grid-cols-[minmax(0,3fr)_120px_88px_96px_100px_120px] md:items-center md:py-2.5',
        isOpen ? 'bg-surface-muted/50' : 'hover:bg-surface-muted/40',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {row.note ?? row.name}
          </span>
          {row.family && (
            <span className="hidden text-xs text-muted-foreground sm:inline">{row.family}</span>
          )}
        </div>
        <code
          className="mt-0.5 block truncate font-mono text-xs text-muted-foreground"
          title={row.name}
        >
          {row.name}
        </code>
      </div>

      <div className="md:pl-0">
        <Badge tone={providerTone as any}>{row.providerLabel}</Badge>
      </div>

      <div>
        {row.modality && (
          <Badge tone={MODALITY_TONE[row.modality] as any}>{MODALITY_LABEL[row.modality]}</Badge>
        )}
      </div>

      <div className="text-sm text-foreground md:text-right">
        {row.contextK != null ? (
          <span className="font-mono tabular-nums">{formatK(row.contextK)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      <div className="md:text-right">
        {row.throughputTps != null ? (
          <SpeedBar tps={row.throughputTps} />
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </div>

      <div className="md:text-right">
        {row.intelligenceIndex != null ? (
          <CapabilityBar index={row.intelligenceIndex} />
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </div>
    </button>
  );
}

function SpeedBar({ tps }: { tps: number }) {
  const pct = Math.min(100, Math.round((tps / 800) * 100));
  const tone =
    tps >= 400
      ? 'bg-primary'
      : tps >= 150
        ? 'bg-success'
        : tps >= 60
          ? 'bg-sky-500'
          : 'bg-muted-foreground/60';
  return (
    <div className="flex items-center gap-2 md:justify-end">
      <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
        {tps}
      </span>
      <div className="h-1 w-16 overflow-hidden rounded-full bg-surface-muted">
        <div className={classNames('h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CapabilityBar({ index }: { index: number }) {
  const pct = Math.min(100, Math.max(0, index));
  const tier =
    index >= 80
      ? { label: '顶级', tone: 'bg-primary', text: 'text-primary' }
      : index >= 65
        ? { label: '强', tone: 'bg-success', text: 'text-success' }
        : index >= 45
          ? { label: '一般', tone: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-300' }
          : { label: '入门', tone: 'bg-muted-foreground/60', text: 'text-muted-foreground' };
  return (
    <div className="flex items-center gap-2 md:justify-end">
      <span className={classNames('shrink-0 text-xs font-medium', tier.text)}>{tier.label}</span>
      <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
        {index}
      </span>
      <div className="h-1 w-16 overflow-hidden rounded-full bg-surface-muted">
        <div className={classNames('h-full rounded-full', tier.tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ExpandedDetail({
  row,
  onOpenGuide,
}: {
  row: EnrichedModel;
  onOpenGuide: () => void;
}) {
  const platform = PLATFORMS.find((p) => p.id === row.providerId);
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          模型详情
        </div>
        <dl className="grid grid-cols-[80px_1fr] gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Model ID</dt>
          <dd className="font-mono text-xs text-foreground/90">{row.name}</dd>
          {row.family && (
            <>
              <dt className="text-muted-foreground">系列</dt>
              <dd className="text-foreground">{row.family}</dd>
            </>
          )}
          {row.note && (
            <>
              <dt className="text-muted-foreground">说明</dt>
              <dd className="text-foreground">{row.note}</dd>
            </>
          )}
          {row.intelligenceIndex != null && (
            <>
              <dt className="text-muted-foreground">能力评分</dt>
              <dd className="text-foreground">
                Intelligence Index {row.intelligenceIndex}
                {row.arenaElo != null && (
                  <span className="ml-2 text-muted-foreground">· Arena Elo ≈ {row.arenaElo}</span>
                )}
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">额度</dt>
          <dd className="text-foreground">
            <span className="inline-flex items-center gap-1 font-mono text-xs">
              <Timer size={12} strokeWidth={1.75} className="text-muted-foreground" />
              {row.reqPerMin ?? '—'} <span className="text-muted-foreground">req/min</span>
              <span className="mx-1 text-muted-foreground">·</span>
              {row.reqPerDay != null ? formatNumber(row.reqPerDay) : '—'}{' '}
              <span className="text-muted-foreground">req/day</span>
            </span>
          </dd>
          {row.throughputTps != null && (
            <>
              <dt className="text-muted-foreground">吞吐</dt>
              <dd className="text-foreground">
                <span className="inline-flex items-center gap-1 font-mono text-xs">
                  <Gauge size={12} strokeWidth={1.75} className="text-muted-foreground" />
                  {row.throughputTps} <span className="text-muted-foreground">tokens/s</span>
                </span>
              </dd>
            </>
          )}
        </dl>
      </div>

      <div className="space-y-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          下一步
        </div>
        <p className="text-sm text-muted-foreground">
          在 <span className="font-medium text-foreground">{row.providerLabel}</span> 完成注册并生成
          API Key 后，前往设置页粘贴保存即可开始使用。
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href="/settings"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
          >
            <Key size={13} strokeWidth={1.75} />
            配置 API Key
          </a>
          <button
            type="button"
            onClick={onOpenGuide}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition hover:border-border-strong"
          >
            <BookOpen size={13} strokeWidth={1.75} />
            查看注册指引
          </button>
          {platform && (
            <a
              href={platform.keyUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              获取 Key
              <ExternalLink size={12} strokeWidth={2} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
