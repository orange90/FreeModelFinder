import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { decryptString } from '../packages/core/src/config/crypto.ts';

const cfgPath = join(homedir(), 'Library', 'Caches', 'FreeModelFinder', 'config.json');
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const apiKey = decryptString(cfg.providers.nvidia.credentials.apiKey);
const BASE = 'https://integrate.api.nvidia.com/v1';
const LOG = 'scripts/nvidia-retry.log';
writeFileSync(LOG, `start ${new Date().toISOString()}\n`);
const log = (m: string) => appendFileSync(LOG, m + '\n');

const prev = JSON.parse(readFileSync('scripts/nvidia-test-result.json', 'utf8')) as {
  ok: string[];
  bad: { id: string; status: number; err?: string }[];
};

const retryTargets = prev.bad.filter((b) => b.status === 0).map((b) => b.id);
log(`retrying ${retryTargets.length} timed-out models sequentially (60s timeout each)`);

async function testModel(id: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
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
      return { id, ok: true as const, status: r.status };
    }
    return { id, ok: false as const, status: r.status, err: (await r.text().catch(() => '')).slice(0, 200) };
  } catch (e) {
    return { id, ok: false as const, status: 0, err: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const newlyOk: string[] = [];
  const stillBad: { id: string; status: number; err?: string }[] = [];
  const writeSnapshot = () => {
    const merged = {
      ok: [...new Set([...prev.ok, ...newlyOk])].sort(),
      bad: [...prev.bad.filter((b) => b.status !== 0), ...stillBad, ...retryTargets.slice(newlyOk.length + stillBad.length).map((id) => ({ id, status: -1, err: 'pending' }))].sort((a, b) => a.id.localeCompare(b.id)),
    };
    writeFileSync('scripts/nvidia-test-result.json', JSON.stringify(merged, null, 2));
  };
  for (const id of retryTargets) {
    const r = await testModel(id);
    log(`${r.ok ? '✓' : '✗ ' + r.status} ${id}${r.ok ? '' : ' :: ' + (r.err ?? '').replace(/\s+/g, ' ').slice(0, 150)}`);
    if (r.ok) newlyOk.push(id);
    else stillBad.push({ id: r.id, status: r.status, err: r.err });
    writeSnapshot();
  }
  const merged = {
    ok: [...new Set([...prev.ok, ...newlyOk])].sort(),
    bad: [...prev.bad.filter((b) => b.status !== 0), ...stillBad].sort((a, b) => a.id.localeCompare(b.id)),
  };
  writeFileSync('scripts/nvidia-test-result.json', JSON.stringify(merged, null, 2));
  log(`done. newly-ok=${newlyOk.length} still-bad=${stillBad.length}`);
}
main().catch((e) => { log('FATAL: ' + (e as Error).message); process.exit(1); });
