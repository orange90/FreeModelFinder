import { Command } from 'commander';
import chalk from 'chalk';
import { serveCommand } from './commands/serve.js';
import { modelCommand } from './commands/model.js';
import { keyCommand } from './commands/key.js';
import { chatCommand } from './commands/chat.js';
import { statusCommand } from './commands/status.js';
import packageJson from '../package.json' with { type: 'json' };

const program = new Command();
program
  .name('fmf')
  .description('FreeModelFinder - free LLM aggregator with local API gateway')
  .version(packageJson.version);

program.addCommand(serveCommand());
program.addCommand(modelCommand());
program.addCommand(keyCommand());
program.addCommand(chatCommand());
program.addCommand(statusCommand());

program.parseAsync(process.argv).catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`Error: ${message}`));
  process.exit(1);
});
