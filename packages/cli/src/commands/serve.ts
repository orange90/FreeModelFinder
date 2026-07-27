import chalk from 'chalk';
import { Command } from 'commander';
import { createServer } from '@freemodelfinder/server';
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
  findUiDir: typeof findUiDir;
  open: typeof open;
}

export function serveCommand(dependencies: Partial<ServeDependencies> = {}): Command {
  const createGateway = dependencies.createServer ?? createServer;
  const resolveUiDir = dependencies.findUiDir ?? findUiDir;
  const openBrowser = dependencies.open ?? open;
  return new Command('serve')
    .description('Start the local API gateway (OpenAI/Anthropic/Gemini compatible)')
    .option('-p, --port <port>', 'listen port', (v) => Number(v))
    .option('--open', 'open the web UI in the default browser')
    .action(async (opts: { port?: number; open?: boolean }) => {
      if (
        opts.port !== undefined &&
        (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535)
      ) {
        throw new Error('port must be an integer between 1 and 65535');
      }
      const uiDir = resolveUiDir();
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
    });
}
