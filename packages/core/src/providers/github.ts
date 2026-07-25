import type { ModelInfo, ProviderId } from '../types.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';

interface GHModel {
  id: string;
  name?: string;
  publisher?: string;
  summary?: string;
}

export class GitHubModelsProvider extends OpenAICompatibleProvider {
  readonly id: ProviderId = 'github';
  readonly displayName = 'GitHub Models';

  protected baseUrl(): string {
    return this.ctx.credentials.baseUrl ?? 'https://models.github.ai/inference';
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await this.fetch('https://models.github.ai/catalog/models', {
      headers: {
        authorization: `Bearer ${this.ctx.credentials.apiKey}`,
        accept: 'application/vnd.github+json',
      },
    });
    if (!res.ok) throw new Error(`github models list failed: ${res.status}`);
    const data = (await res.json()) as GHModel[];
    return data.map((m) => ({
      id: m.id,
      provider: this.id,
      displayName: m.name ?? m.id,
      free: true,
      description:
        m.summary ??
        'GitHub Models free tier: 50 requests/day (premium), 150/day (low tier), works with any GitHub account.',
    }));
  }
}
