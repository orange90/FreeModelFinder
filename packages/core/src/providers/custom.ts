import type { CustomModelEntry, ModelInfo, ProviderId } from '../types.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';

export class CustomProvider extends OpenAICompatibleProvider {
  readonly id: ProviderId = 'custom';
  readonly displayName = 'Custom (自定义)';

  protected baseUrl(): string {
    const url = this.ctx.credentials.baseUrl?.trim();
    if (!url) {
      throw new Error('custom provider baseUrl not configured');
    }
    return url.replace(/\/$/, '');
  }

  async listModels(): Promise<ModelInfo[]> {
    const extra = this.ctx.credentials.extra ?? {};
    const rawModels = (extra as { models?: unknown }).models;
    const list: CustomModelEntry[] = Array.isArray(rawModels)
      ? (rawModels as CustomModelEntry[]).filter(
          (m) => m && typeof m.id === 'string' && m.id.trim(),
        )
      : [];
    return list.map((m) => ({
      id: m.id,
      provider: this.id,
      displayName: m.displayName?.trim() || m.id,
      contextWindow: m.contextWindow,
      free: false,
      description: 'User-defined custom model (OpenAI compatible endpoint).',
    }));
  }
}
