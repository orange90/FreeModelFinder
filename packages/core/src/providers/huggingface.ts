import type { ModelInfo, ProviderId } from '../types.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';

interface HFProviderEntry {
  provider?: string;
  status?: string;
  context_length?: number;
  pricing?: { input?: number; output?: number };
  is_free?: boolean;
}

interface HFRouterModel {
  id: string;
  object?: string;
  owned_by?: string;
  context_length?: number;
  providers?: HFProviderEntry[];
}

const HF_RECOMMENDED = [
  'deepseek-ai/DeepSeek-V3-0324',
  'deepseek-ai/DeepSeek-R1-0528',
  'meta-llama/Llama-3.3-70B-Instruct',
  'Qwen/Qwen2.5-72B-Instruct',
  'Qwen/Qwen2.5-Coder-32B-Instruct',
  'zai-org/GLM-4.5',
  'moonshotai/Kimi-K2-Instruct',
  'google/gemma-3-27b-it',
  'MiniMaxAI/MiniMax-M1-80k',
] as const;

const HF_RECOMMENDED_MAP: ReadonlyMap<string, string> = new Map(
  HF_RECOMMENDED.map((id) => [id.toLowerCase(), id]),
);

function isFreeProvider(p: HFProviderEntry): boolean {
  if (p.status && p.status !== 'live') return false;
  if (p.is_free === true) return true;
  const inPrice = p.pricing?.input;
  const outPrice = p.pricing?.output;
  if (typeof inPrice === 'number' && typeof outPrice === 'number' && inPrice === 0 && outPrice === 0) {
    return true;
  }
  return false;
}

export class HuggingFaceProvider extends OpenAICompatibleProvider {
  readonly id: ProviderId = 'huggingface';
  readonly displayName = 'HuggingFace Router';

  protected baseUrl(): string {
    return this.ctx.credentials.baseUrl ?? 'https://router.huggingface.co/v1';
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await this.fetch(`${this.baseUrl()}/models`, {
      headers: { authorization: `Bearer ${this.ctx.credentials.apiKey}` },
    });
    if (!res.ok) throw new Error(`huggingface list models failed: ${res.status}`);
    const data = (await res.json()) as { data?: HFRouterModel[] };
    const list = Array.isArray(data.data) ? data.data : [];
    if (list.length === 0) {
      throw new Error('huggingface list models returned empty data');
    }
    const seen = new Set<string>();
    const models: ModelInfo[] = [];
    for (const m of list) {
      if (!m?.id) continue;
      const providers = Array.isArray(m.providers) ? m.providers : [];
      const freeProviders = providers.filter(isFreeProvider);
      if (freeProviders.length === 0) continue;
      const canonical = HF_RECOMMENDED_MAP.get(m.id.toLowerCase()) ?? m.id;
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      const ctx =
        m.context_length ??
        freeProviders
          .map((p) => p.context_length)
          .find((v): v is number => typeof v === 'number');
      const backendNames = freeProviders
        .map((p) => p.provider)
        .filter((v): v is string => typeof v === 'string' && v.length > 0);
      const backendDesc = backendNames.length > 0 ? ` via ${backendNames.join(', ')}` : '';
      models.push({
        id: canonical,
        provider: this.id,
        displayName: canonical,
        contextWindow: ctx,
        free: true,
        description: `HuggingFace Router free tier${backendDesc}: ~300 requests/hour shared across models.`,
      });
    }
    if (models.length === 0) {
      throw new Error('huggingface list models returned no free models');
    }
    return models;
  }
}
