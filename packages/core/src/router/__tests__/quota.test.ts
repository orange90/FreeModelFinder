import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseQuotaHeaders, parseResetAt, QuotaTracker } from '../../quota.js';

describe('quota header parsing', () => {
  it('parses multiple request and token windows without provider-specific code', () => {
    const now = Date.UTC(2026, 6, 26, 10, 0, 0);
    const headers = new Headers({
      'x-ratelimit-limit-requests-minute': '20',
      'x-ratelimit-remaining-requests-minute': '17',
      'x-ratelimit-reset-requests-minute': '42',
      'x-ratelimit-limit-requests-day': '500',
      'x-ratelimit-remaining-requests-day': '411',
      'x-ratelimit-reset-requests-day': '2026-07-27T00:00:00Z',
      'x-ratelimit-limit-tokens-hour': '100000',
      'x-ratelimit-remaining-tokens-hour': '75000',
    });

    const windows = parseQuotaHeaders(headers, now);
    assert.equal(windows.length, 3);
    assert.deepEqual(
      windows.map((window) => [
        window.resource,
        window.windowSeconds,
        window.limit,
        window.used,
        window.remaining,
      ]),
      [
        ['requests', 86_400, 500, 89, 411],
        ['requests', 60, 20, 3, 17],
        ['tokens', 3_600, 100_000, 25_000, 75_000],
      ],
    );
    assert.equal(windows.find((window) => window.windowSeconds === 60)?.resetAt, now + 42_000);
  });

  it('parses duration, epoch seconds and ISO reset values', () => {
    const now = Date.UTC(2026, 6, 26, 10, 0, 0);
    assert.equal(parseResetAt('1m30s', now), now + 90_000);
    assert.equal(parseResetAt(String(now / 1000 + 120), now), now + 120_000);
    assert.equal(parseResetAt('2026-07-27T00:00:00Z', now), Date.UTC(2026, 6, 27));
  });

  it('uses Retry-After as a reset-only window on limited responses', () => {
    const now = Date.UTC(2026, 6, 26, 10, 0, 0);
    const windows = parseQuotaHeaders(new Headers({ 'retry-after': '60' }), now);
    assert.equal(windows.length, 1);
    assert.equal(windows[0]?.resetAt, now + 60_000);
    assert.equal(windows[0]?.limit, undefined);
  });
});

describe('QuotaTracker', () => {
  it('combines local session usage with provider and model quota policies', () => {
    const tracker = new QuotaTracker();
    tracker.recordResponse({
      provider: 'modelscope',
      model: 'Qwen/Qwen3-32B',
      status: 200,
      headers: new Headers(),
    });
    tracker.recordUsage({
      provider: 'modelscope',
      model: 'Qwen/Qwen3-32B',
      usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
    });

    const snapshot = tracker.snapshot('modelscope', 'Qwen/Qwen3-32B');
    assert.equal(snapshot.availability, 'available');
    assert.equal(snapshot.session.requests, 1);
    assert.equal(snapshot.session.totalTokens, 6);
    assert.equal(snapshot.windows.length, 2);
    assert.deepEqual(
      snapshot.windows.map((window) => [window.scope, window.remaining]),
      [
        ['provider', 1_999],
        ['model', 199],
      ],
    );
  });

  it('prefers upstream data over a local estimate for the same resource window', () => {
    const tracker = new QuotaTracker();
    tracker.recordResponse({
      provider: 'openrouter',
      model: 'model-a',
      status: 200,
      headers: new Headers({
        'x-ratelimit-limit-requests-minute': '50',
        'x-ratelimit-remaining-requests-minute': '48',
      }),
    });
    const snapshot = tracker.snapshot('openrouter', 'model-a');
    assert.equal(snapshot.windows.length, 1);
    assert.equal(snapshot.windows[0]?.source, 'upstream');
    assert.equal(snapshot.windows[0]?.remaining, 48);
  });

  it('shares provider-scoped upstream windows with sibling models', () => {
    const tracker = new QuotaTracker();
    tracker.recordResponse({
      provider: 'openrouter',
      model: 'model-a',
      status: 200,
      headers: new Headers({
        'x-ratelimit-limit-requests-minute': '50',
        'x-ratelimit-remaining-requests-minute': '48',
      }),
    });
    const sibling = tracker.snapshot('openrouter', 'model-b');
    assert.equal(sibling.windows[0]?.source, 'upstream');
    assert.equal(sibling.windows[0]?.remaining, 48);
  });

  it('does not leak model-scoped response headers to sibling models', () => {
    const tracker = new QuotaTracker();
    tracker.recordResponse({
      provider: 'nvidia',
      model: 'model-a',
      status: 200,
      headers: new Headers({
        'x-ratelimit-limit-requests-minute': '40',
        'x-ratelimit-remaining-requests-minute': '39',
      }),
    });
    assert.equal(tracker.snapshot('nvidia', 'model-a').windows[0]?.remaining, 39);
    assert.equal(tracker.snapshot('nvidia', 'model-b').windows.length, 0);
  });

  it('keeps an OpenRouter upstream-model Retry-After local to that model', () => {
    const tracker = new QuotaTracker();
    tracker.recordResponse({
      provider: 'openrouter',
      model: 'model-a:free',
      status: 429,
      headers: new Headers({ 'retry-after': '30' }),
    });
    assert.equal(tracker.snapshot('openrouter', 'model-a:free').windows.length, 1);
    assert.equal(tracker.snapshot('openrouter', 'model-b:free').windows.length, 0);
  });

  it('decrements an account policy once and exposes the same remainder to every sibling', () => {
    const tracker = new QuotaTracker();
    tracker.recordProviderWindows('openrouter', [
      {
        resource: 'requests',
        windowSeconds: 86_400,
        limit: 1_000,
        scope: 'provider',
        source: 'local-estimate',
      },
    ]);
    tracker.recordResponse({
      provider: 'openrouter',
      model: 'model-a:free',
      status: 200,
      headers: new Headers(),
    });

    const first = tracker.snapshot('openrouter', 'model-a:free');
    const sibling = tracker.snapshot('openrouter', 'model-b:free');
    assert.equal(first.windows[0]?.remaining, 999);
    assert.equal(sibling.windows[0]?.remaining, 999);
    assert.equal(sibling.windows[0]?.scope, 'provider');
  });

  it('shares provider-window token limits across sibling models', () => {
    const tracker = new QuotaTracker();
    tracker.recordProviderWindows('modelscope', [
      {
        resource: 'tokens',
        windowSeconds: 60,
        limit: 30_000,
        scope: 'provider',
        source: 'local-estimate',
      },
    ]);
    const sibling = tracker.snapshot('modelscope', 'model-b');
    const minuteTokens = sibling.windows.find(
      (window) => window.resource === 'tokens' && window.windowSeconds === 60,
    );
    assert.equal(minuteTokens?.scope, 'provider');
    assert.equal(minuteTokens?.limit, 30_000);
  });
});
