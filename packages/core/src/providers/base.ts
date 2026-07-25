import type {
  ChatRequest,
  ChatResponse,
  ModelInfo,
  ProviderCredentials,
  ProviderId,
  StreamChunk,
} from '../types.js';

export interface ProviderContext {
  credentials: ProviderCredentials;
  fetchImpl?: typeof fetch;
}

export abstract class BaseProvider {
  abstract readonly id: ProviderId;
  abstract readonly displayName: string;

  constructor(protected ctx: ProviderContext) {}

  protected get fetch(): typeof fetch {
    return this.ctx.fetchImpl ?? globalThis.fetch;
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
