import type { ModelInfo, ProviderId } from '../types.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';

interface SenseNovaModel {
  id: string;
  object?: string;
  owned_by?: string;
  output_modalities?: string[];
}

const SENSENOVA_STATIC_MODELS: readonly Omit<ModelInfo, 'provider'>[] = [
  {
    id: 'sensenova-6.7-flash-lite',
    displayName: 'SenseNova 6.7 Flash-Lite',
    free: true,
    description: 'SenseNova free tier: 1500 requests / 5 hours. 256K context, multimodal.',
  },
  {
    id: 'deepseek-v4-flash',
    displayName: 'DeepSeek V4 Flash (SenseNova)',
    free: true,
    description: 'SenseNova free tier: 500 requests / 5 hours. 1M context, reasoning.',
  },
  {
    id: 'glm-5.2',
    displayName: 'GLM-5.2 (SenseNova)',
    free: true,
    description: 'SenseNova free tier. 1M context, long-horizon tasks.',
  },
];

export class SenseNovaProvider extends OpenAICompatibleProvider {
  readonly id: ProviderId = 'sensenova';
  readonly displayName = 'SenseNova (\u5546\u6c64)';

  protected baseUrl(): string {
    return this.ctx.credentials.baseUrl ?? 'https://token.sensenova.cn/v1';
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await this.fetch(`${this.baseUrl()}/models`, {
        headers: { authorization: `Bearer ${this.ctx.credentials.apiKey}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { data?: SenseNovaModel[] };
        const list = Array.isArray(data.data) ? data.data : [];
        const dynamic = list
          .filter((m): m is SenseNovaModel => typeof m?.id === 'string' && m.id.length > 0)
          .filter((m) => {
            const outs = m.output_modalities;
            if (!Array.isArray(outs) || outs.length === 0) return true;
            return outs.includes('text');
          })
          .map<ModelInfo>((m) => ({
            id: m.id,
            provider: this.id,
            displayName: m.id,
            free: true,
            description: 'SenseNova free tier, share fair-use rate limit.',
          }));
        if (dynamic.length > 0) return dynamic;
      }
    } catch {
      // fall back to static list
    }
    return SENSENOVA_STATIC_MODELS.map((m) => ({ ...m, provider: this.id }));
  }
}
