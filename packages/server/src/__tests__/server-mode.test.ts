import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { once } from 'node:events';
import { createServer as createTcpServer } from 'node:net';
import { ProviderRegistry, type AppConfig } from '@freemodelfinder/core';
import type { FastifyInstance } from 'fastify';
import { createServerRuntime, type ServerRuntime } from '../server.js';

const runtimes: ServerRuntime[] = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
});

function registry(apiKey?: string): ProviderRegistry {
  const config: AppConfig = {
    version: 2,
    port: 11435,
    providers: {},
    gateway: { apiKey, requireAuth: !!apiKey },
  };
  const value = new ProviderRegistry(config);
  value.listAllModels = async () => ({
    models: [],
    succeededProviders: [],
    failedProviders: [],
  });
  return value;
}

async function runtime(apiKey?: string): Promise<ServerRuntime> {
  const value = await createServerRuntime({
    mode: 'server',
    registry: registry(apiKey),
    adminOrigin: 'https://fmf-admin.example.ts.net',
    publicUrl: 'https://192.0.2.10',
    watchIntervalMs: 60 * 60 * 1000,
  });
  runtimes.push(value);
  return value;
}

const adminHeaders = {
  origin: 'https://fmf-admin.example.ts.net',
  'x-fmf-client': 'ui',
};

describe('server-mode runtime', () => {
  it('creates a mandatory key and exposes deployment metadata only to the admin UI', async () => {
    const value = await runtime();
    const gateway = value.registry.getConfig().gateway;
    assert.equal(gateway?.requireAuth, true);
    assert.match(gateway?.apiKey ?? '', /^fmf-/);

    const denied = await value.adminApp.inject({ method: 'GET', url: '/api/gateway' });
    const allowed = await value.adminApp.inject({
      method: 'GET',
      url: '/api/gateway',
      headers: adminHeaders,
    });
    assert.equal(denied.statusCode, 403);
    assert.equal(allowed.statusCode, 200);
    assert.deepEqual(
      {
        mode: allowed.json().mode,
        authLocked: allowed.json().authLocked,
        publicBaseUrl: allowed.json().publicBaseUrl,
        adminPort: allowed.json().adminPort,
        gatewayPort: allowed.json().gatewayPort,
      },
      {
        mode: 'server',
        authLocked: true,
        publicBaseUrl: 'https://192.0.2.10',
        adminPort: 11435,
        gatewayPort: 11436,
      },
    );
  });

  it('keeps management routes off the public gateway and always requires its key', async () => {
    const value = await runtime('fmf-server-test-key');
    const gateway = value.gatewayApp as FastifyInstance;
    for (const url of [
      '/',
      '/settings',
      '/api/config',
      '/api/onboarding/environment',
      '/v1/models/changes',
    ]) {
      const response = await gateway.inject({ method: 'GET', url, headers: adminHeaders });
      assert.equal(response.statusCode, 404, url);
    }
    const refresh = await gateway.inject({
      method: 'POST',
      url: '/v1/models/refresh',
      headers: adminHeaders,
    });
    assert.equal(refresh.statusCode, 404);

    const missing = await gateway.inject({ method: 'GET', url: '/v1/models' });
    const spoofed = await gateway.inject({
      method: 'GET',
      url: '/v1/models',
      headers: adminHeaders,
    });
    const allowed = await gateway.inject({
      method: 'GET',
      url: '/v1/models',
      headers: { authorization: 'Bearer fmf-server-test-key' },
    });
    assert.equal(missing.statusCode, 401);
    assert.equal(spoofed.statusCode, 401);
    assert.equal(allowed.statusCode, 200);
  });

  it('accepts only the exact configured admin origin and locks unsafe key operations', async () => {
    const value = await runtime('fmf-server-test-key');
    const similarOrigin = await value.adminApp.inject({
      method: 'GET',
      url: '/api/gateway',
      headers: {
        origin: 'https://evil-fmf-admin.example.ts.net',
        'x-fmf-client': 'ui',
      },
    });
    const remote = await value.adminApp.inject({
      method: 'GET',
      url: '/api/gateway',
      headers: adminHeaders,
      remoteAddress: '192.0.2.20',
    });
    const disable = await value.adminApp.inject({
      method: 'POST',
      url: '/api/gateway',
      headers: adminHeaders,
      payload: { action: 'update', requireAuth: false },
    });
    const revoke = await value.adminApp.inject({
      method: 'POST',
      url: '/api/gateway',
      headers: adminHeaders,
      payload: { action: 'revoke' },
    });
    const rotate = await value.adminApp.inject({
      method: 'POST',
      url: '/api/gateway',
      headers: adminHeaders,
      payload: { action: 'generate' },
    });
    const rotatedKey = rotate.json().apiKey as string;
    const oldKey = await value.gatewayApp!.inject({
      method: 'GET',
      url: '/v1/models',
      headers: { authorization: 'Bearer fmf-server-test-key' },
    });
    const newKey = await value.gatewayApp!.inject({
      method: 'GET',
      url: '/v1/models',
      headers: { authorization: `Bearer ${rotatedKey}` },
    });
    assert.equal(similarOrigin.statusCode, 403);
    assert.equal(remote.statusCode, 403);
    assert.equal(disable.statusCode, 409);
    assert.equal(revoke.statusCode, 409);
    assert.equal(rotate.json().requireAuth, true);
    assert.notEqual(rotatedKey, 'fmf-server-test-key');
    assert.equal(oldKey.statusCode, 401);
    assert.equal(newKey.statusCode, 200);
  });

  it('rejects invalid server-mode URLs and equal ports', async () => {
    await assert.rejects(
      createServerRuntime({
        mode: 'server',
        registry: registry('key'),
        adminOrigin: 'http://admin.example.ts.net',
        publicUrl: 'https://192.0.2.10',
      }),
      /admin origin must be a valid HTTPS URL/,
    );
    await assert.rejects(
      createServerRuntime({
        mode: 'server',
        registry: registry('key'),
        adminOrigin: 'https://admin.example.ts.net',
        publicUrl: 'https://192.0.2.10/v1',
      }),
      /public URL must not include a path/,
    );
    await assert.rejects(
      createServerRuntime({
        mode: 'server',
        registry: registry('key'),
        adminOrigin: 'https://admin.example.ts.net',
        publicUrl: 'https://192.0.2.10',
        adminPort: 11435,
        gatewayPort: 11435,
      }),
      /must be different/,
    );
  });

  it('closes the admin listener when the gateway port cannot start', async () => {
    const reserveAdmin = createTcpServer();
    reserveAdmin.listen(0, '127.0.0.1');
    await once(reserveAdmin, 'listening');
    const adminAddress = reserveAdmin.address();
    assert.ok(adminAddress && typeof adminAddress === 'object');
    const adminPort = adminAddress.port;
    reserveAdmin.close();
    await once(reserveAdmin, 'close');

    const occupied = createTcpServer();
    occupied.listen(0, '127.0.0.1');
    await once(occupied, 'listening');
    const gatewayAddress = occupied.address();
    assert.ok(gatewayAddress && typeof gatewayAddress === 'object');

    const value = await createServerRuntime({
      mode: 'server',
      registry: registry('fmf-server-test-key'),
      adminOrigin: 'https://fmf-admin.example.ts.net',
      publicUrl: 'https://192.0.2.10',
      adminPort,
      gatewayPort: gatewayAddress.port,
    });
    runtimes.push(value);
    await assert.rejects(value.listen(), (error: NodeJS.ErrnoException) => {
      assert.equal(error.code, 'EADDRINUSE');
      return true;
    });
    await assert.rejects(fetch(`http://127.0.0.1:${adminPort}/healthz`));
    occupied.close();
    await once(occupied, 'close');
  });
});
