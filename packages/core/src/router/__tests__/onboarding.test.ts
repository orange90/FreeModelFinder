import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { selectOnboardingModel } from '../../onboarding.js';
import type { ModelInfo, ProviderId } from '../../types.js';

function model(provider: ProviderId, id: string, contextWindow?: number): ModelInfo {
  return { provider, id, displayName: id, contextWindow, free: true };
}

describe('selectOnboardingModel', () => {
  it('prefers the OpenRouter free router even when another model scores higher', () => {
    const selected = selectOnboardingModel(
      [model('openrouter', 'giant-405b'), model('openrouter', 'openrouter/free')],
      'openrouter',
    );
    assert.equal(selected?.id, 'openrouter/free');
  });

  it('falls back to capability score within the chosen provider', () => {
    const selected = selectOnboardingModel(
      [model('gemini', 'gemini-small'), model('gemini', 'gemini-2.5-pro')],
      'gemini',
    );
    assert.equal(selected?.id, 'gemini-2.5-pro');
  });

  it('uses the full model id as a stable tie-break and ignores other providers', () => {
    const selected = selectOnboardingModel(
      [model('gemini', 'zeta'), model('openrouter', 'openrouter/free'), model('gemini', 'alpha')],
      'gemini',
    );
    assert.equal(selected?.id, 'alpha');
  });
});
