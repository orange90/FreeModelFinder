'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  Loader2,
  PlugZap,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { Badge, Dot } from './Badge';
import { StatCard } from './StatCard';
import { ModelChangesBanner } from './ModelChangesBanner';
import { classNames, GATEWAY, withUiHeaders } from '../lib/utils';
import { SETTINGS_PROVIDERS } from '../lib/platforms';

type ModelItem = { id: string; provider: string; display_name?: string };

type CustomModelDef = {
  id: string;
  displayName?: string;
  contextWindow?: number;
};

type CustomSourceDef = {
  id: string;
  label?: string;
  baseUrl: string;
  apiKey?: string;
  hasKey?: boolean;
  models: CustomModelDef[];
};

type ConfigRes = {
  port: number;
  defaultModel?: string;
  providers: Record<
    string,
    {
      enabled: boolean;
      hasKey: boolean;
      credentialError?: string;
    }
  >;
  custom?: {
    enabled: boolean;
    hasKey: boolean;
    baseUrl: string;
    models: CustomModelDef[];
    sources?: CustomSourceDef[];
  };
};

type Toast = { kind: 'success' | 'error'; text: string } | null;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type PingState = 'idle' | 'testing' | 'ok' | 'error';
type PingResult = {
  state: PingState;
  message?: string;
  latencyMs?: number;
  reply?: string;
};

type GatewayInfo = {
  hasKey: boolean;
  apiKey: string | null;
  requireAuth: boolean;
  port?: number;
};

export function SettingsView({
  compact = false,
  models = [],
  model = '',
  onModelChange,
  onModelsRefresh,
}: {
  compact?: boolean;
  models?: ModelItem[];
  model?: string;
  onModelChange?: (value: string) => void;
  onModelsRefresh?: () => Promise<ModelItem[]> | ModelItem[] | void;
}) {
  const [cfg, setCfg] = useState<ConfigRes | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [toast, setToast] = useState<Toast>(null);
  const [gatewayError, setGatewayError] = useState<string>('');
  const [modelSectionOpen, setModelSectionOpen] = useState(true);
  const [keysSectionOpen, setKeysSectionOpen] = useState(true);
  const [inspectSectionOpen, setInspectSectionOpen] = useState(false);
  const [ping, setPing] = useState<PingResult>({ state: 'idle' });
  const [gateway, setGateway] = useState<GatewayInfo | null>(null);
  const [gatewaySectionOpen, setGatewaySectionOpen] = useState(true);
  const [gatewayKeyVisible, setGatewayKeyVisible] = useState(false);
  const [gatewayBusy, setGatewayBusy] = useState<'idle' | 'generating' | 'revoking' | 'saving'>(
    'idle',
  );
  const [copied, setCopied] = useState<string | null>(null);

  const [customSectionOpen, setCustomSectionOpen] = useState(true);
  const [customSources, setCustomSources] = useState<CustomSourceDef[]>([]);
  const [customKeyVisible, setCustomKeyVisible] = useState<Record<string, boolean>>({});
  const [customSaveState, setCustomSaveState] = useState<SaveState>('idle');
  const [customNewSourceName, setCustomNewSourceName] = useState('');
  const [customModelDraft, setCustomModelDraft] = useState<
    Record<string, { id: string; name: string; ctx: string }>
  >({});

  type AutoRouteInfo = {
    enabled: boolean;
    strategy: 'capability' | 'speed' | 'rate-limit';
    fallbackChain?: string[];
    cooldowns?: { model: string; provider: string; resetAt: number }[];
    rememberedPreference?: string | null;
    recentNotices?: {
      type: 'switch-away' | 'switch-back';
      from: string;
      to: string;
      reason: string;
      resetAt?: number;
    }[];
  };
  const [autoRoute, setAutoRoute] = useState<AutoRouteInfo | null>(null);
  const [autoRouteBusy, setAutoRouteBusy] = useState(false);
  const [autoRouteOpen, setAutoRouteOpen] = useState(true);

  useEffect(() => {
    const refresh = () =>
      fetch(`${GATEWAY}/api/auto-route`)
        .then((r) => r.json())
        .then((d) => setAutoRoute(d))
        .catch(() => {
          /* ignore when gateway offline */
        });
    void refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  async function saveAutoRoute(patch: Partial<AutoRouteInfo>): Promise<void> {
    setAutoRouteBusy(true);
    try {
      const res = await fetch(`${GATEWAY}/api/auto-route`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`failed ${res.status}`);
      const refreshed = await fetch(`${GATEWAY}/api/auto-route`).then((r) => r.json());
      setAutoRoute(refreshed);
      setToast({ kind: 'success', text: '智能路由配置已更新' });
    } catch (err) {
      setToast({
        kind: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setAutoRouteBusy(false);
    }
  }

  async function clearAllCooldowns(): Promise<void> {
    setAutoRouteBusy(true);
    try {
      await fetch(`${GATEWAY}/api/auto-route/clear-cooldown`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const refreshed = await fetch(`${GATEWAY}/api/auto-route`).then((r) => r.json());
      setAutoRoute(refreshed);
    } finally {
      setAutoRouteBusy(false);
    }
  }

  useEffect(() => {
    fetch(`${GATEWAY}/api/config`)
      .then((r) => r.json())
      .then((c: ConfigRes) => {
        setCfg(c);
        if (c.custom) {
          const list =
            Array.isArray(c.custom.sources) && c.custom.sources.length > 0
              ? c.custom.sources
              : c.custom.baseUrl
                ? [
                    {
                      id: 'default',
                      label: 'Custom',
                      baseUrl: c.custom.baseUrl,
                      hasKey: c.custom.hasKey,
                      models: Array.isArray(c.custom.models) ? c.custom.models : [],
                    },
                  ]
                : [];
          setCustomSources(list.map((s) => ({ ...s, models: s.models ?? [] })));
        }
      })
      .catch(() => setGatewayError('未能连接到本地网关，请先运行 `fmf serve`。'));
    fetch(`${GATEWAY}/api/gateway`)
      .then((r) => r.json())
      .then((g: GatewayInfo) => setGateway(g))
      .catch(() => {
        /* gateway 未在线时忽略 */
      });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    setPing({ state: 'idle' });
  }, [model]);

  async function testConnectivity() {
    if (!model) return;
    setPing({ state: 'testing' });
    const started = Date.now();
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (gateway?.requireAuth && gateway.apiKey) {
        headers['authorization'] = `Bearer ${gateway.apiKey}`;
      }
      const res = await fetch(
        `${GATEWAY}/v1/chat/completions`,
        withUiHeaders({
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'ping' }],
            stream: false,
            max_tokens: 16,
          }),
        }),
      );
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let detail = '';
        let upstream: number | undefined;
        try {
          const j = JSON.parse(text);
          const errObj = j?.error ?? j;
          detail = errObj?.message ?? j?.message ?? '';
          upstream = errObj?.upstream;
          const inner = detail.match(/\{\s*"error"\s*:\s*\{[^}]*"message"\s*:\s*"([^"]+)"/);
          if (inner && inner[1]) detail = inner[1];
        } catch {
          detail = text;
        }
        const hint =
          upstream === 401 || /401|Missing Authentication|Unauthorized/i.test(detail)
            ? '（API Key 可能无效或未生效，请重新粘贴保存后再试）'
            : '';
        setPing({
          state: 'error',
          message: `HTTP ${upstream ?? res.status}${detail ? ` · ${detail.slice(0, 200)}` : ''}${hint}`,
          latencyMs,
        });
        return;
      }
      const json = await res.json().catch(() => null);
      const reply: string =
        json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.delta?.content ?? '';
      setPing({
        state: 'ok',
        latencyMs,
        reply: (reply || '').trim().slice(0, 160),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPing({ state: 'error', message: msg });
    }
  }

  async function save(providerId: string) {
    const apiKey = keys[providerId];
    if (!apiKey) return;
    setSaveStates((s) => ({ ...s, [providerId]: 'saving' }));
    try {
      const res = await fetch(`${GATEWAY}/api/providers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: providerId,
          apiKey,
          enabled: true,
        }),
      });
      if (res.ok) {
        setToast({ kind: 'success', text: `已保存 ${providerId} 的 API Key` });
        setKeys((k) => ({ ...k, [providerId]: '' }));
        setSaveStates((s) => ({ ...s, [providerId]: 'saved' }));
        setTimeout(() => setSaveStates((s) => ({ ...s, [providerId]: 'idle' })), 1600);
        fetch(`${GATEWAY}/api/config`)
          .then((r) => r.json())
          .then(setCfg);
        if (onModelsRefresh) {
          try {
            const refreshed = await onModelsRefresh();
            if (Array.isArray(refreshed)) {
              const hasProvider = refreshed.some((m) => m.provider === providerId);
              if (!hasProvider) {
                setToast({
                  kind: 'error',
                  text: `已保存 ${providerId}，但暂未拉到模型列表（可能网络不通或 Key 无效）`,
                });
              }
            }
          } catch {
            /* ignore refresh errors */
          }
        }
      } else {
        let detail = '';
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) detail = `：${body.error}`;
        } catch {
          try {
            const text = await res.text();
            if (text) detail = `：${text.slice(0, 200)}`;
          } catch {
            /* ignore */
          }
        }
        setToast({ kind: 'error', text: `保存 ${providerId} 失败${detail}` });
        setSaveStates((s) => ({ ...s, [providerId]: 'error' }));
        setTimeout(() => setSaveStates((s) => ({ ...s, [providerId]: 'idle' })), 1800);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast({ kind: 'error', text: `保存 ${providerId} 失败：${msg}` });
      setSaveStates((s) => ({ ...s, [providerId]: 'error' }));
      setTimeout(() => setSaveStates((s) => ({ ...s, [providerId]: 'idle' })), 1800);
    }
  }

  function slugifySourceId(raw: string): string {
    const base = raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return base || 'source';
  }

  function addCustomSource() {
    const name = customNewSourceName.trim();
    if (!name) {
      setToast({ kind: 'error', text: '请填写源名称' });
      return;
    }
    let id = slugifySourceId(name);
    if (customSources.some((s) => s.id === id)) {
      let i = 2;
      while (customSources.some((s) => s.id === `${id}-${i}`)) i++;
      id = `${id}-${i}`;
    }
    setCustomSources((list) => [...list, { id, label: name, baseUrl: '', apiKey: '', models: [] }]);
    setCustomNewSourceName('');
  }

  function removeCustomSource(sourceId: string) {
    setCustomSources((list) => list.filter((s) => s.id !== sourceId));
  }

  function patchCustomSource(sourceId: string, patch: Partial<CustomSourceDef>) {
    setCustomSources((list) => list.map((s) => (s.id === sourceId ? { ...s, ...patch } : s)));
  }

  function addModelToSource(sourceId: string) {
    const draft = customModelDraft[sourceId] ?? { id: '', name: '', ctx: '' };
    const id = draft.id.trim();
    if (!id) return;
    const source = customSources.find((s) => s.id === sourceId);
    if (!source) return;
    if (source.models.some((m) => m.id === id)) {
      setToast({ kind: 'error', text: `${sourceId} 已存在模型 ${id}` });
      return;
    }
    const ctxNum = draft.ctx.trim() ? Number(draft.ctx) : NaN;
    const entry: CustomModelDef = {
      id,
      displayName: draft.name.trim() || undefined,
      contextWindow: Number.isFinite(ctxNum) && ctxNum > 0 ? ctxNum : undefined,
    };
    patchCustomSource(sourceId, { models: [...source.models, entry] });
    setCustomModelDraft((d) => ({ ...d, [sourceId]: { id: '', name: '', ctx: '' } }));
  }

  function removeModelFromSource(sourceId: string, modelId: string) {
    const source = customSources.find((s) => s.id === sourceId);
    if (!source) return;
    patchCustomSource(sourceId, {
      models: source.models.filter((m) => m.id !== modelId),
    });
  }

  async function saveCustomProvider() {
    if (customSources.length === 0) {
      setToast({ kind: 'error', text: '请至少添加一个自定义源' });
      return;
    }
    for (const s of customSources) {
      if (!s.baseUrl.trim()) {
        setToast({ kind: 'error', text: `源「${s.label || s.id}」缺少 Base URL` });
        return;
      }
      if (s.models.length === 0) {
        setToast({
          kind: 'error',
          text: `源「${s.label || s.id}」至少需要一个模型`,
        });
        return;
      }
    }
    setCustomSaveState('saving');
    try {
      const payloadSources = customSources.map((s) => {
        const nextKey =
          typeof s.apiKey === 'string' && s.apiKey.trim() ? s.apiKey.trim() : undefined;
        return {
          id: s.id,
          label: s.label,
          baseUrl: s.baseUrl.trim(),
          // If user did not type a new key but there was one before, keep it by omitting the field.
          ...(nextKey !== undefined ? { apiKey: nextKey } : {}),
          models: s.models,
        };
      });
      const body: Record<string, unknown> = {
        provider: 'custom',
        enabled: true,
        sources: payloadSources,
      };
      const res = await fetch(`${GATEWAY}/api/providers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let detail = '';
        try {
          const j = (await res.json()) as { error?: string };
          if (j?.error) detail = `：${j.error}`;
        } catch {
          /* ignore */
        }
        throw new Error(`HTTP ${res.status}${detail}`);
      }
      setToast({ kind: 'success', text: '自定义模型已保存' });
      setCustomSaveState('saved');
      setTimeout(() => setCustomSaveState('idle'), 1600);
      const refreshed = await fetch(`${GATEWAY}/api/config`).then(
        (r) => r.json() as Promise<ConfigRes>,
      );
      setCfg(refreshed);
      if (refreshed.custom) {
        const list =
          Array.isArray(refreshed.custom.sources) && refreshed.custom.sources.length > 0
            ? refreshed.custom.sources
            : [];
        setCustomSources(list.map((s) => ({ ...s, apiKey: '', models: s.models ?? [] })));
      }
      if (onModelsRefresh) {
        try {
          await onModelsRefresh();
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast({ kind: 'error', text: `保存自定义模型失败：${msg}` });
      setCustomSaveState('error');
      setTimeout(() => setCustomSaveState('idle'), 1800);
    }
  }

  async function clearCustomProvider() {
    setCustomSaveState('saving');
    try {
      const res = await fetch(`${GATEWAY}/api/providers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'custom',
          enabled: false,
          clearCredentials: true,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setToast({ kind: 'success', text: '已清除自定义模型配置' });
      setCustomSources([]);
      setCustomSaveState('idle');
      const refreshed = await fetch(`${GATEWAY}/api/config`).then(
        (r) => r.json() as Promise<ConfigRes>,
      );
      setCfg(refreshed);
      if (onModelsRefresh) {
        try {
          await onModelsRefresh();
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast({ kind: 'error', text: `清除失败：${msg}` });
      setCustomSaveState('idle');
    }
  }

  async function callGateway(body: Record<string, unknown>): Promise<GatewayInfo | null> {
    try {
      const res = await fetch(`${GATEWAY}/api/gateway`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as GatewayInfo;
      setGateway(data);
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast({ kind: 'error', text: `对外接口操作失败：${msg}` });
      return null;
    }
  }

  async function generateGatewayKey() {
    setGatewayBusy('generating');
    const next = await callGateway({ action: 'generate' });
    if (next) {
      setGatewayKeyVisible(true);
      setToast({ kind: 'success', text: '已生成新的对外接口 API Key' });
    }
    setGatewayBusy('idle');
  }

  async function revokeGatewayKey() {
    setGatewayBusy('revoking');
    const next = await callGateway({ action: 'revoke' });
    if (next) {
      setGatewayKeyVisible(false);
      setToast({ kind: 'success', text: '已撤销对外接口 API Key' });
    }
    setGatewayBusy('idle');
  }

  async function toggleRequireAuth(nextValue: boolean) {
    setGatewayBusy('saving');
    await callGateway({ action: 'update', requireAuth: nextValue });
    setGatewayBusy('idle');
  }

  async function copyText(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1400);
    } catch {
      setToast({ kind: 'error', text: '复制失败，请手动选中复制' });
    }
  }

  const gatewayBaseUrl = GATEWAY.replace(/\/$/, '');
  const displayKey = gateway?.apiKey ?? '';
  const curlExampleKey = displayKey || 'YOUR_API_KEY';
  const curlOpenAI = useMemo(
    () =>
      [
        `curl ${gatewayBaseUrl}/v1/chat/completions \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -H "Authorization: Bearer ${curlExampleKey}" \\`,
        `  -d '{`,
        `    "model": "auto",`,
        `    "messages": [{"role": "user", "content": "你好"}],`,
        `    "stream": false`,
        `  }'`,
      ].join('\n'),
    [gatewayBaseUrl, curlExampleKey],
  );
  const curlListModels = useMemo(
    () =>
      [
        `curl ${gatewayBaseUrl}/v1/models \\`,
        `  -H "Authorization: Bearer ${curlExampleKey}"`,
      ].join('\n'),
    [gatewayBaseUrl, curlExampleKey],
  );

  const enabledCount = cfg
    ? Object.values(cfg.providers).filter((p) => p.enabled && p.hasKey).length
    : 0;

  return (
    <div
      className={classNames(
        'mx-auto w-full space-y-5 px-4 py-6 md:px-6',
        compact ? 'max-w-3xl' : 'max-w-3xl',
      )}
    >
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">设置</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          配置各平台的 API Key，Key 只在本机加密存储，不会上传。
        </p>
      </div>

      {gatewayError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
          <Dot tone="danger" />
          <span>{gatewayError}</span>
        </div>
      )}

      <section
        aria-label="状态总览"
        className="grid gap-3 rounded-lg border border-border/60 bg-section-a p-3 sm:grid-cols-3"
      >
        <StatCard
          label="网关状态"
          value={cfg ? `端口 ${cfg.port}` : '未连接'}
          hint={cfg ? '本地网关运行中' : '等待网关…'}
          tone={cfg ? 'ok' : 'muted'}
          icon={<Server size={14} strokeWidth={1.75} />}
        />
        <StatCard
          label="已配置平台"
          value={`${enabledCount} / ${SETTINGS_PROVIDERS.length}`}
          hint={enabledCount > 0 ? '至少启用了一个' : '尚未配置任何 Key'}
          tone={enabledCount > 0 ? 'ok' : 'warn'}
          icon={<ShieldCheck size={14} strokeWidth={1.75} />}
        />
        <StatCard
          label="默认模型"
          value={cfg?.defaultModel ?? '未设置'}
          hint={cfg?.defaultModel ? '来自最近一次保存' : '保存 Key 后自动生成'}
          tone={cfg?.defaultModel ? 'ok' : 'muted'}
        />
      </section>

      <section
        aria-label="当前模型"
        className="space-y-3 rounded-lg border border-border/60 bg-section-b p-3"
      >
        <button
          type="button"
          onClick={() => setModelSectionOpen((v) => !v)}
          aria-expanded={modelSectionOpen}
          className="flex w-full items-center justify-between rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">当前模型</h2>
            <span className="text-xs text-muted-foreground">
              {models.length > 0 ? `${models.length} 个可选` : '暂无可用模型'}
            </span>
          </div>
          <ChevronDown
            size={14}
            strokeWidth={1.75}
            className={classNames(
              'text-muted-foreground transition-transform',
              modelSectionOpen ? 'rotate-0' : '-rotate-90',
            )}
          />
        </button>
        {modelSectionOpen && (
          <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <label className="sr-only" htmlFor="settings-current-model">
              当前模型
            </label>
            <select
              id="settings-current-model"
              aria-label="当前模型"
              className="w-full truncate rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-muted-foreground"
              value={model}
              onChange={(e) => onModelChange?.(e.target.value)}
              disabled={models.length === 0}
            >
              {models.length === 0 && <option value="">暂无模型 — 请先在下方配置 API Key</option>}
              {models.map((m) => (
                <option key={`${m.provider}:${m.id}`} value={`${m.provider}:${m.id}`}>
                  [{m.provider}] {m.display_name ?? m.id}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-muted-foreground">
              选择后将用于"测试模型"页面的对话请求。
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void testConnectivity()}
                disabled={!model || ping.state === 'testing'}
                className={classNames(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  ping.state === 'error'
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : ping.state === 'ok'
                      ? 'bg-success text-primary-foreground'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground',
                )}
              >
                {ping.state === 'testing' ? (
                  <Loader2 size={13} strokeWidth={2} className="animate-spin" />
                ) : ping.state === 'ok' ? (
                  <Check size={13} strokeWidth={2} />
                ) : ping.state === 'error' ? (
                  <X size={13} strokeWidth={2} />
                ) : (
                  <PlugZap size={13} strokeWidth={1.75} />
                )}
                {ping.state === 'testing'
                  ? '测试中…'
                  : ping.state === 'ok'
                    ? '连接正常'
                    : ping.state === 'error'
                      ? '重新测试'
                      : '测试连通性'}
              </button>
              {ping.state === 'ok' && (
                <span className="inline-flex items-center gap-1 text-xs text-success">
                  <Dot tone="success" />
                  {ping.latencyMs != null && <span>{ping.latencyMs} ms</span>}
                  {ping.reply && (
                    <span className="text-muted-foreground">
                      · 回复：<span className="text-foreground">{ping.reply}</span>
                    </span>
                  )}
                </span>
              )}
              {ping.state === 'error' && (
                <span className="inline-flex items-center gap-1 text-xs text-destructive">
                  <Dot tone="danger" />
                  {ping.message ?? '请求失败'}
                </span>
              )}
              {ping.state === 'idle' && !model && (
                <span className="text-xs text-muted-foreground">请先选择一个模型</span>
              )}
            </div>
          </div>
        )}
      </section>

      <section
        aria-label="智能路由"
        className="space-y-3 rounded-lg border border-border/60 bg-section-c p-3"
      >
        <button
          type="button"
          onClick={() => setAutoRouteOpen((v) => !v)}
          aria-expanded={autoRouteOpen}
          className="flex w-full items-center justify-between rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">智能路由</h2>
            <span className="text-xs text-muted-foreground">
              请求限制自动切换 · 解除后自动切换回
            </span>
          </div>
          <ChevronDown
            size={14}
            strokeWidth={1.75}
            className={classNames(
              'text-muted-foreground transition-transform',
              autoRouteOpen ? 'rotate-0' : '-rotate-90',
            )}
          />
        </button>
        {autoRouteOpen && (
          <div className="space-y-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-sm font-medium text-foreground">启用自动路由</div>
                <p className="text-xs text-muted-foreground">
                  达到 RPM/配额时自动切换到备用模型；限制解除后再切换回来。
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-input"
                  checked={!!autoRoute?.enabled}
                  disabled={autoRouteBusy}
                  onChange={(e) => void saveAutoRoute({ enabled: e.target.checked })}
                />
                {autoRoute?.enabled ? '已启用' : '未启用'}
              </label>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">切换策略</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(
                  [
                    {
                      id: 'capability',
                      label: '规格优先',
                      desc: '按模型规模与上下文估算',
                    },
                    { id: 'speed', label: '速度优先', desc: '优先低延迟 Provider' },
                    { id: 'rate-limit', label: '请求限制优先', desc: '优先高 RPM 配额' },
                  ] as const
                ).map((opt) => {
                  const active = autoRoute?.strategy === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={autoRouteBusy}
                      onClick={() => void saveAutoRoute({ strategy: opt.id })}
                      className={classNames(
                        'flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left text-xs transition',
                        active
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-surface-muted/40 text-muted-foreground hover:border-input hover:text-foreground',
                      )}
                    >
                      <span className="text-sm font-medium">{opt.label}</span>
                      <span>{opt.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {autoRoute?.cooldowns && autoRoute.cooldowns.length > 0 && (
              <div className="space-y-2 rounded-md border border-warning/40 bg-warning/5 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-warning">正在冷却中的模型</span>
                  <button
                    type="button"
                    onClick={() => void clearAllCooldowns()}
                    disabled={autoRouteBusy}
                    className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    清除全部
                  </button>
                </div>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {autoRoute.cooldowns.map((c) => (
                    <li key={c.model} className="flex items-center justify-between gap-2">
                      <code className="truncate font-mono text-foreground">{c.model}</code>
                      <span>
                        重置：
                        {new Date(c.resetAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
                {autoRoute.rememberedPreference && (
                  <p className="text-xs text-muted-foreground">
                    原偏好模型：<code className="font-mono">{autoRoute.rememberedPreference}</code>
                    （限制解除后将自动切回）
                  </p>
                )}
              </div>
            )}

            {autoRoute?.recentNotices && autoRoute.recentNotices.length > 0 && (
              <div className="space-y-2 rounded-md border border-border bg-surface-muted/40 p-3">
                <div className="text-xs font-medium text-muted-foreground">最近路由动作</div>
                <ul className="space-y-1 text-xs">
                  {autoRoute.recentNotices.slice(-6).map((n, i) => (
                    <li
                      key={i}
                      className={classNames(
                        'whitespace-pre-line rounded px-2 py-1',
                        n.type === 'switch-back'
                          ? 'bg-success/10 text-success'
                          : 'bg-warning/10 text-warning',
                      )}
                    >
                      {n.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <section
        aria-label="对外接口"
        className="space-y-3 rounded-lg border border-border/60 bg-section-a p-3"
      >
        <button
          type="button"
          onClick={() => setGatewaySectionOpen((v) => !v)}
          aria-expanded={gatewaySectionOpen}
          className="flex w-full items-center justify-between rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">对外接口</h2>
            <span className="text-xs text-muted-foreground">
              让其他工具通过 OpenAI 兼容协议调用本地网关
            </span>
          </div>
          <ChevronDown
            size={14}
            strokeWidth={1.75}
            className={classNames(
              'text-muted-foreground transition-transform',
              gatewaySectionOpen ? 'rotate-0' : '-rotate-90',
            )}
          />
        </button>
        {gatewaySectionOpen && (
          <div className="space-y-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Globe2 size={12} strokeWidth={1.75} /> Base URL
                </div>
                <div className="flex items-center gap-2 rounded-md border border-input bg-surface-muted/40 px-3 py-2">
                  <code className="flex-1 truncate font-mono text-sm text-foreground">
                    {gatewayBaseUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyText(gatewayBaseUrl, 'baseUrl')}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="复制 Base URL"
                  >
                    {copied === 'baseUrl' ? (
                      <Check size={13} strokeWidth={2} className="text-success" />
                    ) : (
                      <Copy size={13} strokeWidth={1.75} />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  兼容 OpenAI 的接口路径为 <code className="font-mono">/v1/*</code>。
                </p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Server size={12} strokeWidth={1.75} /> Model
                </div>
                <div className="flex items-center gap-2 rounded-md border border-input bg-surface-muted/40 px-3 py-2">
                  <code className="flex-1 truncate font-mono text-sm text-foreground">auto</code>
                  <button
                    type="button"
                    onClick={() => void copyText('auto', 'model')}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="复制 model"
                  >
                    {copied === 'model' ? (
                      <Check size={13} strokeWidth={2} className="text-success" />
                    ) : (
                      <Copy size={13} strokeWidth={1.75} />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  推荐使用 <code className="font-mono">auto</code>
                  ，网关会自动选择当前的默认模型；也可传入具体的
                  <code className="font-mono"> provider:model</code>。
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <KeyRound size={12} strokeWidth={1.75} /> API Key
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-input"
                    checked={!!gateway?.requireAuth}
                    disabled={!gateway?.hasKey || gatewayBusy !== 'idle'}
                    onChange={(e) => void toggleRequireAuth(e.target.checked)}
                  />
                  强制鉴权
                </label>
              </div>
              {gateway?.hasKey && displayKey ? (
                <div className="flex items-center gap-2 rounded-md border border-input bg-surface-muted/40 px-3 py-2">
                  <code className="flex-1 truncate font-mono text-sm text-foreground">
                    {gatewayKeyVisible ? displayKey : '•'.repeat(Math.min(displayKey.length, 36))}
                  </code>
                  <button
                    type="button"
                    onClick={() => setGatewayKeyVisible((v) => !v)}
                    aria-label={gatewayKeyVisible ? '隐藏 Key' : '显示 Key'}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {gatewayKeyVisible ? (
                      <EyeOff size={13} strokeWidth={1.75} />
                    ) : (
                      <Eye size={13} strokeWidth={1.75} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyText(displayKey, 'apiKey')}
                    aria-label="复制 API Key"
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {copied === 'apiKey' ? (
                      <Check size={13} strokeWidth={2} className="text-success" />
                    ) : (
                      <Copy size={13} strokeWidth={1.75} />
                    )}
                  </button>
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border bg-surface-muted/30 px-3 py-3 text-xs text-muted-foreground">
                  尚未生成对外 API Key。生成后，其他应用需要在请求头中携带
                  <code className="mx-1 font-mono">Authorization: Bearer &lt;key&gt;</code>
                  才能访问网关（开启"强制鉴权"后生效）。
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void generateGatewayKey()}
                  disabled={gatewayBusy !== 'idle'}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {gatewayBusy === 'generating' ? (
                    <Loader2 size={13} strokeWidth={2} className="animate-spin" />
                  ) : (
                    <RefreshCw size={13} strokeWidth={1.75} />
                  )}
                  {gateway?.hasKey ? '重新生成 Key' : '生成 API Key'}
                </button>
                {gateway?.hasKey && (
                  <button
                    type="button"
                    onClick={() => void revokeGatewayKey()}
                    disabled={gatewayBusy !== 'idle'}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {gatewayBusy === 'revoking' ? (
                      <Loader2 size={13} strokeWidth={2} className="animate-spin" />
                    ) : (
                      <Trash2 size={13} strokeWidth={1.75} />
                    )}
                    撤销
                  </button>
                )}
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <ShieldCheck size={12} strokeWidth={1.75} />
                  Key 仅保存在本机加密存储
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Terminal size={12} strokeWidth={1.75} /> curl 示例
              </div>
              <div className="relative">
                <pre className="max-h-60 overflow-auto rounded-md border border-border bg-surface-muted/40 p-3 pr-10 font-mono text-[12px] leading-relaxed text-foreground">
                  {curlOpenAI}
                </pre>
                <button
                  type="button"
                  onClick={() => void copyText(curlOpenAI, 'curlChat')}
                  aria-label="复制 curl 示例"
                  className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {copied === 'curlChat' ? (
                    <Check size={13} strokeWidth={2} className="text-success" />
                  ) : (
                    <Copy size={13} strokeWidth={1.75} />
                  )}
                </button>
              </div>
              <div className="relative">
                <pre className="max-h-40 overflow-auto rounded-md border border-border bg-surface-muted/40 p-3 pr-10 font-mono text-[12px] leading-relaxed text-foreground">
                  {curlListModels}
                </pre>
                <button
                  type="button"
                  onClick={() => void copyText(curlListModels, 'curlModels')}
                  aria-label="复制 curl 示例"
                  className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {copied === 'curlModels' ? (
                    <Check size={13} strokeWidth={2} className="text-success" />
                  ) : (
                    <Copy size={13} strokeWidth={1.75} />
                  )}
                </button>
              </div>
              {!displayKey && (
                <p className="text-xs text-muted-foreground">
                  示例中的 <code className="font-mono">YOUR_API_KEY</code> 将在生成 Key
                  后自动替换为实际值。
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      <section
        aria-label="来源设置"
        className="space-y-3 rounded-lg border border-border/60 bg-section-b p-3"
      >
        <button
          type="button"
          onClick={() => setKeysSectionOpen((v) => !v)}
          aria-expanded={keysSectionOpen}
          className="flex w-full items-center justify-between rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">来源设置</h2>
            <span className="text-xs text-muted-foreground">
              {enabledCount} / {SETTINGS_PROVIDERS.length} 已配置
            </span>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
              <ShieldCheck size={12} strokeWidth={1.75} />
              仅保存在本机加密存储
            </p>
            <ChevronDown
              size={14}
              strokeWidth={1.75}
              className={classNames(
                'text-muted-foreground transition-transform',
                keysSectionOpen ? 'rotate-0' : '-rotate-90',
              )}
            />
          </div>
        </button>
        {keysSectionOpen &&
          (() => {
            const addedProviders = SETTINGS_PROVIDERS.filter((p) => {
              const s = cfg?.providers[p.id];
              return !!(s?.enabled && s.hasKey);
            });
            const unaddedProviders = SETTINGS_PROVIDERS.filter((p) => {
              const s = cfg?.providers[p.id];
              return !(s?.enabled && s.hasKey);
            });

            const renderCard = (p: (typeof SETTINGS_PROVIDERS)[number]) => {
              const state = cfg?.providers[p.id];
              const enabled = !!(state?.enabled && state.hasKey);
              const isVisible = visible[p.id];
              const saveState = saveStates[p.id] ?? 'idle';
              return (
                <div
                  key={p.id}
                  className="rounded-lg border border-border bg-surface p-4 shadow-sm transition hover:border-border-strong"
                >
                  <div className="grid gap-4 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] md:items-center">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{p.label}</span>
                        {enabled ? (
                          <Badge tone="success">
                            <Dot tone="success" />
                            已配置
                          </Badge>
                        ) : (
                          <Badge tone="neutral">
                            <Dot tone="neutral" />
                            未配置
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        <a
                          className="inline-flex items-center gap-1 font-medium text-blue-500 underline underline-offset-2 transition hover:text-blue-400"
                          href={p.link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          获取 API Key
                          <ExternalLink size={11} strokeWidth={2} />
                        </a>
                        <a
                          className="inline-flex items-center gap-1 font-medium text-blue-500 underline underline-offset-2 transition hover:text-blue-400"
                          href={p.guide}
                          target="_blank"
                          rel="noreferrer"
                        >
                          获取方法
                          <ExternalLink size={11} strokeWidth={2} />
                        </a>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{p.hint}</p>
                      {state?.credentialError && (
                        <p className="mt-1 text-xs text-destructive">
                          本地凭据无法解密，请重新保存这个 Key。
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <div className="relative flex-1">
                        <input
                          type={isVisible ? 'text' : 'password'}
                          className="w-full rounded-md border border-input bg-surface px-3 py-2 pr-9 font-mono text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                          placeholder={state?.hasKey ? '••••••••••（覆盖以更新）' : '粘贴 API Key'}
                          value={keys[p.id] ?? ''}
                          onChange={(e) => setKeys((k) => ({ ...k, [p.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && keys[p.id]) {
                              e.preventDefault();
                              void save(p.id);
                            }
                          }}
                          aria-label={`${p.label} API Key`}
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <button
                          type="button"
                          onClick={() => setVisible((v) => ({ ...v, [p.id]: !v[p.id] }))}
                          aria-label={isVisible ? '隐藏 Key' : '显示 Key'}
                          className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {isVisible ? (
                            <EyeOff size={13} strokeWidth={1.75} />
                          ) : (
                            <Eye size={13} strokeWidth={1.75} />
                          )}
                        </button>
                      </div>
                      <button
                        type="button"
                        className={classNames(
                          'inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          saveState === 'error'
                            ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                            : saveState === 'saved'
                              ? 'bg-success text-primary-foreground'
                              : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground',
                        )}
                        onClick={() => void save(p.id)}
                        disabled={!keys[p.id] || saveState === 'saving'}
                      >
                        {saveState === 'saving' && (
                          <Loader2 size={13} strokeWidth={2} className="animate-spin" />
                        )}
                        {saveState === 'saved' && <Check size={13} strokeWidth={2} />}
                        {saveState === 'error' && <X size={13} strokeWidth={2} />}
                        {saveState === 'saving'
                          ? '保存中…'
                          : saveState === 'saved'
                            ? '已保存'
                            : saveState === 'error'
                              ? '重试'
                              : '保存'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            };

            return (
              <div className="space-y-5">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 px-1">
                    <h3 className="text-xs font-semibold tracking-tight text-foreground">已添加</h3>
                    <span className="text-xs text-muted-foreground">
                      {addedProviders.length} 个
                    </span>
                  </div>
                  {addedProviders.length > 0 ? (
                    <div className="space-y-2.5">{addedProviders.map(renderCard)}</div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border bg-surface-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
                      暂无已添加的来源，保存下方任一 API Key 即可启用
                    </div>
                  )}
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 px-1">
                    <h3 className="text-xs font-semibold tracking-tight text-foreground">未添加</h3>
                    <span className="text-xs text-muted-foreground">
                      {unaddedProviders.length} 个
                    </span>
                  </div>
                  {unaddedProviders.length > 0 ? (
                    <div className="space-y-2.5">{unaddedProviders.map(renderCard)}</div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border bg-surface-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
                      所有来源都已添加 🎉
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
      </section>

      <section
        aria-label="自定义模型"
        className="space-y-3 rounded-lg border border-border/60 bg-section-a p-3"
      >
        <button
          type="button"
          onClick={() => setCustomSectionOpen((v) => !v)}
          aria-expanded={customSectionOpen}
          className="flex w-full items-center justify-between rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center gap-2">
            <Sparkles size={14} strokeWidth={1.75} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight text-foreground">自定义模型</h2>
            <span className="text-xs text-muted-foreground">
              {customSources.length > 0
                ? `${customSources.length} 个源 · ${customSources.reduce(
                    (n, s) => n + s.models.length,
                    0,
                  )} 个模型`
                : '通过 OpenAI 兼容协议接入你自己的模型（支持多源）'}
            </span>
          </div>
          <ChevronDown
            size={14}
            strokeWidth={1.75}
            className={classNames(
              'text-muted-foreground transition-transform',
              customSectionOpen ? 'rotate-0' : '-rotate-90',
            )}
          />
        </button>
        {customSectionOpen && (
          <div className="space-y-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
            {customSources.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-surface-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
                尚未添加自定义源。可以为每个 Base URL 单独配置 API Key 和模型列表。
              </div>
            ) : (
              <ul className="space-y-3">
                {customSources.map((src) => {
                  const draft = customModelDraft[src.id] ?? { id: '', name: '', ctx: '' };
                  const isKeyVisible = !!customKeyVisible[src.id];
                  const modelIdInputId = `custom-model-id-${src.id}`;
                  return (
                    <li
                      key={src.id}
                      className="space-y-3 rounded-lg border border-border bg-surface-muted/30 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <input
                            type="text"
                            className="min-w-0 rounded-md border border-input bg-surface px-2 py-1 text-sm font-medium text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                            placeholder="源名称"
                            value={src.label ?? ''}
                            onChange={(e) => patchCustomSource(src.id, { label: e.target.value })}
                            aria-label={`源 ${src.id} 名称`}
                          />
                          <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                            custom:{src.id}
                          </code>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeCustomSource(src.id)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`删除源 ${src.id}`}
                        >
                          <Trash2 size={12} strokeWidth={1.75} />
                          删除源
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <Globe2 size={12} strokeWidth={1.75} /> Base URL
                          </div>
                          <input
                            type="text"
                            className="w-full rounded-md border border-input bg-surface px-3 py-2 font-mono text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                            placeholder="https://api.example.com/v1"
                            value={src.baseUrl}
                            onChange={(e) => patchCustomSource(src.id, { baseUrl: e.target.value })}
                            autoComplete="off"
                            spellCheck={false}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <KeyRound size={12} strokeWidth={1.75} /> API Key
                          </div>
                          <div className="relative">
                            <input
                              type={isKeyVisible ? 'text' : 'password'}
                              className="w-full rounded-md border border-input bg-surface px-3 py-2 pr-9 font-mono text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                              placeholder={
                                src.hasKey
                                  ? '••••••••••（留空则保持不变）'
                                  : '粘贴 API Key（本地无鉴权可留空）'
                              }
                              value={src.apiKey ?? ''}
                              onChange={(e) =>
                                patchCustomSource(src.id, { apiKey: e.target.value })
                              }
                              autoComplete="off"
                              spellCheck={false}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setCustomKeyVisible((v) => ({ ...v, [src.id]: !v[src.id] }))
                              }
                              aria-label={isKeyVisible ? '隐藏 Key' : '显示 Key'}
                              className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {isKeyVisible ? (
                                <EyeOff size={13} strokeWidth={1.75} />
                              ) : (
                                <Eye size={13} strokeWidth={1.75} />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground">模型列表</div>
                        {src.models.length > 0 ? (
                          <ul className="space-y-1.5">
                            {src.models.map((m) => (
                              <li
                                key={m.id}
                                className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <code className="truncate font-mono text-sm text-foreground">
                                      {m.id}
                                    </code>
                                    {m.displayName && (
                                      <span className="text-xs text-muted-foreground">
                                        · {m.displayName}
                                      </span>
                                    )}
                                    {m.contextWindow && (
                                      <Badge tone="neutral">
                                        {m.contextWindow.toLocaleString()} ctx
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeModelFromSource(src.id, m.id)}
                                  aria-label={`删除 ${m.id}`}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  <Trash2 size={13} strokeWidth={1.75} />
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="rounded-md border border-dashed border-border bg-surface/60 px-3 py-3 text-center text-xs text-muted-foreground">
                            尚未添加模型，请在下方输入模型 ID 后点击「添加」
                          </div>
                        )}

                        <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_auto]">
                          <input
                            id={modelIdInputId}
                            type="text"
                            className="rounded-md border border-input bg-surface px-3 py-2 font-mono text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                            placeholder="模型 ID，例如 gpt-4o-mini"
                            value={draft.id}
                            onChange={(e) =>
                              setCustomModelDraft((d) => ({
                                ...d,
                                [src.id]: { ...draft, id: e.target.value },
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addModelToSource(src.id);
                              }
                            }}
                            autoComplete="off"
                            spellCheck={false}
                          />
                          <input
                            type="text"
                            className="rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                            placeholder="显示名称（可选）"
                            value={draft.name}
                            onChange={(e) =>
                              setCustomModelDraft((d) => ({
                                ...d,
                                [src.id]: { ...draft, name: e.target.value },
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addModelToSource(src.id);
                              }
                            }}
                            autoComplete="off"
                          />
                          <input
                            type="number"
                            min={1}
                            className="rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                            placeholder="上下文 (tokens)"
                            value={draft.ctx}
                            onChange={(e) =>
                              setCustomModelDraft((d) => ({
                                ...d,
                                [src.id]: { ...draft, ctx: e.target.value },
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addModelToSource(src.id);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => addModelToSource(src.id)}
                            disabled={!draft.id.trim()}
                            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Plus size={13} strokeWidth={2} />
                            添加
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border bg-surface-muted/30 p-3">
              <input
                type="text"
                className="min-w-0 flex-1 rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="新源名称（例如 “本地 Ollama”、“公司内网”）"
                value={customNewSourceName}
                onChange={(e) => setCustomNewSourceName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomSource();
                  }
                }}
              />
              <button
                type="button"
                onClick={addCustomSource}
                disabled={!customNewSourceName.trim()}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus size={13} strokeWidth={2} />
                添加源
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => void saveCustomProvider()}
                disabled={customSaveState === 'saving' || customSources.length === 0}
                className={classNames(
                  'inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  customSaveState === 'error'
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : customSaveState === 'saved'
                      ? 'bg-success text-primary-foreground'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground',
                )}
              >
                {customSaveState === 'saving' && (
                  <Loader2 size={13} strokeWidth={2} className="animate-spin" />
                )}
                {customSaveState === 'saved' && <Check size={13} strokeWidth={2} />}
                {customSaveState === 'error' && <X size={13} strokeWidth={2} />}
                {customSaveState === 'saving'
                  ? '保存中…'
                  : customSaveState === 'saved'
                    ? '已保存'
                    : customSaveState === 'error'
                      ? '重试'
                      : '保存自定义模型'}
              </button>
              {cfg?.custom?.enabled && (
                <button
                  type="button"
                  onClick={() => void clearCustomProvider()}
                  disabled={customSaveState === 'saving'}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 size={13} strokeWidth={1.75} />
                  清除全部
                </button>
              )}
              {cfg?.custom?.enabled && customSources.length > 0 && (
                <Badge tone="success">
                  <Dot tone="success" />
                  已启用
                </Badge>
              )}
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                <ShieldCheck size={12} strokeWidth={1.75} />
                Key 仅在本机加密存储
              </span>
            </div>
          </div>
        )}
      </section>

      <section
        aria-label="模型巡检"
        className="space-y-3 rounded-lg border border-border/60 bg-section-c p-3"
      >
        <button
          type="button"
          onClick={() => setInspectSectionOpen((v) => !v)}
          aria-expanded={inspectSectionOpen}
          className="flex w-full items-center justify-between rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">模型巡检</h2>
            <span className="text-xs text-muted-foreground">自动发现新增或下架的免费模型</span>
          </div>
          <ChevronDown
            size={14}
            strokeWidth={1.75}
            className={classNames(
              'text-muted-foreground transition-transform',
              inspectSectionOpen ? 'rotate-0' : '-rotate-90',
            )}
          />
        </button>
        {inspectSectionOpen && <ModelChangesBanner />}
      </section>

      <p className="text-xs text-muted-foreground">
        网关地址：<code className="font-mono">{GATEWAY}</code>
      </p>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-10 left-1/2 z-50 -translate-x-1/2 toast-in"
        >
          <div
            className={classNames(
              'pointer-events-auto flex items-center gap-2 rounded-lg border px-4 py-2 text-sm shadow-lg',
              toast.kind === 'success'
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-destructive/30 bg-destructive/10 text-destructive',
            )}
          >
            {toast.kind === 'success' ? (
              <Check size={14} strokeWidth={2} />
            ) : (
              <X size={14} strokeWidth={2} />
            )}
            {toast.text}
          </div>
        </div>
      )}
    </div>
  );
}
