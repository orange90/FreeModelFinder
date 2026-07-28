#!/usr/bin/env node
// Daily provider free-model audit.
//
// Fetches each provider's live /models catalog through the same core-layer
// registry the app uses, applies the `free === true` filter, and writes a
// dated Markdown report under reports/ plus a `latest.json` snapshot that
// downstream scripts (README updater) can consume.
//
// This intentionally does NOT run real inference tests. It only exercises
// the catalog endpoints, so it is safe to schedule daily on CI as long as
// the relevant provider API keys are exposed as environment variables.

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const CORE_DIST = join(REPO_ROOT, 'packages', 'core', 'dist', 'index.js');

if (!existsSync(CORE_DIST)) {
  console.error(
    '[audit] packages/core/dist/index.js is missing. Run `pnpm build:runtime` before this script.',
  );
  process.exit(2);
}

const { ProviderRegistry } = await import(CORE_DIST);

const PROVIDER_META = [
  {
    id: 'openrouter',
    display: 'OpenRouter',
    envKeys: ['OPENROUTER_API_KEY'],
    freeBasis:
      '实时目录中仅保留 `:free` 或 `openrouter/free`、输入输出价格均为 0、仅输出文本的模型',
    risk: '免费账号通常共享日请求额度；上游目录和限额会变',
  },
  {
    id: 'gemini',
    display: 'Google Gemini',
    envKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    freeBasis: '账号实时目录与 Free Tier 白名单取交集，只保留支持 `generateContent` 的型号',
    risk: '绑定付费项目后可能适用付费层规则；地区和账号资格会影响可用性',
  },
  {
    id: 'zhipu',
    display: 'Zhipu AI',
    envKeys: ['ZHIPU_API_KEY'],
    freeBasis: '只列入官方免费 Flash 清单',
    risk: '免费型号也可能拥塞或限流，静态清单需要随官方政策复审',
  },
  {
    id: 'siliconflow',
    display: 'SiliconFlow',
    envKeys: ['SILICONFLOW_API_KEY'],
    freeBasis: '平台免费型号白名单与实时模型目录取交集',
    risk: '赠金或试用模型不视为零价；上游目录异常时会报告失败而非伪造空目录',
  },
  {
    id: 'modelscope',
    display: 'ModelScope',
    envKeys: ['MODELSCOPE_API_KEY'],
    freeBasis: 'API-Inference 免费型号清单与可用目录取交集',
    risk: '受账号日配额、单模型配额和账号绑定状态限制',
  },
  {
    id: 'nvidia',
    display: 'NVIDIA NIM',
    envKeys: ['NVIDIA_API_KEY'],
    freeBasis: '只保留审核过的 build.nvidia.com 免费开发端点',
    risk: '面向学习、开发和原型，限速且不代表生产环境永久免费',
  },
  {
    id: 'github',
    display: 'GitHub Models',
    envKeys: ['GITHUB_MODELS_TOKEN', 'GITHUB_TOKEN'],
    freeBasis: '目录中的文本输出模型使用账号自带原型开发额度',
    risk: '若主动启用 paid usage，免费额度后可能计费；非聊天模型已排除',
  },
  {
    id: 'cohere',
    display: 'Cohere',
    envKeys: ['COHERE_API_KEY'],
    freeBasis: '只保留 Trial Key 与 Production Key 都明确免费的 `north-mini-code-1-0`',
    risk: '有速率限制；其他 Command 模型不再被标记为免费',
  },
  {
    id: 'huggingface',
    display: 'Hugging Face',
    envKeys: ['HUGGINGFACE_API_KEY', 'HF_TOKEN'],
    freeBasis: '实时端点明确报告 `is_free`，或输入输出价格均为 0',
    risk: '普通 Router 模型可能消耗 credits 或按量收费，因此不会混入',
  },
  {
    id: 'sensenova',
    display: 'SenseNova',
    envKeys: ['SENSENOVA_API_KEY'],
    freeBasis: '实时目录中输入、输出价格都为 0 的文本模型；接口不可用时使用审核过的免费清单',
    risk: '免费配额和型号可能变化；当前网关只处理文本，即使模型本身支持多模态',
  },
];

function readEnvKey(candidates) {
  for (const name of candidates) {
    const raw = process.env[name];
    if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
  }
  return null;
}

function buildConfig() {
  const providers = {};
  const missing = [];
  for (const meta of PROVIDER_META) {
    const key = readEnvKey(meta.envKeys);
    if (key) {
      providers[meta.id] = { enabled: true, credentials: { apiKey: key } };
    } else {
      providers[meta.id] = { enabled: false };
      missing.push({ id: meta.id, envKeys: meta.envKeys });
    }
  }
  return {
    config: {
      version: 1,
      port: 11435,
      providers,
    },
    missing,
  };
}

function todayIsoInShanghai() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}

async function main() {
  const { config, missing } = buildConfig();
  const registry = new ProviderRegistry(config);

  const enabled = registry.listEnabledProviders();
  console.error(`[audit] enabled providers: ${enabled.join(', ') || '(none)'}`);
  if (missing.length > 0) {
    console.error(
      `[audit] skipped ${missing.length} provider(s) without API keys: ${missing
        .map((m) => `${m.id}(${m.envKeys.join('|')})`)
        .join(', ')}`,
    );
  }

  const perProvider = new Map();
  for (const meta of PROVIDER_META) {
    perProvider.set(meta.id, {
      meta,
      status: enabled.includes(meta.id) ? 'unknown' : 'skipped',
      count: 0,
      error: null,
      models: [],
    });
  }

  if (enabled.length > 0) {
    const results = await Promise.allSettled(
      enabled.map(async (id) => {
        const provider = registry.getProvider(id);
        const models = await provider.listModels();
        return { id, models };
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const { id, models } = r.value;
        const entry = perProvider.get(id);
        if (!entry) continue;
        const freeModels = models.filter(
          (m) => m && m.free === true && typeof m.id === 'string' && m.id.trim().length > 0,
        );
        entry.status = 'ok';
        entry.count = freeModels.length;
        entry.models = freeModels.map((m) => ({
          id: m.id,
          displayName: m.displayName,
          contextWindow: m.contextWindow ?? null,
        }));
      } else {
        // r.reason may include the provider id via r.value not being set;
        // recover via message parsing is unreliable, so mark all pending
        // providers as errored only if they were not fulfilled.
        console.error(`[audit] provider fetch failed: ${r.reason?.message ?? r.reason}`);
      }
    }
    // Mark remaining "unknown" enabled providers as errored, keeping the
    // message from allSettled where possible.
    for (let i = 0; i < enabled.length; i += 1) {
      const id = enabled[i];
      const r = results[i];
      if (r?.status === 'rejected') {
        const entry = perProvider.get(id);
        if (entry && entry.status !== 'ok') {
          entry.status = 'error';
          entry.error = r.reason instanceof Error ? r.reason.message : String(r.reason);
        }
      }
    }
  }

  const date = todayIsoInShanghai();
  const okProviders = [...perProvider.values()].filter((e) => e.status === 'ok');
  const totalModels = okProviders.reduce((sum, e) => sum + e.count, 0);

  const rows = PROVIDER_META.map((meta) => {
    const entry = perProvider.get(meta.id);
    let statusCell;
    let countCell;
    if (!entry) {
      statusCell = '未知';
      countCell = '-';
    } else if (entry.status === 'ok') {
      statusCell = '成功';
      countCell = String(entry.count);
    } else if (entry.status === 'skipped') {
      statusCell = '跳过（缺少密钥）';
      countCell = '-';
    } else {
      statusCell = '失败';
      countCell = '-';
    }
    return `| ${meta.display} | ${countCell} | ${meta.freeBasis} | ${statusCell} | ${meta.risk} |`;
  });

  const perProviderSections = PROVIDER_META.map((meta) => {
    const entry = perProvider.get(meta.id);
    if (!entry) return '';
    const header = `### ${meta.display} (${meta.id})`;
    if (entry.status === 'skipped') {
      return `${header}\n\n- 跳过：CI 环境缺少 ${meta.envKeys.join(' 或 ')}。`;
    }
    if (entry.status === 'error') {
      return `${header}\n\n- 目录接口失败：\`${entry.error ?? 'unknown error'}\``;
    }
    if (entry.count === 0) {
      return `${header}\n\n- 目录接口成功，但当前账号目录里没有命中免费过滤的模型。`;
    }
    const lines = entry.models.map(
      (m) => `- \`${m.id}\`${m.displayName && m.displayName !== m.id ? ` — ${m.displayName}` : ''}`,
    );
    return `${header}\n\n${lines.join('\n')}`;
  })
    .filter(Boolean)
    .join('\n\n');

  const md = `# FreeModelFinder Provider 与免费模型审计报告

- 审计时间：${date}（Asia/Shanghai）
- 审计对象：${PROVIDER_META.length} 个内置 provider
- 审计方法：GitHub Actions 每日调度，通过核心层 \`ProviderRegistry.listModels()\` 抓取各 provider 实时目录并套用 \`free === true\` 过滤；本次未执行真实推理测试。
- 生成脚本：\`scripts/audit-free-models.mjs\`

## 结论

- ${okProviders.length}/${PROVIDER_META.length} 个 provider 目录接口在本次运行中成功返回。
- 命中免费过滤的模型合计 **${totalModels}** 个。
- 未配置密钥的 provider 会在下表中标记为“跳过”，不会阻塞审计。

## Provider 汇总

| Provider | 免费模型数 | 免费依据 | 目录连接 | 主要计费与可用性风险 |
|---|---:|---|---|---|
${rows.join('\n')}

## 逐 provider 明细

${perProviderSections}

## 备注

- 本审计不再运行 \`ProviderRegistry.probeModel()\` 的真实推理调用，所以不会消耗 provider 的 token 或请求额度，超出目录接口 quota 除外。
- 想要"目录抓取 + 轻量推理"的完整报告，仍需在发版前手动执行 [docs/RELEASING.md](../docs/RELEASING.md) 中的验收流程。
`;

  const reportsDir = join(REPO_ROOT, 'reports');
  await mkdir(reportsDir, { recursive: true });
  const reportPath = join(reportsDir, `provider-free-model-audit-${date}.md`);
  await writeFile(reportPath, md, 'utf8');

  const summary = {
    date,
    generatedAt: new Date().toISOString(),
    reportPath: `reports/provider-free-model-audit-${date}.md`,
    totalModels,
    providers: PROVIDER_META.map((meta) => {
      const entry = perProvider.get(meta.id);
      return {
        id: meta.id,
        display: meta.display,
        status: entry?.status ?? 'unknown',
        count: entry?.count ?? 0,
        freeBasis: meta.freeBasis,
        risk: meta.risk,
      };
    }),
  };
  const latestPath = join(reportsDir, 'latest.json');
  await writeFile(latestPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.error(`[audit] wrote ${reportPath}`);
  console.error(`[audit] wrote ${latestPath}`);
  console.error(`[audit] total free models across ${okProviders.length} providers: ${totalModels}`);
}

main().catch((err) => {
  console.error('[audit] fatal:', err);
  process.exit(1);
});
