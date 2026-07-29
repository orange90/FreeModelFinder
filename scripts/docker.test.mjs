import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);
const repoDir = resolve(import.meta.dirname, '..');
const dockerfilePath = resolve(repoDir, 'Dockerfile');
const composePath = resolve(repoDir, 'docker-compose.yml');
const dockerignorePath = resolve(repoDir, '.dockerignore');
const runDockerIntegration =
  process.env.FMF_DOCKER_INTEGRATION === '1' ||
  process.env.npm_lifecycle_event === 'test:docker:integration';

async function text(path) {
  return readFile(path, 'utf8');
}

async function docker(args, options = {}) {
  return run('docker', args, {
    cwd: repoDir,
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  });
}

async function freePort(host = '127.0.0.1') {
  const server = createTcpServer();
  server.listen(0, host);
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const { port } = address;
  server.close();
  await once(server, 'close');
  return port;
}

async function waitFor(url, init) {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return response;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
  throw lastError ?? new Error(`timed out waiting for ${url}`);
}

describe('Docker packaging contract', () => {
  it('uses a small non-root runtime with a persistent application home', async () => {
    const dockerfile = await text(dockerfilePath);
    assert.match(dockerfile, /FROM node:22-alpine AS runner/);
    assert.match(dockerfile, /ENV FREEMODELFINDER_HOME=\/data/);
    assert.match(dockerfile, /USER fmf\s+[\s\S]*VOLUME \["\/data"\]/);
    assert.match(dockerfile, /EXPOSE 11435/);
    assert.match(dockerfile, /ENTRYPOINT \["node", "\/app\/index\.js"\]/);
    const command = dockerfile.match(/^CMD (\[.*\])$/m);
    assert.ok(command?.[1], 'Dockerfile must declare a JSON-array CMD');
    assert.deepEqual(JSON.parse(command[1]).slice(0, 3), ['serve', '--port', '11435']);
  });

  it('keeps data in a named volume and checks the container-local service', async () => {
    const compose = await text(composePath);
    assert.match(compose, /FREEMODELFINDER_HOME:\s*\/data/);
    assert.match(compose, /freemodelfinder-data:\/data/);
    assert.match(compose, /(?:127\.0\.0\.1:)?11435:11435/);
    assert.match(compose, /fetch\('http:\/\/127\.0\.0\.1:11435\/(?:healthz|v1\/models)'\)/);
    assert.match(compose, /^volumes:\s*\n\s+freemodelfinder-data:/m);
  });

  it('does not send local secrets or build artifacts into the image context', async () => {
    const dockerignore = await text(dockerignorePath);
    for (const ignored of ['**/node_modules', '**/dist', '.freemodelfinder', '.env', '.git']) {
      assert.ok(
        dockerignore.split(/\r?\n/).includes(ignored),
        `.dockerignore must contain ${ignored}`,
      );
    }
  });

  it('has a Compose file accepted by the installed Docker CLI', async (context) => {
    try {
      await docker(['compose', 'version']);
    } catch {
      context.skip('Docker Compose is not installed');
      return;
    }
    const { stdout } = await docker(['compose', '-f', composePath, 'config']);
    assert.match(stdout, /target: 11435/);
    assert.match(stdout, /target: \/data/);
  });
});

describe('Docker runtime compatibility', () => {
  it(
    'serves the UI and APIs securely, persists data, and reaches host services',
    { skip: !runDockerIntegration },
    async () => {
      const suffix = `${process.pid}-${randomBytes(4).toString('hex')}`;
      const image = `freemodelfinder:test-${suffix}`;
      const container = `freemodelfinder-test-${suffix}`;
      const volume = `freemodelfinder-test-${suffix}`;
      const publishedPort = await freePort();
      const upstreamPort = await freePort('0.0.0.0');
      let built = false;
      let started = false;

      const upstream = createHttpServer(async (request, response) => {
        if (request.url === '/v1/chat/completions' && request.method === 'POST') {
          for await (const _chunk of request) {
            // Drain the request body so the mock behaves like a normal upstream.
          }
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(
            JSON.stringify({
              id: 'docker-host-response',
              model: 'host-model',
              created: 1_700_000_000,
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content: 'host reachable' },
                  finish_reason: 'stop',
                },
              ],
            }),
          );
          return;
        }
        response.writeHead(404).end();
      });

      try {
        upstream.listen(upstreamPort, '0.0.0.0');
        await once(upstream, 'listening');

        await docker(['build', '--tag', image, '.']);
        built = true;
        await docker(['volume', 'create', volume]);
        await docker([
          'run',
          '--detach',
          '--name',
          container,
          '--add-host',
          'host.docker.internal:host-gateway',
          '--publish',
          `127.0.0.1:${publishedPort}:11435`,
          '--volume',
          `${volume}:/data`,
          image,
        ]);
        started = true;

        const origin = `http://127.0.0.1:${publishedPort}`;
        const uiHeaders = {
          origin,
          'x-fmf-client': 'ui',
        };
        const health = await waitFor(`${origin}/healthz`);
        assert.equal((await health.json()).ok, true);
        assert.match(await (await waitFor(`${origin}/`)).text(), /FreeModelFinder/);

        const config = await fetch(`${origin}/api/config`, { headers: uiHeaders });
        assert.equal(config.status, 200, 'the Docker-hosted UI must reach its management API');
        const remoteManagement = await fetch(`${origin}/api/config`, {
          headers: { origin: 'https://public.example', 'x-fmf-client': 'ui' },
        });
        assert.equal(remoteManagement.status, 403);

        const provider = await fetch(`${origin}/api/providers`, {
          method: 'POST',
          headers: { ...uiHeaders, 'content-type': 'application/json' },
          body: JSON.stringify({
            provider: 'custom',
            enabled: true,
            sources: [
              {
                id: 'host',
                label: 'Host fixture',
                baseUrl: `http://host.docker.internal:${upstreamPort}/v1`,
                models: [{ id: 'host-model' }],
              },
            ],
          }),
        });
        assert.equal(provider.status, 200);

        const chat = await fetch(`${origin}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'custom:host:host-model',
            messages: [{ role: 'user', content: 'hello' }],
          }),
        });
        assert.equal(chat.status, 200);
        assert.equal((await chat.json()).choices[0].message.content, 'host reachable');

        const defaultModel = await fetch(`${origin}/api/default-model`, {
          method: 'POST',
          headers: { ...uiHeaders, 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'custom:host:host-model' }),
        });
        assert.equal(defaultModel.status, 200);
        const { stdout: keyBefore } = await docker([
          'exec',
          container,
          'node',
          '-e',
          "process.stdout.write(require('node:fs').readFileSync('/data/master.key','utf8'))",
        ]);

        await docker(['restart', container]);
        await waitFor(`${origin}/healthz`);
        const persisted = await fetch(`${origin}/api/config`, { headers: uiHeaders });
        assert.equal(persisted.status, 200);
        assert.equal((await persisted.json()).defaultModel, 'custom:host:host-model');
        const { stdout: keyAfter } = await docker([
          'exec',
          container,
          'node',
          '-e',
          "process.stdout.write(require('node:fs').readFileSync('/data/master.key','utf8'))",
        ]);
        assert.equal(keyAfter, keyBefore, 'the data volume must preserve the encryption key');
      } catch (error) {
        let logs = '';
        if (started) {
          try {
            ({ stdout: logs } = await docker(['logs', container]));
          } catch {
            // Keep the original failure when logs are unavailable.
          }
        }
        throw new Error(
          `Docker integration check failed${logs ? `\nContainer logs:\n${logs}` : ''}`,
          {
            cause: error,
          },
        );
      } finally {
        upstream.close();
        if (upstream.listening) await once(upstream, 'close');
        if (started) await docker(['rm', '--force', container]).catch(() => undefined);
        await docker(['volume', 'rm', '--force', volume]).catch(() => undefined);
        if (built) await docker(['image', 'rm', '--force', image]).catch(() => undefined);
      }
    },
  );
});
