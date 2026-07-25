import type { ChatRequest, ChatResponse, ModelInfo, ProviderId, StreamChunk } from '../types.js';
import { BaseProvider, requireKey } from './base.js';

interface OpenAILikeChoice {
  index: number;
  message?: {
    role: string;
    content: string | null;
    reasoning_content?: string | null;
    reasoning?: string | null;
  };
  delta?: {
    role?: string;
    content?: string;
    reasoning_content?: string;
    reasoning?: string;
  };
  finish_reason?: string | null;
}

interface OpenAILikeResponse {
  id: string;
  model: string;
  created: number;
  choices: OpenAILikeChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export abstract class OpenAICompatibleProvider extends BaseProvider {
  protected abstract baseUrl(): string;
  protected extraHeaders(): Record<string, string> {
    return {};
  }

  private buildHeaders(): Record<string, string> {
    const key = requireKey(this.ctx.credentials, this.id).trim();
    if (!key) {
      throw new Error(`${this.id} API key not configured`);
    }
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
      ...this.extraHeaders(),
    };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const res = await this.fetch(`${this.baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({ ...req, stream: false }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${this.id} chat failed ${res.status}: ${text}`);
    }
    const data = (await res.json()) as OpenAILikeResponse;
    const choice = data.choices[0];
    const msg = choice?.message;
    const primary = typeof msg?.content === 'string' ? msg.content : '';
    const reasoning =
      (typeof msg?.reasoning_content === 'string' ? msg.reasoning_content : '') ||
      (typeof msg?.reasoning === 'string' ? msg.reasoning : '');
    const content = primary || reasoning;
    return {
      id: data.id,
      model: data.model,
      created: data.created,
      content,
      finish_reason: (choice?.finish_reason ?? 'stop') as ChatResponse['finish_reason'],
      usage: data.usage,
    };
  }

  async *stream(req: ChatRequest): AsyncIterable<StreamChunk> {
    const res = await this.fetch(`${this.baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({ ...req, stream: true }),
    });
    if (!res.ok || !res.body) {
      const text = await res.text();
      throw new Error(`${this.id} stream failed ${res.status}: ${text}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

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
          const json = JSON.parse(payload) as OpenAILikeResponse;
          const choice = json.choices[0];
          const primaryDelta = choice?.delta?.content ?? '';
          const reasoningDelta =
            (choice?.delta?.reasoning_content ?? '') || (choice?.delta?.reasoning ?? '');
          const delta = primaryDelta || reasoningDelta;
          yield {
            id: json.id,
            model: json.model,
            created: json.created,
            delta,
            finish_reason: (choice?.finish_reason ?? null) as StreamChunk['finish_reason'],
          };
        } catch {
          // ignore malformed line
        }
      }
    }
  }

  abstract override listModels(): Promise<ModelInfo[]>;
  abstract override readonly id: ProviderId;
  abstract override readonly displayName: string;
}
