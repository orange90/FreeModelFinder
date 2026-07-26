import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { ProviderRegistry, type AppConfig } from '@freemodelfinder/core';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../server.js';

describe('gateway authentication boundary', () => {
  let app: FastifyInstance;

  before(async () => {
    const config: AppConfig = {
      version: 1,
      port: 11435,
      providers: {},
      gateway: {
        apiKey: 'fmf-test-key',
        requireAuth: true,
      },
    };
    ({ app } = await createServer({
      registry: new ProviderRegistry(config),
      watchIntervalMs: 60 * 60 * 1000,
    }));
  });

  after(async () => {
    await app.close();
  });

  it('does not trust a spoofed UI header without a browser origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/models',
      headers: { 'x-fmf-client': 'ui' },
    });

    assert.equal(response.statusCode, 401);
  });

  it('trusts the UI header only from a local browser origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/models',
      headers: {
        origin: 'http://localhost:3000',
        'x-fmf-client': 'ui',
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:3000');
  });

  it('accepts the configured gateway key for non-browser clients', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/models',
      headers: { authorization: 'Bearer fmf-test-key' },
    });

    assert.equal(response.statusCode, 200);
  });

  it('does not grant CORS access to public web origins', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { origin: 'https://example.com' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  });
});
