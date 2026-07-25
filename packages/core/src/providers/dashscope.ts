import type { ModelInfo, ProviderId } from '../types.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';

const DASHSCOPE_STATIC_MODELS: ModelInfo[] = [
  {
    id: 'qwen-turbo',
    provider: 'dashscope',
    displayName: 'Qwen-Turbo',
    contextWindow: 128_000,
    free: true,
    description: 'Alibaba Bailian free tier: 1M tokens per model / 3 months.',
  },
  {
    id: 'qwen-plus',
    provider: 'dashscope',
    displayName: 'Qwen-Plus',
    contextWindow: 128_000,
    free: true,
  },
  {
    id: 'qwen-max',
    provider: 'dashscope',
    displayName: 'Qwen-Max',
    contextWindow: 32_768,
    free: true,
  },
  {
    id: 'deepseek-v3',
    provider: 'dashscope',
    displayName: 'DeepSeek-V3 (via Bailian)',
    contextWindow: 64_000,
    free: true,
  },
];

export class DashScopeProvider extends OpenAICompatibleProvider {
  readonly id: ProviderId = 'dashscope';
  readonly displayName = 'Aliyun Bailian (DashScope)';

  protected baseUrl(): string {
    return (
      this.ctx.credentials.baseUrl ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    );
  }

  async listModels(): Promise<ModelInfo[]> {
    return DASHSCOPE_STATIC_MODELS;
  }
}
