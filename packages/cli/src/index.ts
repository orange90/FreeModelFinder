import { Command } from 'commander';
import { serveCommand } from './commands/serve.js';
import { modelCommand } from './commands/model.js';
import { keyCommand } from './commands/key.js';
import { chatCommand } from './commands/chat.js';
import { statusCommand } from './commands/status.js';

const program = new Command();
program
  .name('fmf')
  .description('FreeModelFinder - free LLM aggregator with local API gateway')
  .version('0.1.0');

program.addCommand(serveCommand());
program.addCommand(modelCommand());
program.addCommand(keyCommand());
program.addCommand(chatCommand());
program.addCommand(statusCommand());

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
