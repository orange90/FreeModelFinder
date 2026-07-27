import type { ModelInfo, ProviderId } from '../types.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';

interface SFModel {
  id: string;
  object?: string;
  context_length?: number;
  pricing?: { input?: string; output?: string };
}

const SF_FREE_ALLOW_LIST = [
  'Qwen/Qwen2.5-7B-Instruct',
  'Qwen/Qwen3-8B',
  'THUDM/GLM-4-9B-0414',
  'THUDM/GLM-Z1-9B-0414',
  'THUDM/GLM-4-Flash',
  'tencent/Hunyuan-MT-7B',
] as const;

const SF_FREE_ALLOW_MAP: ReadonlyMap<string, string> = new Map(
  SF_FREE_ALLOW_LIST.map((id) => [id.toLowerCase(), id]),
);

export class SiliconFlowProvider extends OpenAICompatibleProvider {
  readonly id: ProviderId = 'siliconflow';
  readonly displayName = 'SiliconFlow (\u7845\u57fa\u6d41\u52a8)';

  protected baseUrl(): string {
    return this.ctx.credentials.baseUrl ?? 'https://api.siliconflow.cn/v1';
  }

  async listModels(): Promise<ModelInfo[]> {
    const headers = { authorization: `Bearer ${this.ctx.credentials.apiKey}` };

    // Always hit the unfiltered endpoint. The `sub_type=chat` filter has been
    // observed to intermittently drop free chat models due to upstream
    // classification changes, which caused every whitelisted model to appear
    // "removed" in a single tick. The unfiltered listing is the source of
    // truth we compare against.
    const res = await this.fetch(`${this.baseUrl()}/models`, { headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`siliconflow list models failed: ${res.status}${text ? ` ${text}` : ''}`);
    }
    const data = (await res.json()) as { data?: SFModel[] };
    const rawList = Array.isArray(data.data) ? data.data : [];
    if (rawList.length === 0) {
      // An empty payload from a 200 response almost always indicates an
      // upstream anomaly (auth downgrade, temporary blank response, etc.).
      // Refuse to treat it as authoritative — throwing makes the watcher
      // mark this provider as failed and preserves the previous snapshot.
      throw new Error('siliconflow list models returned empty data');
    }

    const matched = new Map<string, ModelInfo>();
    for (const m of rawList) {
      if (!m?.id) continue;
      const canonical = SF_FREE_ALLOW_MAP.get(m.id.toLowerCase());
      if (!canonical) continue;
      // Prefer the canonical whitelist casing so the snapshot key stays
      // stable even when upstream tweaks capitalization.
      matched.set(canonical, {
        id: canonical,
        provider: this.id,
        displayName: canonical,
        contextWindow: m.context_length,
        free: true,
      });
    }

    if (matched.size === 0) {
      // The upstream returned data but none of it matches the whitelist.
      // Do not silently report "everything got removed" — surface as an error
      // so the caller can preserve the last known snapshot.
      throw new Error(
        `siliconflow list models returned ${rawList.length} entries but none matched the free whitelist`,
      );
    }

    return [...matched.values()];
  }
}
