'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Sparkles, TrendingDown, X } from 'lucide-react';
import { GATEWAY, classNames, withUiHeaders } from '../lib/utils';

interface ChangeItem {
  id: string;
  provider: string;
  displayName: string;
  free: boolean;
  detectedAt: number;
}

interface ChangesResponse {
  updatedAt: number;
  total: number;
  watcher: {
    intervalMs: number;
    lastRunAt: number;
    lastError: string | null;
    running: boolean;
  };
  added: ChangeItem[];
  removed: ChangeItem[];
}

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const DISMISS_KEY = 'fmf-model-changes-dismissed-at';

function formatRelative(ts: number): string {
  if (!ts) return '尚未巡检';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export function ModelChangesBanner() {
  const [data, setData] = useState<ChangesResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    const raw = window.localStorage.getItem(DISMISS_KEY);
    return raw ? Number(raw) || 0 : 0;
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${GATEWAY}/v1/models/changes?limit=50`, withUiHeaders());
      if (!res.ok) throw new Error(`gateway error ${res.status}`);
      const json = (await res.json()) as ChangesResponse;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch(`${GATEWAY}/v1/models/refresh`, withUiHeaders({ method: 'POST' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useEffect(() => {
    void load();
    timerRef.current = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load]);

  const visibleAdded = useMemo(
    () => (data?.added ?? []).filter((c) => c.detectedAt > dismissedAt),
    [data, dismissedAt],
  );
  const visibleRemoved = useMemo(
    () => (data?.removed ?? []).filter((c) => c.detectedAt > dismissedAt),
    [data, dismissedAt],
  );

  const hasChanges = visibleAdded.length > 0 || visibleRemoved.length > 0;

  function dismiss() {
    const now = Date.now();
    setDismissedAt(now);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, String(now));
    }
  }

  if (!data && !error) return null;

  return (
    <section
      aria-label="模型上下架变动"
      className="mb-4 rounded-lg border border-border bg-surface"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2 text-xs text-muted-foreground">
        <span
          className={classNames(
            'inline-flex h-1.5 w-1.5 rounded-full',
            error ? 'bg-destructive' : data?.watcher.lastError ? 'bg-amber-500' : 'bg-success',
          )}
        />
        <span className="font-medium text-foreground">模型上下架巡检</span>
        <span className="text-muted-foreground/80">
          · 每 {Math.round((data?.watcher.intervalMs ?? 3_600_000) / 60_000)} 分钟自动检查
        </span>
        <span className="text-muted-foreground/80">
          · 最近一次：{formatRelative(data?.watcher.lastRunAt ?? 0)}
        </span>
        {data && <span className="text-muted-foreground/80">· 当前 {data.total} 个模型</span>}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground shadow-sm transition hover:border-border-strong disabled:opacity-60"
          >
            <RefreshCw
              size={12}
              strokeWidth={1.75}
              className={refreshing ? 'animate-spin' : undefined}
            />
            {refreshing ? '巡检中' : '立即巡检'}
          </button>
          {hasChanges && (
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              aria-label="标记已读"
            >
              <X size={12} strokeWidth={1.75} />
              标记已读
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="px-3.5 py-2 text-xs text-destructive">获取模型变动失败：{error}</div>
      )}

      {data?.watcher.lastError && !error && (
        <div className="px-3.5 py-2 text-xs text-amber-600 dark:text-amber-400">
          上一次巡检出错：{data.watcher.lastError}
        </div>
      )}

      {!hasChanges && !error && (
        <div className="px-3.5 py-2 text-xs text-muted-foreground">
          未发现新增或下架的免费模型。
        </div>
      )}

      {hasChanges && (
        <div className="grid gap-3 px-3.5 py-3 md:grid-cols-2">
          <ChangeColumn
            title="新增模型"
            tone="ok"
            icon={<Sparkles size={13} strokeWidth={1.75} />}
            items={visibleAdded}
          />
          <ChangeColumn
            title="下架模型"
            tone="warn"
            icon={<TrendingDown size={13} strokeWidth={1.75} />}
            items={visibleRemoved}
          />
        </div>
      )}
    </section>
  );
}

function ChangeColumn({
  title,
  tone,
  icon,
  items,
}: {
  title: string;
  tone: 'ok' | 'warn';
  icon: React.ReactNode;
  items: ChangeItem[];
}) {
  return (
    <div className="rounded-md border border-border bg-surface-muted/40 p-3">
      <div
        className={classNames(
          'mb-2 inline-flex items-center gap-1.5 text-xs font-medium',
          tone === 'ok' ? 'text-success' : 'text-amber-600 dark:text-amber-400',
        )}
      >
        {icon}
        <span>{title}</span>
        <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">暂无</p>
      ) : (
        <ul className="space-y-1.5">
          {items.slice(0, 8).map((c) => (
            <li key={`${c.provider}:${c.id}:${c.detectedAt}`} className="text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium text-foreground" title={c.displayName}>
                  {c.displayName || c.id}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatRelative(c.detectedAt)}
                </span>
              </div>
              <div className="flex items-baseline gap-2 text-muted-foreground">
                <code className="truncate font-mono" title={c.id}>
                  {c.id}
                </code>
                <span>·</span>
                <span>{c.provider}</span>
              </div>
            </li>
          ))}
          {items.length > 8 && (
            <li className="text-xs text-muted-foreground">还有 {items.length - 8} 个未显示…</li>
          )}
        </ul>
      )}
    </div>
  );
}
