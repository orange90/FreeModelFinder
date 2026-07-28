import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { after, describe, it } from 'node:test';
import { serveCommand } from '../commands/serve.js';
import { doctorCommand } from '../commands/doctor.js';

const packageDir = resolve(import.meta.dirname, '../..');
const entry = resolve(packageDir, 'src/index.ts');
const packageManifest = JSON.parse(await readFile(resolve(packageDir, 'package.json'), 'utf8')) as {
  version: string;
};
const expectedVersion = packageManifest.version;
const testRoot = await mkdtemp(join(tmpdir(), 'freemodelfinder-cli-'));

after(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

async function runCli(
  args: string[],
  options: { home?: string; input?: string } = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, ['--import', 'tsx', entry, ...args], {
    cwd: packageDir,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      LOG_LEVEL: 'silent',
      FREEMODELFINDER_HOME: options.home ?? join(testRoot, args.join('-') || 'default'),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.setEncoding('utf8').on('data', (chunk) => {
    stderr += chunk;
  });
  if (options.input !== undefined) child.stdin.end(options.input);
  else child.stdin.end();
  const [code] = (await once(child, 'exit')) as [number | null];
  return { code, stdout, stderr };
}

async function freePort(): Promise<number> {
  const server = createTcpServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  server.close();
  await once(server, 'close');
  return port;
}

describe('fmf CLI', () => {
  it('reports the package version and rejects invalid ports', async () => {
    const version = await runCli(['--version']);
    assert.equal(version.code, 0);
    assert.equal(version.stdout.trim(), expectedVersion);

    const invalid = await runCli(['serve', '--port', '70000']);
    assert.equal(invalid.code, 1);
    assert.match(invalid.stderr, /port must be an integer between 1 and 65535/);

    const missingServerOptions = await runCli(['serve', '--mode', 'server']);
    assert.equal(missingServerOptions.code, 1);
    assert.match(missingServerOptions.stderr, /--admin-origin is required/);

    const mixedPorts = await runCli([
      'serve',
      '--mode',
      'server',
      '--port',
      '12000',
      '--admin-origin',
      'https://admin.example.ts.net',
      '--public-url',
      'https://192.0.2.10',
    ]);
    assert.equal(mixedPorts.code, 1);
    assert.match(mixedPorts.stderr, /--port is only available in local mode/);
  });

  it('manages status, keys and the default model in an isolated home', async () => {
    const home = join(testRoot, 'management');
    const status = await runCli(['status'], { home });
    assert.equal(status.code, 0);
    assert.match(status.stdout, /FreeModelFinder/);
    assert.match(status.stdout, /port:\s+11435/);

    const keys = await runCli(['key', 'list'], { home });
    assert.equal(keys.code, 0);
    assert.match(keys.stdout, /OpenRouter/);
    const removed = await runCli(['key', 'remove', 'openrouter'], { home });
    assert.equal(removed.code, 0);
    assert.match(removed.stdout, /openrouter disabled/);

    const initial = await runCli(['model', 'current'], { home });
    assert.match(initial.stdout, /not set/);
    const selected = await runCli(['model', 'use', 'custom:fixture-model'], { home });
    assert.equal(selected.code, 0);
    assert.match(selected.stdout, /custom:fixture-model/);
    const current = await runCli(['model', 'current'], { home });
    assert.equal(current.stdout.trim(), 'custom:fixture-model');
  });

  it('handles empty model and chat catalogs without contacting the network', async () => {
    const home = join(testRoot, 'empty-catalog');
    const models = await runCli(['model', 'list'], { home });
    assert.equal(models.code, 0);
    assert.match(models.stdout, /No models available/);
    const chat = await runCli(['chat'], { home });
    assert.equal(chat.code, 0);
    assert.match(chat.stdout, /No models available/);
  });

  it('starts a loopback gateway that answers health checks', async () => {
    const port = await freePort();
    const home = join(testRoot, 'serve');
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', entry, 'serve', '--port', String(port)],
      {
        cwd: packageDir,
        env: {
          ...process.env,
          FORCE_COLOR: '0',
          LOG_LEVEL: 'silent',
          FREEMODELFINDER_HOME: home,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      stdout += chunk;
    });
    const deadline = Date.now() + 10_000;
    let health: Response | undefined;
    while (Date.now() < deadline) {
      try {
        health = await fetch(`http://127.0.0.1:${port}/healthz`);
        if (health.ok) break;
      } catch {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
      }
    }
    assert.ok(health?.ok, 'gateway did not become healthy');
    assert.equal(((await health.json()) as { version: string }).version, expectedVersion);
    assert.match(stdout, new RegExp(`127\\.0\\.0\\.1:${port}`));
    child.kill('SIGTERM');
    await once(child, 'exit');
  });

  it('uses the injected browser opener for --open and tolerates opener failures', async () => {
    const opened: string[] = [];
    const command = serveCommand({
      findUiDir: () => '/fixture/ui',
      createServer: async () => ({ listen: async () => 'http://127.0.0.1:11435' }) as never,
      open: async (url) => {
        opened.push(String(url));
        throw new Error('browser unavailable');
      },
    });
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      await command.parseAsync(['node', 'fmf', '--open']);
    } finally {
      console.log = originalLog;
    }
    assert.deepEqual(opened, ['http://127.0.0.1:11435']);
    assert.match(logs.join('\n'), /Could not open the browser automatically/);
  });

  it('reports configuration and port startup failures clearly', async () => {
    const configFailure = serveCommand({
      createServer: async () => {
        throw new Error('master key is invalid');
      },
    });
    await assert.rejects(
      configFailure.parseAsync(['node', 'fmf']),
      /could not load the local configuration: master key is invalid/,
    );

    const portFailure = serveCommand({
      createServer: async () =>
        ({
          listen: async () => {
            const error = new Error('listen failed') as NodeJS.ErrnoException;
            error.code = 'EADDRINUSE';
            throw error;
          },
        }) as never,
    });
    await assert.rejects(
      portFailure.parseAsync(['node', 'fmf', '--port', '12000']),
      /port 12000 is already in use/,
    );
  });

  it('starts server mode through the dual-listener runtime', async () => {
    const calls: unknown[] = [];
    const command = serveCommand({
      findUiDir: () => '/fixture/ui',
      createServerRuntime: async (options) => {
        calls.push(options);
        return {
          mode: 'server',
          adminApp: {} as never,
          gatewayApp: {} as never,
          registry: {} as never,
          listen: async () => ({
            adminUrl: 'http://127.0.0.1:12001',
            gatewayUrl: 'http://127.0.0.1:12002',
          }),
          close: async () => undefined,
        };
      },
    });
    await command.parseAsync([
      'node',
      'fmf',
      '--mode',
      'server',
      '--admin-port',
      '12001',
      '--gateway-port',
      '12002',
      '--admin-origin',
      'https://admin.example.ts.net',
      '--public-url',
      'https://192.0.2.10',
    ]);
    assert.deepEqual(calls[0], {
      mode: 'server',
      adminPort: 12001,
      gatewayPort: 12002,
      adminOrigin: 'https://admin.example.ts.net',
      publicUrl: 'https://192.0.2.10',
      uiDir: '/fixture/ui',
    });
  });

  it('runs server doctor checks without exposing the configured key', async () => {
    const requested: string[] = [];
    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => output.push(args.join(' '));
    try {
      const command = doctorCommand({
        loadConfig: async () => ({
          version: 2,
          port: 11435,
          providers: {},
          gateway: { apiKey: 'fmf-doctor-secret', requireAuth: true },
        }),
        inspectCertificate: async () => Date.now() + 72 * 60 * 60 * 1000,
        fetch: async (input, init) => {
          const url = String(input);
          requested.push(url);
          if (url.includes('/api/gateway')) {
            return Response.json({
              mode: 'server',
              authLocked: true,
              publicBaseUrl: 'https://192.0.2.10',
            });
          }
          if (url.endsWith('/healthz')) return Response.json({ ok: true });
          if (['/', '/api/config', '/v1/models/refresh'].some((path) => url.endsWith(path))) {
            return new Response('', { status: 404 });
          }
          const authorization = new Headers(init?.headers).get('authorization');
          if (authorization === 'Bearer fmf-doctor-secret') return Response.json({ data: [] });
          return new Response('', { status: 401 });
        },
      });
      await command.parseAsync([
        'node',
        'fmf',
        'server',
        '--admin-url',
        'https://admin.example.ts.net',
        '--public-url',
        'https://192.0.2.10',
      ]);
    } finally {
      console.log = originalLog;
    }
    assert.ok(requested.length >= 9);
    assert.doesNotMatch(output.join('\n'), /fmf-doctor-secret/);
    assert.match(output.join('\n'), /checks passed/);
  });
});
