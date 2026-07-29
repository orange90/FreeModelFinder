import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { ProviderRegistry, type AppConfig } from '@freemodelfinder/core';
import { createServer } from '../server.js';
import { RUNTIME_PATH, type RuntimeDescriptor } from '../runtime.js';

const emptyConfig: AppConfig = {
  version: 2,
  port: 11435,
  providers: {},
  gateway: { requireAuth: false },
  autoRoute: { enabled: false, strategy: 'capability' },
};

describe('desktop runtime control', () => {
  it('writes an instance descriptor and requires its token to shut down', async () => {
    const server = await createServer({
      port: 0,
      registry: new ProviderRegistry(emptyConfig),
      watchIntervalMs: 60 * 60 * 1000,
    });
    const url = await server.listen(0);
    const descriptor = JSON.parse(await readFile(RUNTIME_PATH, 'utf8')) as RuntimeDescriptor;
    assert.equal(descriptor.port, Number(new URL(url).port));
    assert.equal(descriptor.pid, process.pid);
    assert.equal(descriptor.protocolVersion, 1);

    const denied = await server.app.inject({
      method: 'POST',
      url: '/api/runtime/shutdown',
      headers: {
        origin: 'tauri://localhost',
        'x-fmf-client': 'ui',
        'x-fmf-control-token': 'wrong',
      },
    });
    assert.equal(denied.statusCode, 401);

    const accepted = await server.app.inject({
      method: 'POST',
      url: '/api/runtime/shutdown',
      headers: {
        'x-fmf-control-token': descriptor.controlToken,
      },
    });
    assert.equal(accepted.statusCode, 200);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(server.app.server.listening, false);
  });
});
