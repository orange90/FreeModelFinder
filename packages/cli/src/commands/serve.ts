import chalk from 'chalk';
import { Command } from 'commander';
import { createServer } from '@freemodelfinder/server';

export function serveCommand(): Command {
  return new Command('serve')
    .description('Start the local API gateway (OpenAI/Anthropic/Gemini compatible)')
    .option('-p, --port <port>', 'listen port', (v) => Number(v))
    .option('-h, --host <host>', 'listen host', '127.0.0.1')
    .action(async (opts: { port?: number; host: string }) => {
      const { listen } = await createServer({ port: opts.port, host: opts.host });
      const url = await listen();
      console.log(chalk.green(`✓ FreeModelFinder gateway running at ${url}`));
      console.log(chalk.gray('  OpenAI:    POST /v1/chat/completions'));
      console.log(chalk.gray('  Anthropic: POST /v1/messages'));
      console.log(chalk.gray('  Gemini:    POST /v1beta/models/{model}:generateContent'));
      console.log(chalk.gray('  Models:    GET  /v1/models'));
    });
}
