import type { ChatRequest, ChatResponse, ModelInfo, ProviderId, StreamChunk } from '../types.js';
import { BaseProvider, requireKey } from './base.js';

const CF_STATIC_MODELS: ModelInfo[] = [
  {
    id: '@cf/meta/llama-3.1-8b-instruct',
    provider: 'cloudflare',
    displayName: 'Llama 3.1 8B Instruct',
    contextWindow: 128_000,
    free: true,
    description: 'Cloudflare Workers AI free: 10,000 neurons/day.',
  },
  {
    id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    provider: 'cloudflare',
    displayName: 'Llama 3.3 70B Instruct (fast)',
    contextWindow: 128_000,
    free: true,
  },
  {
    id: '@cf/qwen/qwen2.5-coder-32b-instruct',
    provider: 'cloudflare',
    displayName: 'Qwen2.5 Coder 32B',
    contextWindow: 32_768,
    free: true,
  },
  {
    id: '@cf/openai/gpt-oss-120b',
    provider: 'cloudflare',
    displayName: 'GPT-OSS 120B',
    contextWindow: 128_000,
    free: true,
  },
];

interface CFResponse {
  result?: {
    response?: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };
  success?: boolean;
  errors?: Array<{ message?: string }>;
}

export class CloudflareProvider extends BaseProvider {
  readonly id: ProviderId = 'cloudflare';
  readonly displayName = 'Cloudflare Workers AI';

  private accountId(): string {
    const acc =
      (this.ctx.credentials.extra?.accountId as string | undefined) ??
      process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!acc) throw new Error('cloudflare provider requires accountId in credentials.extra');
    return acc;
  }

  private baseUrl(): string {
    return (
      this.ctx.credentials.baseUrl ??
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId()}/ai/run`
    );
  }

  async listModels(): Promise<ModelInfo[]> {
    // A token without its account id cannot call Workers AI. Validate the
    // complete credential pair before advertising these static models.
    this.accountId();
    return CF_STATIC_MODELS;
  }

  private buildHeaders(): Record<string, string> {
    const key = requireKey(this.ctx.credentials, this.id);
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const res = await this.fetch(`${this.baseUrl()}/${req.model}`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        messages: req.messages,
        temperature: req.temperature,
        max_tokens: req.max_tokens,
        stream: false,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`cloudflare chat failed ${res.status}: ${text}`);
    }
    const data = (await res.json()) as CFResponse;
    if (data.success === false) {
      throw new Error(`cloudflare error: ${data.errors?.map((e) => e.message).join('; ')}`);
    }
    return {
      id: `cf-${Date.now()}`,
      model: req.model,
      created: Math.floor(Date.now() / 1000),
      content: data.result?.response ?? '',
      finish_reason: 'stop',
      usage: data.result?.usage,
    };
  }

  async *stream(req: ChatRequest): AsyncIterable<StreamChunk> {
    const res = await this.fetch(`${this.baseUrl()}/${req.model}`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        messages: req.messages,
        temperature: req.temperature,
        max_tokens: req.max_tokens,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      const text = await res.text();
      throw new Error(`cloudflare stream failed ${res.status}: ${text}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const id = `cf-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      for (const raw of parts) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const json = JSON.parse(payload) as { response?: string };
          yield {
            id,
            model: req.model,
            created,
            delta: json.response ?? '',
            finish_reason: null,
          };
        } catch {
          // ignore
        }
      }
    }
  }
}
