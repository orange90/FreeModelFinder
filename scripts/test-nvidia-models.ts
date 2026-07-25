import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { decryptString } from '../packages/core/src/config/crypto.ts';

const cfgPath = join(homedir(), 'Library', 'Caches', 'FreeModelFinder', 'config.json');
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const enc = cfg.providers?.nvidia?.credentials?.apiKey;
if (!enc) throw new Error('no nvidia key in config');
const apiKey = decryptString(enc);

const BASE = 'https://integrate.api.nvidia.com/v1';
const LOG = 'scripts/nvidia-test.log';
const OUT = 'scripts/nvidia-test-result.json';
writeFileSync(LOG, `start ${new Date().toISOString()} keyPrefix=${apiKey.slice(0, 8)}\n`);

function log(msg: string) {
  appendFileSync(LOG, msg + '\n');
}

async function listModels(): Promise<string[]> {
  const r = await fetch(`${BASE}/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) throw new Error(`list models ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { data: { id: string }[] };
  return j.data.map((m) => m.id);
}

async function testModel(id: string): Promise<{ id: string; ok: boolean; status: number; err?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: id,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 4,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (r.ok) {
      await r.json().catch(() => null);
      return { id, ok: true, status: r.status };
    }
    let body = '';
    try {
      body = (await r.text()).slice(0, 200);
    } catch {}
    return { id, ok: false, status: r.status, err: body };
  } catch (e) {
    return { id, ok: false, status: 0, err: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

async function pMap<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

const WHITELIST = [
  'meta/llama-3.1-8b-instruct',
  'meta/llama-3.1-70b-instruct',
  'meta/llama-3.1-405b-instruct',
  'meta/llama-3.2-1b-instruct',
  'meta/llama-3.2-3b-instruct',
  'meta/llama-3.3-70b-instruct',
  'meta/llama-4-maverick-17b-128e-instruct',
  'meta/llama-4-scout-17b-16e-instruct',
  'nvidia/llama-3.1-nemotron-70b-instruct',
  'nvidia/llama-3.1-nemotron-nano-8b-v1',
  'nvidia/llama-3.3-nemotron-super-49b-v1',
  'nvidia/nemotron-4-340b-instruct',
  'nvidia/nemotron-mini-4b-instruct',
  'mistralai/mistral-7b-instruct-v0.3',
  'mistralai/mixtral-8x7b-instruct-v0.1',
  'mistralai/mixtral-8x22b-instruct-v0.1',
  'mistralai/mistral-large',
  'mistralai/mistral-large-2-instruct',
  'mistralai/mistral-nemotron',
  'mistralai/codestral-22b-instruct-v0.1',
  'google/gemma-2-2b-it',
  'google/gemma-2-9b-it',
  'google/gemma-2-27b-it',
  'google/gemma-3-1b-it',
  'google/gemma-3-4b-it',
  'google/gemma-3-12b-it',
  'google/gemma-3-27b-it',
  'google/gemma-3n-e2b-it',
  'google/gemma-3n-e4b-it',
  'qwen/qwen2.5-7b-instruct',
  'qwen/qwen2.5-coder-7b-instruct',
  'qwen/qwen2.5-coder-32b-instruct',
  'qwen/qwen3-235b-a22b',
  'deepseek-ai/deepseek-r1',
  'deepseek-ai/deepseek-r1-distill-llama-8b',
  'deepseek-ai/deepseek-r1-distill-qwen-7b',
  'deepseek-ai/deepseek-r1-distill-qwen-14b',
  'deepseek-ai/deepseek-r1-distill-qwen-32b',
  'microsoft/phi-3-medium-4k-instruct',
  'microsoft/phi-3-mini-4k-instruct',
  'microsoft/phi-3-small-8k-instruct',
  'microsoft/phi-3.5-mini-instruct',
  'microsoft/phi-3.5-moe-instruct',
  'microsoft/phi-4-mini-instruct',
  'microsoft/phi-4-multimodal-instruct',
  '01-ai/yi-large',
  'ibm/granite-3.0-8b-instruct',
  'ibm/granite-3.0-3b-a800m-instruct',
];

async function main() {
  log('fetching /v1/models ...');
  const catalog = await listModels();
  log(`  catalog size: ${catalog.length}`);
  const targets = Array.from(new Set([...WHITELIST, ...catalog])).sort();
  log(`testing ${targets.length} models with concurrency 8 ...`);

  let done = 0;
  const results = await pMap(targets, 8, async (id) => {
    const r = await testModel(id);
    done++;
    log(`[${done}/${targets.length}] ${r.ok ? '✓' : '✗ ' + r.status} ${id} ${r.ok ? '' : (r.err ?? '').replace(/\s+/g, ' ').slice(0, 140)}`);
    return r;
  });

  const ok = results.filter((r) => r.ok).map((r) => r.id).sort();
  const bad = results.filter((r) => !r.ok);
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        ok,
        bad: bad.map((r) => ({ id: r.id, status: r.status, err: r.err })),
      },
      null,
      2,
    ),
  );
  log(`done. ok=${ok.length} bad=${bad.length}. wrote ${OUT}`);
}

main().catch((e) => {
  log('FATAL: ' + (e as Error).message);
  process.exit(1);
});
