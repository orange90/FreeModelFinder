import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BaseProvider } from '../../providers/base.js';
import { ProviderRegistry } from '../../registry.js';
import type { AppConfig, ModelInfo, ProviderId } from '../../types.js';

function configWithProviders(providers: AppConfig['providers']): AppConfig {
  return {
    version: 1,
    port: 11435,
    providers,
  };
}

describe('ProviderRegistry model catalog', () => {
  it('ignores unknown provider keys left by older config files', () => {
    const providers = {
      openrouter: { enabled: false },
      legacy_provider: {
        enabled: true,
        credentials: { apiKey: 'legacy-key' },
      },
    } as unknown as AppConfig['providers'];
    const registry = new ProviderRegistry(configWithProviders(providers));

    assert.deepEqual(registry.listEnabledProviders(), []);
  });

  it('filters paid entries and deduplicates provider/model ids', async () => {
    const registry = new ProviderRegistry(
      configWithProviders({
        openrouter: {
          enabled: true,
          credentials: { apiKey: 'test-key' },
        },
      }),
    );
    const entries: ModelInfo[] = [
      {
        id: 'vendor/free:free',
        provider: 'openrouter',
        displayName: 'First',
        free: true,
      },
      {
        id: 'VENDOR/FREE:FREE',
        provider: 'openrouter',
        displayName: 'Duplicate',
        free: true,
      },
      {
        id: 'vendor/paid',
        provider: 'openrouter',
        displayName: 'Paid',
        free: false,
      },
    ];
    const fakeProvider = {
      id: 'openrouter' as ProviderId,
      displayName: 'Fake OpenRouter',
      listModels: async () => entries,
    } as unknown as BaseProvider;
    const internals = registry as unknown as {
      instances: Map<ProviderId, BaseProvider>;
    };
    internals.instances.set('openrouter', fakeProvider);

    const result = await registry.listAllModels(true);

    assert.equal(result.models.length, 1);
    assert.equal(result.models[0]?.displayName, 'Duplicate');
    assert.deepEqual(result.succeededProviders, ['openrouter']);
    assert.deepEqual(result.failedProviders, []);
  });
});
