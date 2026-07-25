import chalk from 'chalk';
import { Command } from 'commander';
import inquirer from 'inquirer';
import { loadConfig, updateConfig, type ProviderId } from '@freemodelfinder/core';

const KNOWN_PROVIDERS: Array<{ id: ProviderId; label: string; hint: string }> = [
  { id: 'openrouter', label: 'OpenRouter', hint: 'https://openrouter.ai/keys' },
  { id: 'gemini', label: 'Google Gemini', hint: 'https://aistudio.google.com/apikey' },
  { id: 'zhipu', label: 'Zhipu (GLM)', hint: 'https://open.bigmodel.cn/usercenter/apikeys' },
  { id: 'siliconflow', label: 'SiliconFlow', hint: 'https://cloud.siliconflow.cn/account/ak' },
  { id: 'deepseek', label: 'DeepSeek', hint: 'https://platform.deepseek.com/api_keys' },
  { id: 'modelscope', label: 'ModelScope', hint: 'https://modelscope.cn/my/myaccesstoken' },
  { id: 'dashscope', label: 'Aliyun Bailian', hint: 'https://bailian.console.aliyun.com/?apiKey=1' },
  { id: 'cerebras', label: 'Cerebras', hint: 'https://cloud.cerebras.ai/' },
  { id: 'nvidia', label: 'NVIDIA NIM', hint: 'https://build.nvidia.com/' },
  { id: 'mistral', label: 'Mistral AI', hint: 'https://console.mistral.ai/api-keys' },
  { id: 'cloudflare', label: 'Cloudflare Workers AI', hint: 'https://dash.cloudflare.com/profile/api-tokens' },
  { id: 'github', label: 'GitHub Models', hint: 'https://github.com/settings/tokens' },
];

export function keyCommand(): Command {
  const cmd = new Command('key').description('Manage provider API keys');

  cmd
    .command('list')
    .description('List configured providers')
    .action(async () => {
      const cfg = await loadConfig();
      for (const { id, label, hint } of KNOWN_PROVIDERS) {
        const s = cfg.providers[id];
        const status = s?.enabled && s.credentials?.apiKey ? chalk.green('enabled') : chalk.gray('disabled');
        console.log(`${label.padEnd(18)} ${status}   ${chalk.gray(hint)}`);
      }
    });

  cmd
    .command('add [provider]')
    .description('Add or update an API key (interactive)')
    .action(async (provider?: string) => {
      let pid = provider as ProviderId | undefined;
      if (!pid) {
        const answer = await inquirer.prompt<{ pid: ProviderId }>([
          {
            type: 'list',
            name: 'pid',
            message: 'Which provider?',
            choices: KNOWN_PROVIDERS.map((p) => ({ name: `${p.label} (${p.hint})`, value: p.id })),
          },
        ]);
        pid = answer.pid;
      }
      const { apiKey } = await inquirer.prompt<{ apiKey: string }>([
        {
          type: 'password',
          name: 'apiKey',
          mask: '*',
          message: `Enter API key for ${pid}:`,
        },
      ]);
      if (!apiKey) {
        console.log(chalk.red('empty key, aborted'));
        return;
      }
      await updateConfig((cfg) => {
        const cur = cfg.providers[pid!] ?? { enabled: false };
        cfg.providers[pid!] = {
          ...cur,
          enabled: true,
          credentials: { ...cur.credentials, apiKey },
        };
        return cfg;
      });
      console.log(chalk.green(`✓ ${pid} enabled`));
    });

  cmd
    .command('remove <provider>')
    .description('Remove an API key')
    .action(async (provider: ProviderId) => {
      await updateConfig((cfg) => {
        if (cfg.providers[provider]) {
          cfg.providers[provider] = { enabled: false };
        }
        return cfg;
      });
      console.log(chalk.green(`✓ ${provider} disabled`));
    });

  return cmd;
}
