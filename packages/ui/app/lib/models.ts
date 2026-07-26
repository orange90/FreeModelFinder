export type ModelItem = {
  id: string;
  provider: string;
  display_name?: string;
  context_window?: number;
  capability_score?: number;
  description?: string;
  free?: boolean;
  quota?: ModelQuotaSnapshot;
};

export type QuotaWindow = {
  resource: 'requests' | 'tokens' | 'neurons';
  windowSeconds?: number;
  limit?: number;
  used?: number;
  remaining?: number;
  resetAt?: number;
  scope: 'model' | 'provider';
  source: 'upstream' | 'local-estimate';
};

export type ModelQuotaSnapshot = {
  model: string;
  provider: string;
  session: {
    startedAt: number;
    requests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    lastRequestAt?: number;
    resetAt?: number;
  };
  windows: QuotaWindow[];
  availability: 'untested' | 'available' | 'limited' | 'error';
  lastTestAt?: number;
  latencyMs?: number;
  error?: string;
};

export type ProviderFailure = {
  id: string;
  error: string;
};

export type ModelsResponse = {
  object: 'list';
  data: ModelItem[];
  fmf?: {
    enabled_providers?: string[];
    succeeded_providers?: string[];
    failed_providers?: ProviderFailure[];
  };
};

export function modelValue(model: Pick<ModelItem, 'provider' | 'id'>): string {
  return `${model.provider}:${model.id}`;
}

export function splitModelValue(value: string): { provider: string; id: string } {
  const separator = value.indexOf(':');
  if (separator < 0) return { provider: '', id: value };
  return {
    provider: value.slice(0, separator),
    id: value.slice(separator + 1),
  };
}

export function formatContext(tokens?: number): string {
  if (!tokens) return '上下文未知';
  if (tokens >= 1_000_000) {
    const value = tokens / 1_000_000;
    return `${Number.isInteger(value) ? value : value.toFixed(1)}M 上下文`;
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}K 上下文`;
  }
  return `${tokens} tokens`;
}
