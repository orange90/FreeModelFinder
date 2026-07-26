import { loadConfig } from './config/store.js';
import {
  BaseProvider,
  CerebrasProvider,
  CloudflareProvider,
  CohereProvider,
  CustomProvider,
  DashScopeProvider,
  DeepSeekProvider,
  GeminiProvider,
  GitHubModelsProvider,
  HuggingFaceProvider,
  MistralProvider,
  ModelScopeProvider,
  NvidiaProvider,
  OpenRouterProvider,
  SenseNovaProvider,
  SiliconFlowProvider,
  ZhipuProvider,
} from './providers/index.js';
import { AutoRouter } from './router/auto-router.js';
import type { AppConfig, ModelInfo, ProviderId, ProviderCredentials, SwitchNotice } from './types.js';

const PROVIDER_CTORS: Record<
  Exclude<ProviderId, 'ollama'>,
  new (ctx: { credentials: ProviderCredentials }) => BaseProvider
> = {
  openrouter: OpenRouterProvider,
  gemini: GeminiProvider,
  zhipu: ZhipuProvider,
  siliconflow: SiliconFlowProvider,
  deepseek: DeepSeekProvider,
  modelscope: ModelScopeProvider,
  dashscope: DashScopeProvider,
  cerebras: CerebrasProvider,
  nvidia: NvidiaProvider,
  mistral: MistralProvider,
  cloudflare: CloudflareProvider,
  github: GitHubModelsProvider,
  cohere: CohereProvider,
  huggingface: HuggingFaceProvider,
  sensenova: SenseNovaProvider,
  custom: CustomProvider,
};

export interface RegistryOptions {
  config?: AppConfig;
}

export interface ListAllModelsResult {
  models: ModelInfo[];
  succeededProviders: ProviderId[];
  failedProviders: { id: ProviderId; error: string }[];
}

export class ProviderRegistry {
  private instances = new Map<ProviderId, BaseProvider>();
  private modelsCache: ListAllModelsResult | null = null;
  private cacheAt = 0;
  private autoRouter: AutoRouter;
  private noticeBuffer: SwitchNotice[] = [];

  constructor(private config: AppConfig) {
    this.autoRouter = new AutoRouter({
      getSettings: () => this.config.autoRoute,
      listAllModels: async () => (await this.listAllModels()).models,
      onNotice: (n) => {
        this.noticeBuffer.push(n);
        if (this.noticeBuffer.length > 50) this.noticeBuffer.shift();
      },
    });
  }

  static async load(): Promise<ProviderRegistry> {
    const config = await loadConfig();
    return new ProviderRegistry(config);
  }

  getConfig(): AppConfig {
    return this.config;
  }

  getAutoRouter(): AutoRouter {
    return this.autoRouter;
  }

  drainNotices(): SwitchNotice[] {
    const out = this.noticeBuffer;
    this.noticeBuffer = [];
    return out;
  }

  peekNotices(): SwitchNotice[] {
    return [...this.noticeBuffer];
  }

  updateConfig(next: AppConfig): void {
    this.config = next;
    this.instances.clear();
    this.modelsCache = null;
  }

  getProvider(id: ProviderId): BaseProvider {
    const cached = this.instances.get(id);
    if (cached) return cached;

    const settings = this.config.providers[id];
    if (!settings?.enabled || !settings.credentials?.apiKey) {
      throw new Error(`provider ${id} is not enabled or missing api key`);
    }
    if (id === 'ollama') {
      throw new Error('ollama provider not yet implemented');
    }
    const Ctor = PROVIDER_CTORS[id];
    const instance = new Ctor({ credentials: settings.credentials });
    this.instances.set(id, instance);
    return instance;
  }

  listEnabledProviders(): ProviderId[] {
    return (Object.keys(PROVIDER_CTORS) as Array<Exclude<ProviderId, 'ollama'>>).filter((id) => {
      const settings = this.config.providers[id];
      return !!(settings?.enabled && settings.credentials?.apiKey);
    });
  }

  async listAllModels(force = false): Promise<ListAllModelsResult> {
    const ttl = 5 * 60 * 1000;
    if (!force && this.modelsCache && Date.now() - this.cacheAt < ttl) {
      return this.modelsCache;
    }
    const enabled = this.listEnabledProviders();
    const results = await Promise.allSettled(
      enabled.map(async (id) => this.getProvider(id).listModels()),
    );
    const models: ModelInfo[] = [];
    const succeededProviders: ProviderId[] = [];
    const failedProviders: { id: ProviderId; error: string }[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      const id = enabled[i]!;
      if (r.status === 'fulfilled') {
        succeededProviders.push(id);
        models.push(
          ...r.value.filter(
            (model) =>
              model.free === true &&
              typeof model.id === 'string' &&
              model.id.trim().length > 0,
          ),
        );
      } else {
        const err = r.reason;
        failedProviders.push({
          id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    const deduped = new Map<string, ModelInfo>();
    for (const model of models) {
      deduped.set(`${model.provider}:${model.id}`.toLowerCase(), model);
    }
    const result: ListAllModelsResult = {
      models: [...deduped.values()],
      succeededProviders,
      failedProviders,
    };
    this.modelsCache = result;
    this.cacheAt = Date.now();
    return result;
  }

  resolveModel(modelId: string): { provider: BaseProvider; modelId: string } {
    if (modelId === 'auto' || modelId === 'default') {
      const preferred = this.config.defaultModel;
      if (preferred && preferred !== 'auto' && preferred !== 'default') {
        return this.resolveModel(preferred);
      }
      const enabled = this.listEnabledProviders();
      if (enabled.length === 0) {
        throw new Error('no provider is configured; add an API key in Settings first');
      }
      const cached = this.modelsCache?.models;
      if (cached && cached.length > 0) {
        const first = cached[0]!;
        return { provider: this.getProvider(first.provider), modelId: first.id };
      }
      throw new Error(
        'no default model available for `auto`; set a default model or wait for /v1/models to load',
      );
    }
    const sep = modelId.indexOf(':');
    if (sep > 0) {
      const providerId = modelId.slice(0, sep) as ProviderId;
      const real = modelId.slice(sep + 1);
      if (PROVIDER_CTORS[providerId as Exclude<ProviderId, 'ollama'>]) {
        return { provider: this.getProvider(providerId), modelId: real };
      }
    }
    // heuristic
    if (modelId.startsWith('gemini') || modelId.startsWith('models/gemini')) {
      return { provider: this.getProvider('gemini'), modelId: modelId.replace(/^models\//, '') };
    }
    if (
      modelId.startsWith('SenseChat') ||
      modelId.startsWith('sensenova') ||
      modelId === 'deepseek-v4-flash' ||
      modelId === 'glm-5.2'
    ) {
      try {
        return { provider: this.getProvider('sensenova'), modelId };
      } catch {
        // fallthrough
      }
    }
    if (modelId.startsWith('glm-')) {
      try {
        return { provider: this.getProvider('zhipu'), modelId };
      } catch {
        // fallthrough
      }
    }
    if (modelId.startsWith('qwen') || modelId.startsWith('Qwen/')) {
      try {
        return { provider: this.getProvider('dashscope'), modelId };
      } catch {
        try {
          return { provider: this.getProvider('siliconflow'), modelId };
        } catch {
          // fallthrough
        }
      }
    }
    if (modelId.startsWith('deepseek') || modelId.startsWith('deepseek-ai/')) {
      try {
        return { provider: this.getProvider('deepseek'), modelId };
      } catch {
        // fallthrough
      }
    }
    if (modelId.startsWith('mistral') || modelId.startsWith('codestral')) {
      try {
        return { provider: this.getProvider('mistral'), modelId };
      } catch {
        // fallthrough
      }
    }
    if (modelId.startsWith('@cf/')) {
      try {
        return { provider: this.getProvider('cloudflare'), modelId };
      } catch {
        // fallthrough
      }
    }
    if (modelId.startsWith('command-') || modelId.startsWith('c4ai-')) {
      try {
        return { provider: this.getProvider('cohere'), modelId };
      } catch {
        // fallthrough
      }
    }
    // default to openrouter
    return { provider: this.getProvider('openrouter'), modelId };
  }
}
