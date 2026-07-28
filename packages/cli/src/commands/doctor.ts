import chalk from 'chalk';
import { Command } from 'commander';
import { loadConfig } from '@freemodelfinder/core';
import { isIP } from 'node:net';
import { connect } from 'node:tls';

interface DoctorDependencies {
  loadConfig: typeof loadConfig;
  fetch: typeof fetch;
  inspectCertificate: (url: URL) => Promise<number>;
}

function parseHttpsRoot(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL`);
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${label} must be an HTTPS origin without a path, query, or fragment`);
  }
  return url;
}

async function inspectCertificate(url: URL): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = connect({
      host: url.hostname,
      port: Number(url.port || 443),
      servername: isIP(url.hostname) ? undefined : url.hostname,
      rejectUnauthorized: true,
    });
    socket.setTimeout(10_000);
    socket.once('secureConnect', () => {
      const validTo = Date.parse(socket.getPeerCertificate().valid_to);
      socket.end();
      if (!Number.isFinite(validTo)) reject(new Error('certificate expiry is unavailable'));
      else resolve(validTo);
    });
    socket.once('timeout', () => socket.destroy(new Error('certificate check timed out')));
    socket.once('error', reject);
  });
}

function validPort(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${label} must be an integer between 1 and 65535`);
  }
  return value;
}

export function doctorCommand(dependencies: Partial<DoctorDependencies> = {}): Command {
  const readConfig = dependencies.loadConfig ?? loadConfig;
  const request = dependencies.fetch ?? fetch;
  const readCertificate = dependencies.inspectCertificate ?? inspectCertificate;
  const doctor = new Command('doctor').description('Validate a FreeModelFinder deployment');

  doctor
    .command('server')
    .description('Check server-mode routing, authentication, and TLS')
    .requiredOption('--admin-url <url>', 'Tailscale management URL')
    .requiredOption('--public-url <url>', 'public HTTPS API URL')
    .option('--admin-port <port>', 'local management port', (v) => Number(v), 11435)
    .option('--gateway-port <port>', 'local gateway port', (v) => Number(v), 11436)
    .action(
      async (opts: {
        adminUrl: string;
        publicUrl: string;
        adminPort: number;
        gatewayPort: number;
      }) => {
        const adminUrl = parseHttpsRoot(opts.adminUrl, 'admin URL');
        const publicUrl = parseHttpsRoot(opts.publicUrl, 'public URL');
        const adminPort = validPort(opts.adminPort, 'admin port');
        const gatewayPort = validPort(opts.gatewayPort, 'gateway port');
        const config = await readConfig();
        const key = config.gateway?.apiKey;
        if (!config.gateway?.requireAuth || !key) {
          throw new Error('server-mode Gateway Key is missing or authentication is disabled');
        }

        const checks: Array<{ label: string; run: () => Promise<boolean> }> = [
          {
            label: 'local admin listener',
            run: async () => (await request(`http://127.0.0.1:${adminPort}/healthz`)).ok,
          },
          {
            label: 'local gateway listener',
            run: async () => (await request(`http://127.0.0.1:${gatewayPort}/healthz`)).ok,
          },
          {
            label: 'Tailscale management origin',
            run: async () => {
              const response = await request(new URL('/api/gateway', adminUrl), {
                headers: { origin: adminUrl.origin, 'x-fmf-client': 'ui' },
                signal: AbortSignal.timeout(10_000),
              });
              if (!response.ok) return false;
              const body = (await response.json()) as {
                mode?: string;
                authLocked?: boolean;
                publicBaseUrl?: string;
              };
              return (
                body.mode === 'server' &&
                body.authLocked === true &&
                body.publicBaseUrl === publicUrl.origin
              );
            },
          },
          {
            label: 'public API rejects missing key',
            run: async () =>
              (
                await request(new URL('/v1/models', publicUrl), {
                  signal: AbortSignal.timeout(10_000),
                })
              ).status === 401,
          },
          {
            label: 'public API rejects invalid key',
            run: async () =>
              (
                await request(new URL('/v1/models', publicUrl), {
                  headers: { authorization: 'Bearer fmf-invalid-doctor-key' },
                  signal: AbortSignal.timeout(10_000),
                })
              ).status === 401,
          },
          {
            label: 'public API accepts configured key',
            run: async () =>
              (
                await request(new URL('/v1/models', publicUrl), {
                  headers: { authorization: `Bearer ${key}` },
                  signal: AbortSignal.timeout(30_000),
                })
              ).ok,
          },
          ...['/', '/api/config', '/v1/models/refresh'].map((path) => ({
            label: `public route blocked: ${path}`,
            run: async () =>
              (
                await request(new URL(path, publicUrl), {
                  method: path.endsWith('refresh') ? 'POST' : 'GET',
                  headers: { authorization: `Bearer ${key}` },
                  signal: AbortSignal.timeout(10_000),
                })
              ).status === 404,
          })),
          {
            label: 'public certificate valid for at least 48 hours',
            run: async () => (await readCertificate(publicUrl)) - Date.now() >= 48 * 60 * 60 * 1000,
          },
        ];

        let failed = 0;
        for (const check of checks) {
          try {
            const ok = await check.run();
            if (!ok) failed += 1;
            console.log(`${ok ? chalk.green('✓') : chalk.red('✗')} ${check.label}`);
          } catch (error) {
            failed += 1;
            const message = error instanceof Error ? error.message : String(error);
            console.log(`${chalk.red('✗')} ${check.label}: ${message}`);
          }
        }
        if (failed > 0) throw new Error(`${failed} server-mode check(s) failed`);
        console.log(chalk.green('Server-mode deployment checks passed.'));
      },
    );

  return doctor;
}
