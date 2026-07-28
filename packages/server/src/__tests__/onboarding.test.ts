import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  ProviderRegistry,
  updateConfig,
  type AppConfig,
  type ChatRequest,
  type ChatResponse,
  type ModelInfo,
} from '@freemodelfinder/core';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../server.js';

const localUiHeaders = {
  origin: 'http://127.0.0.1:11435',
  'x-fmf-client': 'ui',
};

function registryFixture(options: { failChat?: boolean } = {}): ProviderRegistry {
  const config: AppConfig = {
    version: 2,
    port: 11435,
    providers: {},
    gateway: { requireAuth: false },
    autoRoute: { enabled: false, strategy: 'capability' },
  };
  const registry = new ProviderRegistry(config);
  registry.listAllModels = async () => {
    const models: ModelInfo[] = [];
    for (const provider of ['openrouter', 'gemini'] as const) {
      const settings = registry.getConfig().providers[provider];
      if (!settings?.enabled || !settings.credentials?.apiKey) continue;
      models.push({
        provider,
        id: provider === 'openrouter' ? 'openrouter/free' : 'gemini-2.5-flash',
        displayName: `${provider} fixture`,
        free: true,
      });
    }
    return {
      models,
      succeededProviders: models.map((model) => model.provider),
      failedProviders: [],
    };
  };
  registry.getProvider = ((provider: 'openrouter' | 'gemini') => ({
    id: provider,
    async chat(_request: ChatRequest): Promise<ChatResponse> {
      if (options.failChat) throw new Error('upstream rejected secret-value');
      return {
        id: 'onboarding-fixture',
        model: provider,
        created: 1_700_000_000,
        content: 'OK',
        finish_reason: 'stop',
      };
    },
  })) as never;
  return registry;
}

describe('onboarding management API', () => {
  let app: FastifyInstance;

  before(async () => {
    process.env.OPENROUTER_API_KEY = 'environment-secret';
    ({ app } = await createServer({
      registry: registryFixture(),
      watchIntervalMs: 60 * 60 * 1000,
    }));
  });

  after(async () => {
    delete process.env.OPENROUTER_API_KEY;
    await app.close();
  });

  it('reports only environment variable presence on the local management surface', async () => {
    const denied = await app.inject({ method: 'GET', url: '/api/onboarding/environment' });
    assert.equal(denied.statusCode, 403);

    const response = await app.inject({
      method: 'GET',
      url: '/api/onboarding/environment',
      headers: localUiHeaders,
    });
    assert.equal(response.statusCode, 200);
    const found = response
      .json()
      .data.find((item: { variable: string }) => item.variable === 'OPENROUTER_API_KEY');
    assert.deepEqual(found, {
      provider: 'openrouter',
      variable: 'OPENROUTER_API_KEY',
      present: true,
    });
    assert.doesNotMatch(response.body, /environment-secret/);
  });

  it('rejects unsupported, empty and mismatched credentials without saving them', async () => {
    for (const payload of [
      { provider: 'custom', role: 'primary', credential: { type: 'input', apiKey: 'x' } },
      { provider: 'openrouter', role: 'primary', credential: { type: 'input', apiKey: ' ' } },
      {
        provider: 'openrouter',
        role: 'primary',
        credential: { type: 'env', variable: 'GEMINI_API_KEY' },
      },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/onboarding/connect',
        headers: localUiHeaders,
        payload,
      });
      assert.equal(response.statusCode, 400);
    }
  });

  it('connects a primary provider, preserves it, and enables rate-limit routing for fallback', async () => {
    const primary = await app.inject({
      method: 'POST',
      url: '/api/onboarding/connect',
      headers: localUiHeaders,
      payload: {
        provider: 'openrouter',
        role: 'primary',
        credential: { type: 'env', variable: 'OPENROUTER_API_KEY' },
      },
    });
    assert.equal(primary.statusCode, 200);
    assert.equal(primary.json().selectedModel, 'openrouter:openrouter/free');
    assert.equal(primary.json().test.status, 'success');
    assert.equal(primary.json().autoRoute.enabled, false);
    assert.doesNotMatch(primary.body, /environment-secret/);

    const fallback = await app.inject({
      method: 'POST',
      url: '/api/onboarding/connect',
      headers: localUiHeaders,
      payload: {
        provider: 'gemini',
        role: 'fallback',
        credential: { type: 'input', apiKey: 'gemini-secret' },
      },
    });
    assert.equal(fallback.statusCode, 200);
    assert.equal(fallback.json().test.status, 'success');
    assert.equal(fallback.json().autoRoute.enabled, true);
    assert.equal(fallback.json().autoRoute.strategy, 'rate-limit');
    assert.equal(fallback.json().primaryModel, 'openrouter:openrouter/free');
    assert.doesNotMatch(fallback.body, /gemini-secret/);

    const config = await app.inject({
      method: 'GET',
      url: '/api/config',
      headers: localUiHeaders,
    });
    assert.equal(config.json().defaultModel, 'openrouter:openrouter/free');
    assert.equal(config.json().onboarding.primaryProvider, 'openrouter');
    assert.equal(config.json().providers.openrouter.hasKey, true);
    assert.equal(config.json().providers.gemini.hasKey, true);
    assert.doesNotMatch(config.body, /environment-secret|gemini-secret/);
  });

  it('persists the explicit setup-later choice', async () => {
    const dismissed = await app.inject({
      method: 'POST',
      url: '/api/onboarding/dismiss',
      headers: localUiHeaders,
    });
    assert.equal(dismissed.statusCode, 200);
    assert.equal(typeof dismissed.json().onboarding.dismissedAt, 'number');
  });
});

describe('onboarding failure redaction', () => {
  it('keeps the key saved but redacts it from upstream test errors', async () => {
    await updateConfig((current) => ({
      ...current,
      defaultModel: undefined,
      providers: {},
      onboarding: undefined,
      autoRoute: { enabled: false, strategy: 'capability' },
    }));
    const { app } = await createServer({
      registry: registryFixture({ failChat: true }),
      watchIntervalMs: 60 * 60 * 1000,
    });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/onboarding/connect',
        headers: localUiHeaders,
        payload: {
          provider: 'openrouter',
          role: 'primary',
          credential: { type: 'input', apiKey: 'secret-value' },
        },
      });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().saved, true);
      assert.equal(response.json().test.status, 'failed');
      assert.match(response.json().test.error, /\[REDACTED\]/);
      assert.doesNotMatch(response.body, /secret-value/);
      const config = await app.inject({
        method: 'GET',
        url: '/api/config',
        headers: localUiHeaders,
      });
      assert.deepEqual(config.json().onboarding, {});
    } finally {
      await app.close();
    }
  });
});
