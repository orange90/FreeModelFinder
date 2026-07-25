import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRateLimitError } from '../auto-router.js';
import { makeModel, makeRouter, makeSettings } from './fixtures.js';

const FUTURE = () => Date.now() + 60_000;
const PAST = () => Date.now() - 60_000;

describe('AutoRouter.isRateLimited (cooldown lookup)', () => {
  it('C1: returns null when nothing is cooling down', () => {
    const { router } = makeRouter();
    assert.equal(router.isRateLimited('gpt-4'), null);
  });

  it('C2: returns state while cooling down', () => {
    const { router } = makeRouter();
    router.markRateLimited('gpt-4', 'openrouter', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: 'x',
    });
    assert.ok(router.isRateLimited('gpt-4'));
  });

  it('C3: auto-cleans expired cooldown on lookup', () => {
    const { router } = makeRouter();
    router.markRateLimited('gpt-4', 'gemini', {
      isRateLimit: true,
      resetAt: PAST(),
      message: 'x',
    });
    assert.equal(router.isRateLimited('gpt-4'), null);
    assert.equal(router.listCooldowns().length, 0);
  });

  it('C4: cooldown lookup is case-insensitive', () => {
    const { router } = makeRouter();
    router.markRateLimited('GPT-4', 'gemini', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: 'x',
    });
    assert.ok(router.isRateLimited('gpt-4'));
    assert.ok(router.isRateLimited('GPT-4'));
  });

  it('C5: GC clears multiple expired entries; only fresh ones remain', () => {
    const { router } = makeRouter();
    router.markRateLimited('a', 'gemini', {
      isRateLimit: true,
      resetAt: PAST(),
      message: '',
    });
    router.markRateLimited('b', 'gemini', {
      isRateLimit: true,
      resetAt: PAST(),
      message: '',
    });
    router.markRateLimited('c', 'gemini', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    const list = router.listCooldowns();
    assert.equal(list.length, 1);
    assert.equal(list[0]!.model, 'c');
  });
});

describe('AutoRouter.markRateLimited', () => {
  it('M1: non-shared-quota provider writes only model-scope cooldown', () => {
    const { router } = makeRouter();
    const state = router.markRateLimited('gemini-flash', 'gemini', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: 'x',
    });
    assert.equal(state.scope, 'model');
    assert.equal(router.isProviderRateLimited('gemini'), null);
  });

  it('M2: shared-quota provider (openrouter) also writes provider-scope cooldown', () => {
    const { router } = makeRouter();
    const state = router.markRateLimited('some-free', 'openrouter', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: 'x',
    });
    assert.equal(state.scope, 'provider');
    assert.ok(router.isProviderRateLimited('openrouter'));
  });

  it('M3: repeated 429 with later resetAt extends the provider cooldown', () => {
    const { router } = makeRouter();
    const first = Date.now() + 30_000;
    const second = Date.now() + 90_000;
    router.markRateLimited('a', 'openrouter', {
      isRateLimit: true,
      resetAt: first,
      message: '',
    });
    router.markRateLimited('b', 'openrouter', {
      isRateLimit: true,
      resetAt: second,
      message: '',
    });
    const p = router.isProviderRateLimited('openrouter');
    assert.equal(p?.resetAt, second);
  });

  it('M4: repeated 429 with earlier resetAt does NOT shorten cooldown', () => {
    const { router } = makeRouter();
    const first = Date.now() + 90_000;
    const second = Date.now() + 30_000;
    router.markRateLimited('a', 'openrouter', {
      isRateLimit: true,
      resetAt: first,
      message: '',
    });
    router.markRateLimited('b', 'openrouter', {
      isRateLimit: true,
      resetAt: second,
      message: '',
    });
    const p = router.isProviderRateLimited('openrouter');
    assert.equal(p?.resetAt, first);
  });

  it('M5: undefined resetAt defaults to now + 60s', () => {
    const { router } = makeRouter();
    const before = Date.now();
    const state = router.markRateLimited('m', 'gemini', {
      isRateLimit: true,
      message: '',
    });
    assert.ok(state.resetAt >= before + 60_000 - 50);
    assert.ok(state.resetAt <= Date.now() + 60_000 + 50);
  });

  it('M6: shared-quota trigger applies to other models of same provider', async () => {
    const modelA = makeModel('a-free', 'openrouter');
    const modelB = makeModel('b-free', 'openrouter');
    const { router } = makeRouter([modelA, modelB]);
    router.markRateLimited('a-free', 'openrouter', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    // pickFallback excluding a-free should NOT return b-free because provider is cooling.
    const fb = await router.pickFallback('a-free');
    assert.equal(fb, null);
  });
});

describe('AutoRouter.preflight', () => {
  it('PF1: returns passthrough when disabled', async () => {
    const { router } = makeRouter([], makeSettings({ enabled: false }));
    const r = await router.preflight('gpt-4');
    assert.deepEqual(r, { switched: false, model: 'gpt-4' });
  });

  it('PF2: returns passthrough when requested model is not cooling', async () => {
    const { router } = makeRouter([]);
    const r = await router.preflight('gpt-4');
    assert.equal(r.switched, false);
  });

  it('PF3: switches when model is cooling and a fallback exists', async () => {
    const cooling = makeModel('cool', 'gemini');
    const alt = makeModel('llama-70b', 'cerebras');
    const { router, notices } = makeRouter([cooling, alt]);
    router.markRateLimited('cool', 'gemini', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    const r = await router.preflight('cool');
    assert.equal(r.switched, true);
    if (r.switched) {
      assert.equal(r.model.id, 'llama-70b');
    }
    assert.equal(notices.length, 1);
    assert.equal(notices[0]!.type, 'switch-away');
  });

  it('PF4: keeps original when no viable fallback exists', async () => {
    const cooling = makeModel('cool', 'gemini');
    const { router } = makeRouter([cooling]);
    router.markRateLimited('cool', 'gemini', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    const r = await router.preflight('cool');
    assert.equal(r.switched, false);
  });

  it('PF5: triggers on provider-level cooldown for shared-quota provider', async () => {
    const cool = makeModel('mistral-7b', 'openrouter');
    const alt = makeModel('flash', 'gemini');
    const { router, notices } = makeRouter([cool, alt]);
    // Mark a *different* openrouter model — should cool the whole provider.
    router.markRateLimited('other', 'openrouter', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    const r = await router.preflight('openrouter:mistral-7b');
    assert.equal(r.switched, true);
    if (r.switched) {
      assert.equal(r.model.provider, 'gemini');
    }
    assert.match(notices[0]!.reason, /免费额度已耗尽/);
  });

  it('PF6: matches cooldown by bare model name when prefixed with provider:', async () => {
    const cool = makeModel('cool', 'gemini');
    const alt = makeModel('alt', 'cerebras');
    const { router } = makeRouter([cool, alt]);
    router.markRateLimited('cool', 'gemini', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    const r = await router.preflight('gemini:cool');
    assert.equal(r.switched, true);
  });

  it('PF7: pickFallback filters out cooling models', async () => {
    const cool = makeModel('cool', 'gemini');
    const alsoCool = makeModel('also-cool', 'cerebras');
    const good = makeModel('good', 'cerebras');
    const { router } = makeRouter([cool, alsoCool, good]);
    router.markRateLimited('cool', 'gemini', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    router.markRateLimited('also-cool', 'cerebras', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    const r = await router.preflight('cool');
    assert.equal(r.switched, true);
    if (r.switched) assert.equal(r.model.id, 'good');
  });

  it('PF8: pickFallback filters out models whose provider is cooling', async () => {
    const cool = makeModel('trigger', 'openrouter');
    const otherOR = makeModel('another-or', 'openrouter');
    const good = makeModel('good', 'cerebras');
    const { router } = makeRouter([cool, otherOR, good]);
    router.markRateLimited('trigger', 'openrouter', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    const r = await router.preflight('openrouter:trigger');
    assert.equal(r.switched, true);
    if (r.switched) assert.equal(r.model.provider, 'cerebras');
  });

  it('PF9: fallbackChain wins over score', async () => {
    const cool = makeModel('cool', 'gemini');
    const preferred = makeModel('llama-70b', 'cerebras');
    const better = makeModel('llama-405b', 'cerebras');
    const { router } = makeRouter(
      [cool, preferred, better],
      makeSettings({ fallbackChain: ['cerebras:llama-70b'] }),
    );
    router.markRateLimited('cool', 'gemini', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    const r = await router.preflight('cool');
    assert.equal(r.switched, true);
    if (r.switched) assert.equal(r.model.id, 'llama-70b');
  });

  it('PF10: falls back to score when all fallbackChain entries are unavailable', async () => {
    const cool = makeModel('cool', 'gemini');
    const chainA = makeModel('chain-a', 'cerebras');
    const scoreWinner = makeModel('llama-70b', 'cerebras');
    const { router } = makeRouter(
      [cool, chainA, scoreWinner],
      makeSettings({ fallbackChain: ['cerebras:chain-a'] }),
    );
    router.markRateLimited('cool', 'gemini', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    router.markRateLimited('chain-a', 'cerebras', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    const r = await router.preflight('cool');
    assert.equal(r.switched, true);
    if (r.switched) assert.equal(r.model.id, 'llama-70b');
  });

  it('PF11: rememberPreference kicks in after first switch', async () => {
    const cool = makeModel('cool', 'gemini');
    const alt = makeModel('llama-70b', 'cerebras');
    const { router } = makeRouter([cool, alt]);
    router.markRateLimited('cool', 'gemini', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    await router.preflight('cool');
    assert.equal(router.getRememberedPreference(), 'cool');
  });

  it('PF12: originalPreference not overwritten by later switches', async () => {
    const cool1 = makeModel('cool1', 'gemini');
    const cool2 = makeModel('cool2', 'cerebras');
    const alt = makeModel('alt', 'cerebras');
    const { router } = makeRouter([cool1, cool2, alt]);
    router.markRateLimited('cool1', 'gemini', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    router.markRateLimited('cool2', 'cerebras', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    await router.preflight('cool1');
    await router.preflight('cool2');
    assert.equal(router.getRememberedPreference(), 'cool1');
  });

  it('PF13: excluded model cannot fallback to itself (case-insensitive & prefixed)', async () => {
    const cool = makeModel('COOL', 'gemini');
    const alt = makeModel('alt', 'cerebras');
    const { router } = makeRouter([cool, alt]);
    router.markRateLimited('cool', 'gemini', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    const r = await router.preflight('gemini:cool');
    assert.equal(r.switched, true);
    if (r.switched) assert.notEqual(r.model.id.toLowerCase(), 'cool');
  });
});

describe('AutoRouter.pickFallback (strategy)', () => {
  it('F1: capability picks the highest-capability model', async () => {
    const excluded = makeModel('excluded', 'gemini');
    const small = makeModel('llama-3b', 'siliconflow');
    const big = makeModel('llama-70b', 'cerebras');
    const { router } = makeRouter(
      [excluded, small, big],
      makeSettings({ strategy: 'capability' }),
    );
    const fb = await router.pickFallback('excluded');
    assert.equal(fb?.id, 'llama-70b');
  });

  it('F2: speed picks cerebras over slow models', async () => {
    const excluded = makeModel('excluded', 'gemini');
    const slow = makeModel('claude-3-opus', 'openrouter');
    const fast = makeModel('llama-3-8b', 'cerebras');
    const { router } = makeRouter(
      [excluded, slow, fast],
      makeSettings({ strategy: 'speed' }),
    );
    const fb = await router.pickFallback('excluded');
    assert.equal(fb?.provider, 'cerebras');
  });

  it('F3: rate-limit picks the profile with highest rpmLimit', async () => {
    const excluded = makeModel('excluded', 'gemini');
    const winner = makeModel('big-rpm', 'sensenova');
    const other = makeModel('small', 'siliconflow');
    const { router } = makeRouter(
      [excluded, winner, other],
      makeSettings({
        strategy: 'rate-limit',
        profiles: [
          { id: 'big-rpm', provider: 'sensenova', rpmLimit: 10_000 },
        ],
      }),
    );
    const fb = await router.pickFallback('excluded');
    assert.equal(fb?.id, 'big-rpm');
  });

  it('F4: returns null when all candidates are cooling', async () => {
    const excluded = makeModel('excluded', 'gemini');
    const a = makeModel('a', 'openrouter');
    const b = makeModel('b', 'cohere');
    const { router } = makeRouter([excluded, a, b]);
    router.markRateLimited('a', 'openrouter', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    router.markRateLimited('b', 'cohere', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    const fb = await router.pickFallback('excluded');
    assert.equal(fb, null);
  });

  it('F5: returns null for empty model list', async () => {
    const { router } = makeRouter([]);
    assert.equal(await router.pickFallback('anything'), null);
  });

  it('F6: returns null when only candidate equals excluded', async () => {
    const only = makeModel('only', 'gemini');
    const { router } = makeRouter([only]);
    assert.equal(await router.pickFallback('only'), null);
  });

  it('F7: profile aliases are matched during scoring', async () => {
    const excluded = makeModel('excluded', 'gemini');
    const other = makeModel('other-name', 'gemini');
    const { router } = makeRouter(
      [excluded, other],
      makeSettings({
        strategy: 'capability',
        profiles: [
          {
            id: 'canonical',
            provider: 'gemini',
            capabilityScore: 99,
            aliases: ['other-name'],
          },
        ],
      }),
    );
    const fb = await router.pickFallback('excluded');
    assert.equal(fb?.id, 'other-name');
  });

  it('F8: with equal scores still returns a candidate', async () => {
    const excluded = makeModel('excluded', 'gemini');
    const a = makeModel('a', 'gemini');
    const b = makeModel('b', 'gemini');
    const { router } = makeRouter([excluded, a, b]);
    const fb = await router.pickFallback('excluded');
    assert.ok(fb);
  });
});

describe('AutoRouter.maybeSwitchBack', () => {
  it('B1: returns null when nothing was remembered', async () => {
    const { router } = makeRouter();
    assert.equal(await router.maybeSwitchBack('current'), null);
  });

  it('B2: returns null when preferred == current', async () => {
    const cool = makeModel('cool', 'gemini');
    const alt = makeModel('alt', 'cerebras');
    const { router, notices } = makeRouter([cool, alt]);
    router.markRateLimited('cool', 'gemini', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    await router.preflight('cool');
    // pretend we later requested 'cool' (which is still remembered)
    notices.length = 0;
    assert.equal(await router.maybeSwitchBack('cool'), null);
  });

  it('B3: does not switch back while preferred is still cooling', async () => {
    const cool = makeModel('cool', 'gemini');
    const alt = makeModel('alt', 'cerebras');
    const { router } = makeRouter([cool, alt]);
    router.markRateLimited('cool', 'gemini', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    await router.preflight('cool');
    assert.equal(await router.maybeSwitchBack('alt'), null);
  });

  it('B4: switches back after cooldown clears and clears preference', async () => {
    const cool = makeModel('cool', 'gemini');
    const alt = makeModel('alt', 'cerebras');
    const { router } = makeRouter([cool, alt]);
    // Cool with resetAt in the past so preflight can NOT proc; but we
    // seed rememberPreference manually to isolate this path.
    router.rememberPreference('cool');
    // No active cooldown exists — should switch back.
    const notice = await router.maybeSwitchBack('alt');
    assert.ok(notice);
    assert.equal(notice?.type, 'switch-back');
    assert.equal(notice?.to, 'gemini:cool');
    assert.equal(router.getRememberedPreference(), null);
  });

  it('B5: does not switch back while preferred provider still cooling', async () => {
    const cool = makeModel('cool', 'openrouter');
    const alt = makeModel('alt', 'cerebras');
    const { router } = makeRouter([cool, alt]);
    // manually seed provider cooldown
    router.markRateLimited('cool', 'openrouter', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    router.rememberPreference('openrouter:cool');
    // clear only the model-scope cooldown; provider remains cooling
    router.clearCooldown('cool');
    assert.equal(await router.maybeSwitchBack('alt'), null);
  });

  it('B6: returns null when preferred model no longer exists in list', async () => {
    const alt = makeModel('alt', 'cerebras');
    const { router } = makeRouter([alt]);
    router.rememberPreference('vanished');
    assert.equal(await router.maybeSwitchBack('alt'), null);
  });

  it('B7: does not switch back when matched model provider is cooling (indirect)', async () => {
    const cool = makeModel('preferred', 'openrouter');
    const alt = makeModel('alt', 'cerebras');
    const { router } = makeRouter([cool, alt]);
    // provider cooling triggered by a different model
    router.markRateLimited('other', 'openrouter', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    router.rememberPreference('preferred');
    assert.equal(await router.maybeSwitchBack('alt'), null);
  });

  it('B8: preferred lookup is case-insensitive', async () => {
    const cool = makeModel('CooL', 'gemini');
    const alt = makeModel('alt', 'cerebras');
    const { router } = makeRouter([cool, alt]);
    router.rememberPreference('cool');
    const notice = await router.maybeSwitchBack('alt');
    assert.ok(notice);
  });
});

describe('AutoRouter switch-notice content', () => {
  it('N1: model-scope switch message mentions "已达到请求限制"', async () => {
    const cool = makeModel('cool', 'gemini');
    const alt = makeModel('alt', 'cerebras');
    const { router, notices } = makeRouter([cool, alt]);
    router.markRateLimited('cool', 'gemini', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    await router.preflight('cool');
    assert.match(notices[0]!.reason, /已达到请求限制/);
  });

  it('N2: provider-scope switch message names the provider and "免费额度已耗尽"', async () => {
    const cool = makeModel('any', 'openrouter');
    const alt = makeModel('alt', 'gemini');
    const { router, notices } = makeRouter([cool, alt]);
    router.markRateLimited('any', 'openrouter', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    await router.preflight('openrouter:any');
    assert.match(notices[0]!.reason, /免费额度已耗尽/);
    assert.match(notices[0]!.reason, /openrouter/);
  });

  it('N3: message includes localized strategy label', async () => {
    const cool = makeModel('cool', 'gemini');
    const alt = makeModel('alt', 'cerebras');
    const { router, notices } = makeRouter(
      [cool, alt],
      makeSettings({ strategy: 'speed' }),
    );
    router.markRateLimited('cool', 'gemini', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    await router.preflight('cool');
    assert.match(notices[0]!.reason, /速度优先/);
  });

  it('N4: resetAt is formatted as YYYY-MM-DD HH:mm:ss', async () => {
    const cool = makeModel('cool', 'gemini');
    const alt = makeModel('alt', 'cerebras');
    const { router, notices } = makeRouter([cool, alt]);
    router.markRateLimited('cool', 'gemini', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    await router.preflight('cool');
    assert.match(notices[0]!.reason, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  });

  it('N5: switch-back message contains "限制已解除"', async () => {
    const cool = makeModel('cool', 'gemini');
    const alt = makeModel('alt', 'cerebras');
    const { router, notices } = makeRouter([cool, alt]);
    router.rememberPreference('cool');
    await router.maybeSwitchBack('alt');
    assert.equal(notices.length, 1);
    assert.match(notices[0]!.reason, /限制已解除/);
  });

  it('N6: onNotice is invoked exactly once per switch', async () => {
    const cool = makeModel('cool', 'gemini');
    const alt = makeModel('alt', 'cerebras');
    const { router, notices } = makeRouter([cool, alt]);
    router.markRateLimited('cool', 'gemini', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    await router.preflight('cool');
    assert.equal(notices.length, 1);
  });
});

describe('AutoRouter — general corner cases', () => {
  it('E1: settings=undefined -> disabled and safe', async () => {
    const { router } = makeRouter([], undefined);
    assert.equal(router.isEnabled(), false);
    const r = await router.preflight('anything');
    assert.equal(r.switched, false);
  });

  it('E2: listAllModels throwing bubbles up from preflight', async () => {
    const cool = makeModel('cool', 'gemini');
    const h = makeRouter([cool]);
    h.router.markRateLimited('cool', 'gemini', {
      isRateLimit: true,
      resetAt: FUTURE(),
      message: '',
    });
    h.setListError(new Error('network down'));
    await assert.rejects(() => h.router.preflight('cool'), /network down/);
  });

  it('E3: empty-string model is safe and never matches a cooldown', async () => {
    const { router } = makeRouter();
    assert.equal(router.isRateLimited(''), null);
    const r = await router.preflight('');
    assert.equal(r.switched, false);
  });

  it('E4: cooldown with resetAt === now is treated as expired', () => {
    const { router } = makeRouter();
    router.markRateLimited('x', 'gemini', {
      isRateLimit: true,
      resetAt: Date.now(),
      message: '',
    });
    assert.equal(router.isRateLimited('x'), null);
  });

  it('E5: repeated markRateLimited on same model overwrites/updates state', () => {
    const { router } = makeRouter();
    const t1 = Date.now() + 30_000;
    const t2 = Date.now() + 90_000;
    router.markRateLimited('m', 'gemini', {
      isRateLimit: true,
      resetAt: t1,
      message: '',
    });
    router.markRateLimited('m', 'gemini', {
      isRateLimit: true,
      resetAt: t2,
      message: '',
    });
    const state = router.isRateLimited('m');
    assert.equal(state?.resetAt, t2);
  });

  it('E6: unknown strategy label defaults to capability-style', () => {
    // getStrategy returns 'capability' when settings.strategy is missing.
    const { router } = makeRouter(
      [],
      { enabled: true } as unknown as ReturnType<typeof makeSettings>,
    );
    assert.equal(router.getStrategy(), 'capability');
    assert.equal(router.strategyLabel(), '能力优先');
  });

  it('E7: empty profiles array is safe', () => {
    const { router } = makeRouter([], makeSettings({ profiles: [] }));
    assert.equal(router.getProfile('anything'), undefined);
  });

  it('parseRateLimitError composes with markRateLimited end-to-end', () => {
    const { router } = makeRouter();
    const parsed = parseRateLimitError(
      new Error('429 rate limit, retry-after: 5'),
    );
    const state = router.markRateLimited('m', 'gemini', parsed);
    assert.ok(state.resetAt > Date.now());
  });
});
