import type { ModelInfo, ProviderId } from '../types.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';

interface MSModel {
  id: string;
  object?: string;
}

const MS_FREE_ALLOW_LIST: ReadonlyArray<{
  id: string;
  displayName?: string;
  contextWindow?: number;
  description?: string;
}> = [
  {
    id: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
    displayName: 'Qwen3-235B-A22B-Instruct-2507',
    contextWindow: 262_144,
    description: 'ModelScope free tier: 2000 calls/day (\u2264500 per model).',
  },
  {
    id: 'Qwen/Qwen3-235B-A22B-Thinking-2507',
    displayName: 'Qwen3-235B-A22B-Thinking-2507',
    contextWindow: 262_144,
  },
  {
    id: 'Qwen/Qwen3-Next-80B-A3B-Instruct',
    displayName: 'Qwen3-Next-80B-A3B-Instruct',
    contextWindow: 262_144,
  },
  {
    id: 'Qwen/Qwen3-Next-80B-A3B-Thinking',
    displayName: 'Qwen3-Next-80B-A3B-Thinking',
    contextWindow: 262_144,
  },
  {
    id: 'Qwen/Qwen3-Coder-480B-A35B-Instruct',
    displayName: 'Qwen3-Coder-480B-A35B-Instruct',
    contextWindow: 262_144,
  },
  {
    id: 'Qwen/Qwen3-Coder-30B-A3B-Instruct',
    displayName: 'Qwen3-Coder-30B-A3B-Instruct',
    contextWindow: 262_144,
  },
  {
    id: 'Qwen/Qwen3-VL-235B-A22B-Instruct',
    displayName: 'Qwen3-VL-235B-A22B-Instruct',
    contextWindow: 131_072,
  },
  {
    id: 'Qwen/Qwen3-32B',
    displayName: 'Qwen3-32B',
    contextWindow: 131_072,
  },
  {
    id: 'deepseek-ai/DeepSeek-V3.1',
    displayName: 'DeepSeek-V3.1',
    contextWindow: 131_072,
  },
  {
    id: 'deepseek-ai/DeepSeek-V3',
    displayName: 'DeepSeek-V3',
    contextWindow: 65_536,
  },
  {
    id: 'deepseek-ai/DeepSeek-R1',
    displayName: 'DeepSeek-R1',
    contextWindow: 65_536,
  },
  {
    id: 'ZhipuAI/GLM-4.6',
    displayName: 'GLM-4.6',
    contextWindow: 204_800,
  },
  {
    id: 'ZhipuAI/GLM-4.5',
    displayName: 'GLM-4.5',
    contextWindow: 131_072,
  },
  {
    id: 'moonshotai/Kimi-K2-Instruct',
    displayName: 'Kimi-K2-Instruct',
    contextWindow: 131_072,
  },
  {
    id: 'MiniMax/MiniMax-M2',
    displayName: 'MiniMax-M2',
    contextWindow: 204_800,
  },
  {
    id: 'stepfun-ai/step3',
    displayName: 'Step-3',
    contextWindow: 65_536,
  },
];

const MS_FREE_ALLOW_MAP: ReadonlyMap<string, (typeof MS_FREE_ALLOW_LIST)[number]> = new Map(
  MS_FREE_ALLOW_LIST.map((item) => [item.id.toLowerCase(), item]),
);

function toModelInfo(
  entry: (typeof MS_FREE_ALLOW_LIST)[number],
  provider: ProviderId,
): ModelInfo {
  return {
    id: entry.id,
    provider,
    displayName: entry.displayName ?? entry.id,
    contextWindow: entry.contextWindow,
    free: true,
    description: entry.description,
  };
}

export class ModelScopeProvider extends OpenAICompatibleProvider {
  readonly id: ProviderId = 'modelscope';
  readonly displayName = 'ModelScope (\u9b54\u642d)';

  protected baseUrl(): string {
    return this.ctx.credentials.baseUrl ?? 'https://api-inference.modelscope.cn/v1';
  }

  async listModels(): Promise<ModelInfo[]> {
    const staticSnapshot = MS_FREE_ALLOW_LIST.map((entry) => toModelInfo(entry, this.id));

    const apiKey = this.ctx.credentials.apiKey?.trim();
    if (!apiKey) {
      return staticSnapshot;
    }

    try {
      const res = await this.fetch(`${this.baseUrl()}/models`, {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        return staticSnapshot;
      }
      const data = (await res.json()) as { data?: MSModel[] };
      const rawList = Array.isArray(data.data) ? data.data : [];
      if (rawList.length === 0) {
        return staticSnapshot;
      }

      const matched = new Map<string, ModelInfo>();
      for (const m of rawList) {
        if (!m?.id) continue;
        const canonical = MS_FREE_ALLOW_MAP.get(m.id.toLowerCase());
        if (!canonical) continue;
        matched.set(canonical.id, toModelInfo(canonical, this.id));
      }

      if (matched.size === 0) {
        return staticSnapshot;
      }
      return [...matched.values()];
    } catch {
      return staticSnapshot;
    }
  }
}
