import type { ModelInfo, ProviderId } from '../types.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';

interface DSModel {
  id: string;
  object?: string;
  owned_by?: string;
}

export class DeepSeekProvider extends OpenAICompatibleProvider {
  readonly id: ProviderId = 'deepseek';
  readonly displayName = 'DeepSeek';

  protected baseUrl(): string {
    return this.ctx.credentials.baseUrl ?? 'https://api.deepseek.com/v1';
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await this.fetch(`${this.baseUrl()}/models`, {
      headers: { authorization: `Bearer ${this.ctx.credentials.apiKey}` },
    });
    if (!res.ok) throw new Error(`deepseek list models failed: ${res.status}`);
    const data = (await res.json()) as { data: DSModel[] };
    return data.data.map((m) => ({
      id: m.id,
      provider: this.id,
      displayName: m.id,
      free: false,
      description: 'DeepSeek official API, new users get trial credits.',
    }));
  }
}
