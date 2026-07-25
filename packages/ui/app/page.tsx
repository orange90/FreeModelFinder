'use client';

import { useCallback, useEffect, useState } from 'react';
import { Compass, KeyRound, MessageSquare, Search } from 'lucide-react';
import { ThemeToggle } from './theme';
import { FinderView } from './components/FinderView';
import { QuotaExceededModal } from './components/QuotaExceededModal';
import { SettingsView } from './components/SettingsView';
import { TesterView, type Msg } from './components/TesterView';
import { BottomNav, SegmentedTabs, type SegmentedItem } from './components/SegmentedTabs';
import { GATEWAY, classNames, withUiHeaders } from './lib/utils';
import {
  bumpUsage,
  checkQuotaExceeded,
  findModelQuota,
  getCurrentUsage,
  type QuotaExceededKind,
  type QuotaInfo,
} from './lib/usage';

type ModelItem = { id: string; provider: string; display_name?: string };
type TabKey = 'finder' | 'tester' | 'settings';

const TABS: readonly SegmentedItem<TabKey>[] = [
  { key: 'finder', label: '模型寻找', Icon: Search },
  { key: 'tester', label: '测试模型', Icon: MessageSquare },
  { key: 'settings', label: '模型配置', Icon: KeyRound },
];

export default function Home() {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [model, setModel] = useState<string>('');
  const [tab, setTab] = useState<TabKey>('finder');
  const [tabInitialized, setTabInitialized] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [gatewayReachable, setGatewayReachable] = useState<boolean | null>(null);
  const [quotaModal, setQuotaModal] = useState<
    | {
        kind: QuotaExceededKind;
        quota: QuotaInfo;
        limit: number;
      }
    | null
  >(null);

  useEffect(() => {
    fetch(`${GATEWAY}/v1/models`, withUiHeaders())
      .then((r) => r.json())
      .then((d: { data: ModelItem[] }) => {
        const list = d.data ?? [];
        setModels(list);
        setGatewayReachable(true);
        if (list[0]) setModel(`${list[0].provider}:${list[0].id}`);
        if (!tabInitialized) {
          setTab(list.length > 0 ? 'tester' : 'finder');
          setTabInitialized(true);
        }
      })
      .catch(() => {
        setGatewayReachable(false);
        if (!tabInitialized) {
          setTab('finder');
          setTabInitialized(true);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshModels = useCallback(async () => {
    try {
      const res = await fetch(`${GATEWAY}/v1/models`, withUiHeaders());
      const d: { data: ModelItem[] } = await res.json();
      const list = d.data ?? [];
      setModels(list);
      setGatewayReachable(true);
      setModel((prev) => {
        if (prev && list.some((m) => `${m.provider}:${m.id}` === prev)) return prev;
        return list[0] ? `${list[0].provider}:${list[0].id}` : '';
      });
      return list;
    } catch {
      setGatewayReachable(false);
      return [] as ModelItem[];
    }
  }, []);

  async function send() {
    if (!input.trim() || streaming || !model) return;

    const quota = findModelQuota(model);
    if (quota) {
      const usage = getCurrentUsage(model);
      const exceeded = checkQuotaExceeded(quota, usage);
      if (exceeded) {
        const limit = exceeded === 'day' ? (quota.reqPerDay ?? 0) : (quota.reqPerMin ?? 0);
        setQuotaModal({ kind: exceeded, quota, limit });
        return;
      }
    }

    const next: Msg[] = [...messages, { role: 'user', content: input }];
    setMessages(next);
    setInput('');
    setStreaming(true);

    const assistantIdx = next.length;
    setMessages([...next, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch(
        `${GATEWAY}/v1/chat/completions`,
        withUiHeaders({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model, messages: next, stream: true }),
        }),
      );
      if (!res.ok || !res.body) throw new Error(`gateway error ${res.status}`);
      bumpUsage(model);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n');
        buffer = parts.pop() ?? '';
        for (const raw of parts) {
          const line = raw.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              acc += delta;
              setMessages((prev) => {
                const copy = [...prev];
                copy[assistantIdx] = { role: 'assistant', content: acc };
                return copy;
              });
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => {
        const copy = [...prev];
        copy[assistantIdx] = { role: 'assistant', content: `[error] ${msg}` };
        return copy;
      });
    } finally {
      setStreaming(false);
      if (quota) {
        const latest = getCurrentUsage(model);
        const exceededAfter = checkQuotaExceeded(quota, latest);
        if (exceededAfter) {
          const limit =
            exceededAfter === 'day' ? (quota.reqPerDay ?? 0) : (quota.reqPerMin ?? 0);
          setQuotaModal({ kind: exceededAfter, quota, limit });
        }
      }
    }
  }

  const hasModels = models.length > 0;
  const enabledProviders = Array.from(new Set(models.map((m) => m.provider)));
  const quota = model ? findModelQuota(model) : null;
  const usage = model ? getCurrentUsage(model) : null;

  return (
    <main className="mx-auto flex h-screen w-full max-w-[1440px] flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 relative flex h-14 items-center justify-between gap-3 border-b border-border bg-background px-4 md:px-6">
        <div className="flex items-center gap-3">
          <div
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary"
          >
            <Compass size={17} strokeWidth={1.75} />
          </div>
          <div className="leading-tight">
            <h1 className="font-semibold tracking-tight text-foreground">
              <span className="text-lg text-primary">Free</span>
              <span className="text-sm text-muted-foreground">ModelFinder</span>
            </h1>
            <p className="hidden text-xs text-muted-foreground sm:block">
              免费大模型发现与测试工作台
            </p>
          </div>
        </div>

        <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:block">
          <div className="pointer-events-auto">
            <SegmentedTabs
              items={TABS}
              value={tab}
              onChange={setTab}
              ariaLabel="主导航"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        {tab === 'finder' ? (
          <div className="h-full overflow-y-auto">
            <FinderView
              gatewayReachable={gatewayReachable}
              hasModels={hasModels}
              configuredProviderCount={enabledProviders.length}
            />
          </div>
        ) : tab === 'tester' ? (
          <TesterView
            messages={messages}
            streaming={streaming}
            input={input}
            model={model}
            setInput={setInput}
            send={send}
            hasModels={hasModels}
            quota={quota}
            usage={usage}
          />
        ) : (
          <div className="h-full overflow-y-auto">
            <SettingsView
              models={models}
              model={model}
              onModelChange={setModel}
              onModelsRefresh={refreshModels}
            />
          </div>
        )}
      </div>

      <div className="flex h-7 items-center justify-between border-t border-border bg-surface-muted/40 px-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={classNames(
                'h-1.5 w-1.5 rounded-full',
                gatewayReachable == null
                  ? 'bg-muted-foreground/60'
                  : gatewayReachable
                    ? 'bg-success'
                    : 'bg-destructive',
              )}
            />
            网关
            {gatewayReachable == null
              ? '检测中'
              : gatewayReachable
                ? '已连接'
                : '未连接'}
          </span>
          <span className="hidden text-muted-foreground/60 sm:inline">·</span>
          <span className="hidden sm:inline">
            {enabledProviders.length} 个平台 · {models.length} 个模型
          </span>
        </div>
        <span className="hidden truncate font-mono text-xs sm:inline">{GATEWAY}</span>
      </div>

      <BottomNav items={TABS} value={tab} onChange={setTab} />

      {quotaModal && (
        <QuotaExceededModal
          kind={quotaModal.kind}
          quota={quotaModal.quota}
          limit={quotaModal.limit}
          onConfirm={() => {
            setQuotaModal(null);
            if (typeof window !== 'undefined') {
              window.location.href = '/settings';
            }
          }}
          onClose={() => setQuotaModal(null)}
        />
      )}
    </main>
  );
}
