import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const repoDir = process.cwd();
const publishDir = resolve(repoDir, 'packages/cli/dist');
const scratchDir = await mkdtemp(join(tmpdir(), 'freemodelfinder-pack-'));
const installDir = resolve(scratchDir, 'install');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

async function runCommand(command, args, options = {}) {
  return run(command, args, {
    cwd: repoDir,
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  });
}

async function getFreePort() {
  const server = createTcpServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const { port } = address;
  server.close();
  await once(server, 'close');
  return port;
}

async function waitFor(url) {
  const deadline = Date.now() + 15_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw lastError ?? new Error(`timed out waiting for ${url}`);
}

let gateway;
try {
  await runCommand(pnpmCommand, ['--filter', 'freemodelfinder', 'prepack']);

  const dryRun = await runCommand(npmCommand, ['pack', '--dry-run', '--json', publishDir]);
  const dryRunResult = JSON.parse(dryRun.stdout)[0];
  assert.ok(dryRunResult, 'npm pack --dry-run did not return package metadata');
  const files = dryRunResult.files.map((file) => file.path);
  for (const required of ['index.js', 'index.js.map', 'README.md', 'LICENSE', 'package.json']) {
    assert.ok(files.includes(required), `packed file is missing: ${required}`);
  }
  assert.ok(
    files.some((file) => file === 'ui/index.html'),
    'packed UI index is missing',
  );
  assert.ok(
    files.every(
      (file) =>
        ['index.js', 'index.js.map', 'README.md', 'LICENSE', 'package.json'].includes(file) ||
        file.startsWith('ui/'),
    ),
    `unexpected packed files: ${files.join(', ')}`,
  );
  assert.ok(
    files.every(
      (file) =>
        !/(^|\/)(\.env(?:\.|$)|master\.key$|config\.json$|src(?:\/|$)|.*\.tsbuildinfo$)/.test(file),
    ),
    'package contains a source, configuration, build-info or secret file',
  );

  const packed = await runCommand(npmCommand, [
    'pack',
    '--json',
    '--pack-destination',
    scratchDir,
    publishDir,
  ]);
  const packedResult = JSON.parse(packed.stdout)[0];
  const tarball = resolve(scratchDir, packedResult.filename);

  await writeFile(resolve(scratchDir, 'package.json'), '{"private":true}\n');
  await runCommand(
    npmCommand,
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball],
    { cwd: scratchDir },
  );
  await runCommand(npmCommand, ['audit', '--omit=dev', '--audit-level=moderate'], {
    cwd: scratchDir,
  });
  await mkdir(installDir, { recursive: true });

  const installedPackage = resolve(scratchDir, 'node_modules/freemodelfinder');
  const entry = resolve(installedPackage, 'index.js');
  const manifestText = await readFile(resolve(installedPackage, 'package.json'), 'utf8');
  assert.ok(!manifestText.includes('workspace:'), 'installed manifest contains workspace protocol');
  assert.ok(
    !manifestText.includes('@freemodelfinder/'),
    'installed manifest references private packages',
  );

  const env = {
    ...process.env,
    FORCE_COLOR: '0',
    LOG_LEVEL: 'silent',
    FREEMODELFINDER_HOME: resolve(scratchDir, 'home'),
  };
  const version = await runCommand(process.execPath, [entry, '--version'], {
    cwd: installDir,
    env,
  });
  assert.equal(version.stdout.trim(), '0.1.0');
  const status = await runCommand(process.execPath, [entry, 'status'], { cwd: installDir, env });
  assert.match(status.stdout, /FreeModelFinder/);

  const port = await getFreePort();
  gateway = spawn(process.execPath, [entry, 'serve', '--port', String(port)], {
    cwd: installDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  gateway.stderr.setEncoding('utf8').on('data', (chunk) => {
    stderr += chunk;
  });

  const origin = `http://127.0.0.1:${port}`;
  const health = await waitFor(`${origin}/healthz`);
  const healthBody = await health.json();
  assert.equal(healthBody.ok, true);
  assert.equal(healthBody.service, 'freemodelfinder');
  assert.equal(healthBody.version, '0.1.0');
  assert.equal(typeof healthBody.ts, 'number');
  const homepage = await waitFor(`${origin}/`);
  const html = await homepage.text();
  assert.match(html, /FreeModelFinder/);
  const assetPath = html.match(/(?:src|href)="(\/_next\/static\/[^"]+)"/)?.[1];
  assert.ok(assetPath, 'homepage does not reference a bundled static asset');
  await waitFor(`${origin}${assetPath}`);
  assert.equal(stderr, '', `gateway wrote to stderr: ${stderr}`);

  console.log(`package smoke test passed: ${packedResult.filename}`);
} finally {
  if (gateway && gateway.exitCode === null) {
    gateway.kill('SIGTERM');
    await once(gateway, 'exit');
  }
  await rm(scratchDir, { recursive: true, force: true });
}
