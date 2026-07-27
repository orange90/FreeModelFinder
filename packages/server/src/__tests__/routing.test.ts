import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  ProviderRegistry,
  type AppConfig,
  type ChatRequest,
  type ChatResponse,
  type StreamChunk,
} from '@freemodelfinder/core';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../server.js';

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function response(model = 'backup'): ChatResponse {
  return {
    id: 'route-response',
    model,
    created: 1_700_000_000,
    content: 'fallback reply',
    finish_reason: 'stop',
  };
}

async function appFor(options: {
  autoRoute?: boolean;
  chatError?: Error;
  streamError?: Error;
  resolveError?: Error;
}): Promise<FastifyInstance> {
  const config: AppConfig = {
    version: 2,
    port: 11435,
    providers: {},
    autoRoute: {
      enabled: options.autoRoute ?? false,
      strategy: 'capability',
      fallbackChain: ['custom:backup'],
    },
  };
  const registry = new ProviderRegistry(config);
  const primary = {
    id: 'custom',
    async chat(_request: ChatRequest): Promise<ChatResponse> {
      if (options.chatError) throw options.chatError;
      return response('primary');
    },
    async *stream(_request: ChatRequest): AsyncGenerator<StreamChunk> {
      yield {
        id: 'route-stream',
        model: 'primary',
        created: 1_700_000_000,
        delta: 'before error',
      };
      if (options.streamError) throw options.streamError;
      yield {
        id: 'route-stream',
        model: 'primary',
        created: 1_700_000_000,
        delta: 'done',
        finish_reason: 'stop',
      };
    },
  };
  const backup = {
    id: 'custom',
    async chat(): Promise<ChatResponse> {
      return response();
    },
    async *stream(): AsyncGenerator<StreamChunk> {
      yield {
        id: 'route-stream',
        model: 'backup',
        created: 1_700_000_000,
        delta: 'fallback reply',
        finish_reason: 'stop',
      };
    },
  };
  registry.resolveModel = (model) => {
    if (options.resolveError) throw options.resolveError;
    return {
      provider: (model.includes('backup') ? backup : primary) as never,
      modelId: model.includes('backup') ? 'backup' : 'primary',
    };
  };
  registry.listAllModels = async () => ({
    models: [
      { id: 'primary', provider: 'custom', displayName: 'Primary', free: true },
      { id: 'backup', provider: 'custom', displayName: 'Backup', free: true },
    ],
    succeededProviders: ['custom'],
    failedProviders: [],
  });
  const { app } = await createServer({ registry, watchIntervalMs: 60 * 60 * 1000 });
  apps.push(app);
  return app;
}

const openAiPayload = {
  model: 'custom:primary',
  messages: [{ role: 'user', content: 'hello' }],
};
const anthropicPayload = {
  model: 'custom:primary',
  max_tokens: 32,
  messages: [{ role: 'user', content: 'hello' }],
};
const geminiPayload = { contents: [{ role: 'user', parts: [{ text: 'hello' }] }] };

describe('routing and upstream errors', () => {
  it('falls back once after a non-streaming 429 in all three protocols', async () => {
    for (const request of [
      {
        url: '/v1/chat/completions',
        payload: openAiPayload,
      },
      {
        url: '/v1/messages',
        payload: anthropicPayload,
      },
      {
        url: '/v1beta/models/custom:primary:generateContent',
        payload: geminiPayload,
      },
    ]) {
      const app = await appFor({
        autoRoute: true,
        chatError: new Error('upstream failed 429 rate limit exceeded'),
      });
      const result = await app.inject({ method: 'POST', ...request });
      assert.equal(result.statusCode, 200);
      assert.match(result.body, /fallback reply/);
      assert.match(result.body, /fmf_route_notice/);
    }
  });

  it('maps non-streaming upstream failures without hiding their message', async () => {
    const openai = await appFor({ chatError: new Error('upstream failed 503 unavailable') });
    const openaiResult = await openai.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: openAiPayload,
    });
    assert.equal(openaiResult.statusCode, 503);
    assert.match(openaiResult.body, /unavailable/);

    const anthropic = await appFor({ chatError: new Error('anthropic upstream unavailable') });
    const anthropicResult = await anthropic.inject({
      method: 'POST',
      url: '/v1/messages',
      payload: anthropicPayload,
    });
    assert.equal(anthropicResult.statusCode, 502);
    assert.match(anthropicResult.body, /unavailable/);

    const gemini = await appFor({ chatError: new Error('gemini upstream unavailable') });
    const geminiResult = await gemini.inject({
      method: 'POST',
      url: '/v1beta/models/custom:primary:generateContent',
      payload: geminiPayload,
    });
    assert.equal(geminiResult.statusCode, 500);
    assert.match(geminiResult.body, /unavailable/);
  });

  it('emits streaming errors in protocol-native event streams', async () => {
    for (const request of [
      {
        url: '/v1/chat/completions',
        payload: { ...openAiPayload, stream: true },
      },
      {
        url: '/v1/messages',
        payload: { ...anthropicPayload, stream: true },
      },
      {
        url: '/v1beta/models/custom:primary:streamGenerateContent',
        payload: geminiPayload,
      },
    ]) {
      const app = await appFor({
        autoRoute: true,
        streamError: new Error('stream failed 429 rate limit exceeded'),
      });
      const result = await app.inject({ method: 'POST', ...request });
      assert.equal(result.statusCode, 200);
      assert.match(result.body, /stream failed 429/);
    }
  });

  it('returns a client error when a streaming OpenAI model cannot be resolved', async () => {
    const app = await appFor({ resolveError: new Error('model is unavailable') });
    const result = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: { ...openAiPayload, stream: true },
    });
    assert.equal(result.statusCode, 400);
    assert.match(result.body, /model is unavailable/);
  });

  it('rejects malformed and unsupported Gemini action paths', async () => {
    const app = await appFor({});
    const malformed = await app.inject({
      method: 'POST',
      url: '/v1beta/models/no-action',
      payload: geminiPayload,
    });
    const emptyAction = await app.inject({
      method: 'POST',
      url: '/v1beta/models/model:',
      payload: geminiPayload,
    });
    assert.equal(malformed.statusCode, 404);
    assert.equal(emptyAction.statusCode, 404);
  });
});
