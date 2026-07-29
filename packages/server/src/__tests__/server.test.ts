import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  ProviderRegistry,
  type AppConfig,
  type ChatRequest,
  type ChatResponse,
  type StreamChunk,
} from '@freemodelfinder/core';
import type { FastifyInstance } from 'fastify';
import { createServer, SERVER_VERSION } from '../server.js';

const localUiHeaders = {
  origin: 'http://127.0.0.1:11435',
  'x-fmf-client': 'ui',
};

function testConfig(): AppConfig {
  return {
    version: 2,
    port: 11435,
    providers: {
      custom: {
        enabled: true,
        credentials: {
          apiKey: '',
          extra: {
            sources: [
              {
                id: 'fixture',
                label: 'Fixture',
                baseUrl: 'https://fixture.invalid/v1',
                apiKey: 'source-key',
                models: [{ id: 'fixture-model' }],
              },
            ],
          },
        },
      },
    },
    gateway: { requireAuth: false },
    autoRoute: { enabled: false, strategy: 'capability' },
  };
}

function fakeRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry(testConfig());
  const response: ChatResponse = {
    id: 'fixture-response',
    model: 'fixture-model',
    created: 1_700_000_000,
    content: 'fixture reply',
    finish_reason: 'stop',
    usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
  };
  const provider = {
    id: 'custom',
    async chat(_request: ChatRequest): Promise<ChatResponse> {
      return response;
    },
    async *stream(_request: ChatRequest): AsyncGenerator<StreamChunk> {
      yield {
        id: 'fixture-stream',
        model: 'fixture-model',
        created: 1_700_000_000,
        delta: 'fixture ',
      };
      yield {
        id: 'fixture-stream',
        model: 'fixture-model',
        created: 1_700_000_000,
        delta: 'reply',
        finish_reason: 'stop',
      };
    },
  };
  registry.resolveModel = () => ({ provider: provider as never, modelId: 'fixture-model' });
  registry.listAllModels = async () => ({
    models: [
      {
        id: 'fixture-model',
        provider: 'custom',
        displayName: 'Fixture Model',
        free: true,
      },
    ],
    succeededProviders: ['custom'],
    failedProviders: [],
  });
  return registry;
}

describe('gateway surface', () => {
  let app: FastifyInstance;
  let uiDir: string;

  before(async () => {
    uiDir = await mkdtemp(join(tmpdir(), 'freemodelfinder-ui-'));
    await mkdir(join(uiDir, '_next', 'static'), { recursive: true });
    await writeFile(join(uiDir, 'index.html'), '<!doctype html><title>FreeModelFinder</title>');
    await writeFile(join(uiDir, 'settings.html'), '<!doctype html><title>Settings</title>');
    await writeFile(join(uiDir, '_next', 'static', 'app.js'), 'globalThis.__fmf = true;');
    ({ app } = await createServer({
      registry: fakeRegistry(),
      uiDir,
      watchIntervalMs: 60 * 60 * 1000,
    }));
  });

  after(async () => {
    await app.close();
    await rm(uiDir, { recursive: true, force: true });
  });

  it('reports a versioned health payload', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, 'freemodelfinder');
    assert.equal(body.version, SERVER_VERSION);
    assert.equal(typeof body.instanceId, 'string');
    assert.equal(body.desktopControlProtocol, 1);
    assert.equal(body.uiAvailable, true);
    assert.equal(typeof body.ts, 'number');
  });

  it('serves the exported UI and its assets from the gateway origin', async () => {
    const home = await app.inject({ method: 'GET', url: '/' });
    const settings = await app.inject({ method: 'GET', url: '/settings' });
    const asset = await app.inject({ method: 'GET', url: '/_next/static/app.js' });
    assert.equal(home.statusCode, 200);
    assert.match(home.body, /FreeModelFinder/);
    assert.equal(settings.statusCode, 200);
    assert.match(settings.body, /Settings/);
    assert.equal(asset.statusCode, 200);
    assert.match(asset.body, /__fmf/);
  });

  it('keeps the management API local and redacts stored custom source keys', async () => {
    const denied = await app.inject({ method: 'GET', url: '/api/config' });
    assert.equal(denied.statusCode, 403);

    const remote = await app.inject({
      method: 'GET',
      url: '/api/config',
      headers: localUiHeaders,
      remoteAddress: '192.0.2.10',
    });
    assert.equal(remote.statusCode, 403);

    const allowed = await app.inject({
      method: 'GET',
      url: '/api/config',
      headers: localUiHeaders,
    });
    assert.equal(allowed.statusCode, 200);
    assert.equal(allowed.json().custom.sources[0].hasKey, true);
    assert.doesNotMatch(allowed.body, /source-key/);
  });

  it('lists models and exposes watcher status', async () => {
    const models = await app.inject({ method: 'GET', url: '/v1/models' });
    assert.equal(models.statusCode, 200);
    assert.equal(models.json().data[0].id, 'fixture-model');

    const changes = await app.inject({ method: 'GET', url: '/v1/models/changes?limit=5' });
    assert.equal(changes.statusCode, 200);
    assert.equal(typeof changes.json().watcher.running, 'boolean');

    const refresh = await app.inject({ method: 'POST', url: '/v1/models/refresh' });
    assert.equal(refresh.statusCode, 200);
    assert.equal(refresh.json().ok, true);
  });

  it('exposes a lightweight desktop state without credentials', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/desktop/state',
      headers: localUiHeaders,
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.protocolVersion, 1);
    assert.equal(body.auto.available, true);
    assert.equal(body.auto.enabled, false);
    assert.equal(body.auto.strategy, 'capability');
    assert.equal(body.providers[0].label, 'Custom');
    assert.equal(body.providers[0].models[0].value, 'custom:fixture-model');
    assert.equal(typeof body.revision, 'number');
    assert.doesNotMatch(response.body, /source-key/);
  });

  it('validates and persists local management changes', async () => {
    const missingProvider = await app.inject({
      method: 'POST',
      url: '/api/providers',
      headers: localUiHeaders,
      payload: {},
    });
    const unsupportedProvider = await app.inject({
      method: 'POST',
      url: '/api/providers',
      headers: localUiHeaders,
      payload: { provider: 'ollama', enabled: true },
    });
    assert.equal(missingProvider.statusCode, 400);
    assert.equal(unsupportedProvider.statusCode, 400);

    const custom = await app.inject({
      method: 'POST',
      url: '/api/providers',
      headers: localUiHeaders,
      payload: {
        provider: 'custom',
        enabled: true,
        sources: [
          {
            id: 'source',
            label: 'Source',
            baseUrl: 'https://source.invalid/v1/',
            apiKey: 'new-source-key',
            models: [{ id: 'model', displayName: 'Model', contextWindow: 4096 }],
          },
          { id: '', baseUrl: '' },
        ],
      },
    });
    assert.equal(custom.statusCode, 200);

    const providerWithModels = await app.inject({
      method: 'POST',
      url: '/api/providers',
      headers: localUiHeaders,
      payload: {
        provider: 'openrouter',
        enabled: true,
        apiKey: ' provider-key ',
        baseUrl: ' https://openrouter.example/v1 ',
        models: [
          { id: ' free-model ', displayName: ' Free Model ', contextWindow: 8192 },
          { id: '', displayName: '', contextWindow: -1 },
        ],
      },
    });
    assert.equal(providerWithModels.statusCode, 200);
    const providerUpdate = await app.inject({
      method: 'POST',
      url: '/api/providers',
      headers: localUiHeaders,
      payload: { provider: 'openrouter', baseUrl: 'https://updated.example/v1' },
    });
    assert.equal(providerUpdate.statusCode, 200);
    const providerClear = await app.inject({
      method: 'POST',
      url: '/api/providers',
      headers: localUiHeaders,
      payload: { provider: 'openrouter', apiKey: '' },
    });
    assert.equal(providerClear.statusCode, 200);

    const config = await app.inject({
      method: 'GET',
      url: '/api/config',
      headers: localUiHeaders,
    });
    assert.equal(config.json().custom.sources[0].baseUrl, 'https://source.invalid/v1');
    assert.equal(config.json().custom.sources[0].hasKey, true);
    assert.doesNotMatch(config.body, /new-source-key/);

    const missingModel = await app.inject({
      method: 'POST',
      url: '/api/default-model',
      headers: localUiHeaders,
      payload: {},
    });
    const defaultModel = await app.inject({
      method: 'POST',
      url: '/api/default-model',
      headers: localUiHeaders,
      payload: { model: 'custom:source:model' },
    });
    const unavailableModel = await app.inject({
      method: 'POST',
      url: '/api/default-model',
      headers: localUiHeaders,
      payload: { model: 'custom:missing' },
    });
    const automaticModel = await app.inject({
      method: 'POST',
      url: '/api/default-model',
      headers: localUiHeaders,
      payload: { model: 'auto' },
    });
    assert.equal(missingModel.statusCode, 400);
    assert.equal(defaultModel.statusCode, 200);
    assert.equal(defaultModel.json().defaultModel, 'custom:source:model');
    assert.equal(unavailableModel.statusCode, 400);
    assert.equal(automaticModel.json().defaultModel, 'auto');

    const invalidRoute = await app.inject({
      method: 'POST',
      url: '/api/auto-route',
      headers: localUiHeaders,
      payload: { strategy: 'random' },
    });
    assert.equal(invalidRoute.statusCode, 400);
    const route = await app.inject({
      method: 'POST',
      url: '/api/auto-route',
      headers: localUiHeaders,
      payload: {
        enabled: true,
        strategy: 'speed',
        fallbackChain: ['custom:model'],
        profiles: [],
      },
    });
    assert.equal(route.statusCode, 200);
    const routeState = await app.inject({
      method: 'GET',
      url: '/api/auto-route',
      headers: localUiHeaders,
    });
    assert.equal(routeState.json().strategy, 'speed');
    const desktopRouteState = await app.inject({
      method: 'GET',
      url: '/api/desktop/state',
      headers: localUiHeaders,
    });
    assert.equal(desktopRouteState.json().auto.enabled, true);
    assert.equal(desktopRouteState.json().auto.strategy, 'speed');
    const cleared = await app.inject({
      method: 'POST',
      url: '/api/auto-route/clear-cooldown',
      headers: localUiHeaders,
      payload: {},
    });
    assert.equal(cleared.statusCode, 200);

    const generated = await app.inject({
      method: 'POST',
      url: '/api/gateway',
      headers: localUiHeaders,
      payload: { action: 'generate', requireAuth: true },
    });
    assert.equal(generated.statusCode, 200);
    assert.match(generated.json().apiKey, /^fmf-/);
    assert.equal(generated.json().requireAuth, true);
    const gateway = await app.inject({
      method: 'GET',
      url: '/api/gateway',
      headers: localUiHeaders,
    });
    assert.equal(gateway.json().hasKey, true);
    const updatedGateway = await app.inject({
      method: 'POST',
      url: '/api/gateway',
      headers: localUiHeaders,
      payload: { action: 'update', requireAuth: false },
    });
    assert.equal(updatedGateway.json().requireAuth, false);
    const revoked = await app.inject({
      method: 'POST',
      url: '/api/gateway',
      headers: localUiHeaders,
      payload: { action: 'revoke' },
    });
    assert.equal(revoked.json().hasKey, false);
    assert.equal(revoked.json().requireAuth, false);

    const clearedCustom = await app.inject({
      method: 'POST',
      url: '/api/providers',
      headers: localUiHeaders,
      payload: { provider: 'custom', clearCredentials: true },
    });
    assert.equal(clearedCustom.statusCode, 200);
  });

  it('normalizes legacy custom configuration for the UI', async () => {
    const legacyConfig = testConfig();
    legacyConfig.autoRoute = undefined;
    legacyConfig.providers = {
      openrouter: undefined,
      custom: {
        enabled: true,
        credentials: {
          apiKey: 'legacy-key',
          baseUrl: 'https://legacy.invalid/v1',
          extra: { models: [{ id: 'legacy-model' }] },
        },
      },
    };
    const legacyServer = await createServer({
      registry: new ProviderRegistry(legacyConfig),
      watchIntervalMs: 60 * 60 * 1000,
    });
    const legacy = await legacyServer.app.inject({
      method: 'GET',
      url: '/api/config',
      headers: localUiHeaders,
    });
    assert.equal(legacy.statusCode, 200);
    assert.equal(legacy.json().custom.sources[0].id, 'default');
    assert.equal(legacy.json().custom.sources[0].hasKey, true);
    const route = await legacyServer.app.inject({
      method: 'GET',
      url: '/api/auto-route',
      headers: localUiHeaders,
    });
    assert.equal(route.json().enabled, false);
    await legacyServer.app.close();
  });
});

describe('text compatibility protocols', () => {
  let app: FastifyInstance;

  before(async () => {
    ({ app } = await createServer({
      registry: fakeRegistry(),
      watchIntervalMs: 60 * 60 * 1000,
    }));
  });

  after(async () => {
    await app.close();
  });

  it('handles OpenAI non-streaming and streaming requests', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: { model: 'fixture-model', messages: [{ role: 'user', content: 'hello' }] },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().choices[0].message.content, 'fixture reply');
    assert.equal(response.json().model, 'custom:fixture-model');

    const stream = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        model: 'fixture-model',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      },
    });
    assert.equal(stream.statusCode, 200);
    assert.match(stream.headers['content-type'] ?? '', /text\/event-stream/);
    assert.match(stream.body, /fixture/);
    assert.match(stream.body, /\[DONE\]/);
  });

  it('handles Anthropic non-streaming and streaming requests', async () => {
    const payload = {
      model: 'fixture-model',
      max_tokens: 32,
      messages: [{ role: 'user', content: 'hello' }],
    };
    const response = await app.inject({ method: 'POST', url: '/v1/messages', payload });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().content[0].text, 'fixture reply');
    assert.equal(response.json().model, 'custom:fixture-model');

    const stream = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      payload: { ...payload, stream: true },
    });
    assert.equal(stream.statusCode, 200);
    assert.match(stream.body, /event: message_start/);
    assert.match(stream.body, /"text":"fixture "/);
    assert.match(stream.body, /"text":"reply"/);
    assert.match(stream.body, /event: message_stop/);
  });

  it('handles Gemini non-streaming and streaming requests', async () => {
    const payload = { contents: [{ role: 'user', parts: [{ text: 'hello' }] }] };
    const response = await app.inject({
      method: 'POST',
      url: '/v1beta/models/fixture-model:generateContent',
      payload,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().candidates[0].content.parts[0].text, 'fixture reply');

    const stream = await app.inject({
      method: 'POST',
      url: '/v1beta/models/fixture-model:streamGenerateContent',
      payload,
    });
    assert.equal(stream.statusCode, 200);
    assert.match(stream.body, /fixture/);
    assert.match(stream.body, /reply/);
  });

  it('validates malformed requests and unknown Gemini actions', async () => {
    const openai = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {},
    });
    const anthropic = await app.inject({ method: 'POST', url: '/v1/messages', payload: {} });
    const gemini = await app.inject({
      method: 'POST',
      url: '/v1beta/models/fixture-model:unknown',
      payload: { contents: [] },
    });
    assert.equal(openai.statusCode, 400);
    assert.equal(anthropic.statusCode, 400);
    assert.equal(gemini.statusCode, 404);
  });
});
