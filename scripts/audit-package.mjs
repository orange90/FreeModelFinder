import { execFile } from 'node:child_process';
import { access, cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const repoDir = process.cwd();
const publishedManifest = resolve(repoDir, 'packages/cli/dist/package.json');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

try {
  await access(publishedManifest);
} catch {
  throw new Error('published manifest is missing; run `pnpm build` before `pnpm audit:prod`');
}

const scratchDir = await mkdtemp(join(tmpdir(), 'freemodelfinder-audit-'));
try {
  await cp(publishedManifest, resolve(scratchDir, 'package.json'));
  await run(
    npmCommand,
    ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'],
    {
      cwd: scratchDir,
      maxBuffer: 20 * 1024 * 1024,
      shell: process.platform === 'win32',
    },
  );
  const result = await run(npmCommand, ['audit', '--omit=dev', '--audit-level=moderate'], {
    cwd: scratchDir,
    maxBuffer: 20 * 1024 * 1024,
    shell: process.platform === 'win32',
  });
  process.stdout.write(result.stdout);
} finally {
  await rm(scratchDir, { recursive: true, force: true });
}
