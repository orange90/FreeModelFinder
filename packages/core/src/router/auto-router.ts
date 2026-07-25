import {
  isSharedQuotaProvider,
  type AutoRouteSettings,
  type AutoRouteStrategy,
  type ModelInfo,
  type ModelRoutingProfile,
  type ProviderCooldownState,
  type ProviderId,
  type RateLimitState,
  type SwitchNotice,
} from '../types.js';

export interface RateLimitParseResult {
  isRateLimit: boolean;
  resetAt?: number;
  retryAfterSec?: number;
  message: string;
}

const DEFAULT_COOLDOWN_MS = 60_000;

const RATE_LIMIT_PATTERNS: RegExp[] = [
  /\brpm\b/i,
  /\brate[\s_-]?limit/i,
  /\bquota\b/i,
  /\btoo many requests\b/i,
  /\brequests per minute\b/i,
  /\bresource[_\s]?exhausted\b/i,
  /\bexceeded\b.*\b(limit|quota|rpm|rpd|tpm)\b/i,
];

export function parseRateLimitError(err: unknown): RateLimitParseResult {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const now = Date.now();

  let isRateLimit = false;
  const statusMatch = message.match(/failed\s+(\d{3})/i);
  const status = statusMatch ? Number(statusMatch[1]) : undefined;
  if (status === 429) isRateLimit = true;
  if (!isRateLimit) {
    for (const re of RATE_LIMIT_PATTERNS) {
      if (re.test(message)) {
        isRateLimit = true;
        break;
      }
    }
  }

  let retryAfterSec: number | undefined;
  const retryAfterMatch = message.match(/retry[\s-]?after[^0-9]*(\d+)/i);
  if (retryAfterMatch) retryAfterSec = Number(retryAfterMatch[1]);
  const secondsMatch = message.match(/(?:in|after|wait)\s+(\d+)\s*(?:s|seconds?)\b/i);
  if (retryAfterSec === undefined && secondsMatch) retryAfterSec = Number(secondsMatch[1]);

  let resetAt: number | undefined;
  const isoMatch = message.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s"'}]*)/);
  if (isoMatch) {
    const ts = Date.parse(isoMatch[1]!);
    if (!Number.isNaN(ts)) resetAt = ts;
  }
  const epochMatch = message.match(/reset[^0-9]{0,10}(\d{10,13})/i);
  if (!resetAt && epochMatch) {
    const raw = Number(epochMatch[1]);
    resetAt = raw > 1e12 ? raw : raw * 1000;
  }
  if (!resetAt && retryAfterSec !== undefined) {
    resetAt = now + retryAfterSec * 1000;
  }
  if (isRateLimit && !resetAt) {
    resetAt = now + DEFAULT_COOLDOWN_MS;
  }

  return { isRateLimit, resetAt, retryAfterSec, message };
}

function normalizeModelKey(model: string): string {
  return model.toLowerCase();
}

function findProfile(
  model: string,
  profiles: ModelRoutingProfile[] | undefined,
): ModelRoutingProfile | undefined {
  if (!profiles || profiles.length === 0) return undefined;
  const key = normalizeModelKey(model);
  return profiles.find(
    (p) =>
      normalizeModelKey(p.id) === key ||
      (p.aliases?.some((a) => normalizeModelKey(a) === key) ?? false),
  );
}

function heuristicCapabilityScore(m: ModelInfo): number {
  const id = m.id.toLowerCase();
  let score = 50;
  if (/(70b|72b|65b|80b|405b|deepseek-r1|deepseek-v3|glm-4\.5|qwen[-_]?max|opus|gpt-5|gpt-4o|gemini-2\.5-pro|claude-3\.5)/i.test(id))
    score = 95;
  else if (/(30b|32b|34b|40b|gpt-4|glm-4|gemini-2\.0|deepseek-v2|qwen-plus|sonnet)/i.test(id))
    score = 80;
  else if (/(14b|13b|20b|mixtral|command-r|haiku|flash|mini)/i.test(id)) score = 65;
  else if (/(7b|8b|9b|10b|small|nano)/i.test(id)) score = 45;
  else if (/(1b|2b|3b|tiny)/i.test(id)) score = 30;
  if (m.contextWindow && m.contextWindow >= 128_000) score += 5;
  return score;
}

function heuristicSpeedScore(m: ModelInfo): number {
  const id = m.id.toLowerCase();
  let score = 50;
  if (m.provider === 'cerebras') score = 95;
  else if (m.provider === 'gemini' && /flash/.test(id)) score = 85;
  else if (/flash|mini|nano|haiku|8b|7b|3b|1b/.test(id)) score = 78;
  else if (/70b|72b|405b|opus|max/.test(id)) score = 35;
  return score;
}

function heuristicRpmScore(m: ModelInfo, profile?: ModelRoutingProfile): number {
  if (profile?.rpmLimit) return Math.min(100, Math.log10(profile.rpmLimit + 1) * 30);
  // Providers roughly ordered by known free tier RPM (higher = better)
  const providerBaseline: Partial<Record<ProviderId, number>> = {
    cerebras: 85,
    openrouter: 60,
    siliconflow: 70,
    modelscope: 70,
    dashscope: 70,
    zhipu: 70,
    deepseek: 60,
    mistral: 55,
    cloudflare: 65,
    github: 40,
    cohere: 55,
    huggingface: 30,
    sensenova: 50,
    nvidia: 55,
    gemini: 45,
    ollama: 100,
  };
  return providerBaseline[m.provider] ?? 50;
}

export function scoreModel(
  m: ModelInfo,
  strategy: AutoRouteStrategy,
  profile?: ModelRoutingProfile,
): number {
  if (strategy === 'capability') {
    return profile?.capabilityScore ?? heuristicCapabilityScore(m);
  }
  if (strategy === 'speed') {
    return profile?.speedScore ?? heuristicSpeedScore(m);
  }
  return heuristicRpmScore(m, profile);
}

export function formatModelId(m: ModelInfo): string {
  return `${m.provider}:${m.id}`;
}

export function formatResetTime(resetAt: number | undefined): string {
  if (!resetAt) return '未知';
  const d = new Date(resetAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export interface AutoRouterOptions {
  getSettings: () => AutoRouteSettings | undefined;
  listAllModels: () => Promise<ModelInfo[]>;
  onNotice?: (notice: SwitchNotice) => void;
}

export class AutoRouter {
  private cooldowns = new Map<string, RateLimitState>();
  private providerCooldowns = new Map<ProviderId, ProviderCooldownState>();
  private originalPreference: string | null = null;

  constructor(private opts: AutoRouterOptions) {}

  isEnabled(): boolean {
    return !!this.opts.getSettings()?.enabled;
  }

  getStrategy(): AutoRouteStrategy {
    return this.opts.getSettings()?.strategy ?? 'capability';
  }

  getProfile(model: string): ModelRoutingProfile | undefined {
    return findProfile(model, this.opts.getSettings()?.profiles);
  }

  isRateLimited(model: string): RateLimitState | null {
    this.gc();
    const state = this.cooldowns.get(model.toLowerCase());
    if (!state) return null;
    if (Date.now() >= state.resetAt) {
      this.cooldowns.delete(model.toLowerCase());
      return null;
    }
    return state;
  }

  /**
   * Provider-level cooldown check. When a shared-quota provider (e.g.
   * OpenRouter) has been rate-limited on any of its models, every model
   * owned by that provider must be considered unavailable until the
   * cooldown expires.
   */
  isProviderRateLimited(provider: ProviderId): ProviderCooldownState | null {
    this.gcProvider();
    const state = this.providerCooldowns.get(provider);
    if (!state) return null;
    if (Date.now() >= state.resetAt) {
      this.providerCooldowns.delete(provider);
      return null;
    }
    return state;
  }

  markRateLimited(
    model: string,
    provider: ProviderId,
    parsed: RateLimitParseResult,
  ): RateLimitState {
    const shared = isSharedQuotaProvider(provider);
    const resetAt = parsed.resetAt ?? Date.now() + DEFAULT_COOLDOWN_MS;
    const state: RateLimitState = {
      model,
      provider,
      hitAt: Date.now(),
      resetAt,
      message: parsed.message,
      scope: shared ? 'provider' : 'model',
    };
    this.cooldowns.set(model.toLowerCase(), state);
    if (shared) {
      this.markProviderRateLimited(provider, {
        resetAt,
        triggeringModel: model,
        message: parsed.message,
      });
    }
    return state;
  }

  markProviderRateLimited(
    provider: ProviderId,
    info: { resetAt: number; triggeringModel?: string; message?: string },
  ): ProviderCooldownState {
    const state: ProviderCooldownState = {
      provider,
      hitAt: Date.now(),
      resetAt: info.resetAt,
      triggeringModel: info.triggeringModel,
      message: info.message,
    };
    const existing = this.providerCooldowns.get(provider);
    // keep the LATER resetAt so consecutive 429s only extend, never shorten
    if (!existing || existing.resetAt < state.resetAt) {
      this.providerCooldowns.set(provider, state);
    }
    return this.providerCooldowns.get(provider)!;
  }

  listCooldowns(): RateLimitState[] {
    this.gc();
    return Array.from(this.cooldowns.values());
  }

  listProviderCooldowns(): ProviderCooldownState[] {
    this.gcProvider();
    return Array.from(this.providerCooldowns.values());
  }

  clearCooldown(model: string): boolean {
    return this.cooldowns.delete(model.toLowerCase());
  }

  clearProviderCooldown(provider: ProviderId): boolean {
    return this.providerCooldowns.delete(provider);
  }

  rememberPreference(model: string | null | undefined): void {
    if (model && !this.originalPreference) {
      this.originalPreference = model;
    }
  }

  getRememberedPreference(): string | null {
    return this.originalPreference;
  }

  resetPreference(): void {
    this.originalPreference = null;
  }

  private gc(): void {
    const now = Date.now();
    for (const [k, v] of this.cooldowns) {
      if (v.resetAt <= now) this.cooldowns.delete(k);
    }
  }

  private gcProvider(): void {
    const now = Date.now();
    for (const [k, v] of this.providerCooldowns) {
      if (v.resetAt <= now) this.providerCooldowns.delete(k);
    }
  }

  async pickFallback(excludedModel: string): Promise<ModelInfo | null> {
    const settings = this.opts.getSettings();
    if (!settings?.enabled) return null;
    const strategy = settings.strategy;
    const all = await this.opts.listAllModels();
    const excludedKey = excludedModel.toLowerCase();
    const candidates = all.filter((m) => {
      const key = m.id.toLowerCase();
      const full = `${m.provider}:${m.id}`.toLowerCase();
      if (key === excludedKey || full === excludedKey) return false;
      // Skip any model whose provider is currently in cooldown (shared quota)
      if (this.isProviderRateLimited(m.provider)) return false;
      if (this.isRateLimited(m.id) || this.isRateLimited(`${m.provider}:${m.id}`)) return false;
      return true;
    });
    if (candidates.length === 0) return null;

    if (settings.fallbackChain && settings.fallbackChain.length > 0) {
      for (const preferred of settings.fallbackChain) {
        const found = candidates.find((c) => {
          const pref = preferred.toLowerCase();
          return c.id.toLowerCase() === pref || `${c.provider}:${c.id}`.toLowerCase() === pref;
        });
        if (found) return found;
      }
    }

    const scored = candidates
      .map((m) => ({ m, s: scoreModel(m, strategy, findProfile(m.id, settings.profiles)) }))
      .sort((a, b) => b.s - a.s);
    return scored[0]?.m ?? null;
  }

  notify(notice: SwitchNotice): void {
    this.opts.onNotice?.(notice);
  }

  buildSwitchAwayMessage(state: RateLimitState, target: ModelInfo): string {
    const providerScope = state.scope === 'provider' || isSharedQuotaProvider(state.provider);
    const header = providerScope
      ? `⚠️ Provider "${state.provider}" 的免费额度已耗尽（该服务商所有模型共享此配额），已整体暂停使用。`
      : `⚠️ 模型 "${state.model}" 已达到请求限制（RPM/配额）。`;
    return [
      header,
      `   下次重置时间：${formatResetTime(state.resetAt)}`,
      `   已根据「${this.strategyLabel()}」原则自动切换到：${formatModelId(target)}`,
    ].join('\n');
  }

  buildSwitchBackMessage(target: ModelInfo): string {
    return `✅ 根据「${this.strategyLabel()}」原则，限制已解除，已切换回：${formatModelId(target)}`;
  }

  strategyLabel(): string {
    switch (this.getStrategy()) {
      case 'capability':
        return '能力优先';
      case 'speed':
        return '速度优先';
      case 'rate-limit':
        return '请求限制优先';
      default:
        return '能力优先';
    }
  }

  /**
   * Given a requested model id, check cooldowns before dispatching a request.
   * Returns either the original model or a fallback (and a switch notice).
   *
   * Providers with shared quotas cause every one of their models to be
   * considered "in cooldown" until the reset time.
   */
  async preflight(
    requestedModel: string,
  ): Promise<
    | { switched: false; model: string }
    | { switched: true; model: ModelInfo; notice: SwitchNotice; original: string }
  > {
    if (!this.isEnabled()) return { switched: false, model: requestedModel };

    // First check: is the specific model in cooldown?
    const modelState =
      this.isRateLimited(requestedModel) ??
      (requestedModel.includes(':')
        ? this.isRateLimited(requestedModel.split(':').slice(1).join(':'))
        : null);

    // Second check: does the requested model belong to a provider that is
    // currently in a shared-quota cooldown?
    let providerState: ProviderCooldownState | null = null;
    if (requestedModel.includes(':')) {
      const providerId = requestedModel.split(':', 1)[0] as ProviderId;
      providerState = this.isProviderRateLimited(providerId);
    }

    if (!modelState && !providerState) {
      return { switched: false, model: requestedModel };
    }

    const fallback = await this.pickFallback(requestedModel);
    if (!fallback) return { switched: false, model: requestedModel };

    this.rememberPreference(requestedModel);
    const effectiveState: RateLimitState = modelState ?? {
      model: requestedModel,
      provider: providerState!.provider,
      hitAt: providerState!.hitAt,
      resetAt: providerState!.resetAt,
      message: providerState!.message,
      scope: 'provider',
    };
    const notice: SwitchNotice = {
      type: 'switch-away',
      from: requestedModel,
      to: formatModelId(fallback),
      strategy: this.getStrategy(),
      reason: this.buildSwitchAwayMessage(effectiveState, fallback),
      resetAt: effectiveState.resetAt,
    };
    this.notify(notice);
    return { switched: true, model: fallback, notice, original: requestedModel };
  }

  /**
   * Called after a request completes successfully. If we were on a fallback
   * because of a rate limit and the original preferred model is no longer
   * limited, schedule a switch-back on the *next* request.
   */
  async maybeSwitchBack(currentModel: string): Promise<SwitchNotice | null> {
    if (!this.isEnabled()) return null;
    const preferred = this.originalPreference;
    if (!preferred) return null;
    if (preferred.toLowerCase() === currentModel.toLowerCase()) return null;
    if (this.isRateLimited(preferred)) return null;
    // Do not switch back while the preferred model's provider is still cooling down.
    if (preferred.includes(':')) {
      const providerId = preferred.split(':', 1)[0] as ProviderId;
      if (this.isProviderRateLimited(providerId)) return null;
    }

    const all = await this.opts.listAllModels();
    const match = all.find((m) => {
      const key = preferred.toLowerCase();
      return m.id.toLowerCase() === key || `${m.provider}:${m.id}`.toLowerCase() === key;
    });
    if (!match) return null;
    if (this.isProviderRateLimited(match.provider)) return null;

    const notice: SwitchNotice = {
      type: 'switch-back',
      from: currentModel,
      to: formatModelId(match),
      strategy: this.getStrategy(),
      reason: this.buildSwitchBackMessage(match),
    };
    this.originalPreference = null;
    this.notify(notice);
    return notice;
  }
}
