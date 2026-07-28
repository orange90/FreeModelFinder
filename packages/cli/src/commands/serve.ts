import chalk from 'chalk';
import { Command } from 'commander';
import { createServer, createServerRuntime } from '@freemodelfinder/server';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import open from 'open';

export function findUiDir(): string | undefined {
  const candidates = [
    fileURLToPath(new URL('./ui/', import.meta.url)),
    fileURLToPath(new URL('../../../ui/out/', import.meta.url)),
  ];
  return candidates.find((candidate) => existsSync(`${candidate}/index.html`));
}

interface ServeDependencies {
  createServer: typeof createServer;
  createServerRuntime: typeof createServerRuntime;
  findUiDir: typeof findUiDir;
  open: typeof open;
}

export function serveCommand(dependencies: Partial<ServeDependencies> = {}): Command {
  const createGateway = dependencies.createServer ?? createServer;
  const createRuntime = dependencies.createServerRuntime ?? createServerRuntime;
  const resolveUiDir = dependencies.findUiDir ?? findUiDir;
  const openBrowser = dependencies.open ?? open;
  return new Command('serve')
    .description('Start FreeModelFinder in local or server mode')
    .option('--mode <mode>', 'deployment mode: local or server', 'local')
    .option('-p, --port <port>', 'listen port', (v) => Number(v))
    .option('--admin-port <port>', 'server-mode management port', (v) => Number(v), 11435)
    .option('--gateway-port <port>', 'server-mode public gateway port', (v) => Number(v), 11436)
    .option('--admin-origin <url>', 'server-mode Tailscale management origin')
    .option('--public-url <url>', 'server-mode public HTTPS base URL')
    .option('--open', 'open the web UI in the default browser')
    .action(
      async (
        opts: {
          mode: string;
          port?: number;
          adminPort: number;
          gatewayPort: number;
          adminOrigin?: string;
          publicUrl?: string;
          open?: boolean;
        },
        command: Command,
      ) => {
        if (!['local', 'server'].includes(opts.mode)) {
          throw new Error('mode must be either local or server');
        }
        if (
          opts.port !== undefined &&
          (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535)
        ) {
          throw new Error('port must be an integer between 1 and 65535');
        }
        const validatePort = (value: number, name: string) => {
          if (!Number.isInteger(value) || value < 1 || value > 65535) {
            throw new Error(`${name} must be an integer between 1 and 65535`);
          }
        };
        if (opts.mode === 'server') {
          if (command.getOptionValueSource('port') === 'cli') {
            throw new Error(
              '--port is only available in local mode; use --admin-port and --gateway-port',
            );
          }
          validatePort(opts.adminPort, 'admin port');
          validatePort(opts.gatewayPort, 'gateway port');
          if (opts.adminPort === opts.gatewayPort) {
            throw new Error('admin port and gateway port must be different');
          }
          if (!opts.adminOrigin) throw new Error('--admin-origin is required in server mode');
          if (!opts.publicUrl) throw new Error('--public-url is required in server mode');
          if (opts.open) throw new Error('--open is only available in local mode');
        } else if (
          command.getOptionValueSource('adminPort') === 'cli' ||
          command.getOptionValueSource('gatewayPort') === 'cli' ||
          opts.adminOrigin ||
          opts.publicUrl
        ) {
          throw new Error('server-mode options require --mode server');
        }
        const uiDir = resolveUiDir();
        if (opts.mode === 'server') {
          let runtime: Awaited<ReturnType<typeof createServerRuntime>>;
          try {
            runtime = await createRuntime({
              mode: 'server',
              adminPort: opts.adminPort,
              gatewayPort: opts.gatewayPort,
              adminOrigin: opts.adminOrigin,
              publicUrl: opts.publicUrl,
              uiDir,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`could not initialize server mode: ${message}`);
          }
          let urls: Awaited<ReturnType<typeof runtime.listen>>;
          try {
            urls = await runtime.listen();
          } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'EADDRINUSE') {
              throw new Error(
                `admin port ${opts.adminPort} or gateway port ${opts.gatewayPort} is already in use`,
              );
            }
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`could not start server mode: ${message}`);
          }
          let closing = false;
          const shutdown = () => {
            if (closing) return;
            closing = true;
            void runtime.close().finally(() => process.exit(0));
          };
          process.once('SIGINT', shutdown);
          process.once('SIGTERM', shutdown);
          console.log(chalk.green('✓ FreeModelFinder server mode running'));
          console.log(chalk.gray(`  Admin:          ${urls.adminUrl}`));
          console.log(chalk.gray(`  Tailscale UI:   ${opts.adminOrigin}`));
          console.log(chalk.gray(`  Gateway:        ${urls.gatewayUrl}`));
          console.log(chalk.gray(`  Public API:     ${opts.publicUrl}`));
          console.log(chalk.gray('  Authentication: required'));
          return;
        }
        let listen: Awaited<ReturnType<typeof createServer>>['listen'];
        try {
          ({ listen } = await createGateway({ port: opts.port, uiDir }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`could not load the local configuration: ${message}`);
        }
        let url: string;
        try {
          url = await listen();
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === 'EADDRINUSE') {
            throw new Error(
              `port ${opts.port ?? 11435} is already in use; stop the other process or pass --port <port>`,
            );
          }
          if (code === 'EACCES') {
            throw new Error(`permission denied while listening on port ${opts.port ?? 11435}`);
          }
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`could not start the local gateway: ${message}`);
        }
        console.log(chalk.green(`✓ FreeModelFinder gateway running at ${url}`));
        console.log(chalk.gray(`  Web UI:    ${url}`));
        console.log(chalk.gray('  OpenAI:    POST /v1/chat/completions'));
        console.log(chalk.gray('  Anthropic: POST /v1/messages'));
        console.log(chalk.gray('  Gemini:    POST /v1beta/models/{model}:generateContent'));
        console.log(chalk.gray('  Models:    GET  /v1/models'));
        if (!uiDir) {
          console.log(chalk.yellow('  Web UI assets were not found; API-only mode is active.'));
        } else if (opts.open) {
          try {
            await openBrowser(url);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.log(chalk.yellow(`  Could not open the browser automatically: ${message}`));
          }
        }
      },
    );
}
