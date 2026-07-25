import type { ModelInfo, ProviderId } from '../types.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';

interface CohereModel {
  id: string;
  name?: string;
  context_length?: number;
  endpoints?: string[];
}

const COHERE_FREE_ALLOW_LIST = [
  'command-a-reasoning-08-2025',
  'command-a-vision-07-2025',
  'command-r-plus-08-2024',
  'command-r-08-2024',
  'command-r7b-12-2024',
] as const;

const COHERE_FREE_ALLOW_MAP: ReadonlyMap<string, string> = new Map(
  COHERE_FREE_ALLOW_LIST.map((id) => [id.toLowerCase(), id]),
);

export class CohereProvider extends OpenAICompatibleProvider {
  readonly id: ProviderId = 'cohere';
  readonly displayName = 'Cohere';

  protected baseUrl(): string {
    return this.ctx.credentials.baseUrl ?? 'https://api.cohere.ai/compatibility/v1';
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await this.fetch('https://api.cohere.com/v1/models?page_size=1000', {
      headers: { authorization: `Bearer ${this.ctx.credentials.apiKey}` },
    });
    if (!res.ok) throw new Error(`cohere list models failed: ${res.status}`);
    const data = (await res.json()) as { models?: CohereModel[] };
    const models = Array.isArray(data.models) ? data.models : [];
    const chatModels = models.filter((m) => {
      if (!m?.name && !m?.id) return false;
      const endpoints = m.endpoints ?? [];
      return endpoints.length === 0 || endpoints.includes('chat');
    });
    const picked: ModelInfo[] = [];
    for (const m of chatModels) {
      const rawId = m.id ?? m.name;
      if (!rawId) continue;
      const canonical = COHERE_FREE_ALLOW_MAP.get(rawId.toLowerCase()) ?? rawId;
      picked.push({
        id: canonical,
        provider: this.id,
        displayName: canonical,
        contextWindow: m.context_length,
        free: true,
        description: 'Cohere Trial Key: 20 RPM, share fair-use rate limit.',
      });
    }
    if (picked.length === 0) {
      throw new Error('cohere list models returned no chat models');
    }
    return picked;
  }
}
