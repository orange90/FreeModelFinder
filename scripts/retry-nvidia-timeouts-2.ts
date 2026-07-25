import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { decryptString } from '../packages/core/src/config/crypto.ts';

const cfgPath = join(homedir(), 'Library', 'Caches', 'FreeModelFinder', 'config.json');
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const apiKey = decryptString(cfg.providers.nvidia.credentials.apiKey);
const BASE = 'https://integrate.api.nvidia.com/v1';
const LOG = 'scripts/nvidia-retry2.log';
writeFileSync(LOG, `start ${new Date().toISOString()}\n`);
const log = (m: string) => appendFileSync(LOG, m + '\n');

const prev = JSON.parse(readFileSync('scripts/nvidia-test-result.json', 'utf8')) as {
  ok: string[];
  bad: { id: string; status: number; err?: string }[];
};
const retry = prev.bad.filter((b) => b.status === 0).map((b) => b.id);
log(`retrying ${retry.length} still-aborted models with 180s timeout, 2 attempts each`);

async function testOnce(id: string, timeoutMs: number) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: id, messages: [{ role: 'user', content: 'hi' }], max_tokens: 4, stream: false }),
      signal: ctl.signal,
    });
    if (r.ok) { await r.json().catch(() => null); return { ok: true as const, status: r.status }; }
    return { ok: false as const, status: r.status, err: (await r.text().catch(() => '')).slice(0, 200) };
  } catch (e) {
    return { ok: false as const, status: 0, err: (e as Error).message };
  } finally { clearTimeout(t); }
}

async function main() {
  const newlyOk: string[] = [];
  const stillBad: { id: string; status: number; err?: string }[] = [];
  for (const id of retry) {
    let r = await testOnce(id, 180000);
    if (!r.ok && r.status === 0) {
      log(`(retry after 5s) ${id}`);
      await new Promise((res) => setTimeout(res, 5000));
      r = await testOnce(id, 180000);
    }
    log(`${r.ok ? '✓' : '✗ ' + r.status} ${id}${r.ok ? '' : ' :: ' + (r.err ?? '').replace(/\s+/g, ' ').slice(0, 150)}`);
    if (r.ok) newlyOk.push(id); else stillBad.push({ id, status: r.status, err: r.err });
    const merged = {
      ok: [...new Set([...prev.ok, ...newlyOk])].sort(),
      bad: [...prev.bad.filter((b) => b.status !== 0 && !newlyOk.includes(b.id)), ...stillBad].sort((a, b) => a.id.localeCompare(b.id)),
    };
    writeFileSync('scripts/nvidia-test-result.json', JSON.stringify(merged, null, 2));
  }
  log(`done. newly-ok=${newlyOk.length} still-bad=${stillBad.length}`);
}
main().catch((e) => { log('FATAL: ' + (e as Error).message); process.exit(1); });
