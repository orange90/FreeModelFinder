import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ProviderRegistry } from '@freemodelfinder/core';
import { getProxyResult, installProxyFromEnv, isSupportedProxy, pickProxyUrl } from '../proxy.js';
import { ModelWatcher } from '../watcher.js';

describe('proxy environment handling', () => {
  it('uses the documented environment precedence and ignores blank values', () => {
    assert.equal(
      pickProxyUrl({ HTTPS_PROXY: ' https://secure.proxy:443 ' }),
      'https://secure.proxy:443',
    );
    assert.equal(
      pickProxyUrl({ https_proxy: 'http://lower.proxy', HTTP_PROXY: 'http://fallback.proxy' }),
      'http://lower.proxy',
    );
    assert.equal(pickProxyUrl({ ALL_PROXY: 'http://all.proxy' }), 'http://all.proxy');
    assert.equal(pickProxyUrl({ HTTPS_PROXY: '  ' }), undefined);
    assert.equal(pickProxyUrl({}), undefined);
  });

  it('accepts only HTTP proxy schemes and returns a stable install result', () => {
    assert.equal(isSupportedProxy('http://proxy.test'), true);
    assert.equal(isSupportedProxy('HTTPS://proxy.test'), true);
    assert.equal(isSupportedProxy('socks5://proxy.test'), false);
    assert.deepEqual(installProxyFromEnv(), getProxyResult());
  });
});

function registryStub(options: {
  enabled?: string[];
  list?: () => Promise<{
    models: never[];
    succeededProviders: never[];
    failedProviders: Array<{ id: 'custom'; error: string }>;
  }>;
}): ProviderRegistry {
  return {
    listEnabledProviders: () => options.enabled ?? [],
    listAllModels:
      options.list ?? (async () => ({ models: [], succeededProviders: [], failedProviders: [] })),
  } as unknown as ProviderRegistry;
}

describe('ModelWatcher', () => {
  it('starts once, skips upstream work with no providers, and stops idempotently', async () => {
    const watcher = new ModelWatcher({
      intervalMs: 60_000,
      getRegistry: () => registryStub({}),
    });
    await watcher.init();
    watcher.start();
    watcher.start();
    await watcher.tick();
    assert.equal(watcher.getStatus().running, true);
    assert.equal(watcher.getStatus().lastError, null);
    watcher.stop();
    watcher.stop();
    assert.equal(watcher.getStatus().running, false);
  });

  it('records partial provider failures and reports them through the logger', async () => {
    const calls: string[] = [];
    const logger = {
      warn: () => calls.push('warn'),
      info: () => calls.push('info'),
      debug: () => calls.push('debug'),
    };
    const watcher = new ModelWatcher({
      getRegistry: () =>
        registryStub({
          enabled: ['custom'],
          list: async () => ({
            models: [],
            succeededProviders: [],
            failedProviders: [{ id: 'custom', error: 'offline' }],
          }),
        }),
      logger: logger as never,
    });
    await watcher.init();
    await watcher.tick(true);
    assert.match(watcher.getStatus().lastError ?? '', /custom \(offline\)/);
    assert.ok(calls.includes('warn'));
  });

  it('coalesces concurrent ticks and captures thrown errors', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const watcher = new ModelWatcher({
      getRegistry: () =>
        registryStub({
          enabled: ['custom'],
          list: async () => {
            calls += 1;
            await gate;
            throw new Error('catalog failed');
          },
        }),
    });
    await watcher.init();
    const first = watcher.tick();
    const second = watcher.tick();
    release();
    await Promise.all([first, second]);
    assert.equal(calls, 1);
    assert.equal(watcher.getStatus().lastError, 'catalog failed');
  });
});
