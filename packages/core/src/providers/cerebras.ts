import type { ModelInfo, ProviderId } from '../types.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';

interface CerebrasModel {
  id: string;
  object?: string;
  owned_by?: string;
}

export class CerebrasProvider extends OpenAICompatibleProvider {
  readonly id: ProviderId = 'cerebras';
  readonly displayName = 'Cerebras';

  protected baseUrl(): string {
    return this.ctx.credentials.baseUrl ?? 'https://api.cerebras.ai/v1';
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await this.fetch(`${this.baseUrl()}/models`, {
      headers: { authorization: `Bearer ${this.ctx.credentials.apiKey}` },
    });
    if (!res.ok) throw new Error(`cerebras list models failed: ${res.status}`);
    const data = (await res.json()) as { data: CerebrasModel[] };
    return data.data.map((m) => ({
      id: m.id,
      provider: this.id,
      displayName: m.id,
      free: true,
      description: 'Cerebras free tier: ~1M tokens/day, 2000+ tok/s.',
    }));
  }
}
