import type { ModelInfo, ProviderId } from '../types.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';

interface NvidiaModel {
  id: string;
  object?: string;
  owned_by?: string;
}

const FREE_MODEL_IDS = new Set<string>([
  'meta/llama-3.1-8b-instruct',
  'meta/llama-3.1-70b-instruct',
  'meta/llama-3.1-405b-instruct',
  'meta/llama-3.2-1b-instruct',
  'meta/llama-3.2-3b-instruct',
  'meta/llama-3.3-70b-instruct',
  'meta/llama-4-maverick-17b-128e-instruct',
  'meta/llama-4-scout-17b-16e-instruct',
  'nvidia/llama-3.1-nemotron-70b-instruct',
  'nvidia/llama-3.1-nemotron-nano-8b-v1',
  'nvidia/llama-3.3-nemotron-super-49b-v1',
  'nvidia/nemotron-4-340b-instruct',
  'nvidia/nemotron-mini-4b-instruct',
  'mistralai/mistral-7b-instruct-v0.3',
  'mistralai/mixtral-8x7b-instruct-v0.1',
  'mistralai/mixtral-8x22b-instruct-v0.1',
  'mistralai/mistral-large',
  'mistralai/mistral-large-2-instruct',
  'mistralai/mistral-nemotron',
  'mistralai/codestral-22b-instruct-v0.1',
  'google/gemma-2-2b-it',
  'google/gemma-2-9b-it',
  'google/gemma-2-27b-it',
  'google/gemma-3-1b-it',
  'google/gemma-3-4b-it',
  'google/gemma-3-12b-it',
  'google/gemma-3-27b-it',
  'google/gemma-3n-e2b-it',
  'google/gemma-3n-e4b-it',
  'qwen/qwen2.5-7b-instruct',
  'qwen/qwen2.5-coder-7b-instruct',
  'qwen/qwen2.5-coder-32b-instruct',
  'qwen/qwen3-235b-a22b',
  'deepseek-ai/deepseek-r1',
  'deepseek-ai/deepseek-r1-distill-llama-8b',
  'deepseek-ai/deepseek-r1-distill-qwen-7b',
  'deepseek-ai/deepseek-r1-distill-qwen-14b',
  'deepseek-ai/deepseek-r1-distill-qwen-32b',
  'microsoft/phi-3-medium-4k-instruct',
  'microsoft/phi-3-mini-4k-instruct',
  'microsoft/phi-3-small-8k-instruct',
  'microsoft/phi-3.5-mini-instruct',
  'microsoft/phi-3.5-moe-instruct',
  'microsoft/phi-4-mini-instruct',
  'microsoft/phi-4-multimodal-instruct',
  '01-ai/yi-large',
  'ibm/granite-3.0-8b-instruct',
  'ibm/granite-3.0-3b-a800m-instruct',
]);

export class NvidiaProvider extends OpenAICompatibleProvider {
  readonly id: ProviderId = 'nvidia';
  readonly displayName = 'NVIDIA NIM';

  protected baseUrl(): string {
    return this.ctx.credentials.baseUrl ?? 'https://integrate.api.nvidia.com/v1';
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await this.fetch(`${this.baseUrl()}/models`, {
      headers: { authorization: `Bearer ${this.ctx.credentials.apiKey}` },
    });
    if (!res.ok) throw new Error(`nvidia list models failed: ${res.status}`);
    const data = (await res.json()) as { data: NvidiaModel[] };
    return data.data
      .filter((m) => FREE_MODEL_IDS.has(m.id))
      .map((m) => ({
        id: m.id,
        provider: this.id,
        displayName: m.id,
        free: true,
        description: 'NVIDIA NIM permanent free tier: 40 RPM, no daily token cap.',
      }));
  }
}
