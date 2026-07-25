import type { ModelInfo, ProviderId } from '../types.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';

interface MistralModel {
  id: string;
  object?: string;
  max_context_length?: number;
}

export class MistralProvider extends OpenAICompatibleProvider {
  readonly id: ProviderId = 'mistral';
  readonly displayName = 'Mistral AI';

  protected baseUrl(): string {
    return this.ctx.credentials.baseUrl ?? 'https://api.mistral.ai/v1';
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await this.fetch(`${this.baseUrl()}/models`, {
      headers: { authorization: `Bearer ${this.ctx.credentials.apiKey}` },
    });
    if (!res.ok) throw new Error(`mistral list models failed: ${res.status}`);
    const data = (await res.json()) as { data: MistralModel[] };
    return data.data.map((m) => ({
      id: m.id,
      provider: this.id,
      displayName: m.id,
      contextWindow: m.max_context_length,
      free: true,
      description: 'Mistral Experiment tier: ~1B tokens/month, GDPR compliant.',
    }));
  }
}
