import type { ModelInfo, ProviderId } from '../types.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';

const ZHIPU_FREE_MODELS = new Set(['glm-4-flash', 'glm-4-flash-250414', 'glm-4.7-flash']);

const ZHIPU_STATIC_MODELS: ModelInfo[] = [
  {
    id: 'glm-4-flash',
    provider: 'zhipu',
    displayName: 'GLM-4-Flash',
    contextWindow: 128_000,
    free: true,
    description: 'Zhipu GLM-4-Flash, permanently free, 128K context.',
  },
  {
    id: 'glm-4.7-flash',
    provider: 'zhipu',
    displayName: 'GLM-4.7-Flash',
    contextWindow: 200_000,
    free: true,
    description: 'Zhipu GLM-4.7-Flash, permanently free, 200K context, strong coding.',
  },
];

export class ZhipuProvider extends OpenAICompatibleProvider {
  readonly id: ProviderId = 'zhipu';
  readonly displayName = 'Zhipu AI (BigModel)';

  protected baseUrl(): string {
    return this.ctx.credentials.baseUrl ?? 'https://open.bigmodel.cn/api/paas/v4';
  }

  async listModels(): Promise<ModelInfo[]> {
    return ZHIPU_STATIC_MODELS.map((m) => ({
      ...m,
      free: ZHIPU_FREE_MODELS.has(m.id) || m.free,
    }));
  }
}
