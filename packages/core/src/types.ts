import { z } from 'zod';

export const ProviderIdSchema = z.enum([
  'openrouter',
  'gemini',
  'ollama',
  'zhipu',
  'siliconflow',
  'modelscope',
  'nvidia',
  'cloudflare',
  'github',
  'cohere',
  'huggingface',
  'sensenova',
  'custom',
]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export interface CustomModelEntry {
  id: string;
  displayName?: string;
  contextWindow?: number;
}

export interface CustomSource {
  id: string;
  label?: string;
  baseUrl: string;
  apiKey?: string;
  models: CustomModelEntry[];
}

export const RoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);
export type Role = z.infer<typeof RoleSchema>;

export const ChatMessageSchema = z.object({
  role: RoleSchema,
  content: z.string(),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatRequestSchema = z.object({
  model: z.string(),
  messages: z.array(ChatMessageSchema),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_tokens: z.number().int().positive().optional(),
  stream: z.boolean().optional().default(false),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export interface ChatResponse {
  id: string;
  model: string;
  created: number;
  content: string;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface StreamChunk {
  id: string;
  model: string;
  created: number;
  delta: string;
  finish_reason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

export interface ModelInfo {
  id: string;
  provider: ProviderId;
  displayName: string;
  contextWindow?: number;
  free: boolean;
  description?: string;
}

export type QuotaResource = 'requests' | 'tokens' | 'neurons';
export type QuotaSource = 'upstream' | 'local-estimate';
export type QuotaScope = 'model' | 'provider';

export interface QuotaWindow {
  resource: QuotaResource;
  /** Window length in seconds. Omitted when the upstream does not disclose it. */
  windowSeconds?: number;
  limit?: number;
  used?: number;
  remaining?: number;
  resetAt?: number;
  scope: QuotaScope;
  source: QuotaSource;
}

export interface ModelQuotaSnapshot {
  model: string;
  provider: ProviderId;
  session: {
    startedAt: number;
    requests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    lastRequestAt?: number;
    /** The nearest known quota-window reset, not a promise that every quota resets then. */
    resetAt?: number;
  };
  windows: QuotaWindow[];
  availability: 'untested' | 'available' | 'limited' | 'error';
  lastTestAt?: number;
  latencyMs?: number;
  error?: string;
}

export const AutoRouteStrategySchema = z.enum(['capability', 'speed', 'rate-limit']);
export type AutoRouteStrategy = z.infer<typeof AutoRouteStrategySchema>;

export interface ModelRoutingProfile {
  id: string;
  provider: ProviderId;
  capabilityScore?: number;
  speedScore?: number;
  rpmLimit?: number;
  aliases?: string[];
}

export interface AutoRouteSettings {
  enabled: boolean;
  strategy: AutoRouteStrategy;
  profiles?: ModelRoutingProfile[];
  fallbackChain?: string[];
}

export interface RateLimitState {
  model: string;
  provider: ProviderId;
  hitAt: number;
  resetAt: number;
  message?: string;
  /**
   * When true, the cooldown applies to the whole provider account
   * (free-tier quota is shared across all of that provider's models),
   * so the router should avoid every model owned by this provider
   * until `resetAt` — not just the specific model that hit the limit.
   */
  scope?: 'model' | 'provider';
}

export interface ProviderCooldownState {
  provider: ProviderId;
  hitAt: number;
  resetAt: number;
  triggeringModel?: string;
  message?: string;
}

/**
 * Providers whose free-tier quotas (RPD / monthly credits) are shared
 * across ALL of their models on the same account/key. When any one of
 * these hits a rate-limit, the AutoRouter pauses the entire provider
 * (not just the specific model) until `resetAt`.
 *
 * References:
 * - OpenRouter free tier: 50 req/day (unfunded) or 1000 req/day
 *   (once cumulative deposits ≥ $10). The cap counts across every
 *   `:free` model on the account.
 * - GitHub Models: monthly request cap shared across every model
 *   (per Copilot tier).
 * - Cohere trial key: monthly request quota shared across models.
 * - Hugging Face Inference API: monthly credits pooled across models.
 * - Cloudflare Workers AI: daily neuron budget pooled across models.
 */
export const PROVIDER_SHARED_QUOTA: Partial<Record<ProviderId, boolean>> = {
  openrouter: true,
  github: true,
  cohere: true,
  huggingface: true,
  cloudflare: true,
};

export function isSharedQuotaProvider(provider: ProviderId): boolean {
  return PROVIDER_SHARED_QUOTA[provider] === true;
}

export interface SwitchNotice {
  type: 'switch-away' | 'switch-back';
  from: string;
  to: string;
  strategy?: AutoRouteStrategy;
  reason: string;
  resetAt?: number;
}

export interface ProviderCredentials {
  apiKey: string;
  baseUrl?: string;
  extra?: Record<string, unknown>;
}

export interface ProviderSettings {
  enabled: boolean;
  credentials?: ProviderCredentials;
  credentialError?: string;
}

export interface GatewaySettings {
  apiKey?: string;
  requireAuth?: boolean;
}

export interface AppConfig {
  version: number;
  port: number;
  defaultModel?: string;
  providers: Partial<Record<ProviderId, ProviderSettings>>;
  gateway?: GatewaySettings;
  autoRoute?: AutoRouteSettings;
}
