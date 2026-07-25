import type { ModelInfo, ProviderId } from '../types.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';

interface OpenRouterModel {
  id: string;
  name?: string;
  context_length?: number;
  description?: string;
  pricing?: { prompt?: string; completion?: string };
}

export class OpenRouterProvider extends OpenAICompatibleProvider {
  readonly id: ProviderId = 'openrouter';
  readonly displayName = 'OpenRouter';

  protected baseUrl(): string {
    return this.ctx.credentials.baseUrl ?? 'https://openrouter.ai/api/v1';
  }

  protected override extraHeaders(): Record<string, string> {
    return {
      'HTTP-Referer': 'https://github.com/freemodelfinder',
      'X-Title': 'FreeModelFinder',
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await this.fetch(`${this.baseUrl()}/models`);
    if (!res.ok) throw new Error(`openrouter list models failed: ${res.status}`);
    const data = (await res.json()) as { data: OpenRouterModel[] };
    return data.data
      .filter((m) => {
        const p = Number(m.pricing?.prompt ?? '0');
        const c = Number(m.pricing?.completion ?? '0');
        return p === 0 && c === 0;
      })
      .map((m) => ({
        id: m.id,
        provider: this.id,
        displayName: m.name ?? m.id,
        contextWindow: m.context_length,
        free: true,
        description: m.description,
      }));
  }
}
