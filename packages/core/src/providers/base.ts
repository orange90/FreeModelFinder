import type {
  ChatRequest,
  ChatResponse,
  ModelInfo,
  ProviderId,
  ProviderCredentials,
  QuotaWindow,
  StreamChunk,
} from '../types.js';

export interface ProviderContext {
  credentials: ProviderCredentials;
  fetchImpl?: typeof fetch;
  onResponse?: (event: {
    provider: ProviderId;
    model: string;
    status: number;
    headers: Headers;
  }) => void;
  onUsage?: (event: {
    provider: ProviderId;
    model: string;
    usage?: ChatResponse['usage'];
  }) => void;
  onQuotaWindows?: (event: { provider: ProviderId; windows: QuotaWindow[] }) => void;
}

export abstract class BaseProvider {
  abstract readonly id: ProviderId;
  abstract readonly displayName: string;

  constructor(protected ctx: ProviderContext) {}

  protected get fetch(): typeof fetch {
    return this.ctx.fetchImpl ?? globalThis.fetch;
  }

  protected observeResponse(model: string, response: Response): Response {
    this.ctx.onResponse?.({
      provider: this.id,
      model,
      status: response.status,
      headers: response.headers,
    });
    return response;
  }

  protected observeUsage(model: string, usage?: ChatResponse['usage']): void {
    this.ctx.onUsage?.({ provider: this.id, model, usage });
  }

  protected observeProviderQuota(windows: QuotaWindow[]): void {
    this.ctx.onQuotaWindows?.({ provider: this.id, windows });
  }

  abstract listModels(): Promise<ModelInfo[]>;
  abstract chat(req: ChatRequest): Promise<ChatResponse>;
  abstract stream(req: ChatRequest): AsyncIterable<StreamChunk>;
}

export function requireKey(cred: ProviderCredentials | undefined, provider: string): string {
  if (!cred?.apiKey) {
    throw new Error(`${provider} API key not configured`);
  }
  return cred.apiKey;
}
