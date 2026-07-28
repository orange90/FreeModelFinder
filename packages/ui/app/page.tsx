'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, MessageSquare, RefreshCw, Search, Wifi, WifiOff } from 'lucide-react';
import { FinderView } from './components/FinderView';
import { OnboardingWizard, type OnboardingResult } from './components/OnboardingWizard';
import { SettingsView } from './components/SettingsView';
import { TesterView, type Msg } from './components/TesterView';
import { BottomNav, type SegmentedItem } from './components/SegmentedTabs';
import { ThemeToggle } from './theme';
import {
  modelValue,
  type ModelItem,
  type ModelQuotaSnapshot,
  type ModelsResponse,
  type ProviderFailure,
} from './lib/models';
import { GATEWAY, classNames, withUiHeaders } from './lib/utils';

type TabKey = 'finder' | 'tester' | 'settings';
type OnboardingMode = 'loading' | 'required' | 'dismissed' | 'complete';

type ConfigPayload = {
  defaultModel?: string;
  onboarding?: { completedAt?: number; dismissedAt?: number; primaryProvider?: string };
  providers?: Record<string, { enabled?: boolean; hasKey?: boolean }>;
};

const TABS: readonly SegmentedItem<TabKey>[] = [
  { key: 'finder', label: '模型', Icon: Search },
  { key: 'tester', label: '测试', Icon: MessageSquare },
  { key: 'settings', label: '设置', Icon: KeyRound },
];

const PAGE_COPY: Record<TabKey, { title: string; description: string }> = {
  finder: { title: '免费模型', description: '实时发现与筛选' },
  tester: { title: '对话测试', description: '直接比较模型表现' },
  settings: { title: '本地设置', description: '来源、路由与接口' },
};

async function requestModels(): Promise<ModelsResponse> {
  const response = await fetch(`${GATEWAY}/v1/models`, withUiHeaders());
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `gateway error ${response.status}`);
  }
  return response.json() as Promise<ModelsResponse>;
}

export default function Home() {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [model, setModel] = useState('');
  const [tab, setTab] = useState<TabKey>('finder');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const [gatewayReachable, setGatewayReachable] = useState<boolean | null>(null);
  const [failures, setFailures] = useState<ProviderFailure[]>([]);
  const [probingModels, setProbingModels] = useState<string[]>([]);
  const [onboardingMode, setOnboardingMode] = useState<OnboardingMode>('loading');
  const streamAbortRef = useRef<AbortController | null>(null);
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const applyModels = useCallback((payload: ModelsResponse) => {
    const list = Array.isArray(payload.data)
      ? payload.data.filter((item) => item.free !== false)
      : [];
    setModels(list);
    setFailures(payload.fmf?.failed_providers ?? []);
    setGatewayReachable(true);
    setModel((current) => {
      if (current && list.some((item) => modelValue(item) === current)) return current;
      return list[0] ? modelValue(list[0]) : '';
    });
    return list;
  }, []);

  const refreshModels = useCallback(
    async (force = false): Promise<ModelItem[]> => {
      setModelLoading(true);
      try {
        if (force) {
          const refreshed = await fetch(
            `${GATEWAY}/v1/models/refresh`,
            withUiHeaders({ method: 'POST' }),
          );
          if (!refreshed.ok) throw new Error(`refresh failed ${refreshed.status}`);
        }
        return applyModels(await requestModels());
      } catch {
        setGatewayReachable(false);
        return [];
      } finally {
        setModelLoading(false);
      }
    },
    [applyModels],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setModelLoading(true);
      try {
        const config = await fetch(`${GATEWAY}/api/config`, withUiHeaders()).then(
          async (response) => {
            if (!response.ok) throw new Error(`config error ${response.status}`);
            return response.json() as Promise<ConfigPayload>;
          },
        );
        if (cancelled) return;
        setGatewayReachable(true);
        const hasConfiguredProvider = Object.values(config.providers ?? {}).some(
          (provider) => provider.enabled && provider.hasKey,
        );
        const onboardingHandled =
          !!config.onboarding?.completedAt || !!config.onboarding?.dismissedAt;
        const onboardingPending = config.onboarding !== undefined && !onboardingHandled;
        if (onboardingPending || (!hasConfiguredProvider && !onboardingHandled)) {
          setOnboardingMode('required');
          return;
        }
        setOnboardingMode(hasConfiguredProvider ? 'complete' : 'dismissed');
        const modelPayload = await requestModels();
        if (cancelled) return;
        const list = applyModels(modelPayload);
        const preferred = config.defaultModel;
        if (preferred && list.some((item) => modelValue(item) === preferred)) {
          setModel(preferred);
        } else if (list[0]) {
          const fallback = modelValue(list[0]);
          setModel(fallback);
          void fetch(
            `${GATEWAY}/api/default-model`,
            withUiHeaders({
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ model: fallback }),
            }),
          );
        }
      } catch {
        if (!cancelled) {
          setGatewayReachable(false);
          setOnboardingMode('complete');
        }
      } finally {
        if (!cancelled) setModelLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyModels]);

  const finishOnboarding = useCallback(
    async (_result: OnboardingResult) => {
      setOnboardingMode('complete');
      const [list, config] = await Promise.all([
        refreshModels(false),
        fetch(`${GATEWAY}/api/config`, withUiHeaders())
          .then((response) => response.json() as Promise<ConfigPayload>)
          .catch(() => ({}) as ConfigPayload),
      ]);
      const preferred = config.defaultModel;
      if (preferred && list.some((item) => modelValue(item) === preferred)) setModel(preferred);
      setTab('tester');
    },
    [refreshModels],
  );

  const dismissOnboarding = useCallback(() => {
    setOnboardingMode('dismissed');
    setGatewayReachable(true);
    void refreshModels(false);
  }, [refreshModels]);

  const openAdvancedSettings = useCallback(() => {
    setOnboardingMode('dismissed');
    setGatewayReachable(true);
    setTab('settings');
    void refreshModels(false);
  }, [refreshModels]);

  const applyQuotas = useCallback((quotas: ModelQuotaSnapshot[]) => {
    const byModel = new Map(
      quotas.map((quota) => [`${quota.provider}:${quota.model}`.toLowerCase(), quota]),
    );
    setModels((current) =>
      current.map((item) => ({
        ...item,
        quota: byModel.get(modelValue(item).toLowerCase()) ?? item.quota,
      })),
    );
  }, []);

  useEffect(() => {
    if (tab !== 'finder' || models.length === 0) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`${GATEWAY}/api/model-quotas`, withUiHeaders());
        if (!response.ok) return;
        const payload = (await response.json()) as { data?: ModelQuotaSnapshot[] };
        if (!cancelled && Array.isArray(payload.data)) applyQuotas(payload.data);
      } catch {
        // Quota polling is supplemental; keep the model catalog usable while offline.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [applyQuotas, models.length, tab]);

  const probeModel = useCallback(
    async (value: string) => {
      setProbingModels((current) => (current.includes(value) ? current : [...current, value]));
      try {
        const response = await fetch(
          `${GATEWAY}/api/model-quotas/probe`,
          withUiHeaders({
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: value }),
          }),
        );
        if (!response.ok) throw new Error(`probe failed ${response.status}`);
        const payload = (await response.json()) as {
          quota?: ModelQuotaSnapshot;
          data?: ModelQuotaSnapshot[];
        };
        if (Array.isArray(payload.data)) applyQuotas(payload.data);
        else if (payload.quota) applyQuotas([payload.quota]);
      } catch {
        // Keep the current snapshot; the card can be retried when the gateway is reachable.
      } finally {
        setProbingModels((current) => current.filter((item) => item !== value));
      }
    },
    [applyQuotas],
  );

  const selectModel = useCallback((value: string) => {
    setModel(value);
    if (!value) return;
    void fetch(`${GATEWAY}/api/default-model`, {
      ...withUiHeaders({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: value }),
      }),
    }).catch(() => {
      // The in-memory selection still works when persistence is temporarily unavailable.
    });
  }, []);

  async function send() {
    if (!input.trim() || streaming || !model) return;

    const next: Msg[] = [...messages, { role: 'user', content: input.trim() }];
    const assistantIndex = next.length;
    setMessages([...next, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);
    const controller = new AbortController();
    streamAbortRef.current = controller;

    try {
      const response = await fetch(
        `${GATEWAY}/v1/chat/completions`,
        withUiHeaders({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model, messages: next, stream: true }),
          signal: controller.signal,
        }),
      );
      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => '');
        throw new Error(detail || `gateway error ${response.status}`);
      }

      const reader = response.body.getReader();
      streamReaderRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      let finished = false;

      while (!finished) {
        const chunk = await reader.read();
        finished = chunk.done;
        buffer += decoder.decode(chunk.value, { stream: !chunk.done });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>;
              error?: string | { message?: string };
            };
            if (json.error) {
              const message =
                typeof json.error === 'string'
                  ? json.error
                  : (json.error.message ?? 'upstream error');
              throw new Error(message);
            }
            const delta = json.choices?.[0]?.delta?.content ?? '';
            if (!delta) continue;
            accumulated += delta;
            const content = accumulated;
            setMessages((current) => {
              const copy = [...current];
              copy[assistantIndex] = { role: 'assistant', content };
              return copy;
            });
          } catch (error) {
            if (error instanceof SyntaxError) continue;
            throw error;
          }
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessages((current) => {
        const copy = [...current];
        copy[assistantIndex] = { role: 'assistant', content: `[error] ${detail}` };
        return copy;
      });
    } finally {
      streamReaderRef.current = null;
      if (streamAbortRef.current === controller) streamAbortRef.current = null;
      setStreaming(false);
    }
  }

  const cancelStream = useCallback(() => {
    void streamReaderRef.current?.cancel();
    streamAbortRef.current?.abort();
  }, []);

  const currentPage = PAGE_COPY[tab];

  if (onboardingMode === 'loading') {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground text-xs font-bold text-background">
            FM
          </div>
          <p className="mt-4 text-xs text-muted-foreground">正在连接本地网关…</p>
        </div>
      </main>
    );
  }

  if (onboardingMode === 'required') {
    return (
      <OnboardingWizard
        onReady={(result) => void finishOnboarding(result)}
        onDismiss={dismissOnboarding}
        onOpenSettings={openAdvancedSettings}
      />
    );
  }

  return (
    <main className="h-[100dvh] min-h-0 bg-background text-foreground">
      <div className="mx-auto grid h-full min-h-0 max-w-[1600px] md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 flex-col border-r border-border bg-surface px-4 py-5 md:flex">
          <button
            type="button"
            onClick={() => setTab('finder')}
            className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-left"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-xs font-bold tracking-tight text-background">
              FM
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-[-0.02em]">
                FreeModelFinder
              </span>
              <span className="block text-[11px] text-muted-foreground">Local model gateway</span>
            </span>
          </button>

          <nav className="mt-10 space-y-1" aria-label="主导航">
            {TABS.map((item) => {
              const active = item.key === tab;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={classNames(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                    active
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
                  )}
                >
                  <item.Icon size={16} strokeWidth={active ? 2 : 1.75} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto rounded-2xl border border-border bg-background p-3.5">
            <div className="flex items-center gap-2">
              <span
                className={classNames(
                  'h-2 w-2 rounded-full',
                  gatewayReachable == null
                    ? 'bg-muted-foreground'
                    : gatewayReachable
                      ? 'bg-success'
                      : 'bg-destructive',
                )}
              />
              <span className="text-xs font-medium text-foreground">
                {gatewayReachable == null ? '正在连接' : gatewayReachable ? '网关在线' : '网关离线'}
              </span>
            </div>
            <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground">{GATEWAY}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{models.length} 个免费模型</p>
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-5 md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-foreground text-[10px] font-bold text-background md:hidden">
                FM
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold tracking-[-0.02em]">
                  {currentPage.title}
                </h1>
                <p className="truncate text-[11px] text-muted-foreground">
                  {currentPage.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div
                className={classNames(
                  'hidden items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] sm:flex',
                  gatewayReachable
                    ? 'border-success/20 bg-success/5 text-success'
                    : 'border-border bg-surface text-muted-foreground',
                )}
              >
                {gatewayReachable ? <Wifi size={12} /> : <WifiOff size={12} />}
                {gatewayReachable ? '已连接' : '未连接'}
              </div>
              <button
                type="button"
                aria-label="同步模型"
                title="同步模型"
                onClick={() => void refreshModels(true)}
                disabled={modelLoading}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground transition hover:bg-surface-muted hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw size={15} className={modelLoading ? 'animate-spin' : undefined} />
              </button>
              <ThemeToggle className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/10" />
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-hidden">
            {tab === 'finder' ? (
              <div className="h-full overflow-y-auto">
                <FinderView
                  models={models}
                  selectedModel={model}
                  gatewayReachable={gatewayReachable}
                  loading={modelLoading}
                  failures={failures}
                  onSelectModel={selectModel}
                  onOpenTester={() => setTab('tester')}
                  onOpenSettings={() => setTab('settings')}
                  onStartOnboarding={
                    onboardingMode === 'dismissed' ? () => setOnboardingMode('required') : undefined
                  }
                  onRefresh={() => void refreshModels(true)}
                  onProbeModel={(value) => void probeModel(value)}
                  probingModels={probingModels}
                />
              </div>
            ) : tab === 'tester' ? (
              <TesterView
                messages={messages}
                streaming={streaming}
                input={input}
                model={model}
                models={models}
                setInput={setInput}
                send={send}
                onCancel={cancelStream}
                onModelChange={selectModel}
                onClear={() => setMessages([])}
              />
            ) : (
              <div className="h-full overflow-y-auto">
                <SettingsView
                  models={models}
                  model={model}
                  onModelChange={selectModel}
                  onModelsRefresh={() => refreshModels(false)}
                />
              </div>
            )}
          </div>

          <BottomNav items={TABS} value={tab} onChange={setTab} />
        </section>
      </div>
    </main>
  );
}
