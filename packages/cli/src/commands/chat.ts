import chalk from 'chalk';
import { Command } from 'commander';
import inquirer from 'inquirer';
import readline from 'node:readline';
import {
  ProviderRegistry,
  loadConfig,
  updateConfig,
  type ChatMessage,
} from '@freemodelfinder/core';

async function pickModel(reg: ProviderRegistry): Promise<string | undefined> {
  const { models } = await reg.listAllModels(true);
  if (!models.length) {
    console.log(chalk.yellow('No models available. Run `fmf key add` first.'));
    return undefined;
  }
  const answer = await inquirer.prompt<{ model: string }>([
    {
      type: 'list',
      name: 'model',
      message: 'Select model',
      pageSize: 20,
      choices: models.map((m) => ({
        name: `${m.provider.padEnd(10)} ${m.id}`,
        value: `${m.provider}:${m.id}`,
      })),
    },
  ]);
  return answer.model;
}

export function chatCommand(): Command {
  return new Command('chat')
    .description('Interactive terminal chat. Type /model to switch model, /exit to quit.')
    .option('-m, --model <id>', 'model id (provider:model or bare id)')
    .action(async (opts: { model?: string }) => {
      const reg = await ProviderRegistry.load();
      const cfg = await loadConfig();
      let current = opts.model ?? cfg.defaultModel;
      if (!current) {
        current = await pickModel(reg);
        if (!current) return;
        await updateConfig((c) => ({ ...c, defaultModel: current }));
      }
      console.log(chalk.gray(`Using model: ${current}`));
      console.log(chalk.gray('Commands: /model to switch, /exit to quit'));

      const messages: ChatMessage[] = [];
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ask = () =>
        new Promise<string>((resolve) => rl.question(chalk.cyan('you> '), resolve));

      for (;;) {
        const line = (await ask()).trim();
        if (!line) continue;
        if (line === '/exit' || line === '/quit') {
          rl.close();
          break;
        }
        if (line === '/model') {
          const picked = await pickModel(reg);
          if (picked) {
            current = picked;
            await updateConfig((c) => ({ ...c, defaultModel: current }));
            console.log(chalk.gray(`Switched to ${current}`));
          }
          continue;
        }
        messages.push({ role: 'user', content: line });
        try {
          const { provider, modelId } = reg.resolveModel(current!);
          process.stdout.write(chalk.magenta('bot> '));
          let assistantText = '';
          for await (const chunk of provider.stream({
            model: modelId,
            messages,
            stream: true,
          })) {
            process.stdout.write(chunk.delta);
            assistantText += chunk.delta;
          }
          process.stdout.write('\n');
          messages.push({ role: 'assistant', content: assistantText });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(chalk.red(`error: ${msg}`));
        }
      }
    });
}
