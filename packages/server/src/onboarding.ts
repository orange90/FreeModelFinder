import type { FastifyInstance } from 'fastify';
import {
  ProviderIdSchema,
  selectOnboardingModel,
  updateConfig,
  type AppConfig,
  type ProviderId,
  type ProviderRegistry,
} from '@freemodelfinder/core';

type OnboardingProvider = Exclude<ProviderId, 'ollama' | 'custom'>;
type OnboardingRole = 'primary' | 'fallback';

export const ONBOARDING_ENVIRONMENT_KEYS: Readonly<
  Partial<Record<OnboardingProvider, readonly string[]>>
> = {
  openrouter: ['OPENROUTER_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  siliconflow: ['SILICONFLOW_API_KEY'],
  cohere: ['COHERE_API_KEY'],
  huggingface: ['HF_TOKEN', 'HUGGINGFACE_API_KEY'],
  sensenova: ['SENSENOVA_API_KEY'],
  modelscope: ['MODELSCOPE_API_TOKEN', 'MODELSCOPE_TOKEN'],
  zhipu: ['ZHIPUAI_API_KEY'],
  nvidia: ['NVIDIA_API_KEY'],
  github: ['GH_TOKEN', 'GITHUB_TOKEN'],
};

interface ConnectBody {
  provider?: string;
  role?: OnboardingRole;
  credential?: { type?: 'input'; apiKey?: string } | { type?: 'env'; variable?: string };
}

export interface OnboardingRouteOptions {
  getRegistry: () => ProviderRegistry;
  updateRegistry: (config: AppConfig) => void;
  refreshSnapshot?: () => Promise<unknown>;
  environment?: NodeJS.ProcessEnv;
  now?: () => number;
}

function configuredProviderCount(config: AppConfig): number {
  return Object.entries(config.providers).filter(([provider, settings]) => {
    if (!settings?.enabled) return false;
    if (provider === 'custom') {
      const extra = settings.credentials?.extra as { sources?: unknown[] } | undefined;
      return !!settings.credentials?.baseUrl || !!extra?.sources?.length;
    }
    return !!settings.credentials?.apiKey;
  }).length;
}

function routeState(config: AppConfig): {
  enabled: boolean;
  strategy: 'capability' | 'speed' | 'rate-limit';
} {
  return {
    enabled: !!config.autoRoute?.enabled,
    strategy: config.autoRoute?.strategy ?? 'capability',
  };
}

function safeError(error: unknown, secret: string): string {
  let message = error instanceof Error ? error.message : String(error);
  if (secret) message = message.split(secret).join('[REDACTED]');
  return message.slice(0, 500);
}

function isOnboardingProvider(provider: ProviderId): provider is OnboardingProvider {
  return provider !== 'ollama' && provider !== 'custom';
}

export function registerOnboardingRoutes(
  app: FastifyInstance,
  options: OnboardingRouteOptions,
): void {
  const environment = options.environment ?? process.env;
  const now = options.now ?? Date.now;

  app.get('/api/onboarding/environment', async () => ({
    data: Object.entries(ONBOARDING_ENVIRONMENT_KEYS).flatMap(([provider, variables]) =>
      (variables ?? []).map((variable) => ({
        provider,
        variable,
        present: !!environment[variable]?.trim(),
      })),
    ),
  }));

  app.post('/api/onboarding/dismiss', async (_request, reply) => {
    try {
      const next = await updateConfig((config) => ({
        ...config,
        onboarding: { ...config.onboarding, dismissedAt: now() },
      }));
      options.updateRegistry(next);
      return { ok: true, onboarding: next.onboarding };
    } catch (error) {
      return reply.code(500).send({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post<{ Body: ConnectBody }>('/api/onboarding/connect', async (request, reply) => {
    const parsedProvider = ProviderIdSchema.safeParse(request.body?.provider);
    const role = request.body?.role;
    const credential = request.body?.credential;
    if (!parsedProvider.success || !isOnboardingProvider(parsedProvider.data)) {
      return reply.code(400).send({ error: 'unsupported onboarding provider' });
    }
    if (role !== 'primary' && role !== 'fallback') {
      return reply.code(400).send({ error: 'role must be primary or fallback' });
    }

    const provider = parsedProvider.data;
    let apiKey = '';
    if (credential?.type === 'input') {
      apiKey = credential.apiKey?.trim() ?? '';
    } else if (credential?.type === 'env') {
      const variable = credential.variable?.trim() ?? '';
      if (!ONBOARDING_ENVIRONMENT_KEYS[provider]?.includes(variable)) {
        return reply.code(400).send({ error: 'environment variable is not allowed for provider' });
      }
      apiKey = environment[variable]?.trim() ?? '';
    } else {
      return reply.code(400).send({ error: 'credential type must be input or env' });
    }
    if (!apiKey) return reply.code(400).send({ error: 'API key is empty' });

    let config: AppConfig;
    try {
      config = await updateConfig((current) => {
        const existing = current.providers[provider] ?? { enabled: false };
        return {
          ...current,
          onboarding: current.onboarding ?? {},
          providers: {
            ...current.providers,
            [provider]: {
              ...existing,
              enabled: true,
              credentialError: undefined,
              credentials: {
                ...existing.credentials,
                apiKey,
              },
            },
          },
        };
      });
      options.updateRegistry(config);
    } catch (error) {
      return reply.code(500).send({ error: safeError(error, apiKey) });
    }

    const registry = options.getRegistry();
    let listed: Awaited<ReturnType<ProviderRegistry['listAllModels']>>;
    try {
      listed = await registry.listAllModels(true);
    } catch (error) {
      return {
        saved: true,
        provider,
        modelsFound: 0,
        test: { status: 'skipped' as const, error: safeError(error, apiKey) },
        onboardingComplete: !!config.onboarding?.completedAt,
        autoRoute: routeState(config),
      };
    }

    const providerModels = listed.models.filter((model) => model.provider === provider);
    const selected = selectOnboardingModel(providerModels, provider);
    if (!selected) {
      const failure = listed.failedProviders.find((item) => item.id === provider)?.error;
      return {
        saved: true,
        provider,
        modelsFound: providerModels.length,
        test: {
          status: 'skipped' as const,
          error: safeError(failure || 'No verified free text models were returned.', apiKey),
        },
        onboardingComplete: !!config.onboarding?.completedAt,
        autoRoute: routeState(config),
      };
    }

    const selectedModel = `${selected.provider}:${selected.id}`;
    const startedAt = now();
    let replyText = '';
    try {
      const upstream = await registry.getProvider(provider).chat({
        model: selected.id,
        messages: [{ role: 'user', content: 'Reply with only: OK' }],
        max_tokens: 8,
        stream: false,
      });
      replyText = upstream.content.trim().slice(0, 120);
    } catch (error) {
      return {
        saved: true,
        provider,
        modelsFound: providerModels.length,
        selectedModel,
        test: {
          status: 'failed' as const,
          latencyMs: Math.max(0, now() - startedAt),
          error: safeError(error, apiKey),
        },
        onboardingComplete: !!config.onboarding?.completedAt,
        autoRoute: routeState(config),
      };
    }

    try {
      config = await updateConfig((current) => {
        if (role === 'primary') {
          return {
            ...current,
            defaultModel: selectedModel,
            onboarding: {
              ...current.onboarding,
              completedAt: now(),
              dismissedAt: undefined,
              primaryProvider: provider,
            },
          };
        }

        const providerCount = new Set(listed.models.map((model) => model.provider)).size;
        if (providerCount < 2) return current;
        return {
          ...current,
          autoRoute: {
            ...current.autoRoute,
            enabled: true,
            strategy: 'rate-limit',
            fallbackChain: [],
          },
        };
      });
      options.updateRegistry(config);
      await options.refreshSnapshot?.();
    } catch (error) {
      return reply.code(500).send({
        saved: true,
        provider,
        modelsFound: providerModels.length,
        selectedModel,
        error: safeError(error, apiKey),
      });
    }

    return {
      saved: true,
      provider,
      modelsFound: providerModels.length,
      selectedModel,
      test: {
        status: 'success' as const,
        latencyMs: Math.max(0, now() - startedAt),
        reply: replyText,
      },
      onboardingComplete: !!config.onboarding?.completedAt,
      autoRoute: routeState(config),
      configuredProviders: configuredProviderCount(config),
      primaryModel: config.defaultModel,
    };
  });
}
