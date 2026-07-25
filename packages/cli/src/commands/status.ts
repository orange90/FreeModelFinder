import chalk from 'chalk';
import { Command } from 'commander';
import { CONFIG_PATH, loadConfig } from '@freemodelfinder/core';

export function statusCommand(): Command {
  return new Command('status')
    .description('Show current configuration and status')
    .action(async () => {
      const cfg = await loadConfig();
      console.log(chalk.bold('FreeModelFinder'));
      console.log(`config:  ${CONFIG_PATH}`);
      console.log(`port:    ${cfg.port}`);
      console.log(`default: ${cfg.defaultModel ?? chalk.yellow('(not set)')}`);
      console.log(chalk.bold('providers:'));
      for (const [id, s] of Object.entries(cfg.providers)) {
        const ok = s?.enabled && s.credentials?.apiKey;
        console.log(`  ${id.padEnd(12)} ${ok ? chalk.green('enabled') : chalk.gray('disabled')}`);
      }
    });
}
