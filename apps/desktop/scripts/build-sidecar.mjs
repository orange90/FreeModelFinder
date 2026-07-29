import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(here, '..');
const repoRoot = resolve(desktopRoot, '../..');
const triple = execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf8' }).trim();
if (!['aarch64-apple-darwin', 'x86_64-apple-darwin'].includes(triple)) {
  throw new Error(`macOS sidecar builds require an Apple target, received ${triple}`);
}

const work = join(tmpdir(), `freemodelfinder-sea-${process.pid}-${Date.now()}`);
const bundle = join(work, 'server.cjs');
const blob = join(work, 'server.blob');
const seaConfig = join(work, 'sea-config.json');
const outputDir = join(desktopRoot, 'src-tauri', 'binaries');
const output = join(outputDir, `freemodelfinder-server-${triple}`);
mkdirSync(work, { recursive: true });
mkdirSync(outputDir, { recursive: true });

try {
  await build({
    entryPoints: [join(repoRoot, 'packages/server/src/cli.ts')],
    outfile: bundle,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    sourcemap: false,
    minify: false,
    logLevel: 'info',
  });

  writeFileSync(
    seaConfig,
    `${JSON.stringify(
      {
        main: bundle,
        output: blob,
        disableExperimentalSEAWarning: true,
        useCodeCache: false,
      },
      null,
      2,
    )}\n`,
  );
  execFileSync(process.execPath, ['--experimental-sea-config', seaConfig], { stdio: 'inherit' });
  copyFileSync(process.execPath, output);
  execFileSync('codesign', ['--remove-signature', output], { stdio: 'ignore' });
  execFileSync(
    process.execPath,
    [
      join(desktopRoot, 'node_modules/postject/dist/cli.js'),
      output,
      'NODE_SEA_BLOB',
      blob,
      '--sentinel-fuse',
      'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
      '--macho-segment-name',
      'NODE_SEA',
    ],
    { stdio: 'inherit' },
  );
  execFileSync('codesign', ['--force', '--sign', '-', output], { stdio: 'inherit' });
  chmodSync(output, 0o755);
  process.stderr.write(`[desktop] built ${output}\n`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
