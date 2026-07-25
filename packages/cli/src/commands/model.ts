import chalk from 'chalk';
import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import { ProviderRegistry, loadConfig, updateConfig } from '@freemodelfinder/core';

export function modelCommand(): Command {
  const cmd = new Command('model').description('Manage the default model');

  cmd
    .command('list')
    .description('List all available free models')
    .action(async () => {
      const spin = ora('Fetching models...').start();
      const reg = await ProviderRegistry.load();
      const { models, failedProviders } = await reg.listAllModels(true);
      spin.stop();
      if (failedProviders.length) {
        for (const f of failedProviders) {
          console.log(chalk.yellow(`! ${f.id}: ${f.error}`));
        }
      }
      if (!models.length) {
        console.log(chalk.yellow('No models available. Configure providers via `fmf key add`.'));
        return;
      }
      for (const m of models) {
        console.log(`${chalk.cyan(m.provider.padEnd(10))} ${m.id}   ${chalk.gray(m.displayName)}`);
      }
    });

  cmd
    .command('current')
    .description('Show current default model')
    .action(async () => {
      const cfg = await loadConfig();
      console.log(cfg.defaultModel ?? chalk.yellow('(not set)'));
    });

  cmd
    .command('use [modelId]')
    .description('Switch the default model (interactive if omitted)')
    .action(async (modelId?: string) => {
      const reg = await ProviderRegistry.load();
      let chosen = modelId;
      if (!chosen) {
        const spin = ora('Loading models...').start();
        const { models } = await reg.listAllModels(true);
        spin.stop();
        if (!models.length) {
          console.log(chalk.yellow('No models available. Configure providers first.'));
          return;
        }
        const answer = await inquirer.prompt<{ model: string }>([
          {
            type: 'list',
            name: 'model',
            message: 'Select the default model',
            pageSize: 20,
            choices: models.map((m) => ({
              name: `${m.provider.padEnd(10)} ${m.id}`,
              value: `${m.provider}:${m.id}`,
            })),
          },
        ]);
        chosen = answer.model;
      }
      await updateConfig((cfg) => ({ ...cfg, defaultModel: chosen }));
      console.log(chalk.green(`✓ default model set to ${chosen}`));
    });

  return cmd;
}
