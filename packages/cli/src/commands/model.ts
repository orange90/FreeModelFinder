import chalk from 'chalk';
import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import { ProviderRegistry, loadConfig, updateConfig } from '@freemodelfinder/core';

type Prompt = <T>(questions: unknown[]) => Promise<T>;

interface ModelCommandDependencies {
  loadRegistry: () => Promise<ProviderRegistry>;
  loadConfig: typeof loadConfig;
  updateConfig: typeof updateConfig;
  prompt: Prompt;
  startSpinner: (message: string) => { stop: () => void };
}

export function modelCommand(dependencies: Partial<ModelCommandDependencies> = {}): Command {
  const loadRegistry = dependencies.loadRegistry ?? (() => ProviderRegistry.load());
  const readConfig = dependencies.loadConfig ?? loadConfig;
  const writeConfig = dependencies.updateConfig ?? updateConfig;
  const prompt: Prompt =
    dependencies.prompt ??
    ((questions) => inquirer.prompt(questions as never) as Promise<unknown> as never);
  const startSpinner = dependencies.startSpinner ?? ((message: string) => ora(message).start());
  const cmd = new Command('model').description('Manage the default model');

  cmd
    .command('list')
    .description('List all available free models')
    .action(async () => {
      const spin = startSpinner('Fetching models...');
      const reg = await loadRegistry();
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
      const cfg = await readConfig();
      console.log(cfg.defaultModel ?? chalk.yellow('(not set)'));
    });

  cmd
    .command('use [modelId]')
    .description('Switch the default model (interactive if omitted)')
    .action(async (modelId?: string) => {
      const reg = await loadRegistry();
      let chosen = modelId;
      if (!chosen) {
        const spin = startSpinner('Loading models...');
        const { models } = await reg.listAllModels(true);
        spin.stop();
        if (!models.length) {
          console.log(chalk.yellow('No models available. Configure providers first.'));
          return;
        }
        const answer = await prompt<{ model: string }>([
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
      await writeConfig((cfg) => ({ ...cfg, defaultModel: chosen }));
      console.log(chalk.green(`✓ default model set to ${chosen}`));
    });

  return cmd;
}
