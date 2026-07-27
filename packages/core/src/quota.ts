import type {
  ChatResponse,
  ModelQuotaSnapshot,
  ProviderId,
  QuotaResource,
  QuotaScope,
  QuotaWindow,
} from './types.js';

type ResponseEvent = {
  provider: ProviderId;
  model: string;
  status: number;
  headers: Headers;
};

type UsageEvent = {
  provider: ProviderId;
  model: string;
  usage?: ChatResponse['usage'];
};

type Policy = {
  resource: QuotaResource;
  windowSeconds: number;
  limit: number;
  scope: QuotaScope;
  model?: RegExp;
};

const PROVIDER_POLICIES: Partial<Record<ProviderId, Policy[]>> = {
  cohere: [
    { resource: 'requests', windowSeconds: 60, limit: 20, scope: 'model' },
    { resource: 'requests', windowSeconds: 2_592_000, limit: 1_000, scope: 'provider' },
  ],
  modelscope: [
    { resource: 'requests', windowSeconds: 86_400, limit: 2_000, scope: 'provider' },
    { resource: 'requests', windowSeconds: 86_400, limit: 200, scope: 'model' },
  ],
  sensenova: [
    {
      resource: 'requests',
      windowSeconds: 18_000,
      limit: 1_500,
      scope: 'model',
      model: /sensenova-6\.7-flash-lite/i,
    },
    {
      resource: 'requests',
      windowSeconds: 18_000,
      limit: 500,
      scope: 'model',
      model: /deepseek-v4-flash/i,
    },
  ],
};

type State = {
  provider: ProviderId;
  model: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  lastRequestAt?: number;
  headerWindows: QuotaWindow[];
  availability: ModelQuotaSnapshot['availability'];
  lastTestAt?: number;
  latencyMs?: number;
  error?: string;
};

type RequestEvent = { provider: ProviderId; model: string; at: number };
type TokenEvent = { provider: ProviderId; model: string; at: number; tokens: number };

function key(provider: ProviderId, model: string): string {
  return `${provider}:${model}`.toLowerCase();
}

function finite(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseResetAt(
  value: string | null | undefined,
  now = Date.now(),
): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const duration = trimmed.match(
    /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/i,
  );
  if (duration && duration[0]) {
    const seconds =
      Number(duration[1] ?? 0) * 3600 + Number(duration[2] ?? 0) * 60 + Number(duration[3] ?? 0);
    if (seconds > 0) return now + seconds * 1000;
  }
  const numeric = /^-?\d+(?:\.\d+)?$/.test(trimmed) ? Number(trimmed) : undefined;
  if (numeric !== undefined) {
    if (numeric > 1e12) return numeric;
    const nowSeconds = now / 1000;
    if (numeric > nowSeconds - 86_400) return numeric * 1000;
    if (numeric >= 0) return now + numeric * 1000;
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function windowFromSeconds(seconds?: number): number | undefined {
  if (!seconds || seconds <= 0) return undefined;
  return seconds;
}

function suffixWindow(value: string | undefined): number | undefined {
  switch (value) {
    case 'second':
      return 1;
    case 'minute':
      return 60;
    case 'hour':
      return 3_600;
    case 'day':
      return 86_400;
    case 'month':
      return 2_592_000;
    default:
      return undefined;
  }
}

/** Parse the common x-ratelimit-* and RFC RateLimit response-header families. */
export function parseQuotaHeaders(headers: Headers, now = Date.now()): QuotaWindow[] {
  const values = new Map<
    string,
    {
      resource: QuotaResource;
      windowSeconds?: number;
      limit?: number;
      remaining?: number;
      resetAt?: number;
    }
  >();
  const ensure = (resource: QuotaResource, windowSeconds?: number) => {
    const k = `${resource}:${windowSeconds ?? 'unknown'}`;
    const current = values.get(k) ?? { resource, windowSeconds };
    values.set(k, current);
    return current;
  };

  for (const [rawName, rawValue] of headers.entries()) {
    const name = rawName.toLowerCase();
    const match = name.match(
      /^x-ratelimit-(limit|remaining|reset)-(requests|tokens)(?:-(second|minute|hour|day|month))?$/,
    );
    if (!match) continue;
    const field = match[1]!;
    const resource = match[2] as QuotaResource;
    const item = ensure(resource, suffixWindow(match[3]));
    if (field === 'limit') item.limit = finite(rawValue);
    if (field === 'remaining') item.remaining = finite(rawValue);
    if (field === 'reset') item.resetAt = parseResetAt(rawValue, now);
  }

  const genericLimit = headers.get('x-ratelimit-limit');
  const genericRemaining = headers.get('x-ratelimit-remaining');
  const genericReset = headers.get('x-ratelimit-reset');
  if (genericLimit || genericRemaining || genericReset) {
    const item = ensure('requests');
    item.limit = finite(genericLimit);
    item.remaining = finite(genericRemaining);
    item.resetAt = parseResetAt(genericReset, now);
  }

  const standardLimit = headers.get('ratelimit-limit');
  const standardRemaining = headers.get('ratelimit-remaining');
  const standardReset = headers.get('ratelimit-reset');
  if (standardLimit || standardRemaining || standardReset) {
    const windowMatch = standardLimit?.match(/(?:^|;)\s*w\s*=\s*(\d+)/i);
    const item = ensure(
      'requests',
      windowFromSeconds(windowMatch ? Number(windowMatch[1]) : undefined),
    );
    item.limit = finite(standardLimit);
    item.remaining = finite(standardRemaining);
    item.resetAt = parseResetAt(standardReset, now);
  }

  const retryAfter = headers.get('retry-after');
  if (retryAfter && values.size === 0) {
    ensure('requests').resetAt = parseResetAt(retryAfter, now);
  }

  return [...values.values()]
    .filter(
      (item) =>
        item.limit !== undefined || item.remaining !== undefined || item.resetAt !== undefined,
    )
    .map((item) => ({
      ...item,
      used:
        item.limit !== undefined && item.remaining !== undefined
          ? Math.max(0, item.limit - item.remaining)
          : undefined,
      scope: 'provider' as const,
      source: 'upstream' as const,
    }));
}

function nextBoundary(now: number, seconds: number): number {
  const windowMs = seconds * 1000;
  return Math.floor(now / windowMs) * windowMs + windowMs;
}

function responseWindowScope(provider: ProviderId, window: QuotaWindow): QuotaScope {
  // These providers publish account/org-wide windows. OpenRouter Retry-After
  // without a numeric account limit can describe one temporarily constrained
  // upstream model, so keep that reset model-scoped.
  if (provider === 'openrouter') {
    return window.limit !== undefined || window.remaining !== undefined ? 'provider' : 'model';
  }
  // Gemini, NVIDIA, SenseNova and similar services commonly vary
  // the limit by model. Shared account pools for those providers are supplied
  // separately through provider policies/control-plane quota discovery.
  return 'model';
}

export class QuotaTracker {
  readonly startedAt = Date.now();
  private states = new Map<string, State>();
  private requestEvents: RequestEvent[] = [];
  private tokenEvents: TokenEvent[] = [];
  private providerHeaderWindows = new Map<ProviderId, QuotaWindow[]>();
  private providerPolicyWindows = new Map<ProviderId, QuotaWindow[]>();

  private state(provider: ProviderId, model: string): State {
    const k = key(provider, model);
    let state = this.states.get(k);
    if (!state) {
      state = {
        provider,
        model,
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        headerWindows: [],
        availability: 'untested',
      };
      this.states.set(k, state);
    }
    return state;
  }

  recordResponse(event: ResponseEvent): void {
    const now = Date.now();
    const state = this.state(event.provider, event.model);
    state.requests += 1;
    state.lastRequestAt = now;
    this.requestEvents.push({ provider: event.provider, model: event.model, at: now });
    const parsed = parseQuotaHeaders(event.headers, now).map((window) => ({
      ...window,
      scope: responseWindowScope(event.provider, window),
    }));
    if (parsed.length > 0) {
      state.headerWindows = parsed.filter((window) => window.scope === 'model');
      const shared = parsed.filter((window) => window.scope === 'provider');
      if (shared.length > 0) this.providerHeaderWindows.set(event.provider, shared);
    }
    if (event.status >= 200 && event.status < 400) state.availability = 'available';
    else if (event.status === 429) state.availability = 'limited';
    else if (event.status >= 400) state.availability = 'error';
  }

  recordUsage(event: UsageEvent): void {
    const usage = event.usage;
    if (!usage) return;
    const state = this.state(event.provider, event.model);
    state.promptTokens += usage.prompt_tokens ?? 0;
    state.completionTokens += usage.completion_tokens ?? 0;
    const total = usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
    state.totalTokens += total;
    this.tokenEvents.push({
      provider: event.provider,
      model: event.model,
      at: Date.now(),
      tokens: total,
    });
  }

  /** Account/control-plane quota applies to every model owned by the provider. */
  recordProviderWindows(provider: ProviderId, windows: QuotaWindow[]): void {
    this.providerPolicyWindows.set(
      provider,
      windows.map((window) => ({ ...window, scope: 'provider' })),
    );
  }

  recordTest(
    provider: ProviderId,
    model: string,
    result: { ok: boolean; latencyMs: number; error?: string; limited?: boolean },
  ): void {
    const state = this.state(provider, model);
    state.lastTestAt = Date.now();
    state.latencyMs = result.latencyMs;
    state.error = result.error;
    state.availability = result.ok ? 'available' : result.limited ? 'limited' : 'error';
  }

  snapshot(provider: ProviderId, model: string, now = Date.now()): ModelQuotaSnapshot {
    const state = this.state(provider, model);
    const policies = (PROVIDER_POLICIES[provider] ?? []).filter(
      (policy) => !policy.model || policy.model.test(model),
    );
    const localWindows: QuotaWindow[] = policies.map((policy) => {
      const since = now - policy.windowSeconds * 1000;
      const matchesScope = (event: { provider: ProviderId; model: string; at: number }) =>
        event.at > since &&
        event.provider === provider &&
        (policy.scope === 'provider' || event.model.toLowerCase() === model.toLowerCase());
      const used =
        policy.resource === 'requests'
          ? this.requestEvents.filter(matchesScope).length
          : policy.resource === 'tokens'
            ? this.tokenEvents
                .filter(matchesScope)
                .reduce((total, event) => total + event.tokens, 0)
            : undefined;
      return {
        resource: policy.resource,
        windowSeconds: policy.windowSeconds,
        limit: policy.limit,
        used,
        remaining: used === undefined ? undefined : Math.max(0, policy.limit - used),
        resetAt: nextBoundary(now, policy.windowSeconds),
        scope: policy.scope,
        source: 'local-estimate',
      };
    });
    const providerPolicies = (this.providerPolicyWindows.get(provider) ?? []).map((window) => {
      if (
        window.resource !== 'requests' ||
        window.limit === undefined ||
        window.remaining !== undefined
      ) {
        return window;
      }
      const since = window.windowSeconds ? now - window.windowSeconds * 1000 : this.startedAt;
      const used = this.requestEvents.filter(
        (event) => event.at > since && event.provider === provider,
      ).length;
      return {
        ...window,
        used,
        remaining: Math.max(0, window.limit - used),
        resetAt:
          window.resetAt ??
          (window.windowSeconds ? nextBoundary(now, window.windowSeconds) : undefined),
      };
    });
    const headerWindows = [
      ...(this.providerHeaderWindows.get(provider) ?? []),
      ...state.headerWindows,
    ];
    const effectiveWindows = [...headerWindows, ...providerPolicies];
    const headerKeys = new Set(
      effectiveWindows.map(
        (window) => `${window.resource}:${window.windowSeconds ?? 'unknown'}:${window.scope}`,
      ),
    );
    const windows = [
      ...effectiveWindows,
      ...localWindows.filter(
        (window) =>
          !headerKeys.has(
            `${window.resource}:${window.windowSeconds ?? 'unknown'}:${window.scope}`,
          ),
      ),
    ];
    const resetAt = windows
      .map((window) => window.resetAt)
      .filter((value): value is number => typeof value === 'number' && value > now)
      .sort((a, b) => a - b)[0];
    return {
      model,
      provider,
      session: {
        startedAt: this.startedAt,
        requests: state.requests,
        promptTokens: state.promptTokens,
        completionTokens: state.completionTokens,
        totalTokens: state.totalTokens,
        lastRequestAt: state.lastRequestAt,
        resetAt,
      },
      windows,
      availability: state.availability,
      lastTestAt: state.lastTestAt,
      latencyMs: state.latencyMs,
      error: state.error,
    };
  }
}
