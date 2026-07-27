import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRateLimitError } from '../auto-router.js';

describe('parseRateLimitError', () => {
  it('P1: detects HTTP 429 with "failed 429" phrasing', () => {
    const r = parseRateLimitError(new Error('request failed 429: rpm exceeded'));
    assert.equal(r.isRateLimit, true);
    assert.ok(r.resetAt && r.resetAt > Date.now(), 'has future resetAt');
  });

  it('P2: detects "Rate limit exceeded"', () => {
    const r = parseRateLimitError(new Error('Rate limit exceeded, try later'));
    assert.equal(r.isRateLimit, true);
  });

  it('P3: detects "quota exhausted"', () => {
    const r = parseRateLimitError(new Error('quota exhausted for today'));
    assert.equal(r.isRateLimit, true);
  });

  it('P4: detects Gemini "resource_exhausted"', () => {
    const r = parseRateLimitError(new Error('resource_exhausted: try later'));
    assert.equal(r.isRateLimit, true);
  });

  it('P5: parses Retry-After header value', () => {
    const before = Date.now();
    const r = parseRateLimitError(new Error('429 rpm exceeded, retry-after: 42'));
    assert.equal(r.retryAfterSec, 42);
    assert.ok(r.resetAt !== undefined);
    assert.ok(r.resetAt! >= before + 42_000 - 50);
    assert.ok(r.resetAt! <= Date.now() + 42_000 + 50);
  });

  it('P6: parses "wait 30 seconds" phrasing', () => {
    const r = parseRateLimitError(new Error('rate limit hit, please wait 30 seconds'));
    assert.equal(r.retryAfterSec, 30);
  });

  it('P7: parses ISO reset timestamp', () => {
    const iso = '2026-08-01T00:00:00Z';
    const expected = Date.parse(iso);
    const r = parseRateLimitError(new Error(`429 rate limit, reset at ${iso}`));
    assert.equal(r.resetAt, expected);
  });

  it('P8: parses epoch milliseconds', () => {
    const r = parseRateLimitError(new Error('rate limit, reset 1785283200000'));
    assert.equal(r.resetAt, 1785283200000);
  });

  it('P9: parses epoch seconds (multiplies by 1000)', () => {
    const r = parseRateLimitError(new Error('rate limit, reset 1785283200'));
    assert.equal(r.resetAt, 1785283200 * 1000);
  });

  it('P10: does not flag ordinary success message', () => {
    const r = parseRateLimitError(new Error('200 OK, all good'));
    assert.equal(r.isRateLimit, false);
    assert.equal(r.resetAt, undefined);
  });

  it('P11: safely handles null / undefined error', () => {
    const rNull = parseRateLimitError(null);
    const rUndef = parseRateLimitError(undefined);
    assert.equal(rNull.isRateLimit, false);
    assert.equal(rUndef.isRateLimit, false);
  });

  it('P12: handles string as error', () => {
    const r = parseRateLimitError('429 too many requests');
    assert.equal(r.isRateLimit, true);
  });

  it('P13: retry-after and ISO can coexist; ISO wins for resetAt', () => {
    const iso = '2026-08-01T00:00:00Z';
    const r = parseRateLimitError(new Error(`429 rate limit reset at ${iso} retry-after: 10`));
    assert.equal(r.retryAfterSec, 10);
    assert.equal(r.resetAt, Date.parse(iso));
  });

  it('P14: is case-insensitive', () => {
    const r = parseRateLimitError(new Error('TOO MANY REQUESTS'));
    assert.equal(r.isRateLimit, true);
  });

  it('P15: does not misfire on "exceeded 100 tokens" without limit/quota context', () => {
    const r = parseRateLimitError(new Error('exceeded 100 tokens in prompt'));
    assert.equal(r.isRateLimit, false);
  });
});
