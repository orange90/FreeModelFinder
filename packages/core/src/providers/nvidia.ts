import type { ModelInfo, ProviderId } from '../types.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';

interface NvidiaModel {
  id: string;
  object?: string;
  owned_by?: string;
}

const FREE_MODEL_IDS = new Set<string>([
  'abacusai/dracarys-llama-3.1-70b-instruct',
  'bytedance/seed-oss-36b-instruct',
  'deepseek-ai/deepseek-v4-flash',
  'google/diffusiongemma-26b-a4b-it',
  'google/gemma-2-2b-it',
  'google/gemma-3n-e2b-it',
  'google/gemma-3n-e4b-it',
  'google/gemma-4-31b-it',
  'meta/llama-3.1-70b-instruct',
  'meta/llama-3.1-8b-instruct',
  'meta/llama-3.2-11b-vision-instruct',
  'meta/llama-3.2-1b-instruct',
  'meta/llama-3.2-3b-instruct',
  'meta/llama-3.2-90b-vision-instruct',
  'meta/llama-4-maverick-17b-128e-instruct',
  'minimaxai/minimax-m2.7',
  'minimaxai/minimax-m3',
  'mistralai/mistral-medium-3.5-128b',
  'mistralai/mistral-nemotron',
  'mistralai/mistral-small-4-119b-2603',
  'mistralai/mixtral-8x7b-instruct-v0.1',
  'nvidia/gliner-pii',
  'nvidia/ising-calibration-1-35b-a3b',
  'nvidia/ising-calibration-1.5-31b',
  'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
  'nvidia/llama-3.3-nemotron-super-49b-v1',
  'nvidia/llama-3.3-nemotron-super-49b-v1.5',
  'nvidia/nemotron-3-nano-30b-a3b',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
  'nvidia/nemotron-3-super-120b-a12b',
  'nvidia/nemotron-3-ultra-550b-a55b',
  'nvidia/nemotron-mini-4b-instruct',
  'nvidia/nemotron-nano-12b-v2-vl',
  'nvidia/nvidia-nemotron-nano-9b-v2',
  'nvidia/riva-translate-4b-instruct-v1.1',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3-next-80b-a3b-instruct',
  'sarvamai/sarvam-m',
  'stepfun-ai/step-3.5-flash',
  'stepfun-ai/step-3.7-flash',
  'upstage/solar-10.7b-instruct',
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
